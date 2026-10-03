import sys
import unittest
from pathlib import Path
from unittest.mock import call, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import prepare_headless_input


class HeadlessInputTests(unittest.TestCase):
    def test_late_boot_restoration_is_repaired_without_reboot(self):
        def fake_adb(_serial, *arguments, **_kwargs):
            return "device" if arguments == ("get-state",) else "1"

        with patch.object(prepare_headless_input, "adb", side_effect=fake_adb), \
             patch.object(prepare_headless_input, "verify", side_effect=[RuntimeError("IME restored"), RuntimeError("Google app restored"), None]) as verify, \
             patch.object(prepare_headless_input, "apply") as apply, \
             patch.object(prepare_headless_input.time, "sleep"):
            prepare_headless_input.ensure("emulator-5562")

        self.assertEqual(verify.call_count, 3)
        self.assertEqual(apply.call_args_list, [call("emulator-5562", dismiss_overlay=False)] * 2)


if __name__ == "__main__":
    unittest.main()
