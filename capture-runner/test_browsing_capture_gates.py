import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


def _agent_module():
    spec = importlib.util.spec_from_file_location(
        "browsing_mobile2_for_test", Path(__file__).parent / "agents" / "browsing_mobile2.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BrowsingCaptureGateTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        try:
            cls.agent = _agent_module()
        except ImportError as exc:
            raise unittest.SkipTest(f"Browsing agent dependencies unavailable: {exc}")

    def test_overlay_requires_root_bar_to_be_hidden(self):
        decide = self.agent._accept_overlay_prediction
        self.assertFalse(decide({"is_overlay": True}, True))
        self.assertTrue(decide({"is_overlay": True}, False))
        self.assertFalse(decide({"is_overlay": False}, False))

    def test_capped_capture_gets_a_larger_bounded_repair(self):
        limit = self.agent._repair_scroll_limit
        records = [{"scope": "Home > Article", "status": "capture_limit_reached",
                    "swipe_attempts": 12}]
        self.assertEqual(limit(records, "Home > Article"), 24)
        records.append({"scope": "Home > Article", "status": "capture_limit_reached",
                        "swipe_attempts": 24})
        self.assertEqual(limit(records, "Home > Article"), 32)
        records.append({"scope": "Home > Article", "status": "confirmed_vertical_end"})
        self.assertEqual(limit(records, "Home > Article"), 12)

    def test_root_with_a_pending_child_is_not_certified(self):
        with tempfile.TemporaryDirectory() as root:
            shot = Path(root) / "screen.png"
            shot.write_bytes(b"saved")
            lane = {"name": "Saved > All articles", "type": "active_filter",
                    "survey_screenshots": [str(shot)]}
            stages = {"Saved > All articles": {"survey": "complete", "interaction": "complete"}}
            self.assertEqual(self.agent._root_exit_checkpoint(
                "Saved", [lane], stages, {})["status"], "verified")
            stages["Saved"] = {"_pristine_pending_captures": {
                "child": {"scope": "Saved > All articles > Search"}}}
            self.assertEqual(self.agent._root_exit_checkpoint(
                "Saved", [lane], stages, {})["status"], "review_needed")

    def test_wrong_route_is_quarantined_and_recaptured_on_resume(self):
        with tempfile.TemporaryDirectory() as root:
            screenshots = Path(root) / "screenshots"
            screenshots.mkdir()
            wrong = screenshots / "wrong.png"
            wrong.write_bytes(b"\x89PNG\r\n\x1a\nrest")
            manifest = {
                "tabs": [{"name": "Search > Add", "canonical_path": "Search > Add",
                          "type": "captured_surface",
                          "survey_screenshots": [str(wrong)]}],
                "overlay_misroutes": [{"root": "Search", "item": "Add",
                                        "diagnostic_screenshot": str(wrong)}],
            }
            progress = {"Search > Add": {"survey": "complete", "interaction": "complete"}}
            reconcile = self.agent._reconcile_capture_evidence
            self.assertEqual(len(reconcile(manifest, progress, str(screenshots))), 1)
            self.assertEqual(manifest["tabs"][0]["survey_screenshots"], [])
            self.assertEqual(progress["Search > Add"]["survey"], "partial")
            self.assertEqual(manifest["targeted_recaptures"], ["Search"])
            self.assertEqual(reconcile(manifest, progress, str(screenshots)), [])
            self.assertEqual(len(manifest["excluded_captures"]), 1)

    def test_missing_png_cannot_certify_a_root(self):
        with tempfile.TemporaryDirectory() as root:
            missing = Path(root) / "screenshots" / "lost.png"
            missing.parent.mkdir()
            manifest = {"tabs": [{"name": "Home > Default", "type": "default_view",
                                   "survey_screenshots": [str(missing)]}]}
            progress = {"Home > Default": {"survey": "complete", "interaction": "complete"}}
            self.agent._reconcile_capture_evidence(manifest, progress, str(missing.parent))
            self.assertEqual(self.agent._root_exit_checkpoint(
                "Home", manifest["tabs"], progress, {})["status"], "review_needed")

    def test_unresolved_menu_misroute_blocks_root_completion(self):
        with tempfile.TemporaryDirectory() as root:
            shot = Path(root) / "screen.png"
            shot.write_bytes(b"saved")
            lane = {"name": "Search > Default", "type": "default_view",
                    "survey_screenshots": [str(shot)]}
            progress = {"Search > Default": {"survey": "complete", "interaction": "complete"}}
            misroute = [{"root": "Search", "item": "Add", "resolved": False}]
            result = self.agent._root_exit_checkpoint(
                "Search", [lane], progress, {}, misroute)
            self.assertEqual(result["status"], "review_needed")
            self.assertEqual(result["unresolved_misroutes"], ["Add"])

    async def test_introduction_advances_only_with_native_safe_action(self):
        module = self.agent

        class FakeDevice:
            screen_size = (1080, 2400)

        class FakeSpy:
            device = FakeDevice()
            session_data = {"tabs": []}
            tapped = False

            async def _ai_call(self, *args, **kwargs):
                return {"informational_intro": True, "safe_to_continue": True,
                        "action_label": "Continue", "evidence": "intro heading and button"}

            async def _probe_tap(self, x, y, **kwargs):
                self.tapped = (x, y)
                return True

            async def _capture_active_screen(self):
                return b"after"

            def save_screenshot_bytes(self, image, name):
                return "/session/screenshots/intro.png"

            def sanitize_filename(self, text):
                return text.lower()

            def _force_save_manifest(self):
                pass

        fake = FakeSpy()
        elements = [{"text": "Continue", "enabled": True,
                     "bounds": [480, 2100, 900, 2200]}]
        with patch.object(module, "compute_screen_hash", side_effect=lambda data: data):
            self.assertTrue(await module.UniversalMobileSpy._advance_root_introduction(
                fake, "Activity", b"before", elements))
        self.assertEqual(fake.tapped, (690, 2150))
        self.assertEqual(fake.session_data["tabs"][0]["canonical_path"],
                         "Activity > Introduction")
        fake.tapped = False
        self.assertFalse(await module.UniversalMobileSpy._advance_root_introduction(
            fake, "Activity", b"before", elements + [{"text": "Password"}]))
        self.assertFalse(fake.tapped)

    async def test_overlay_destination_needs_semantic_match_with_confidence(self):
        module = self.agent

        class FakeSpy:
            verdict = {"matches_action": False, "confidence": 0.99,
                       "observed_page": "Languages", "reason": "Unrelated"}

            async def _ai_call(self, *args, **kwargs):
                return self.verdict

        fake = FakeSpy()
        check = module.UniversalMobileSpy._verify_overlay_destination
        self.assertFalse((await check(fake, "Search", "Add", b"before", b"after"))[0])
        fake.verdict = {"matches_action": True, "confidence": 0.6}
        self.assertFalse((await check(fake, "Search", "Add", b"before", b"after"))[0])
        fake.verdict = {"matches_action": True, "confidence": 0.95}
        self.assertTrue((await check(fake, "Search", "Close", b"before", b"after"))[0])


if __name__ == "__main__":
    unittest.main()
