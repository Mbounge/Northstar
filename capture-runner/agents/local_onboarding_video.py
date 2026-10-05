#!/usr/bin/env python3
"""Opt-in, Mac-local onboarding motion proof. Never publishes video to Northstar.

The onboarding agent calls OnboardingBurstRecorder around device input. The
automatic editor selects the forward journey and checks the finished MP4.
No synthetic screen transitions or inferred interactions are generated here.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run(argv: list[str], *, timeout: float = 15) -> subprocess.CompletedProcess:
    return subprocess.run(argv, capture_output=True, text=True, timeout=timeout)


class OnboardingBurstRecorder:
    """Record short real-device bursts without changing the agent's decisions.

    Android's screenrecord is started just before an input and stopped after a
    quiet post-roll. Closely spaced inputs remain in one clip. Planned field
    entry can be recorded with a mandatory redaction region; external
    verification interrupts recording. Raw clips stay local.
    """

    def __init__(self, session_dir: str | Path, package: str, *, context=None,
                 post_roll: float = 2.5, adb: str | None = None):
        self.session = Path(session_dir).expanduser().resolve()
        self.burst_dir = self.session / "local_video_bursts"
        self.burst_dir.mkdir(parents=True, exist_ok=True)
        self.journal = self.session / "local_video_bursts.jsonl"
        self.package = package
        self.context = context or (lambda: {})
        self.post_roll = max(0.5, float(post_roll))
        self.adb = adb or shutil.which("adb") or "adb"
        self.serial = os.environ.get("ANDROID_SERIAL", "").strip()
        self._lock = threading.RLock()
        self._timer: threading.Timer | None = None
        self._process: subprocess.Popen | None = None
        self._pid: str | None = None
        self._remote: str | None = None
        self._started_at: float | None = None
        self._actions: list[dict] = []
        self._action_type = ""
        self._field_redaction: dict | None = None
        self._redactions: list[dict] = []
        self._closed = False
        self.enabled = False
        self._next_number = self._read_next_number()

    def _adb(self, *args: str) -> list[str]:
        return [self.adb, *(["-s", self.serial] if self.serial else []), *args]

    def _read_next_number(self) -> int:
        numbers = [int(match.group(1)) for path in self.burst_dir.glob("burst_*.mp4")
                   if (match := re.match(r"burst_(\d+)\.mp4$", path.name))]
        if self.journal.exists():
            for line in self.journal.read_text(encoding="utf-8").splitlines():
                try:
                    numbers.append(int(json.loads(line).get("number", 0)))
                except (ValueError, TypeError, json.JSONDecodeError):
                    continue
        return max(numbers, default=0) + 1

    def _focused_on_app(self) -> bool:
        try:
            result = _run(self._adb("shell", "dumpsys", "window"), timeout=8)
            focused = next((line for line in result.stdout.splitlines()
                            if "mCurrentFocus=" in line), "")
            return result.returncode == 0 and self.package in focused
        except (OSError, subprocess.TimeoutExpired):
            return False

    def _screenrecord_pids(self) -> set[str]:
        try:
            result = _run(self._adb("shell", "pidof", "screenrecord"), timeout=5)
            return set(re.findall(r"\b\d+\b", result.stdout)) if result.returncode == 0 else set()
        except (OSError, subprocess.TimeoutExpired):
            return set()

    @staticmethod
    def _kind(cmd: str) -> str | None:
        if re.fullmatch(r"monkey -p [A-Za-z0-9._]+ -c android\.intent\.category\.LAUNCHER 1", cmd):
            return "launch"
        if re.fullmatch(r"input tap \d+ \d+", cmd):
            return "tap"
        if re.fullmatch(r"input swipe \d+ \d+ \d+ \d+ \d+", cmd):
            return "swipe"
        if cmd == "input keyevent 4":
            return "back"
        if cmd.startswith("input text "):
            return "text"
        if cmd.startswith("input keyevent "):
            return "edit_key"
        return None

    def prepare_action(self, action: str) -> None:
        """Keep a field-entry burst separate from neighboring navigation."""
        with self._lock:
            if action == "FILL_FIELD" or self._action_type == "FILL_FIELD":
                self._finish_locked("action_boundary")
            self._action_type = action
            self._field_redaction = None

    def mark_field_redaction(self, rect: tuple[int, int, int, int],
                             screen_size: tuple[int, int] | list[int]) -> None:
        """Require a grounded input rectangle before recording any text bytes."""
        with self._lock:
            width, height = map(int, screen_size)
            x1, y1, x2, y2 = map(int, rect)
            if not (0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height):
                return
            region = {"rect": [x1, y1, x2, y2], "screen_size": [width, height]}
            self._field_redaction = region
            if self._process is not None and region not in self._redactions:
                self._redactions.append(region)

    def before_command(self, cmd: str) -> None:
        """Called before every agent ADB command; failures never block input."""
        try:
            with self._lock:
                if self._closed:
                    return
                kind = self._kind(cmd)
                if kind in {"text", "edit_key"} and (
                    self._action_type != "FILL_FIELD" or self._field_redaction is None
                ):
                    self._finish_locked("unredacted_text_entry")
                    return
                if cmd.startswith("monkey -p ") and not cmd.startswith(f"monkey -p {self.package} "):
                    self._finish_locked("external_launch")
                    return
                details = self.context() or {}
                if details.get("phase") == "VERIFICATION":
                    self._finish_locked("verification")
                    return
                if not self.enabled:
                    if cmd.startswith("input "):
                        self._finish_locked("outside_planned_action")
                    return
                if kind is None:
                    return
                if (kind != "launch" and not (
                    kind in {"text", "edit_key"} and self._process is not None
                ) and not self._focused_on_app()):
                    self._finish_locked("external_app")
                    return
                if self._process is not None and self._process.poll() is not None:
                    self._finish_locked("screenrecord_ended")
                if self._process is None and not self._start_locked():
                    return
                self._actions.append({
                    "at": time.time(),
                    "kind": kind,
                    "phase": details.get("phase"),
                    "timeline_sequence": details.get("timeline_sequence"),
                })
                if kind in {"text", "edit_key"} and self._field_redaction not in self._redactions:
                    self._redactions.append(self._field_redaction)
                if self._timer is not None:
                    self._timer.cancel()
                    self._timer = None
        except Exception as exc:
            print(f"      ⚠️ Local video recorder skipped input: {exc}")

    def after_command(self, cmd: str) -> None:
        if not self.enabled or self._kind(cmd) is None:
            return
        try:
            with self._lock:
                if self._process is None or self._closed:
                    return
                if self._timer is not None:
                    self._timer.cancel()
                self._timer = threading.Timer(self.post_roll, self._finish_after_idle)
                self._timer.daemon = True
                self._timer.start()
        except Exception as exc:
            print(f"      ⚠️ Local video recorder could not schedule post-roll: {exc}")

    def _start_locked(self) -> bool:
        # Do not interfere with another screen recorder on the same emulator.
        if self._screenrecord_pids():
            print("      ⚠️ Local video skipped: another Android screenrecord is active")
            return False
        remote = f"/sdcard/northstar_local_{uuid.uuid4().hex}.mp4"
        command = self._adb("shell", "screenrecord", "--bit-rate", "4000000",
                            "--time-limit", "30", remote)
        process = None
        try:
            process = subprocess.Popen(command, stdout=subprocess.DEVNULL,
                                       stderr=subprocess.DEVNULL)
            pid = None
            for _ in range(24):
                if process.poll() is not None:
                    break
                pids = self._screenrecord_pids()
                if len(pids) == 1:
                    pid = next(iter(pids))
                    break
                time.sleep(0.05)
            if pid is None:
                process.terminate()
                process.wait(timeout=3)
                print("      ⚠️ Local video skipped: Android screenrecord did not start")
                return False
            time.sleep(0.18)  # Give the encoder a pre-action frame.
            self._process = process
            self._pid = pid
            self._remote = remote
            self._started_at = time.time()
            self._actions = []
            self._redactions = (
                [self._field_redaction]
                if self._action_type == "FILL_FIELD" and self._field_redaction
                else []
            )
            return True
        except (OSError, subprocess.TimeoutExpired) as exc:
            if process is not None and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
            print(f"      ⚠️ Local video skipped: {exc}")
            return False

    def _finish_after_idle(self) -> None:
        with self._lock:
            self._finish_locked("idle")

    def _finish_locked(self, reason: str) -> None:
        if self._timer is not None:
            self._timer.cancel()
            self._timer = None
        process = self._process
        if process is None:
            return
        pid, remote, started_at = self._pid, self._remote, self._started_at
        actions = list(self._actions)
        redactions = list(self._redactions)
        self._process = None
        self._pid = self._remote = self._started_at = None
        self._actions = []
        self._redactions = []
        number = self._next_number
        self._next_number += 1
        output = self.burst_dir / f"burst_{number:04d}.mp4"
        error = None
        try:
            if process.poll() is None and pid:
                _run(self._adb("shell", "kill", "-2", pid), timeout=5)
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.terminate()
                process.wait(timeout=3)
                raise RuntimeError("screenrecord did not finalize after SIGINT")
            pulled = _run(self._adb("pull", remote, str(output)), timeout=30)
            if pulled.returncode != 0 or not output.is_file() or output.stat().st_size < 1024:
                raise RuntimeError("ADB could not pull a valid video burst")
        except (OSError, subprocess.TimeoutExpired, RuntimeError) as exc:
            error = str(exc)
            output.unlink(missing_ok=True)
        finally:
            if remote:
                try:
                    _run(self._adb("shell", "rm", "-f", remote), timeout=5)
                except (OSError, subprocess.TimeoutExpired):
                    pass
        in_app_at_end = self._focused_on_app()
        # A clip that reached Gmail, a browser, or another app is ineligible.
        if not in_app_at_end:
            output.unlink(missing_ok=True)
        entry = {
            "number": number,
            "recorded_at": _utc_now(),
            "started_at": started_at,
            "ended_at": time.time(),
            "file": str(output.relative_to(self.session)) if output.exists() else None,
            "actions": actions,
            "redactions": redactions,
            "eligible": bool(output.exists() and actions and in_app_at_end),
            "stop_reason": reason,
            "error": error or ("external_app_at_end" if not in_app_at_end else None),
        }
        with self.journal.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry) + "\n")
        if entry["eligible"]:
            print(f"      🎬 Local onboarding burst {number}: {output.name}")
        elif error:
            print(f"      ⚠️ Local video burst {number} discarded: {error}")

    def close(self) -> None:
        with self._lock:
            self._closed = True
            self._finish_locked("agent_exit")


def _read_bursts(session: Path) -> list[dict]:
    journal = session / "local_video_bursts.jsonl"
    if not journal.is_file():
        raise ValueError(f"No video burst journal found at {journal}")
    bursts = []
    for line in journal.read_text(encoding="utf-8").splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(item, dict):
            bursts.append(item)
    return sorted(bursts, key=lambda item: int(item.get("number", 0)))


def create_plan(session: Path | str, *, force: bool = False) -> Path:
    session = Path(session).expanduser().resolve()
    target = session / "local_video_edit_plan.json"
    if target.exists() and not force:
        raise ValueError(f"Edit plan already exists: {target} (pass --force to replace it)")
    timeline = {}
    timeline_path = session / "timeline_journal.jsonl"
    if timeline_path.is_file():
        for line in timeline_path.read_text(encoding="utf-8").splitlines():
            try:
                entry = json.loads(line)
                timeline[int(entry["timeline_sequence"])] = entry
            except (ValueError, TypeError, KeyError, json.JSONDecodeError):
                continue
    clips = []
    for item in _read_bursts(session):
        if not item.get("eligible") or not item.get("file"):
            continue
        clip = (session / item["file"]).resolve()
        if not clip.is_relative_to(session) or not clip.is_file():
            continue
        first_action = (item.get("actions") or [{}])[0]
        screen = timeline.get(first_action.get("timeline_sequence"), {})
        clips.append({
            "number": int(item["number"]),
            "file": item["file"],
            "include": False,  # Selection requires review of actual pixels.
            "trim_in": 0.0,
            "trim_out": None,
            "label": "",
            "screen_state": screen.get("state", ""),
            "screen_screenshot": screen.get("screenshot"),
            "started_at": item.get("started_at"),
            "actions": item.get("actions", []),
            "redactions": item.get("redactions", []),
        })
    plan = {"version": 1, "purpose": "local onboarding video proof",
            "reviewed": False, "clips": clips}
    target.write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
    return target


def _is_placeholder_burst(path: Path) -> bool:
    """Detect a burst made almost entirely of blank or loading placeholders."""
    try:
        import cv2
        import numpy as np
    except ImportError as exc:
        raise ValueError("OpenCV and NumPy are required for automatic visual checks") from exc
    capture = cv2.VideoCapture(str(path))
    try:
        count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        if count < 2:
            return True
        placeholder = 0
        observed = 0
        for position in (0.08, 0.28, 0.5, 0.72, 0.92):
            capture.set(cv2.CAP_PROP_POS_FRAMES, min(count - 1, int(count * position)))
            ok, frame = capture.read()
            if not ok:
                continue
            gray = cv2.cvtColor(cv2.resize(frame, (270, 600)), cv2.COLOR_BGR2GRAY)
            edge_ratio = float(np.mean(cv2.Canny(gray, 60, 140) > 0))
            bright_ratio = float(np.mean(gray > 225))
            dark_ratio = float(np.mean(gray < 30))
            # Actual UI has edges from controls and text; skeletons and blank
            # transitions are nearly featureless even when light or dark.
            placeholder += edge_ratio < 0.006 and (bright_ratio > 0.9 or dark_ratio > 0.9)
            observed += 1
        return observed >= 4 and placeholder / observed >= 0.8
    finally:
        capture.release()


def _visible_ranges(path: Path) -> list[tuple[float, float]]:
    """Keep real UI frames while cutting sustained blank/loading intervals."""
    import cv2
    import numpy as np
    capture = cv2.VideoCapture(str(path))
    try:
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
        if frame_count < 2 or fps <= 0:
            return []
        duration = frame_count / fps
        step = 0.1
        samples = []
        for index in range(max(1, int(duration / step))):
            at = min(duration - 1 / fps, index * step)
            capture.set(cv2.CAP_PROP_POS_MSEC, at * 1000)
            ok, frame = capture.read()
            if not ok:
                continue
            gray = cv2.cvtColor(cv2.resize(frame, (270, 600)), cv2.COLOR_BGR2GRAY)
            edges = float(np.mean(cv2.Canny(gray, 60, 140) > 0))
            blank = edges < 0.009 and (
                float(np.mean(gray > 225)) > 0.95
                or float(np.mean(gray < 30)) > 0.96
            )
            samples.append((at, not blank))
        if not samples:
            return []
        ranges = []
        start = None
        for at, visible in samples:
            if visible and start is None:
                start = at
            if not visible and start is not None:
                end = min(duration, at + 0.04)
                if end - start >= 0.18:
                    ranges.append((max(0.0, start - 0.04), end))
                start = None
        if start is not None and duration - start >= 0.18:
            ranges.append((max(0.0, start - 0.04), duration))
        # A momentary low-detail animation is part of the page change, not a
        # gap to excise. Removing it produced visible jumps within one tap.
        merged = []
        for start, end in ranges:
            if merged and start - merged[-1][1] < 0.9:
                merged[-1] = (merged[-1][0], end)
            else:
                merged.append((start, end))
        return [(round(a, 3), round(b, 3)) for a, b in merged]
    finally:
        capture.release()


def _compress_static_ranges(path: Path, ranges: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Remove the middle of long unchanged holds, retaining both context ends."""
    import cv2
    import numpy as np
    capture = cv2.VideoCapture(str(path))
    try:
        result = []
        for outer_start, outer_end in ranges:
            samples = []
            for at in np.arange(outer_start, outer_end, 0.15):
                capture.set(cv2.CAP_PROP_POS_MSEC, float(at) * 1000)
                ok, frame = capture.read()
                if ok:
                    gray = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (64, 142))
                    samples.append((float(at), gray.astype(float)))
            cuts = []
            still_start = None
            for (previous_at, previous), (at, current) in zip(samples, samples[1:]):
                changed = float(np.mean(np.abs(current - previous)) / 255) >= 0.005
                if not changed and still_start is None:
                    still_start = previous_at
                if changed and still_start is not None:
                    if previous_at - still_start >= 1.0:
                        cuts.append((still_start + 0.4, previous_at - 0.3))
                    still_start = None
            if still_start is not None and samples[-1][0] - still_start >= 1.0:
                cuts.append((still_start + 0.4, samples[-1][0] - 0.3))
            cursor = outer_start
            for cut_start, cut_end in cuts:
                if cut_end <= cut_start:
                    continue
                if cut_start - cursor >= 0.18:
                    result.append((cursor, cut_start))
                cursor = max(cursor, cut_end)
            if outer_end - cursor >= 0.18:
                result.append((cursor, outer_end))
        return [(round(a, 3), round(b, 3)) for a, b in result]
    finally:
        capture.release()


