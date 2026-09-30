import json
import tempfile
import unittest
from pathlib import Path

from reconcile_paused_capture import reconcile


class ReconcilePausedCaptureTests(unittest.TestCase):
    def test_misrouted_lane_becomes_diagnostic_and_evidence_is_preserved(self):
        with tempfile.TemporaryDirectory() as root:
            session = Path(root)
            (session / "screenshots").mkdir()
            for name in ("sheet.png", "wrong.png", "root.png"):
                (session / "screenshots" / name).write_bytes(
                    bytes([137, 80, 78, 71, 13, 10, 26, 10]) + b"evidence")
            (session / "session_manifest.json").write_text(json.dumps({
                "tabs": [
                    {"name": "Search > Close", "canonical_path": "Search > Close",
                     "survey_screenshots": [str(session / "screenshots" / "root.png")]},
                    {"name": "Search > Add", "canonical_path": "Search > Add",
                     "survey_screenshots": [str(session / "screenshots" / "wrong.png")]},
                ],
                "pristine_capture_results": [{"context": "tab_overlay_add", "status": "partial"}],
                "preflight_deferred": {"Search": {"status": "deferred"}},
            }))
            (session / "agent_memory.json").write_text(json.dumps({
                "tab_progress": {"Search": {"_pristine_pending_captures": {
                    "tab_overlay_add": {"scope": "Search"}}}}
            }))
            plan = {
                "move_lanes": [{"from": "Search > Close", "to": "Search > Default",
                                "type": "default_view"}],
                "exclude_lanes": [{"path": "Search > Add", "reason": "Wrong destination"}],
                "add_lanes": [{"path": "Search > Widget offer", "type": "prerequisite",
                               "screenshots": ["sheet.png"]}],
                "misrouted_capture_contexts": ["tab_overlay_add"],
                "clear_pending_captures": [{"root": "Search", "context": "tab_overlay_add"}],
                "clear_preflight_deferred": ["Search"],
                "overlay_misroutes": [{"root": "Search", "item": "Add",
                                       "reason": "Wrong destination", "screenshot": "wrong.png"}],
                "reset_progress": ["Search > Default"],
            }
            manifest, memory, events = reconcile(session, plan)
            paths = [lane["canonical_path"] for lane in manifest["tabs"]]
            self.assertEqual(paths, ["Search > Default", "Search > Widget offer"])
            self.assertTrue(manifest["pristine_capture_results"][0]["misrouted_diagnostic"])
            self.assertEqual(manifest["excluded_captures"][0]["survey_screenshots"],
                             [str(session / "screenshots" / "wrong.png")])
            self.assertFalse(manifest["overlay_misroutes"][0]["resolved"])
            self.assertEqual(manifest["preflight_deferred"], {})
            self.assertEqual(memory["tab_progress"]["Search > Default"]["survey"], "partial")
            self.assertNotIn("_pristine_pending_captures", memory["tab_progress"]["Search"])
            self.assertGreater(len(events), 5)
            # Dry-run reconciliation never changes the source files.
            self.assertIn("Search > Add", (session / "session_manifest.json").read_text())


if __name__ == "__main__":
    unittest.main()
