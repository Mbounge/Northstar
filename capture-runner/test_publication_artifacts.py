import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import server


class PublicationArtifactsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_root = server.ROOT
        server.ROOT = Path(self.temp.name)
        self.run = {"id": "11111111-1111-1111-1111-111111111111"}
        self.session = server.ROOT / self.run["id"]
        self.session.mkdir()

    def tearDown(self):
        server.ROOT = self.old_root
        self.temp.cleanup()

    def write(self, name, data):
        path = self.session / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data if isinstance(data, bytes) else json.dumps(data).encode())

    def fixture(self):
        self.write("processing_pipeline.json", {"stage": "ready_for_review", "canonical_screens": 1, "audit_status": "partial"})
        self.write("enriched/enriched_manifest.json", {"enriched_screenshots": [
            {"screenshot": "step_01.png", "enriched_file": "step_01_enriched.json"}]})
        self.write("enriched/session_intelligence.json", {"executive_summary": "Observed"})
        self.write("enriched/flows.json", {"screen_catalog": [{"screenshot_file": "step_01.png"}]})
        self.write("enriched/step_01_enriched.json", {"extraction_meta": {"provider": "openai"}})
        self.write("flows/flows.json", {"taxonomy": []})
        self.write("screenshots/step_01.png", b"png-evidence")
        self.write("app_store_research.json", {"stage": "ready_for_review", "track_id": 123})
        self.write("app_store/app_store_manifest.json", {"track_id": 123, "icons": {"app_icon": "icons/app_icon_512x512.png"}, "screenshots": {"carousel": []}})
        self.write("app_store/itunes_lookup.json", {"results": []})
        self.write("app_store/icons/app_icon_512x512.png", b"icon")

    def test_only_allowlisted_evidence_and_stable_hashes(self):
        self.fixture()
        self.write("private_password.txt", b"secret")
        self.write("app_store/screenshots/stale.jpg", b"stale")
        first = server._publication_files(self.run)
        second = server._publication_files(self.run)
        self.assertEqual(first, second)
        paths = {item["path"]: item for item in first["files"]}
        self.assertNotIn("private_password.txt", paths)
        self.assertNotIn("app_store/screenshots/stale.jpg", paths)
        self.assertEqual(paths["browsing/screenshots/step_01.png"]["sha256"], hashlib.sha256(b"png-evidence").hexdigest())
        self.assertEqual(first["audit_status"], "partial")
        self.write("screenshots/step_01.png", b"bad-evidence")
        changed = server._publication_files(self.run)
        self.assertNotEqual(changed["fingerprint"], first["fingerprint"])

    def test_missing_canonical_file_blocks_publication(self):
        self.fixture()
        (self.session / "screenshots/step_01.png").unlink()
        with self.assertRaisesRegex(ValueError, "Missing publication artifact"):
            server._publication_files(self.run)

    def test_unicode_article_name_is_safe_publication_evidence(self):
        self.fixture()
        old = "step_01"
        new = "choir_of_the_málaga_cathedral"
        (self.session / f"screenshots/{old}.png").rename(self.session / f"screenshots/{new}.png")
        (self.session / f"enriched/{old}_enriched.json").rename(self.session / f"enriched/{new}_enriched.json")
        self.write("enriched/enriched_manifest.json", {"enriched_screenshots": [
            {"screenshot": f"{new}.png", "enriched_file": f"{new}_enriched.json"}]})
        paths = {item["path"] for item in server._publication_files(self.run)["files"]}
        self.assertIn(f"browsing/screenshots/{new}.png", paths)
        self.assertIn(f"browsing/enriched/{new}_enriched.json", paths)

    def test_original_agent_manifest_and_competitor_icons_are_published(self):
        self.fixture()
        (self.session / "app_store/itunes_lookup.json").unlink()
        self.write("app_store/agent_manifest.json", {"intelligence": {"executive_summary": "Research"}})
        self.write("app_store/icons/competitor_01.png", b"competitor")
        self.write("app_store/app_store_manifest.json", {
            "track_id": 123, "icons": {"app_icon": "icons/app_icon_512x512.png"},
            "screenshots": {"carousel": []},
            "raw_data": {"competitors": [{"icon_path": "icons/competitor_01.png"}]},
        })
        paths = {item["path"] for item in server._publication_files(self.run)["files"]}
        self.assertIn("app_store/agent_manifest.json", paths)
        self.assertIn("app_store/icons/competitor_01.png", paths)
        self.assertNotIn("app_store/itunes_lookup.json", paths)


if __name__ == "__main__":
    unittest.main()
