import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from processing_pipeline import inspect, prepare, run


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


if __name__ == "__main__":
    unittest.main()
