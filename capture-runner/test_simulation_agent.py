import signal
import unittest
from unittest.mock import Mock, patch

import simulation_agent


class SimulationAgentLauncherTests(unittest.TestCase):
    def test_argv_stays_literal_and_never_uses_a_shell(self):
        with patch.dict(simulation_agent.os.environ, {"NORTHSTAR_NODE": "/trusted/node"}):
            args = ["prepare", "--session", "/capture/with spaces;$(not-a-command)"]
            command = simulation_agent.command(args)
            self.assertEqual(command[:3], ["/trusted/node", "--import", "tsx"])
            self.assertEqual(command[-3:], args)

    def test_sigterm_forwards_to_owned_child_group_and_restores_handlers(self):
        child = Mock(pid=12345)
        child.poll.return_value = None
        handlers = {}
        def handler(sig, callback):
            handlers[sig] = callback
            return "previous-handler"
        def wait():
            handlers[signal.SIGTERM](signal.SIGTERM, None)
            return 1
        child.wait.side_effect = wait
        with patch.object(simulation_agent, "command", return_value=["node", "trusted.ts"]), \
             patch.object(simulation_agent.sys, "argv", ["launcher", "run"]), \
             patch.object(simulation_agent.subprocess, "Popen", return_value=child) as spawn, \
             patch.object(simulation_agent.signal, "signal", side_effect=handler), \
             patch.object(simulation_agent.os, "killpg") as kill:
            self.assertEqual(simulation_agent.main(), 1)
            self.assertTrue(spawn.call_args.kwargs["start_new_session"])
            self.assertNotIn("shell", spawn.call_args.kwargs)
            kill.assert_called_once_with(12345, signal.SIGTERM)
            self.assertEqual(handlers[signal.SIGTERM], "previous-handler")
            self.assertEqual(handlers[signal.SIGINT], "previous-handler")


if __name__ == "__main__":
    unittest.main()
