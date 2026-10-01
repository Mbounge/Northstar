import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import service
from install_mac_worker import LABELS, chrome_arguments, definitions
from mac_collector import COLLECTOR_CHROME_DATA_DIR, configure as configure_mac_collector, dedicated_chrome_data_dir
from open_collector_browser import SOCIAL_URLS, launch_command, main as open_collector_browser
from publisher import validate_feed

TENANT = "12345678-1234-1234-1234-123456789abc"


class MarketingRunnerTests(unittest.TestCase):
    def test_mac_collector_publishes_to_canonical_host_without_redirect(self):
        with patch.dict(os.environ, {}, clear=True), patch("mac_collector.dotenv_values", return_value={
            "NORTHSTAR_MARKETING_RUNNER_TOKEN": "runner-test",
            "NORTHSTAR_MARKETING_PUBLISH_TOKEN": "publisher-test",
        }):
            configure_mac_collector()
            self.assertEqual(os.environ["NORTHSTAR_MARKETING_PUBLISH_URL"],
                             "https://www.usenorthstar.ai/api/internal/marketing-publish")
            self.assertEqual(os.environ["NORTHSTAR_MARKETING_WORKER_LOCATION"], "mac_bridge")

    def test_collector_cannot_use_everyday_chrome_or_profile(self):
        regular = Path.home() / "Library/Application Support/Google/Chrome"
        self.assertEqual(dedicated_chrome_data_dir(""), str(COLLECTOR_CHROME_DATA_DIR))
        with self.assertRaisesRegex(RuntimeError, "isolated Chrome collector"):
            dedicated_chrome_data_dir(str(regular))
        with self.assertRaisesRegex(RuntimeError, "isolated Chrome collector"):
            dedicated_chrome_data_dir(str(regular / "Profile 3"))
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, "isolated Chrome collector"):
                dedicated_chrome_data_dir(directory)

    def test_installed_browser_uses_existing_isolated_profile(self):
        launch_agents = definitions()
        arguments = chrome_arguments()
        self.assertIn(f"--user-data-dir={COLLECTOR_CHROME_DATA_DIR}", arguments)
        self.assertIn("--remote-debugging-address=127.0.0.1", arguments)
        self.assertIn("--remote-debugging-port=9222", arguments)
        self.assertFalse(launch_agents[LABELS[0]].get("KeepAlive", False))
        self.assertTrue(launch_agents[LABELS[0]]["ProgramArguments"][-1].endswith("open_collector_browser.py"))
        self.assertEqual(
            launch_agents[LABELS[1]]["EnvironmentVariables"]["NORTHSTAR_MARKETING_CHROME_DATA_DIR"],
            str(COLLECTOR_CHROME_DATA_DIR),
        )
        with self.assertRaisesRegex(RuntimeError, "isolated Chrome collector"):
            definitions(str(Path.home() / "Library/Application Support/Google/Chrome"))

    def test_one_time_signin_launcher_uses_only_collector_profile(self):
        command = launch_command()
        self.assertEqual(command[:4], ["open", "-na", "/Applications/Google Chrome.app", "--args"])
        self.assertIn(f"--user-data-dir={COLLECTOR_CHROME_DATA_DIR}", command)
        self.assertIn("--remote-debugging-address=127.0.0.1", command)
        self.assertIn("--remote-debugging-port=9222", command)
        self.assertEqual(tuple(command[-3:]), SOCIAL_URLS)

    def test_launcher_reuses_running_collector_without_opening_another(self):
        with patch("open_collector_browser.service.collector_owns_debugging_port", return_value=True), patch("open_collector_browser.subprocess.run") as run:
            open_collector_browser()
            run.assert_not_called()

    def test_debugging_port_must_belong_to_collector_profile(self):
        listener = MagicMock(returncode=0, stdout="p1234\n")
        process = MagicMock(returncode=0, stdout=f"n/Applications/Google Chrome.app/Contents/MacOS/Google Chrome\nn{COLLECTOR_CHROME_DATA_DIR}/Default/History\n")
        with patch.object(service, "CHROME_DATA_DIR", str(COLLECTOR_CHROME_DATA_DIR)), patch.object(service.subprocess, "run", side_effect=[listener, process]):
            self.assertTrue(service.collector_owns_debugging_port())
        wrong_profile = MagicMock(returncode=0, stdout="n/Applications/Google Chrome.app/Contents/MacOS/Google Chrome\nn/Users/mbounge/Library/Application Support/Google/Chrome/Default/History\n")
        with patch.object(service, "CHROME_DATA_DIR", str(COLLECTOR_CHROME_DATA_DIR)), patch.object(service.subprocess, "run", side_effect=[listener, wrong_profile]):
            self.assertFalse(service.collector_owns_debugging_port())
        with patch.object(service, "CHROME_DATA_DIR", str(COLLECTOR_CHROME_DATA_DIR)), patch.object(service, "collector_owns_debugging_port", return_value=False), self.assertRaisesRegex(RuntimeError, "does not belong"):
            service.cdp_endpoint()

    def test_chrome_debugging_port_is_resolved_without_exporting_browser_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "DevToolsActivePort").write_text("43127\n/devtools/browser/test-id\n")
            with patch.object(service, "CHROME_DATA_DIR", str(root)):
                self.assertEqual(service.cdp_endpoint(), "ws://127.0.0.1:43127/devtools/browser/test-id")
            (root / "DevToolsActivePort").write_text("bad\n/devtools/browser/test-id\n")
            with patch.object(service, "CHROME_DATA_DIR", str(root)), self.assertRaises(ValueError):
                service.cdp_endpoint()

    def test_collector_rejects_a_stale_or_wrong_chrome_endpoint(self):
        endpoint = "ws://127.0.0.1:43127/devtools/browser/expected"
        response = MagicMock()
        response.status = 200
        response.__enter__.return_value = response
        with patch.object(service, "CHROME_DATA_DIR", "/tmp/collector-profile"), patch.object(service, "cdp_endpoint", return_value=endpoint), patch.object(service, "urlopen", return_value=response):
            response.read.return_value = json.dumps({"webSocketDebuggerUrl": "ws://127.0.0.1:43127/devtools/browser/other"}).encode()
            self.assertFalse(service.linkedin_browser_connected())
            response.read.return_value = json.dumps({"webSocketDebuggerUrl": endpoint}).encode()
            self.assertTrue(service.linkedin_browser_connected())

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
            _, incomplete = validate_feed(records, root, {"linkedin": "https://linkedin.com/company/example", "twitter": "https://x.com/example"})
            self.assertEqual(incomplete["sources"]["twitter"]["status"], "no_verified_posts")

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

    def test_mac_collector_rejects_manual_run_while_browser_is_offline(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = service.validate_target({"tenant_id": TENANT, "app_name": "Example",
                "socials": {"twitter": "https://x.com/example"}})
            with patch.object(service, "CHROME_DATA_DIR", str(root)), patch.object(service, "TARGETS", root / "targets.json"), patch.object(service, "RUNS", root / "runs.json"), patch.object(service, "linkedin_browser_connected", return_value=False):
                service.write_json(service.TARGETS, {target["id"]: target})
                with self.assertRaisesRegex(ValueError, "dedicated Chrome collector endpoint is unavailable"):
                    service.queue_run(target["id"], "snapshot", "manual")

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
