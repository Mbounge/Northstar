"""Checks that an emailed code reaches the verification resource."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "agents"))
from onboarding_mobile2 import OnboardingSpy


class VerificationRoutingTests(unittest.TestCase):
    def test_sent_code_uses_inbox_before_resend_or_back(self):
        check = OnboardingSpy._verification_has_local_action_first
        for target in ("Didn't get the code? Resend it", "Back arrow", "Enter verification code"):
            self.assertFalse(check(None, {
                "action": "CLICK", "target_desc": target,
                "screen_description": "A verification code was sent by email; enter the code",
            }))

    def test_initial_send_code_action_stays_in_app(self):
        self.assertTrue(OnboardingSpy._verification_has_local_action_first(None, {
            "action": "CLICK", "target_desc": "Send code",
            "screen_description": "Enter your email to receive a code",
        }))


if __name__ == "__main__":
    unittest.main()
