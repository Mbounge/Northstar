import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app_catalog


class AppCatalogTests(unittest.TestCase):
    def test_root_staging_hands_private_directory_to_preview_worker(self):
        with tempfile.TemporaryDirectory() as folder:
            catalog = Path(folder) / "apks"
            catalog.mkdir()
            calls = []

            def fake_adb(_serial, *args):
                if args[:3] == ("shell", "pm", "path"):
                    return "package:/data/app/com.example.app/base.apk"
                if args[0] == "pull":
                    Path(args[2]).write_bytes(b"apk")
                    return ""
                raise AssertionError(args)

            with patch.object(app_catalog, "CATALOG", catalog), \
                 patch.object(app_catalog, "run_adb", fake_adb), \
                 patch.object(app_catalog.os, "geteuid", return_value=0), \
                 patch.object(app_catalog.os, "chown", side_effect=lambda path, uid, gid: calls.append((path, uid, gid))):
                app_catalog.stage("com.example.app", "emulator-5554")

            staged = catalog / "com.example.app"
            self.assertEqual(json.loads((staged / "manifest.json").read_text())["package"], "com.example.app")
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0][1:], (catalog.stat().st_uid, catalog.stat().st_gid))


if __name__ == "__main__":
    unittest.main()