def _private_or_verification_step(clip: dict, action: dict) -> bool:
    """Keep account credentials and external verification out of the film."""
    state = str(clip.get("screen_state") or "").upper()
    phase = str((clip.get("actions") or [{}])[0].get("phase") or "").upper()
    verb = str(action.get("action") or "").upper()
    description = str(action.get("screen_desc") or "")
    if state in {"VERIFICATION", "VERIFICATION_RESULT", "DATE_PICKER"} or phase == "VERIFICATION":
        return True
    if verb == "FILL_FIELD":
        return not bool(clip.get("redactions"))
    if state in {"FIELD_FILLED", "FORM", "LOGIN"} or verb == "UPLOAD_RESUME":
        return True
    if re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", description, re.I):
        return True
    if re.search(r"\b(?:code|otp|password|phone number)\b", description, re.I):
        return True
    return False


def create_automatic_plan(session: Path | str) -> Path:
    """Select a complete, chronological first-run journey without a reviewer.

    A completed home is required. Reverse scrolls on the same screen are an
    exploration detour, not a second onboarding step. Repeated taps on an
    unchanged source screen are retries, so only the successful last attempt
    belongs in the film. The full decision record stays in the plan.
    """
    session = Path(session).expanduser().resolve()
    manifest = json.loads((session / "onboarding_manifest.json").read_text(encoding="utf-8"))
    if manifest.get("result", {}).get("status") != "COMPLETED_SETTLED":
        raise ValueError("Automatic edit requires a completed, settled onboarding run")
    plan_path = create_plan(session, force=True)
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    clips = plan["clips"]
    if not clips:
        raise ValueError("No eligible in-app motion bursts were captured")

    timeline = {}
    journal = session / "timeline_journal.jsonl"
    for line in journal.read_text(encoding="utf-8").splitlines():
        try:
            item = json.loads(line)
            timeline[int(item["timeline_sequence"])] = item
        except (ValueError, TypeError, KeyError, json.JSONDecodeError):
            continue

    def action_for(clip: dict) -> dict:
        first = (clip.get("actions") or [{}])[0]
        return timeline.get(first.get("timeline_sequence"), {})

    omit = {}
    for clip in clips:
        if _private_or_verification_step(clip, action_for(clip)):
            omit[clip["number"]] = "account_or_verification_private_step"
    # A launch burst often begins on Android's launcher. The first tap burst
    # begins on the app's welcome screen and still shows the first transition.
    if any((c.get("actions") or [{}])[0].get("kind") == "tap" for c in clips):
        for clip in clips:
            if (clip.get("actions") or [{}])[0].get("kind") == "launch":
                omit[clip["number"]] = "launcher_or_splash_before_first_action"

    # Ignore only an adjacent out-and-back scroll on one logical screen. A
    # one-way scroll may be needed to expose the next action and stays in.
    opposites = {("SCROLL_DOWN", "SCROLL_UP"), ("SCROLL_UP", "SCROLL_DOWN"),
                 ("SCROLL_LEFT", "SCROLL_RIGHT"), ("SCROLL_RIGHT", "SCROLL_LEFT")}
    for left, right in zip(clips, clips[1:]):
        a, b = action_for(left), action_for(right)
        if (left["number"] not in omit and right["number"] not in omit
                and left.get("screen_state") == right.get("screen_state")
                and (a.get("action"), b.get("action")) in opposites):
            omit[left["number"]] = "reversed_exploratory_scroll"
            omit[right["number"]] = "reversed_exploratory_scroll"

    # When the agent retries the same control on the identical source pixels,
    # the earlier attempt did not advance the film.
    for left, right in zip(clips, clips[1:]):
        a, b = action_for(left), action_for(right)
        if (left["number"] not in omit and right["number"] not in omit
                and a.get("action") == b.get("action") == "CLICK"
                and a.get("target") == b.get("target")
                and a.get("screenshot") == b.get("screenshot")):
            omit[left["number"]] = "repeated_unchanged_action"

    for clip in clips:
        if clip["number"] not in omit and _is_placeholder_burst(session / clip["file"]):
            omit[clip["number"]] = "loading_or_placeholder_only"

    for clip in clips:
        number = clip["number"]
        if number not in omit:
            visible_ranges = _visible_ranges(session / clip["file"])
            # Text-entry pauses carry the real agent's typing rhythm. Do not
            # collapse them as though they were idle static screens. Cut the
            # preparatory clear-field keypresses before the first typed byte.
            typed = [item for item in clip.get("actions", []) if item.get("kind") == "text"]
            if typed:
                ranges = visible_ranges
                if clip.get("started_at"):
                    first = max(0.0, float(typed[0]["at"]) - float(clip["started_at"]) - 0.35)
                    last = float(typed[-1]["at"]) - float(clip["started_at"]) + 0.8
                    ranges = [(max(start, first), min(end, last))
                              for start, end in ranges if min(end, last) - max(start, first) >= 0.18]
            else:
                # Short device bursts already contain the tap and its real
                # response. Cutting a brief still moment can remove the only
                # frames that connect two screens. Compress only long waits.
                ranges = (visible_ranges if _duration(session / clip["file"]) < 4
                          else _compress_static_ranges(session / clip["file"], visible_ranges))
            clip["keep_ranges"] = [
                {"trim_in": start, "trim_out": end}
                for start, end in ranges
            ]
            if not clip["keep_ranges"]:
                omit[number] = "loading_or_placeholder_only"
        clip["include"] = number not in omit
        clip["label"] = str(action_for(clip).get("target") or "app launch")
        if clip["include"] and sum(
            span["trim_out"] - span["trim_in"] for span in clip["keep_ranges"]
        ) < 0.18:
            raise ValueError(f"Selected burst {number} is too short to show an action")

    chosen = [c for c in clips if c["include"]]
    if not chosen or not any(action_for(c).get("action") == "CLICK" for c in chosen):
        raise ValueError("Automatic edit cannot establish a visible onboarding journey")
    if not any(c.get("screen_state") in {"OVERLAY/POPUP", "HOME", "DASHBOARD"}
               for c in chosen[-2:]):
        raise ValueError("Automatic edit has no visible transition to the usable home")
    plan["automatic_checks"] = {
        "status": "passed",
        "terminal_status": "COMPLETED_SETTLED",
        "selected_bursts": [c["number"] for c in chosen],
        "omitted_bursts": [{"number": n, "reason": reason} for n, reason in sorted(omit.items())],
    }
    plan_path.write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
    return plan_path


