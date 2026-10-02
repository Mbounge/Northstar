import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import preview_server


class ResetPackageTests(unittest.IsolatedAsyncioTestCase):
    async def test_only_known_system_crash_is_dismissed(self):
        self.assertTrue(preview_server.bluetooth_crash_focused(b"mCurrentFocus=Window{1 u0 Application Error: com.google.android.bluetooth}"))
        self.assertFalse(preview_server.bluetooth_crash_focused(b"mCurrentFocus=Window{1 u0 Application Error: org.wikipedia}"))
        self.assertFalse(preview_server.bluetooth_crash_focused(b"mFocusedApp=Application Error: com.google.android.bluetooth"))

    async def test_clean_reset_retains_only_the_allowed_package_name(self):
        with tempfile.TemporaryDirectory() as directory:
            last_package = Path(directory) / "last-package"
            reset_request = Path(directory) / "reset-request"
            app = {"stream_state": {"viewers": []}, "runtime": {"active_package": "org.wikipedia"}, "catalog": {"org.wikipedia": {}}}
            with patch.object(preview_server, "LAST_PACKAGE", last_package), patch.object(preview_server, "RESET_REQUEST", reset_request):
                await preview_server.reset_device(app)
            self.assertEqual(last_package.read_text(encoding="ascii"), "org.wikipedia\n")
            self.assertTrue(reset_request.exists())

    async def test_unknown_package_cannot_become_the_next_boot_default(self):
        with tempfile.TemporaryDirectory() as directory:
            last_package = Path(directory) / "last-package"
            reset_request = Path(directory) / "reset-request"
            app = {"stream_state": {"viewers": []}, "runtime": {"active_package": "other.package"}, "catalog": {"org.wikipedia": {}}}
            with patch.object(preview_server, "LAST_PACKAGE", last_package), patch.object(preview_server, "RESET_REQUEST", reset_request):
                await preview_server.reset_device(app)
            self.assertFalse(last_package.exists())
            self.assertTrue(reset_request.exists())


if __name__ == "__main__":
    unittest.main()
