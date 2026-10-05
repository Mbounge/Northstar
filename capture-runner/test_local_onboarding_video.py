"""Offline checks for the local onboarding video edit contract."""

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from PIL import Image, ImageDraw, ImageFont


sys.path.insert(0, str(Path(__file__).resolve().parent / "agents"))
from local_onboarding_video import (
    OnboardingBurstRecorder, _duration, _is_placeholder_burst, _private_or_verification_step,
    _redaction_filters, _scan_rendered_privacy,
    automatic_edit, create_plan, render,
)


class LocalOnboardingVideoTests(unittest.TestCase):
    def test_only_motion_inputs_are_recordable(self):
        self.assertEqual(OnboardingBurstRecorder._kind(
            "monkey -p com.example.app -c android.intent.category.LAUNCHER 1"), "launch")
        self.assertEqual(OnboardingBurstRecorder._kind("input tap 50 70"), "tap")
        self.assertEqual(OnboardingBurstRecorder._kind("input swipe 1 2 3 4 500"), "swipe")
        self.assertEqual(OnboardingBurstRecorder._kind("input text 'password'"), "text")
        self.assertEqual(OnboardingBurstRecorder._kind("input keyevent 67"), "edit_key")

    def test_recorder_only_arms_for_planned_app_action(self):
        with tempfile.TemporaryDirectory() as tmp:
            recorder = OnboardingBurstRecorder(tmp, "com.example.app",
                                               context=lambda: {"phase": "EXPLORE"})
            recorder._focused_on_app = Mock(return_value=True)
            recorder._start_locked = Mock(side_effect=lambda: (
                setattr(recorder, "_process", Mock(poll=lambda: None)) or True))
            recorder._finish_locked = Mock()
            recorder.before_command("input tap 50 70")
            recorder._start_locked.assert_not_called()
            recorder.enabled = True
            recorder.before_command("input tap 50 70")
            recorder._start_locked.assert_called_once()
            self.assertEqual([item["kind"] for item in recorder._actions], ["tap"])
            recorder.before_command("input text 'secret'")
            recorder._finish_locked.assert_called_with("unredacted_text_entry")

    def test_planned_field_entry_records_timing_without_storing_text(self):
        with tempfile.TemporaryDirectory() as tmp:
            recorder = OnboardingBurstRecorder(tmp, "com.example.app",
                                               context=lambda: {"phase": "SIGNUP"})
            recorder.enabled = True
            recorder.prepare_action("FILL_FIELD")
            recorder.mark_field_redaction((40, 300, 680, 450), (720, 1280))
            recorder._focused_on_app = Mock(return_value=True)
            recorder._start_locked = Mock(side_effect=lambda: (
                setattr(recorder, "_process", Mock(poll=lambda: None)) or True))
            recorder.before_command("input text 'private@example.invalid'")
            self.assertEqual(recorder._actions[0]["kind"], "text")
            self.assertNotIn("private@example.invalid", json.dumps(recorder._actions))
            self.assertEqual(len(recorder._redactions), 1)
            self.assertTrue(_redaction_filters(recorder._redactions))

    def test_plan_requires_review_and_render_preserves_source_order(self):
        if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
            self.skipTest("ffmpeg is unavailable")
        with tempfile.TemporaryDirectory() as tmp:
            session = Path(tmp)
            burst_dir = session / "local_video_bursts"
            burst_dir.mkdir()
            entries = []
            for number, color in ((1, "red"), (2, "blue")):
                clip = burst_dir / f"burst_{number:04d}.mp4"
                subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                                "-f", "lavfi", "-i", f"color=c={color}:s=180x320:r=30:d=1",
                                "-c:v", "libx264", "-pix_fmt", "yuv420p", str(clip)],
                               check=True, timeout=30)
                entries.append({"number": number, "eligible": True,
                                "file": str(clip.relative_to(session)),
                                "actions": [{"kind": "tap", "timeline_sequence": number}]})
            (session / "local_video_bursts.jsonl").write_text(
                "".join(json.dumps(entry) + "\n" for entry in entries))
            (session / "timeline_journal.jsonl").write_text(
                "".join(json.dumps({"timeline_sequence": number, "state": f"STEP_{number}"}) + "\n"
                        for number in (1, 2)))
            plan_path = create_plan(session)
            plan = json.loads(plan_path.read_text())
            self.assertEqual([clip["screen_state"] for clip in plan["clips"]],
                             ["STEP_1", "STEP_2"])
            self.assertTrue(all(not clip["include"] for clip in plan["clips"]))
            with self.assertRaisesRegex(ValueError, "reviewed or automatically checked"):
                render(session)
            plan["reviewed"] = True
            for clip in plan["clips"]:
                clip["include"] = True
            plan_path.write_text(json.dumps(plan))
            result = render(session)
            self.assertTrue(result.is_file())
            self.assertGreater(result.stat().st_size, 1000)
            # A page change must blend through real held boundary frames,
            # without truncating the source action to make room for the edit.
            self.assertGreater(_duration(result), 2.7)
            import cv2
            capture = cv2.VideoCapture(str(result))
            capture.set(cv2.CAP_PROP_POS_MSEC, 1570)
            ok, midpoint = capture.read()
            capture.release()
            self.assertTrue(ok)
            self.assertGreater(float(midpoint[:, :, 0].mean()), 30)  # blue
            self.assertGreater(float(midpoint[:, :, 2].mean()), 30)  # red
            provenance = json.loads((session / "onboarding_local_proof_sources.json").read_text())
            self.assertEqual([clip["number"] for clip in provenance["clips"]], [1, 2])
            self.assertEqual(provenance["transitions"][0]["style"], "fade")
            entries[0]["ended_at"] = 10.0
            entries[1]["started_at"] = 100.0
            (session / "local_video_bursts.jsonl").write_text(
                "".join(json.dumps(entry) + "\n" for entry in entries))
            render(session)
            provenance = json.loads((session / "onboarding_local_proof_sources.json").read_text())
            self.assertEqual(provenance["transitions"][0]["style"], "fadeblack")
            plan["clips"].reverse()
            plan_path.write_text(json.dumps(plan))
            with self.assertRaisesRegex(ValueError, "original capture order"):
                render(session)

    def test_automatic_editor_removes_launcher_and_reversed_scroll_detour(self):
        if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
            self.skipTest("ffmpeg is unavailable")
        with tempfile.TemporaryDirectory() as tmp:
            session = Path(tmp)
            burst_dir = session / "local_video_bursts"
            burst_dir.mkdir()
            actions = [
                ("launch", "WELCOME_SCREEN", "LAUNCH", "", "welcome"),
                ("tap", "WELCOME_SCREEN", "CLICK", "Get started", "welcome"),
                ("swipe", "PAYMENT", "SCROLL_DOWN", "", "donation_top"),
                ("swipe", "PAYMENT", "SCROLL_UP", "", "donation_bottom"),
                ("tap", "OVERLAY/POPUP", "CLICK", "Dismiss", "overlay"),
            ]
            bursts, timeline = [], []
            for number, (kind, state, action, target, screenshot) in enumerate(actions, 1):
                clip = burst_dir / f"burst_{number:04d}.mp4"
                subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                                "-f", "lavfi", "-i", "color=c=blue:s=180x320:r=30:d=1.2",
                                "-c:v", "libx264", "-pix_fmt", "yuv420p", str(clip)],
                               check=True, timeout=30)
                bursts.append({"number": number, "eligible": True,
                               "file": str(clip.relative_to(session)),
                               "actions": [{"kind": kind, "timeline_sequence": number}]})
                timeline.append({"timeline_sequence": number, "state": state,
                                 "action": action, "target": target,
                                 "screenshot": screenshot})
            (session / "local_video_bursts.jsonl").write_text(
                "".join(json.dumps(item) + "\n" for item in bursts))
            (session / "timeline_journal.jsonl").write_text(
                "".join(json.dumps(item) + "\n" for item in timeline + [
                    {"timeline_sequence": 6, "state": "HOME", "action": "SETTLED_HOME",
                     "screenshot": "screenshots/home.png"}]))
            (session / "screenshots").mkdir()
            Image.new("RGB", (180, 320), "blue").save(session / "screenshots/home.png")
            (session / "onboarding_manifest.json").write_text(
                json.dumps({"result": {"status": "COMPLETED_SETTLED"}}))
            with patch("local_onboarding_video._is_placeholder_burst", return_value=False), \
                 patch("local_onboarding_video._visible_ranges", return_value=[(0.0, 1.2)]), \
                 patch("local_onboarding_video._compress_static_ranges", return_value=[(0.0, 1.2)]):
                video = automatic_edit(str(session))
            self.assertTrue(video.is_file())
            qa = json.loads((session / "onboarding_local_proof_qa.json").read_text())
            self.assertEqual(qa["selection"]["selected_bursts"], [2, 5])
            self.assertEqual(qa["interactions"]["tap_events"], 2)
            self.assertEqual([item["number"] for item in qa["selection"]["omitted_bursts"]],
                             [1, 3, 4])

    def test_blank_video_is_rejected_as_placeholder(self):
        if not shutil.which("ffmpeg"):
            self.skipTest("ffmpeg is unavailable")
        with tempfile.TemporaryDirectory() as tmp:
            clip = Path(tmp) / "blank.mp4"
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                            "-f", "lavfi", "-i", "color=c=white:s=180x320:r=30:d=1",
                            "-c:v", "libx264", "-pix_fmt", "yuv420p", str(clip)],
                           check=True, timeout=30)
            self.assertTrue(_is_placeholder_burst(clip))

    def test_account_code_and_filled_email_are_not_selected(self):
        code = {"screen_state": "VERIFICATION", "actions": [{"phase": "SIGNUP"}]}
        filled_email = {"screen_state": "SIGNUP_METHOD", "actions": [{"phase": "SIGNUP"}]}
        self.assertTrue(_private_or_verification_step(code, {"action": "CLICK"}))
        self.assertTrue(_private_or_verification_step(filled_email, {
            "action": "CLICK", "screen_desc": "Email already entered: test@example.com",
        }))
        self.assertFalse(_private_or_verification_step({
            **filled_email, "redactions": [{"rect": [0, 200, 720, 350],
                                            "screen_size": [720, 1280]}],
        }, {"action": "FILL_FIELD", "screen_desc": "Enter email"}))
        self.assertFalse(_private_or_verification_step({
            "screen_state": "AUTH_CHOICE", "actions": [{"phase": "SIGNUP"}],
        }, {"action": "CLICK", "screen_desc": "Welcome with Sign in or sign up"}))

    def test_rendered_account_identifier_fails_privacy_check(self):
        if not shutil.which("ffmpeg") or not shutil.which("tesseract"):
            self.skipTest("ffmpeg or tesseract is unavailable")
        font_path = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
        if not font_path.is_file():
            self.skipTest("system font is unavailable")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            still = root / "account.png"
            film = root / "account.mp4"
            image = Image.new("RGB", (720, 1280), "white")
            ImageDraw.Draw(image).text((40, 420), "demo@example.invalid", fill="black",
                                       font=ImageFont.truetype(str(font_path), 44))
            image.save(still)
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                            "-loop", "1", "-i", str(still), "-t", "1",
                            "-r", "30", "-pix_fmt", "yuv420p", str(film)],
                           check=True, timeout=30)
            with self.assertRaisesRegex(ValueError, "account identifier"):
                _scan_rendered_privacy(film)

    def test_render_masks_a_real_recorded_field_before_privacy_check(self):
        if not all(shutil.which(name) for name in ("ffmpeg", "ffprobe", "tesseract")):
            self.skipTest("video tooling is unavailable")
        font_path = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
        if not font_path.is_file():
            self.skipTest("system font is unavailable")
        with tempfile.TemporaryDirectory() as tmp:
            session = Path(tmp)
            burst_dir = session / "local_video_bursts"
            burst_dir.mkdir()
            still = session / "account.png"
            clip = burst_dir / "burst_0001.mp4"
            image = Image.new("RGB", (720, 1280), "white")
            ImageDraw.Draw(image).text((40, 420), "demo@example.invalid", fill="black",
                                       font=ImageFont.truetype(str(font_path), 44))
            image.save(still)
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                            "-loop", "1", "-i", str(still), "-t", "1",
                            "-r", "30", "-pix_fmt", "yuv420p", str(clip)],
                           check=True, timeout=30)
            entry = {"number": 1, "eligible": True, "file": str(clip.relative_to(session)),
                     "started_at": 100.0,
                     "actions": [{"kind": "text", "timeline_sequence": 1,
                                  "at": at} for at in (100.2, 100.5, 100.7)],
                     "redactions": [{"rect": [0, 380, 720, 500],
                                     "screen_size": [720, 1280]}]}
            (session / "local_video_bursts.jsonl").write_text(json.dumps(entry) + "\n")
            plan = create_plan(session)
            data = json.loads(plan.read_text())
            data["reviewed"] = True
            data["clips"][0]["include"] = True
            plan.write_text(json.dumps(data))
            output = render(session)
            self.assertGreaterEqual(_scan_rendered_privacy(output), 2)


if __name__ == "__main__":
    unittest.main()