def _duration(path: Path) -> float:
    probe = _run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                  "-of", "default=noprint_wrappers=1:nokey=1", str(path)], timeout=20)
    if probe.returncode != 0:
        raise ValueError(f"ffprobe could not read {path}: {probe.stderr.strip()}")
    return float(probe.stdout.strip())


def _redaction_geometry(region: dict) -> tuple[int, int, int, int]:
    try:
        x1, y1, x2, y2 = map(int, region["rect"])
        source_w, source_h = map(int, region["screen_size"])
    except (KeyError, TypeError, ValueError):
        raise ValueError("A recorded text field has invalid redaction metadata") from None
    if not (0 <= x1 < x2 <= source_w and 0 <= y1 < y2 <= source_h):
        raise ValueError("A recorded text field has out-of-bounds redaction metadata")
    scale = min(720 / source_w, 1280 / source_h)
    pad_x = (720 - source_w * scale) / 2
    pad_y = (1280 - source_h * scale) / 2
    # Cover the grounded field, including its cursor and a small margin.
    left = max(0, int(pad_x + (x1 - 18) * scale))
    right = min(720, int(pad_x + (x2 + 18) * scale))
    top = max(0, int(pad_y + (y1 - 35) * scale))
    bottom = min(1280, int(pad_y + (y2 + 55) * scale))
    return left, top, max(left + 1, right), max(top + 1, bottom)


