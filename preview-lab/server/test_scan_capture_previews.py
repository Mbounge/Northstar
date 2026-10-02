import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import scan_capture_previews


class ScanCapturePreviewsTests(unittest.TestCase):
    def test_new_capture_package_is_staged_from_its_installed_device(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "runs.json").write_text(json.dumps({
                "run-1": {"id": "run-1", "package_name": "com.example.app", "app": "Example",
                          "device_id": "android-2", "created_at": 1},
            }))
            registry = root / "apps.json"
            registry.write_text("[]")
            installed = subprocess.CompletedProcess([], 0, "package:/data/app/com.example.app/base.apk\n", "")
            calls = []
            with patch.dict(os.environ, {"CAPTURE_DATA_ROOT": str(root),
                                      "CAPTURE_DEVICES_JSON": json.dumps({"android-2": "emulator-5556"})}), \
                 patch.object(scan_capture_previews, "REGISTRY", registry), \
                 patch.object(scan_capture_previews.subprocess, "run", return_value=installed), \
                 patch.object(scan_capture_previews, "provision", side_effect=lambda *args: calls.append(args)):
                scan_capture_previews.main()
            self.assertEqual(calls, [("com.example.app", "Example", "emulator-5556", None)])


if __name__ == "__main__":
    unittest.main()
