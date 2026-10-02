import base64
import hashlib
import hmac
import json
import unittest

from access_grant import GrantInvalid, verify_grant
from pool_broker import permitted_packages


SECRET = b"preview-test-secret-longer-than-32-bytes"
KNOWN = {"org.wikipedia", "de.danoeh.antennapod"}


def sign(payload):
    encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).rstrip(b"=").decode()
    mac = base64.urlsafe_b64encode(hmac.new(SECRET, encoded.encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
    return f"{encoded}.{mac}"


class GrantTests(unittest.TestCase):
    def setUp(self):
        self.payload = {"v": 1, "aud": "northstar-preview", "tenant": "tenant-a", "user": "user-a",
                        "packages": ["org.wikipedia"], "exp": 1300}

    def test_valid_grant_limits_packages(self):
        self.assertEqual(verify_grant(sign(self.payload), SECRET, KNOWN, now=1000)["packages"], ["org.wikipedia"])

    def test_tampering_and_expiry_fail_closed(self):
        token = sign(self.payload)
        with self.assertRaises(GrantInvalid):
            verify_grant(token[:-1] + ("A" if token[-1] != "A" else "B"), SECRET, KNOWN, now=1000)
        with self.assertRaises(GrantInvalid):
            verify_grant(token, SECRET, KNOWN, now=1300)

    def test_unknown_package_and_long_lifetime_fail_closed(self):
        self.payload["packages"] = ["org.example.other"]
        with self.assertRaises(GrantInvalid):
            verify_grant(sign(self.payload), SECRET, KNOWN, now=1000)
        self.payload["packages"] = ["org.wikipedia"]
        self.payload["exp"] = 2000
        with self.assertRaises(GrantInvalid):
            verify_grant(sign(self.payload), SECRET, KNOWN, now=1000)

    def test_malformed_packages_do_not_crash_verifier(self):
        self.payload["packages"] = [{"package": "org.wikipedia"}]
        with self.assertRaises(GrantInvalid):
            verify_grant(sign(self.payload), SECRET, KNOWN, now=1000)

    def test_broker_restricts_catalog_to_signed_packages(self):
        app = {"grant_secret": SECRET, "apps": {package: {} for package in KNOWN}}
        # Use a grant with a lifetime inside the verifier's 15-minute limit.
        import time
        self.payload["exp"] = int(time.time()) + 300
        self.assertEqual(permitted_packages(app, sign(self.payload)), {"org.wikipedia"})
        with self.assertRaises(GrantInvalid):
            permitted_packages(app, None)

    def test_different_tenant_grants_cannot_cross_their_app_assignments(self):
        import time
        app = {"grant_secret": SECRET, "apps": {package: {} for package in KNOWN}}
        self.payload["exp"] = int(time.time()) + 300
        tenant_a = sign(self.payload)
        self.payload["tenant"] = "tenant-b"
        self.payload["packages"] = ["de.danoeh.antennapod"]
        tenant_b = sign(self.payload)
        self.assertEqual(permitted_packages(app, tenant_a), {"org.wikipedia"})
        self.assertEqual(permitted_packages(app, tenant_b), {"de.danoeh.antennapod"})


if __name__ == "__main__":
    unittest.main()
