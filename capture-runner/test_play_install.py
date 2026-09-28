import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("play_install", Path(__file__).with_name("play_install.py"))
play = importlib.util.module_from_spec(SPEC)
import sys
sys.modules[SPEC.name] = play
SPEC.loader.exec_module(play)


def xml(*nodes):
    return "<hierarchy>" + "".join(
        f'<node text="{text}" content-desc="" bounds="[0,0][100,60]" enabled="true" />'
        for text in nodes
    ) + "</hierarchy>"


class PlayInstallTests(unittest.TestCase):
    def test_only_requested_listing_install_button_is_actionable(self):
        state, point = play._screen_state(play._ui_nodes(xml("GRAET: Hockey News", "Install")), "Graet")
        self.assertEqual((state, point), ("install", (50, 30)))
        self.assertEqual(play._screen_state(play._ui_nodes(xml("NHL", "Install")), "Graet"), ("unknown", None))
        self.assertEqual(play._screen_state(play._ui_nodes(xml("Graet", "Install", "Install")), "Graet"), ("unknown", None))

    def test_incompatible_and_auth_are_terminal(self):
        self.assertEqual(play._screen_state(play._ui_nodes(xml("This app won't work for your device")), "Graet")[0], "incompatible")
        self.assertEqual(play._screen_state(play._ui_nodes(xml("Your device isn't compatible with this version.")), "Graet")[0], "incompatible")
        self.assertEqual(play._screen_state(play._ui_nodes(xml("Sign in to Google Play")), "Graet")[0], "needs_auth")

    def test_existing_install_does_not_open_play(self):
        events = []
        with patch.object(play, "_installed", return_value=True), patch.object(play, "_adb") as adb:
            play.ensure_installed("adb", "emulator-1", "com.graet", "Graet",
                                  lambda phase, message: events.append(phase), lambda: False)
        self.assertEqual(events, ["installed"])
        adb.assert_not_called()

    def test_missing_app_installs_from_matching_play_listing(self):
        events = []
        checks = iter([False, False, True])
        calls = []
        def adb(_adb_path, _serial, *args, **_kwargs):
            calls.append(args)
            return xml("GRAET: Hockey News", "Install") if "uiautomator" in args else ""
        with patch.object(play, "_installed", side_effect=lambda *_: next(checks)), \
             patch.object(play, "_adb", side_effect=adb), \
             patch.object(play.time, "sleep", return_value=None):
            play.ensure_installed("adb", "emulator-1", "com.graet", "Graet",
                                  lambda phase, message: events.append(phase), lambda: False)
        self.assertTrue(any(args[:3] == ("shell", "input", "tap") for args in calls))
        self.assertEqual(events[-1], "installed")


if __name__ == "__main__":
    unittest.main()
