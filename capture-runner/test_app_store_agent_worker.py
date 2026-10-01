import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

import app_store_agent_worker as worker


class AppStoreAgentWorkerTests(unittest.TestCase):
    def test_original_agent_evidence_is_normalized_without_dropping_research(self):
        with tempfile.TemporaryDirectory() as temporary:
            session = Path(temporary) / "capture"
            session.mkdir()
            original_directory = Path.cwd()

            class OriginalAgent:
                data_dir = "data/app_store_intel_Example_20261001"

                def __init__(self):
                    self.manifest = {}

                async def run(self):
                    source = session / self.data_dir
                    (source / "icons").mkdir(parents=True)
                    (source / "screenshots").mkdir()
                    (source / "icons/app_icon_512x512.png").write_bytes(b"icon")
                    (source / "icons/competitor_01.png").write_bytes(b"other")
                    (source / "screenshots/carousel_00.jpg").write_bytes(b"screen")
                    (source / "app_store_manifest.json").write_text(json.dumps({
                        "app_name": "Example",
                        "app_store_url": "https://apps.apple.com/ca/app/example/id123456789",
                        "screenshots": {
                            "app_icon": f"{self.data_dir}/icons/app_icon_512x512.png",
                            "carousel": [f"{self.data_dir}/screenshots/carousel_00.jpg"],
                        },
                        "raw_data": {"hero": {"title": "Example"},
                                     "app_info": {"Seller": "Example Inc."},
                                     "raw_reviews": ["review"],
                                     "competitors": [{"name": "Other", "icon_path": f"{self.data_dir}/icons/competitor_01.png"}]},
                        "intelligence": {"executive_summary": "Meaningful research", "positioning": "Specific"},
                    }))

            fake = types.SimpleNamespace(AppStoreResearcher=OriginalAgent)
            try:
                with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}), \
                     patch.dict(sys.modules, {"legacy_app_store_researcher": fake}):
                    result = worker.research(session, "Example", "com.example.android")
            finally:
                os.chdir(original_directory)
            self.assertEqual(result["stage"], "ready_for_review")
            self.assertEqual(result["track_id"], 123456789)
            self.assertEqual(result["competitor_count"], 1)
            normalized = json.loads((session / "app_store/app_store_manifest.json").read_text())
            self.assertEqual(normalized["storefront"], "CA")
            self.assertEqual(normalized["intelligence"]["positioning"], "Specific")
            self.assertEqual(normalized["screenshots"]["carousel"], ["screenshots/carousel_00.jpg"])
            self.assertEqual(normalized["raw_data"]["competitors"][0]["icon_path"], "icons/competitor_01.png")
            self.assertTrue((session / "app_store/agent_manifest.json").is_file())
            self.assertTrue((session / "app_store/icons/app_icon_512x512.png").is_file())


if __name__ == "__main__":
    unittest.main()
