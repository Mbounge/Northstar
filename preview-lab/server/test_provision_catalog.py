import hashlib
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import provision_catalog


class ProvisionCatalogTests(unittest.TestCase):
    def test_new_app_is_visible_only_after_verified_splits(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            registry = root / "apps.json"
            registry.write_text("[]")
            apks = root / "apks"
            apks.mkdir()
            icons = root / "icons"
            icons.mkdir()

            def fake_stage(package, serial):
                self.assertEqual(serial, "emulator-5554")
                staged = apks / package
                staged.mkdir()
                with zipfile.ZipFile(staged / "base.apk", "w") as archive:
                    archive.writestr("classes.dex", b"Lcom/pairip/licensecheck/LicenseActivity;" if package.endswith("protected") else b"test-dex")
                content = (staged / "base.apk").read_bytes()
                (staged / "manifest.json").write_text(json.dumps({
                    "package": package,
                    "splits": [{"file": "base.apk", "sha256": hashlib.sha256(content).hexdigest()}],
                }))

            with patch.object(provision_catalog, "ROOT", root), patch.object(provision_catalog, "REGISTRY", registry), \
                 patch.object(provision_catalog, "PUBLIC_ICONS", icons), patch.object(provision_catalog, "CATALOG", apks), \
                 patch.object(provision_catalog, "stage", fake_stage):
                self.assertEqual(provision_catalog.provision("com.example.app", "Example", "emulator-5554"), "ready")
                self.assertEqual(json.loads(registry.read_text())[0]["package"], "com.example.app")
                self.assertEqual(provision_catalog.provision("com.example.app", "Example", "emulator-5554"), "ready")
                self.assertEqual(provision_catalog.provision("com.example.protected", "Protected", "emulator-5554"), "ready")
                protected = next(app for app in json.loads(registry.read_text()) if app["package"] == "com.example.protected")
                self.assertEqual(protected["launch_gate"], "google_play")
                (apks / "com.example.app" / "base.apk").write_bytes(b"corrupt")
                with self.assertRaises(ValueError):
                    provision_catalog.provision("com.example.app", "Example", "emulator-5554")
                self.assertEqual(len(json.loads(registry.read_text())), 2)


if __name__ == "__main__":
    unittest.main()