def _redaction_filters(regions: list[dict]) -> list[str]:
    """Map grounded device-field bounds to the normalized portrait film."""
    return [
        f"drawbox=x={left}:y={top}:w={right - left}:h={bottom - top}:"
        "color=0x171725:t=fill"
        for left, top, right, bottom in map(_redaction_geometry, regions)
    ]


def _typing_progress_filters(source: dict, start: float, end: float) -> list[str]:
    """Show the cadence of real typed characters without revealing their text."""
    regions = source.get("redactions") or []
    typed = [item for item in source.get("actions", []) if item.get("kind") == "text"]
    if not regions or not typed or not source.get("started_at"):
        return []
    left, top, right, bottom = _redaction_geometry(regions[0])
    events = [float(item["at"]) - float(source["started_at"]) - start for item in typed]
    slots = min(18, len(events), max(1, (right - left - 36) // 18))
    dot_y = max(top + 8, (top + bottom - 10) // 2)
    filters = []
    for slot in range(slots):
        event_index = min(len(events) - 1, ((slot + 1) * len(events) - 1) // slots)
        at = max(0.0, events[event_index])
        if at >= end - start:
            continue
        filters.append(
            f"drawbox=x={left + 18 + slot * 18}:y={dot_y}:w=9:h=9:"
            f"color=0xc5adff:t=fill:enable='gte(t,{at:.3f})'"
        )
    return filters


def render(session: Path | str, *, output: Path | None = None) -> Path:
    session = Path(session).expanduser().resolve()
    plan_path = session / "local_video_edit_plan.json"
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    if plan.get("reviewed") is not True and plan.get("automatic_checks", {}).get("status") != "passed":
        raise ValueError("A reviewed or automatically checked edit plan is required")
    selected = [clip for clip in plan.get("clips", []) if clip.get("include") is True]
    if not selected:
        raise ValueError("Select at least one reviewed clip in local_video_edit_plan.json")
    numbers = [int(clip["number"]) for clip in selected]
    if numbers != sorted(set(numbers)):
        raise ValueError("Selected clips must be unique and in original capture order")
    burst_by_number = {int(item["number"]): item for item in _read_bursts(session)}
    output = (output or session / "onboarding_local_proof.mp4").expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise ValueError("ffmpeg and ffprobe are required to render the local proof")
    import tempfile
    with tempfile.TemporaryDirectory(prefix="northstar_onboarding_edit_") as temp:
        temp_dir = Path(temp)
        segments = []
        provenance = []
        segment_number = 0
        dissolve = 0.38
        previous_real_duration = None
        previous_number = None
        for clip in selected:
            number = int(clip["number"])
            source = burst_by_number.get(number)
            if not source or not source.get("eligible") or source.get("file") != clip.get("file"):
                raise ValueError(f"Clip {number} is not an eligible recorded burst")
            path = (session / clip["file"]).resolve()
            if not path.is_relative_to(session) or not path.is_file():
                raise ValueError(f"Clip {number} is missing or outside the session")
            duration = _duration(path)
            regions = source.get("redactions") or []
            if any(item.get("kind") == "text" for item in source.get("actions", [])) and not regions:
                raise ValueError(f"Recorded text in clip {number} has no grounded redaction")
            spans = clip.get("keep_ranges") or [{
                "trim_in": clip.get("trim_in") or 0,
                "trim_out": duration if clip.get("trim_out") is None else clip["trim_out"],
            }]
            for span in spans:
                start = float(span["trim_in"])
                end = float(span["trim_out"])
                if not (0 <= start < end <= duration + 0.05):
                    raise ValueError(f"Clip {number} has an invalid trim range")
                segment_number += 1
                segment = temp_dir / f"segment_{segment_number:04d}.mp4"
                real_duration = end - start
                # Some Android screenrecords have under a second of media
                # despite a much longer real capture. Hold the next burst's
                # first settled frame long enough to read before its tap.
                lead = (dissolve if previous_real_duration is None or previous_number == number else
                        max(dissolve, min(1.25, 1.8 - previous_real_duration)))
                visual_filters = [
                    "fps=30", "scale=720:1280:force_original_aspect_ratio=decrease",
                    "pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=0x10111f",
                    *_redaction_filters(regions),
                    *_typing_progress_filters(source, start, end),
                    # Blend only held, already-redacted boundary frames. The
                    # real tap and app animation remain at their recorded pace.
                    f"tpad=start_mode=clone:start_duration={lead:.3f}:"
                    f"stop_mode=clone:stop_duration={dissolve}",
                    "format=yuv420p",
                ]
                command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                           "-ss", str(start), "-t", str(end - start), "-i", str(path),
                           "-vf", ",".join(visual_filters),
                           "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                           "-movflags", "+faststart", str(segment)]
                result = _run(command, timeout=120)
                if result.returncode != 0:
                    raise ValueError(f"ffmpeg failed on clip {number}: {result.stderr.strip()}")
                segments.append(segment)
                provenance.append({"number": number, "source": str(path),
                                   "trim_in": start, "trim_out": end,
                                   "lead_seconds": round(lead, 3),
                                   "redacted_fields": len(regions),
                                   "label": clip.get("label", "")})
                previous_real_duration = real_duration
                previous_number = number
        if len(segments) == 1:
            shutil.copyfile(segments[0], output)
            result = subprocess.CompletedProcess([], 0, "", "")
        else:
            inputs = [part for segment in segments for part in ("-i", str(segment))]
            graph = []
            transitions = []
            elapsed = _duration(segments[0])
            previous = "[0:v]"
            for index, segment in enumerate(segments[1:], 1):
                label = f"[blend{index}]"
                offset = elapsed - dissolve
                prior_source = burst_by_number[provenance[index - 1]["number"]]
                next_source = burst_by_number[provenance[index]["number"]]
                omitted_seconds = (float(next_source["started_at"])
                                   - float(prior_source["ended_at"])
                                   if next_source.get("started_at") and prior_source.get("ended_at")
                                   else 0)
                # A long private verification gap is a real edit in time.
                # Dip through the app's dark background instead of visually
                # superimposing account entry and the post-auth screen.
                transition = "fadeblack" if omitted_seconds > 60 else "fade"
                graph.append(
                    f"{previous}[{index}:v]xfade=transition={transition}:"
                    f"duration={dissolve}:offset={offset:.6f}{label}"
                )
                transitions.append({"from": provenance[index - 1]["number"],
                                    "to": provenance[index]["number"],
                                    "style": transition})
                previous = label
                elapsed = offset + _duration(segment)
            graph.append(f"{previous}tpad=stop_mode=clone:stop_duration=0.7,format=yuv420p[v]")
            result = _run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                           *inputs, "-filter_complex", ";".join(graph),
                           "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "medium",
                           "-crf", "18", "-movflags", "+faststart", str(output)], timeout=240)
        if result.returncode != 0:
            raise ValueError(f"ffmpeg could not blend selected clips: {result.stderr.strip()}")
    (session / "onboarding_local_proof_sources.json").write_text(
        json.dumps({"rendered_at": _utc_now(), "output": str(output),
                    "clips": provenance,
                    "transitions": transitions if len(segments) > 1 else []},
                   indent=2) + "\n", encoding="utf-8")
    return output


def _scan_rendered_privacy(path: Path) -> int:
    """OCR sampled frames and fail closed if an inbox address/code UI survives."""
    if not shutil.which("tesseract"):
        raise ValueError("Tesseract is required for automatic account-video privacy checks")
    import cv2
    import tempfile
    capture = cv2.VideoCapture(str(path))
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
    count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if fps <= 0 or count <= 0:
        capture.release()
        raise ValueError("Cannot read the rendered film for privacy checks")
    checked = 0
    try:
        with tempfile.TemporaryDirectory(prefix="northstar_video_privacy_") as tmp:
            frame_path = Path(tmp) / "frame.png"
            # Four samples per second catch short-lived account screens that
            # a once-per-second check could skip between edit boundaries.
            for frame_index in range(0, count, max(1, round(fps / 4))):
                capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
                ok, frame = capture.read()
                if not ok:
                    continue
                enlarged = cv2.resize(frame, None, fx=2, fy=2,
                                       interpolation=cv2.INTER_CUBIC)
                cv2.imwrite(str(frame_path), enlarged)
                ocr = _run(["tesseract", str(frame_path), "stdout", "--psm", "11"], timeout=25)
                if ocr.returncode != 0:
                    raise ValueError("OCR privacy check could not read a rendered frame")
                visible = ocr.stdout
                # OCR can insert spaces around a dot even when the address is
                # rendered without any; accept that spacing and fail closed.
                if (re.search(r"[A-Z0-9._%+-]+\s*@\s*[A-Z0-9-]+(?:\s*\.\s*[A-Z0-9-]+)+", visible, re.I)
                        or re.search(r"enter (?:the )?(?:verification )?code", visible, re.I)):
                    raise ValueError("Rendered onboarding film contains an account identifier or code-entry screen")
                checked += 1
    finally:
        capture.release()
    if checked < 2:
        raise ValueError("Too few frames were checked for account privacy")
    return checked


def automatic_edit(session: Path | str, *, output: Path | None = None) -> Path:
    """Build the plan, cut the film, and validate its playable output locally."""
    session = Path(session).expanduser().resolve()
    plan_path = create_automatic_plan(session)
    result = render(session, output=output)
    probe = _run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                  "-show_entries", "stream=width,height,nb_frames",
                  "-show_entries", "format=duration",
                  "-of", "json", str(result)], timeout=20)
    if probe.returncode != 0:
        result.unlink(missing_ok=True)
        raise ValueError("Rendered onboarding film failed ffprobe validation")
    info = json.loads(probe.stdout)
    stream = (info.get("streams") or [{}])[0]
    seconds = float(info.get("format", {}).get("duration") or 0)
    if (int(stream.get("width") or 0), int(stream.get("height") or 0)) != (720, 1280) or seconds < 2:
        result.unlink(missing_ok=True)
        raise ValueError("Rendered onboarding film has invalid size or duration")
    # The terminal label alone is insufficient: the last actual video frame
    # must resemble the agent's settled-home screenshot.
    import cv2
    import numpy as np
    home_ref = None
    for line in (session / "timeline_journal.jsonl").read_text(encoding="utf-8").splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if item.get("state") in {"HOME", "DASHBOARD"} and item.get("screenshot"):
            home_ref = session / "screenshots" / Path(item["screenshot"]).name
    reference = cv2.imread(str(home_ref)) if home_ref and home_ref.is_file() else None
    capture = cv2.VideoCapture(str(result))
    count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_ok, frame = False, None
    for offset in (2, 5, 10, 15):
        capture.set(cv2.CAP_PROP_POS_FRAMES, max(0, count - offset))
        frame_ok, frame = capture.read()
        if frame_ok:
            break
    capture.release()
    if reference is None or not frame_ok:
        result.unlink(missing_ok=True)
        raise ValueError("Automatic edit cannot verify the final home frame")
    height, width = frame.shape[:2]
    crop_width = min(width, round(height * reference.shape[1] / reference.shape[0]))
    frame = frame[:, (width - crop_width) // 2:(width + crop_width) // 2]
    a = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (64, 142)).astype(float)
    b = cv2.resize(cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY), (64, 142)).astype(float)
    home_delta = float(np.mean(np.abs(a - b)) / 255)
    if home_delta > 0.22:
        result.unlink(missing_ok=True)
        raise ValueError("Rendered film does not finish on the confirmed home screen")
    try:
        privacy_frames = _scan_rendered_privacy(result)
    except ValueError:
        result.unlink(missing_ok=True)
        raise
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    selected = [clip for clip in plan["clips"] if clip["include"]]
    interactions = {
        "tap_events": sum(item.get("kind") == "tap" for clip in selected
                          for item in clip.get("actions", [])),
        "typed_input_events": sum(item.get("kind") == "text" for clip in selected
                                  for item in clip.get("actions", [])),
        "redacted_field_bursts": sum(bool(clip.get("redactions")) for clip in selected),
    }
    report = {
        "status": "passed", "output": str(result), "duration_seconds": seconds,
        "width": 720, "height": 1280, "final_home_pixel_delta": round(home_delta, 4),
        "privacy_frames_checked": privacy_frames,
        "interactions": interactions, "selection": plan["automatic_checks"],
    }
    (session / "onboarding_local_proof_qa.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    plan_parser = commands.add_parser("plan", help="Create an unselected review plan from recorded bursts")
    plan_parser.add_argument("session", type=Path)
    plan_parser.add_argument("--force", action="store_true")
    render_parser = commands.add_parser("render", help="Render reviewed clips into one local MP4")
    render_parser.add_argument("session", type=Path)
    render_parser.add_argument("--output", type=Path)
    auto_parser = commands.add_parser("auto", help="Select, render, and validate the onboarding film automatically")
    auto_parser.add_argument("session", type=Path)
    auto_parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "plan":
            path = create_plan(args.session, force=args.force)
        elif args.command == "render":
            path = render(args.session, output=args.output)
        else:
            path = automatic_edit(args.session, output=args.output)
        print(path)
        return 0
    except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print(f"Local onboarding video: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
