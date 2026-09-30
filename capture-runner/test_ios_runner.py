import importlib.util
import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


agent = load("ios_agent", "ios_agent.py")
server = load("ios_server", "ios_server.py")


class FakeAppium:
    def __init__(self):
        self.taps = []
        self.ended = False

    def open(self, udid, bundle_id):
        self.bundle_id = bundle_id

    def active_bundle(self):
        return self.bundle_id

    def screenshot(self):
        return b"\x89PNG\r\n\x1a\n"

    def source(self):
        return ('<App><XCUIElementTypeButton label="Settings" visible="true" '
                'enabled="true" x="10" y="20" width="80" height="40"/>'
                '<XCUIElementTypeButton label="Delete account" visible="true" '
                'enabled="true" x="10" y="80" width="80" height="40"/></App>')

    def tap(self, x, y):
        self.taps.append((x, y))

    def end(self):
        self.ended = True


class IOSAgentTests(unittest.TestCase):
    def test_resume_deduplicates_screens_and_never_taps_blocked_action(self):
        with tempfile.TemporaryDirectory() as directory:
            fake = FakeAppium()
            agent.STOP = False
            with patch.object(agent, "Appium", return_value=fake), patch.object(agent.time, "sleep"):
                self.assertEqual(agent.run(Path(directory), "phone-udid", "com.graet.mobile", 1), 2)
                self.assertEqual(agent.run(Path(directory), "phone-udid", "com.graet.mobile", 1), 2)
            state = json.loads((Path(directory) / "ios_capture_state.json").read_text())
            status = json.loads((Path(directory) / "ios_status.json").read_text())
            self.assertEqual(fake.taps, [(50, 40)])
            self.assertEqual(len(state["screens"]), 1)
            self.assertEqual(state["actions"], 1)
            self.assertEqual((Path(directory) / "latest_frame.png").read_bytes(), fake.screenshot())
            self.assertEqual(status["state"], "needs_review")
            self.assertEqual(status["coverage"]["audit_status"], "pending")
            self.assertTrue(fake.ended)


class IOSServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old = (server.ROOT, server.TOKEN, server.DEVICES)
        server.ROOT = Path(self.temp.name)
        server.TOKEN = "ios-test-secret"
        server.DEVICES = {"iphone": {"udid": "physical-udid", "name": "Real iPhone"}}
        server.PROCESSES.clear()
        self.http = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.http.server_port}"

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join(timeout=3)
        server.ROOT, server.TOKEN, server.DEVICES = self.old
        self.temp.cleanup()

    def call(self, path, body=None, authorized=True):
        headers = {"Content-Type": "application/json"}
        if authorized:
            headers["Authorization"] = "Bearer ios-test-secret"
        request = Request(self.base + path, headers=headers,
                          data=json.dumps(body).encode() if body is not None else None)
        try:
            with urlopen(request, timeout=3) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            with error:
                return error.code, json.load(error)

    def test_preflight_blocks_missing_real_app_and_never_marks_partial_run_complete(self):
        self.assertEqual(self.call("/v1/runs", authorized=False)[0], 401)
        status, body = self.call("/v1/runs", {
            "app": "Graet", "package_name": "com.graet.mobile", "organization_id": "tenant-1",
            "device_id": "iphone", "scope": "browsing",
        })
        self.assertEqual(status, 201)
        run_id = body["run"]["id"]
        with patch.object(server, "_online", return_value=True), \
             patch.object(server, "_installed", return_value=False), \
             patch.object(server, "_appium_ready", return_value=True):
            self.assertFalse(self.call(f"/v1/runs/{run_id}/preflight")[1]["preflight"]["ready"])
            self.assertEqual(self.call(f"/v1/runs/{run_id}/start", {})[0], 409)
        runs = server._runs()
        runs[run_id].update(status="running", pid=123456)
        server._save_runs(runs)
        (server._directory(run_id) / "ios_status.json").write_text(json.dumps({
            "state": "needs_review", "coverage": {"capture_status": "partial", "audit_status": "pending"},
        }))
        with patch.object(server, "_pid_alive", return_value=False):
            self.assertEqual(self.call(f"/v1/runs/{run_id}")[1]["run"]["status"], "needs_review")

    def test_coredevice_physical_udid_and_offline_check(self):
        listing = {"result": {"devices": [{"identifier": "coredevice-id",
                    "hardwareProperties": {"udid": "physical-udid", "reality": "physical"}}]}}
        with patch.object(server, "_devicectl", side_effect=[listing, {"result": {"apps": []}}]):
            self.assertTrue(server._online("physical-udid"))
        with patch.object(server, "_devicectl", side_effect=[listing, {}]):
            self.assertFalse(server._online("physical-udid"))


if __name__ == "__main__":
    unittest.main()
