import importlib.util
import json
import tempfile
import threading
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


SPEC = importlib.util.spec_from_file_location("capture_server", Path(__file__).with_name("server.py"))
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)


class CaptureServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        server.ROOT = Path(self.temp.name)
        self.old_script = server.SCRIPT
        self.old_emulator_units = server.EMULATOR_UNITS
        server.SCRIPT = server.ROOT / "spy_mobile2.5.py"
        server.SCRIPT.touch()
        server.TOKEN = "test-secret"
        server.DEVICES = {"pixel": "offline-test-serial"}
        server.EMULATOR_UNITS = {"pixel": "northstar-emulator.service"}
        server.PROCESSES.clear()
        self.http = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.http.server_port}"

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join(timeout=3)
        self.temp.cleanup()
        server.SCRIPT = self.old_script
        server.EMULATOR_UNITS = self.old_emulator_units

    def test_device_reboot_requires_auth_and_idle_device(self):
        self.assertEqual(self.call("/v1/devices/pixel/reboot", {}, authorized=False)[0], 401)
        self.assertEqual(self.call("/v1/devices/unknown/reboot", {})[0], 404)
        with patch.object(server, "_restart_emulator") as restart:
            self.assertEqual(self.call("/v1/devices/pixel/reboot", {})[0], 202)
            restart.assert_called_once_with("pixel")
        _, payload = self.call("/v1/runs", {
            "app": "Example", "package_name": "com.example.app",
            "device_id": "pixel", "scope": "browsing",
        })
        run = server._read_runs()[payload["run"]["id"]]
        run.update(status="running", pid=12345)
        server._write_runs({run["id"]: run})
        with patch.object(server, "_pid_alive", return_value=True), \
             patch.object(server, "_restart_emulator") as restart:
            code, response = self.call("/v1/devices/pixel/reboot", {})
        self.assertEqual(code, 409)
        self.assertIn("Pause", response["error"])
        restart.assert_not_called()

    def call(self, path, body=None, authorized=True):
        headers = {"Content-Type": "application/json"}
        if authorized:
            headers["Authorization"] = "Bearer test-secret"
        request = Request(self.base + path, headers=headers,
                          data=json.dumps(body).encode() if body is not None else None)
        try:
            with urlopen(request, timeout=3) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            with error:
                return error.code, json.load(error)

    def test_authenticated_run_is_persistent_and_cannot_start_without_app(self):
        self.assertEqual(self.call("/v1/runs", authorized=False)[0], 401)
        status, payload = self.call("/v1/runs", {
            "app": "Graet", "package_name": "com.graet.app",
            "organization_id": "tenant-1", "device_id": "pixel", "scope": "browsing",
        })
        self.assertEqual(status, 201)
        run_id = payload["run"]["id"]
        self.assertEqual(self.call("/v1/runs")[1]["runs"][0]["id"], run_id)
        self.assertEqual(json.loads((server.ROOT / "runs.json").read_text())[run_id]["status"], "queued")
        self.assertEqual(self.call(f"/v1/runs/{run_id}/start", {})[0], 409)

    def test_invalid_package_scope_and_screen_path_are_rejected(self):
        common = {"app": "Graet", "organization_id": "tenant-1", "device_id": "pixel", "scope": "browsing"}
        self.assertEqual(self.call("/v1/runs", {**common, "package_name": "com.app;rm"})[0], 400)
        status, payload = self.call("/v1/runs", {**common, "package_name": "com.app", "scope": "onboarding"})
        self.assertEqual(status, 201)
        self.assertEqual(payload["run"]["scope"], "onboarding")
        self.assertEqual(self.call("/v1/runs", {**common, "package_name": "com.app", "scope": "marketing"})[0], 400)
        self.assertEqual(self.call("/v1/runs/../../runs")[0], 404)

    def test_capture_can_enter_shared_pool_without_tenant(self):
        status, payload = self.call("/v1/runs", {
            "app": "Example", "package_name": "com.example.app",
            "device_id": "pixel", "scope": "onboarding",
        })
        self.assertEqual(status, 201)
        self.assertEqual(payload["run"]["organization_id"], "")

    def test_browsing_launcher_exposes_adb_to_worker(self):
        _, payload = self.call("/v1/runs", {
            "app": "Example", "package_name": "com.example.app",
            "device_id": "pixel", "scope": "browsing",
        })
        run_id = payload["run"]["id"]

        class FakeProcess:
            pid = 12345

            def poll(self):
                return None

        with patch.object(server.Handler, "_device_online", return_value=True), \
             patch.object(server, "_preflight", return_value={"ready": True}), \
             patch.object(server.subprocess, "Popen", return_value=FakeProcess()) as launch, \
             patch.object(server, "ADB", "/opt/android-sdk/platform-tools/adb"):
            self.assertEqual(self.call(f"/v1/runs/{run_id}/start", {})[0], 200)
        self.assertEqual(launch.call_args.kwargs["env"]["PATH"].split(":")[0],
                         "/opt/android-sdk/platform-tools")

    def test_full_log_download_is_authenticated_and_redacted(self):
        _, payload = self.call("/v1/runs", {
            "app": "Example", "package_name": "com.example.app",
            "device_id": "pixel", "scope": "onboarding",
        })
        run_id = payload["run"]["id"]
        log = server._run_dir(run_id) / "launch.log"
        log.write_text("\n".join(f"line {n}" for n in range(150)) + "\npassword=sample-secret-value\n")
        url = self.base + f"/v1/runs/{run_id}/logs/download"
        with self.assertRaises(HTTPError) as unauthorized:
            urlopen(url, timeout=3)
        self.assertEqual(unauthorized.exception.code, 401)
        unauthorized.exception.close()
        with patch.dict(server.os.environ, {"ONBOARDING_PASSWORD": "sample-secret-value"}):
            with urlopen(Request(url, headers={"Authorization": "Bearer test-secret"}), timeout=3) as response:
                content = response.read().decode()
                self.assertEqual(response.headers["Content-Type"], "text/plain; charset=utf-8")
        self.assertIn("line 0", content)
        self.assertIn("line 149", content)
        self.assertNotIn("sample-secret-value", content)
        self.assertIn("[redacted onboarding_password]", content)

    def test_partial_audit_cannot_claim_complete_after_process_exit(self):
        _, payload = self.call("/v1/runs", {
            "app": "Graet", "package_name": "com.graet", "organization_id": "tenant-1",
            "device_id": "pixel", "scope": "browsing",
        })
        run_id = payload["run"]["id"]
        runs = server._read_runs()
        runs[run_id].update(status="running", pid=123456)
        server._write_runs(runs)
        status_path = server._run_dir(run_id) / "capture_supervisor_status.json"
        status_path.write_text(json.dumps({"state": "complete", "coverage": {
            "capture_status": "finished", "audit_status": "complete",
            "pending_obligations": 1, "screenshots": 1,
        }}))
        with patch.object(server, "_pid_alive", return_value=False):
            self.assertEqual(self.call(f"/v1/runs/{run_id}")[1]["run"]["status"], "needs_review")
            status_path.write_text(json.dumps({"state": "complete", "coverage": {
                "capture_status": "finished", "audit_status": "complete",
                "pending_obligations": 0, "unverified_destinations": 0,
                "incomplete_topbars": 0, "partial_captures": 0, "screenshots": 1,
            }}))
            self.assertEqual(self.call(f"/v1/runs/{run_id}")[1]["run"]["status"], "complete")

    def test_progress_distinguishes_saved_home_evidence_from_other_root_tabs(self):
        _, payload = self.call("/v1/runs", {
            "app": "Wikipedia", "package_name": "org.wikipedia", "device_id": "pixel", "scope": "browsing",
        })
        run_id = payload["run"]["id"]
        directory = server._run_dir(run_id)
        (directory / "screenshots").mkdir()
        (directory / "screenshots" / "home.png").write_bytes(b"png")
        (directory / "session_manifest.json").write_text(json.dumps({
            "root_tab_reconciliation": [{"live_names": ["Home", "Saved", "Search", "Activity", "More"]}],
            "tabs": [{"name": "Home > Community", "canonical_path": "Home > Community",
                      "root_path": "Home", "survey_screenshots": ["home.png"],
                      "capture_status": "partial", "interactions": [{"id": "example"}]}],
        }))
        (directory / "agent_memory.json").write_text(json.dumps({
            "current_location": "Home > Community", "current_phase": "STRUCTURED_FEED",
            "tab_progress": {"Home > Community": {"survey": "partial", "interaction": "partial"}},
        }))
        code, response = self.call(f"/v1/runs/{run_id}/progress")
        self.assertEqual(code, 200)
        progress = response["progress"]
        self.assertEqual((progress["visited_tabs"], progress["identified_tabs"], progress["navigation_percent"]),
                         (1, 5, 20))
        self.assertEqual(progress["tabs"][0]["state"], "needs_followup")
        self.assertEqual(server.build_progress(directory, active=True)["tabs"][0]["state"], "capturing")
        self.assertEqual(progress["tabs"][1]["state"], "not_reached")
        self.assertEqual(progress["areas"][0]["state"], "not_identified")

    def test_finish_with_evidence_is_terminal_without_claiming_full_audit(self):
        _, payload = self.call("/v1/runs", {
            "app": "Wikipedia", "package_name": "org.wikipedia", "device_id": "pixel", "scope": "browsing",
        })
        run_id = payload["run"]["id"]
        self.assertEqual(self.call(f"/v1/runs/{run_id}/finish", {})[0], 409)
        directory = server._run_dir(run_id)
        (directory / "screenshots").mkdir()
        (directory / "screenshots" / "home.png").write_bytes(b"png")
        (directory / "unattended_audit.json").write_text(json.dumps({"status": "partial"}))
        runs = server._read_runs()
        runs[run_id].update(status="running", pid=123456)
        server._write_runs(runs)
        with patch.object(server, "_pid_alive", return_value=True), patch.object(server.os, "kill") as stop:
            code, response = self.call(f"/v1/runs/{run_id}/finish", {})
            self.assertEqual(code, 200)
            self.assertEqual(response["run"]["status"], "finishing")
            stop.assert_called_once_with(123456, server.signal.SIGINT)
        overdue = server._read_runs()[run_id]
        overdue["finish_requested_at"] = server.time.time() - 121
        with patch.object(server, "_pid_alive", return_value=True), \
             patch.object(server.os, "getpgid", return_value=123456), \
             patch.object(server.os, "killpg") as force_stop:
            self.assertEqual(server._status(overdue)["status"], "finishing")
            force_stop.assert_called_once_with(123456, server.signal.SIGKILL)
        with patch.object(server, "_pid_alive", return_value=False):
            code, response = self.call(f"/v1/runs/{run_id}")
            self.assertEqual(code, 200)
            self.assertEqual(response["run"]["status"], "finished_early")
            self.assertEqual(response["run"]["audit_status"], "partial")
        self.assertEqual(self.call(f"/v1/runs/{run_id}/start", {})[0], 409)

    def test_play_install_preflight_allows_missing_target_but_requires_store(self):
        run = {"device_id": "pixel", "package_name": "com.graet"}
        with patch.object(server, "_device_property", return_value="1"), \
             patch.object(server, "_installed", side_effect=lambda serial, package: package == "com.android.vending"):
            readiness = server._preflight(run, True)
            self.assertTrue(readiness["ready"])
            self.assertFalse(readiness["installed"])
            self.assertTrue(readiness["play_store"])
        with patch.object(server, "_device_property", return_value="1"), \
             patch.object(server, "_installed", return_value=False):
            readiness = server._preflight(run, True)
            self.assertFalse(readiness["ready"])
            self.assertEqual(readiness["reason"], "Google Play Store is unavailable on this device")
        with patch.object(server, "_device_property", return_value="1"), \
             patch.object(server, "_installed", return_value=True), \
             patch.object(server, "_launchable", return_value=False):
            readiness = server._preflight(run, True)
            self.assertFalse(readiness["ready"])
            self.assertEqual(readiness["reason"], "App is installed but has no launchable activity")

    def test_onboarding_requires_configured_host_identity_and_its_own_manifest(self):
        _, payload = self.call("/v1/runs", {
            "app": "Example", "package_name": "com.example.app", "organization_id": "tenant-1",
            "device_id": "pixel", "scope": "onboarding",
        })
        run_id = payload["run"]["id"]
        with patch.object(server, "_device_property", return_value="1"), \
             patch.object(server, "_installed", return_value=True), \
             patch.object(server, "_launchable", return_value=True):
            readiness = server._preflight(payload["run"], True)
        self.assertFalse(readiness["ready"])
        self.assertIn("identity", readiness["reason"])
        run = server._read_runs()[run_id]
        run.update(status="running", pid=123456)
        server._write_runs({run_id: run})
        directory = server._run_dir(run_id)
        (directory / "screenshots").mkdir()
        (directory / "screenshots" / "screen.png").write_bytes(b"png")
        (directory / "capture_supervisor_status.json").write_text(json.dumps({"state": "complete"}))
        (directory / "onboarding_manifest.json").write_text(json.dumps({
            "result": {"status": "COMPLETED_SETTLED", "settled_home_reached": True,
                       "score": 40, "account_created": False, "signup_found": False}
        }))
        with patch.object(server, "_pid_alive", return_value=False):
            status = self.call(f"/v1/runs/{run_id}")[1]["run"]
        self.assertEqual(status["status"], "needs_review")
        self.assertTrue(status["manifest_available"])
        self.assertEqual(status["onboarding_result"]["score"], 40)
        self.assertFalse(status["onboarding_result"]["account_created"])


if __name__ == "__main__":
    unittest.main()
