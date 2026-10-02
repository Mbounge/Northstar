import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from processing_pipeline import _enrichment_valid, _reconcile_flow_roots, inspect, prepare, run


class ProcessingPipelineTests(unittest.TestCase):
    def fixture(self, root):
        base = Path(root)
        session = base / "11111111-1111-1111-1111-111111111111"
        shots = session / "screenshots"
        shots.mkdir(parents=True)
        image = shots / "s0001_home.png"
        Image.new("RGB", (40, 80), "white").save(image)
        (base / "runs.json").write_text(json.dumps({session.name: {
            "status": "finished_early"}}))
        (session / "session_manifest.json").write_text(json.dumps({
            "app": "Example", "package": "org.example.app", "tabs": [{
                "name": "Home > Default", "canonical_path": "Home > Default",
                "type": "default_view", "survey_screenshots": [str(image)],
                "interactions": [],
            }],
        }))
        (session / "unattended_audit.json").write_text('{"status":"partial"}')
        return session, image

    def test_prepares_reviewable_flows_without_marking_partial_audit_complete(self):
        with tempfile.TemporaryDirectory() as root:
            session, image = self.fixture(root)
            original = (session / "session_manifest.json").read_bytes()
            result = prepare(session)
            self.assertEqual(result["stage"], "prepared")
            self.assertEqual(result["audit_status"], "partial")
            self.assertEqual(result["canonical_screens"], 1)
            self.assertTrue((session / "flows/flows.json").is_file())
            self.assertTrue((session / "flows/index.html").is_file())
            self.assertEqual((session / "session_manifest.json").read_bytes(), original)
            self.assertEqual(inspect(session)["canonical_screens"], 1)
            image.unlink()
            with self.assertRaisesRegex(ValueError, "Missing screenshot"):
                inspect(session)

    def test_running_capture_cannot_be_prepared(self):
        with tempfile.TemporaryDirectory() as root:
            session, _ = self.fixture(root)
            (session.parent / "runs.json").write_text(json.dumps({session.name: {
                "status": "running"}}))
            with self.assertRaisesRegex(ValueError, "must be finished"):
                inspect(session)

    def test_existing_generated_flow_roots_reconcile_without_reprocessing(self):
        with tempfile.TemporaryDirectory() as root:
            session, _ = self.fixture(root)
            (session / "agent_memory.json").write_text(json.dumps({"tab_index_map": {"0": "Home"}}))
            enriched = session / "enriched"
            enriched.mkdir()
            flow_file = enriched / "flows.json"
            flow_file.write_text(json.dumps({"summary": {"total_root_flows": 3}, "taxonomy": [
                {"label": "Home", "screens": [1], "children": []},
                {"label": "Search Panel", "screens": [2], "children": []},
                {"label": "Search Panel", "screens": [3], "children": []},
            ]}))
            _reconcile_flow_roots(session)
            first = flow_file.read_bytes()
            roots = json.loads(first)["taxonomy"]
            self.assertEqual([node["label"] for node in roots], ["Home", "Other app surfaces"])
            self.assertEqual(roots[1]["children"][0]["screens"], [2, 3])
            _reconcile_flow_roots(session)
            self.assertEqual(flow_file.read_bytes(), first)

    def test_changed_manifest_cannot_reuse_previous_processing_checkpoints(self):
        with tempfile.TemporaryDirectory() as root:
            session, _ = self.fixture(root)
            prepare(session)
            manifest_path = session / "session_manifest.json"
            manifest = json.loads(manifest_path.read_text())
            manifest["app"] = "Changed source"
            manifest_path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "manifest changed"):
                run(session)

    def test_changed_screenshot_cannot_reuse_previous_processing_checkpoints(self):
        with tempfile.TemporaryDirectory() as root:
            session, image = self.fixture(root)
            prepared = prepare(session)
            self.assertEqual(len(prepared["source_screens_sha256"]), 64)
            Image.new("RGB", (40, 80), "black").save(image)
            with self.assertRaisesRegex(ValueError, "screenshots changed"):
                run(session)

    def test_screen_checkpoints_do_not_hide_failed_market_synthesis(self):
        with tempfile.TemporaryDirectory() as root:
            session, image = self.fixture(root)
            enriched = session / "enriched"
            enriched.mkdir()
            (enriched / "screen.json").write_text(json.dumps({
                "extraction_meta": {"provider": "openai"}}))
            (enriched / "enriched_manifest.json").write_text(json.dumps({
                "enriched_screenshots": [{"screenshot": image.name,
                                          "enriched_file": "screen.json"}]}))
            intelligence = enriched / "session_intelligence.json"
            intelligence.write_text(json.dumps({"executive_summary": "",
                                                "competitive_profile": {}}))
            self.assertFalse(_enrichment_valid(session, {image.name}))
            intelligence.write_text(json.dumps({
                "executive_summary": "Evidence-backed summary",
                "competitive_profile": {"macro_market": "Education & Learning",
                                        "micro_niche": "Encyclopedia"}}))
            self.assertTrue(_enrichment_valid(session, {image.name}))


if __name__ == "__main__":
    unittest.main()
