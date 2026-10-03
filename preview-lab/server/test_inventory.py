import hashlib
import hmac
import json
import tempfile
import unittest
from pathlib import Path

from aiohttp import web
from aiohttp.test_utils import make_mocked_request

from pool_broker import inventory


class InventoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_inventory_requires_server_hmac_and_reads_new_catalog(self):
        secret = b"inventory-test-secret-longer-than-32-bytes"
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "apps.json"
            path.write_text(json.dumps([{"package": "org.wikipedia", "name": "Wikipedia", "icon": "wikipedia.png"}]))
            app = web.Application()
            app["grant_secret"] = secret
            app["apps_path"] = path
            unauthenticated = make_mocked_request("GET", "/inventory", app=app)
            with self.assertRaises(web.HTTPForbidden):
                await inventory(unauthenticated)
            mac = hmac.new(secret, b"northstar-preview-inventory-v1", hashlib.sha256).hexdigest()
            headers = {"Authorization": f"Bearer {mac}"}
            first = await inventory(make_mocked_request("GET", "/inventory", headers=headers, app=app))
            self.assertEqual(len(json.loads(first.text)["apps"]), 1)
            path.write_text(json.dumps([
                {"package": "org.wikipedia", "name": "Wikipedia", "icon": "wikipedia.png"},
                {"package": "com.example.newapp", "name": "New app", "icon": "app-placeholder.svg", "launch_gate": "google_play"},
            ]))
            second = await inventory(make_mocked_request("GET", "/inventory", headers=headers, app=app))
            self.assertEqual(len(json.loads(second.text)["apps"]), 2)
            self.assertEqual(json.loads(second.text)["apps"][1]["launch_gate"], "google_play")


if __name__ == "__main__":
    unittest.main()
