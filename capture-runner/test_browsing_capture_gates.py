import importlib.util
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
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

    def test_named_root_menu_needs_two_distinct_destinations(self):
        decide = self.agent._accept_named_root_overlay
        self.assertTrue(decide({"is_overlay": True, "menu_items": [
            {"name": "Settings"}, {"name": "Games"}, {"name": "Cancel"}]}))
        self.assertFalse(decide({"is_overlay": True, "menu_items": [
            {"name": "Sign in"}, {"name": "Cancel"}]}))
        self.assertFalse(decide({"is_overlay": False, "menu_items": [
            {"name": "Settings"}, {"name": "Games"}]}))

    def test_account_gate_requires_blocked_content_and_visible_evidence(self):
        decide = self.agent._confirmed_root_access_gate
        self.assertTrue(decide({"is_required": True, "root_content_visible": False,
                                "visible_evidence": "Log in or create an account to view activity"}))
        self.assertFalse(decide({"is_required": True, "root_content_visible": True,
                                 "visible_evidence": "Optional sign-in banner beside feed"}))
        self.assertFalse(decide({"is_required": True, "root_content_visible": False,
                                 "visible_evidence": ""}))

    def test_resume_targets_keep_their_explicit_order(self):
        tabs = [{"name": name} for name in ("Home", "Search", "More", "Saved", "Activity")]
        ordered = self.agent._prioritize_targeted_roots(tabs, ["More", "Activity", "Search"])
        self.assertEqual([tab["name"] for tab in ordered],
                         ["More", "Activity", "Search", "Home", "Saved"])

    def test_crash_dialog_is_not_called_an_external_destination(self):
        decide = self.agent._foreground_exit_reason
        self.assertEqual(decide([{"text": "Wikipedia keeps stopping"}]), "app_crash")
        self.assertEqual(decide([{"text": "Open in Chrome"}]), "left_app_unverified")
        log = ("1790874549.500 1 1 E AndroidRuntime: FATAL EXCEPTION: main\n"
               "1790874549.501 1 1 E AndroidRuntime: Process: org.wikipedia, PID: 123\n")
        self.assertTrue(self.agent._recent_android_crash(log, "org.wikipedia", 1790874550))
        self.assertFalse(self.agent._recent_android_crash(log, "org.wikipedia", 1790874600))
        self.assertFalse(self.agent._recent_android_crash(log, "other.app", 1790874550))

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

    async def test_menu_root_checkpoint_does_not_repair_background_page(self):
        class RepairPlane:
            async def run_repair_pass(self, **kwargs):
                raise AssertionError("A menu root has no background page to repair")

        with tempfile.TemporaryDirectory() as root:
            fake = SimpleNamespace(
                session_data={"tabs": [{"name": "More > Menu",
                                         "type": "root_overlay_menu",
                                         "survey_screenshots": []}]},
                memory=SimpleNamespace(tab_progress={}, save_memory=lambda: None),
                screenshot_dir=root,
                control_plane=RepairPlane(),
                _force_save_manifest=lambda: None,
            )
            await self.agent.UniversalMobileSpy._checkpoint_root_exit(
                fake, "More", allow_repair=False)
            self.assertEqual(fake.session_data["root_exit_checkpoints"]["More"]["status"],
                             "review_needed")
            self.assertNotIn("root_repair_passes", fake.session_data)

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

    async def test_named_menu_outweighs_dimmed_background_tab_selection(self):
        module = self.agent

        class FakeDevice:
            screen_size = (1080, 2400)
            tapped = False

            def is_app_running(self):
                return True

            def get_ui_elements(self):
                if self.tapped:
                    return []
                return [
                    {"text": "Home", "enabled": True, "selected": True,
                     "bounds": [40, 2130, 160, 2320]},
                    {"text": "More", "enabled": True, "selected": False,
                     "bounds": [910, 2130, 1030, 2320]},
                ]

        class FakeSpy:
            device = FakeDevice()
            memory = type("Memory", (), {"current_tab": "More"})()
            session_data = {"tabs": []}
            _current_main_tabs = [
                {"name": "Home", "type": "bottom", "source": "xml", "x": 100, "y": 2232},
                {"name": "More", "type": "bottom", "source": "xml", "x": 970, "y": 2232},
            ]

            async def _capture_active_screen(self):
                return b"after" if self.device.tapped else b"before"

            async def _probe_tap(self, x, y, **kwargs):
                self.device.tapped = True
                self._last_tap_probe = {"point": (x, y)}
                return True

            async def _ai_call(self, prompt, **kwargs):
                if "NAMED ROOT MENU CHECK" in prompt:
                    return {"is_overlay": True, "menu_items": [
                        {"name": "Settings", "x": 500, "y": 1900},
                        {"name": "Games", "x": 500, "y": 1750}]}
                return {"has_bottom_nav": True, "active_tab_name": "More",
                        "active_tab_id": "nav_2", "confidence": "medium",
                        "active_evidence": "More is visible behind its dimmed menu"}

        fake = FakeSpy()
        with patch.object(module, "compute_screen_hash", side_effect=lambda data: data), \
             patch.object(module.time, "sleep", return_value=None):
            self.assertTrue(await module.UniversalMobileSpy._enforce_current_tab(fake))
        self.assertEqual(fake._last_tab_verification["status"], "verified_root_overlay")
        self.assertEqual(fake._last_verified_root_overlay["tab"], "More")

        low_confidence = FakeSpy()
        low_confidence.device = FakeDevice()
        original = low_confidence._ai_call

        async def ambiguous_identity(prompt, **kwargs):
            if "ROOT TAB IDENTITY" in prompt:
                return {"has_bottom_nav": True, "active_tab_name": None,
                        "confidence": "low", "active_evidence": "Menu obscures the bar"}
            return await original(prompt, **kwargs)

        low_confidence._ai_call = ambiguous_identity
        with patch.object(module, "compute_screen_hash", side_effect=lambda data: data), \
             patch.object(module.time, "sleep", return_value=None):
            self.assertTrue(await module.UniversalMobileSpy._enforce_current_tab(low_confidence))
        self.assertEqual(low_confidence._last_tab_verification["status"], "verified_root_overlay")

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
