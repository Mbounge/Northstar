import asyncio
import shlex
import unittest
from unittest.mock import AsyncMock

from input_text import send_adb_text


class PreviewInputTests(unittest.TestCase):
    def test_login_punctuation_is_quoted_and_percent_preserved(self):
        value = "a&b %s'c;$()"
        run = AsyncMock()
        asyncio.run(send_adb_text(value, adb="adb", device="emulator-test", run_checked=run))
        entered = ""
        for call in run.await_args_list:
            remote = call.args[4]
            self.assertEqual(call.args[3], "shell")
            parts = shlex.split(remote)
            self.assertEqual(parts[:2], ["input", "text"])
            self.assertEqual(len(parts), 3)
            entered += parts[2].replace("%s", " ")
        self.assertEqual(entered, value)


if __name__ == "__main__":
    unittest.main()
