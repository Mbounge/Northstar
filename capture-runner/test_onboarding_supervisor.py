import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("onboarding_supervisor", Path(__file__).with_name("onboarding_supervisor.py"))
supervisor = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = supervisor
SPEC.loader.exec_module(supervisor)


class FakeProcess:
    def __init__(self, command, cwd, env, stdin, session, status):
        self.command = command
        self.env = env
        self.session = session
        self.status = status

    def wait(self):
        (self.session / "screenshots").mkdir(exist_ok=True)
        (self.session / "screenshots" / "screen.png").write_bytes(b"png")
        (self.session / "onboarding_manifest.json").write_text(json.dumps({
            "result": {"status": self.status, "settled_home_reached": self.status == "COMPLETED_SETTLED"}
        }))
        return 0

    def poll(self):
        return None


class OnboardingSupervisorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.script = self.root / "onboarding_mobile2.py"
        self.script.touch()
        self.profile = self.root / "profile.json"
        self.profile.write_text(json.dumps({"identity": {"email": "tester@example.com"}}))
        self.old_script = supervisor.SCRIPT
        self.old_python = supervisor.PYTHON
        supervisor.SCRIPT = self.script
        supervisor.PYTHON = sys.executable
        supervisor.STOP_REQUESTED = False

    def tearDown(self):
        supervisor.SCRIPT = self.old_script
        supervisor.PYTHON = self.old_python
        supervisor.STOP_REQUESTED = False
        self.temp.cleanup()

    def run_agent(self, session, status):
        commands = []

        def launch(command, cwd, env, stdin):
            commands.append((command, env))
            return FakeProcess(command, cwd, env, stdin, session, status)

        with patch.dict(os.environ, {
            "ONBOARDING_IDENTITY_PROFILE": str(self.profile),
            "ONBOARDING_PASSWORD": "test-password", "CAPTURE_ADB": "adb",
        }), patch.object(supervisor, "ensure_installed", return_value=None), \
             patch.object(supervisor.subprocess, "run") as clear, \
             patch.object(supervisor.subprocess, "Popen", side_effect=launch):
            result = supervisor.supervise("Example", "com.example.app", "emulator-5554", session)
        return result, commands, clear

    def test_new_run_clears_only_target_app_and_uses_selected_device(self):
        session = self.root / "run"
        result, commands, clear = self.run_agent(session, "COMPLETED_SETTLED")
        self.assertEqual(result, 0)
        clear.assert_called_once()
        self.assertEqual(clear.call_args.args[0], ["adb", "-s", "emulator-5554", "shell", "pm", "clear", "com.example.app"])
        self.assertEqual(commands[0][1]["ANDROID_SERIAL"], "emulator-5554")
        self.assertEqual(commands[0][1]["ONBOARDING_EMAIL"], "tester@example.com")
        self.assertIn("--resume", commands[0][0])
        self.assertEqual(json.loads((session / "capture_supervisor_status.json").read_text())["state"], "complete")

    def test_resume_preserves_app_data(self):
        session = self.root / "resume"
        session.mkdir()
        (session / "session_resume_state.json").write_text("{}")
        result, _, clear = self.run_agent(session, "COMPLETED_SETTLED")
        self.assertEqual(result, 0)
        clear.assert_not_called()

    def test_partial_result_requires_review(self):
        session = self.root / "partial"
        result, _, _ = self.run_agent(session, "BLOCKED_VERIFICATION")
        self.assertEqual(result, 2)
        self.assertEqual(json.loads((session / "capture_supervisor_status.json").read_text())["state"], "needs_review")


if __name__ == "__main__":
    unittest.main()
