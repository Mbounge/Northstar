import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import service
from publisher import validate_feed

TENANT = "12345678-1234-1234-1234-123456789abc"


class MarketingRunnerTests(unittest.TestCase):
    def test_target_validation_and_schedule(self):
        target = service.validate_target({
            "tenant_id": TENANT, "app_name": "Example App", "cadence": "weekly",
            "timezone": "America/Halifax", "hour": 9, "weekday": 0,
            "socials": {"linkedin": "https://www.linkedin.com/company/example/?trk=tracking"},
        })
        self.assertEqual(target["socials"]["linkedin"], "https://www.linkedin.com/company/example/")
        due = service.next_due(target, datetime(2026, 9, 30, 12, tzinfo=timezone.utc))
        self.assertEqual(due.weekday(), 0)
        self.assertEqual(due.hour, 12)  # Halifax is UTC-3 in September.
        with self.assertRaises(ValueError):
            service.validate_target({"tenant_id": TENANT, "app_name": "../other", "socials": {"linkedin": "https://linkedin.com/company/example"}})
        with self.assertRaises(ValueError):
            service.validate_target({"tenant_id": TENANT, "app_name": "Example", "socials": {"linkedin": "https://linkedin.com.attacker.test/company/example"}})

    def test_feed_accepts_only_own_screenshot_backed_records(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            screenshots = root / "screenshots"
            screenshots.mkdir()
            good = screenshots / "post.jpg"
            good.write_bytes(b"a" * 1200)
            external = root / "outside.jpg"
            external.write_bytes(b"a" * 1200)
            records = [
                {"platform": "LinkedIn", "entity": "Example", "post_text": "A real post", "screenshot": str(good)},
                {"platform": "LinkedIn", "entity": "Example", "post_text": "A real post", "screenshot": str(external)},
                {"platform": "Instagram", "entity": "Example", "post_text": "A real post", "screenshot": str(good)},
                {"platform": "LinkedIn", "entity": "Example", "type": "Grid", "post_text": "Profile", "screenshot": str(good)},
            ]
            accepted, coverage = validate_feed(records, root, {"linkedin": "https://linkedin.com/company/example"})
            self.assertEqual(len(accepted), 1)
            self.assertEqual(coverage["sources"]["linkedin"]["posts"], 1)
            self.assertEqual(coverage["rejected_records"], 3)

    def test_duplicate_active_run_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = service.validate_target({"tenant_id": TENANT, "app_name": "Example", "socials": {"twitter": "https://x.com/example"}})
            with patch.object(service, "ROOT", root), patch.object(service, "TARGETS", root / "targets.json"), patch.object(service, "RUNS", root / "runs.json"):
                service.write_json(service.TARGETS, {target["id"]: target})
                first = service.queue_run(target["id"], "snapshot", "manual")
                self.assertEqual(first["status"], "queued")
                with self.assertRaises(ValueError):
                    service.queue_run(target["id"], "snapshot", "manual")
                service.record(first["id"], status="completed")
                second = service.queue_run(target["id"], "snapshot", "manual")
                self.assertNotEqual(first["id"], second["id"])

    def test_blocked_people_discovery_preserves_brand_but_needs_review(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = service.validate_target({"tenant_id": TENANT, "app_name": "Example",
                "socials": {"linkedin": "https://www.linkedin.com/company/example/"}})
            with patch.object(service, "ROOT", root), patch.object(service, "TARGETS", root / "targets.json"), patch.object(service, "RUNS", root / "runs.json"):
                service.write_json(service.TARGETS, {target["id"]: target})
                run = service.queue_run(target["id"], "research", "manual")

                def brand_only(_script, env, _log, _timeout):
                    roster = Path(env["NORTHSTAR_MARKETING_ROSTER_FILE"])
                    roster.parent.mkdir(parents=True, exist_ok=True)
                    roster.write_text(json.dumps([{"name": "Example", "type": "Brand"}]))

                with patch.object(service, "run_script", side_effect=brand_only):
                    service.perform({**run, "work_dir": str(root / "runs" / run["id"])})
                result = service.read_json(service.RUNS, {})[run["id"]]
                self.assertEqual(result["status"], "needs_review")
                self.assertEqual(result["roster_count"], 0)
                self.assertIn("could not be verified", result["error"])


if __name__ == "__main__":
    unittest.main()
