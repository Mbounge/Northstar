import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("supervisor", Path(__file__).with_name("supervisor.py"))
supervisor = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = supervisor
SPEC.loader.exec_module(supervisor)


class SupervisorTests(unittest.TestCase):
    def test_disconnected_emulator_is_detected_from_agent_log(self):
        self.assertTrue(supervisor._device_disconnected_in_log("adb: device offline"))
        self.assertTrue(supervisor._device_disconnected_in_log("adb: device 'emulator-5554' not found"))
        self.assertTrue(supervisor._device_disconnected_in_log("ADB shell timed out after 20s"))
        self.assertFalse(supervisor._device_disconnected_in_log("Native root navigation verified"))

    def test_reconnect_waits_for_two_booted_checks_with_app_installed(self):
        def result(stdout, code=0):
            return subprocess.CompletedProcess([], code, stdout=stdout)

        checks = [result("offline", 1), result("", 1), result("", 1)] + [
            result("device\n"), result("1\n"), result("package:/data/app/example.apk\n")
        ] * 2
        with patch.object(supervisor.subprocess, "run", side_effect=checks) as call, \
             patch.object(supervisor.time, "sleep"):
            self.assertTrue(supervisor._wait_for_device("adb", "emulator-5554", "org.wikipedia", timeout=30))
        self.assertEqual(call.call_count, 9)

    def test_disconnected_pass_resumes_saved_session_after_device_returns(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = root / "fake_spy.py"
            script.write_text('''
import json, os
from pathlib import Path
session = Path(os.environ["MOBILESPY_RESUME_SESSION_DIR"])
counter = session / "passes.txt"
number = int(counter.read_text()) + 1 if counter.exists() else 1
counter.write_text(str(number))
complete = number == 2
(session / "session_manifest.json").write_text(json.dumps({
    "stabilization_summary": {"status": "finished" if complete else "partial"},
    "unattended_audit": {"status": "complete" if complete else "partial", "pending": 0 if complete else 1},
    "device_failures": [] if complete else [{"reason": "adb: device offline"}]
}))
(session / "unattended_audit.json").write_text(json.dumps({
    "status": "complete" if complete else "partial",
    "pending_obligations": [] if complete else [1],
    "graph_summary": {"complete_or_terminal": number}
}))
(session / "screenshots").mkdir(exist_ok=True)
(session / "screenshots" / f"screen{number}.png").write_bytes(b"test")
if not complete:
    with (session / "launch.log").open("a") as log:
        log.write("SCRIPT CRASHED: adb: device offline\\n")
''')
            old = (supervisor.SPY_SCRIPT, supervisor.SPY_ROOT, supervisor.SPY_PYTHON,
                   supervisor.STOP_REQUESTED)
            supervisor.SPY_SCRIPT, supervisor.SPY_ROOT = script, root
            supervisor.SPY_PYTHON = sys.executable
            supervisor.STOP_REQUESTED = False
            try:
                with patch.dict(os.environ, {
                    "MOBILESPY_RESUME_SESSION_DIR": str(root),
                    "MOBILESPY_DEVICE_SERIAL": "emulator-test",
                    "MOBILESPY_PACKAGE_NAME": "org.wikipedia",
                }), patch.object(supervisor, "ensure_installed", return_value=None), \
                     patch.object(supervisor, "_wait_for_device", return_value=True) as reconnect, \
                     patch.object(supervisor.time, "sleep", return_value=None):
                    self.assertEqual(supervisor.supervise("Wikipedia", root, 3), 0)
                state = json.loads((root / "capture_supervisor_status.json").read_text())
                self.assertEqual(state["state"], "complete")
                self.assertEqual(len(state["history"]), 2)
                self.assertTrue(state["history"][0]["device_reconnected"])
                reconnect.assert_called_once()
            finally:
                supervisor.SPY_SCRIPT, supervisor.SPY_ROOT, supervisor.SPY_PYTHON, \
                    supervisor.STOP_REQUESTED = old

    def test_manifest_audit_disagreement_never_counts_as_complete(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "session_manifest.json").write_text(json.dumps({
                "stabilization_summary": {"status": "finished"},
                "unattended_audit": {"status": "complete", "pending": 0},
            }))
            (root / "unattended_audit.json").write_text(json.dumps({
                "status": "partial", "pending_obligations": [],
            }))
            self.assertEqual(supervisor._snapshot(root)["audit_status"], "partial")

    def test_unverified_root_is_coverage_debt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "session_manifest.json").write_text(json.dumps({
                "stabilization_summary": {"status": "partial",
                                          "roots_needing_review": ["Search"]},
                "unattended_audit": {"status": "complete", "pending": 0},
            }))
            snapshot = supervisor._snapshot(root)
            self.assertEqual(snapshot["roots_needing_review"], 1)
            cleared = dict(snapshot, roots_needing_review=0)
            self.assertTrue(supervisor._structural_progress(snapshot, cleared))

    def test_partial_first_pass_resumes_and_complete_requires_audit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = root / "fake_spy.py"
            script.write_text('''
import json, os
from pathlib import Path
session = Path(os.environ["MOBILESPY_RESUME_SESSION_DIR"])
counter = session / "passes.txt"
number = int(counter.read_text()) + 1 if counter.exists() else 1
counter.write_text(str(number))
status = "partial" if number == 1 else "complete"
capture = "partial" if number == 1 else "finished"
(session / "session_manifest.json").write_text(json.dumps({
    "stabilization_summary": {"status": capture},
    "unattended_audit": {"status": status, "pending": 2 if number == 1 else 0}
}))
(session / "unattended_audit.json").write_text(json.dumps({
    "status": status, "pending_obligations": [1, 2] if number == 1 else [],
    "graph_summary": {"complete_or_terminal": number}
}))
(session / "screenshots").mkdir(exist_ok=True)
(session / "screenshots" / "screen.png").write_bytes(b"test")
''')
            old = (supervisor.SPY_SCRIPT, supervisor.SPY_ROOT, supervisor.SPY_PYTHON,
                   supervisor.STOP_REQUESTED)
            supervisor.SPY_SCRIPT, supervisor.SPY_ROOT = script, root
            supervisor.SPY_PYTHON = sys.executable
            supervisor.STOP_REQUESTED = False
            try:
                with patch.dict(os.environ, {
                    "MOBILESPY_RESUME_SESSION_DIR": str(root),
                    "MOBILESPY_DEVICE_SERIAL": "emulator-test",
                    "MOBILESPY_PACKAGE_NAME": "com.graet",
                }), patch.object(supervisor, "ensure_installed", return_value=None), \
                     patch.object(supervisor.time, "sleep", return_value=None):
                    self.assertEqual(supervisor.supervise("Graet", root, 3), 0)
                state = json.loads((root / "capture_supervisor_status.json").read_text())
                self.assertEqual(state["state"], "complete")
                self.assertEqual(len(state["history"]), 2)
                self.assertEqual((root / "passes.txt").read_text(), "2")
            finally:
                supervisor.SPY_SCRIPT, supervisor.SPY_ROOT, supervisor.SPY_PYTHON, \
                    supervisor.STOP_REQUESTED = old

    def test_play_incompatibility_stops_before_capture(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.dict(os.environ, {
                "MOBILESPY_DEVICE_SERIAL": "emulator-test",
                "MOBILESPY_PACKAGE_NAME": "com.graet",
            }), patch.object(supervisor, "ensure_installed", side_effect=supervisor.InstallBlocked(
                "incompatible", "Google Play says this app is incompatible")):
                self.assertEqual(supervisor.supervise("Graet", root, 2), 2)
            state = json.loads((root / "capture_supervisor_status.json").read_text())
            self.assertEqual(state["state"], "needs_review")
            self.assertEqual(state["phase"], "incompatible")


if __name__ == "__main__":
    unittest.main()
