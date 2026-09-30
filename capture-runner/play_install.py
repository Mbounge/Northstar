"""Install a target app from the signed-in device's native Play Store.

The installer only acts on a listing reached by exact Android package ID. It
stops for account authentication, incompatibility, or an unrecognized screen
instead of tapping an arbitrary suggested app.
"""

from __future__ import annotations

import re
import subprocess
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Callable


@dataclass
class InstallBlocked(Exception):
    state: str
    reason: str


def _adb(adb: str, serial: str, *args: str, timeout: int = 15) -> str:
    return subprocess.check_output(
        [adb, "-s", serial, *args], timeout=timeout, text=True,
        stderr=subprocess.DEVNULL,
    )


def _installed(adb: str, serial: str, package: str) -> bool:
    try:
        return _adb(adb, serial, "shell", "pm", "path", package).startswith("package:")
    except (subprocess.SubprocessError, OSError):
        return False


def _ui_nodes(raw: str) -> list[dict]:
    start = raw.find("<hierarchy")
    end = raw.rfind("</hierarchy>")
    if start < 0 or end < 0:
        return []
    try:
        root = ET.fromstring(raw[start:end + len("</hierarchy>")])
    except ET.ParseError:
        return []
    return [node.attrib for node in root.iter("node")]


def _text(node: dict) -> str:
    return " ".join([node.get("text", ""), node.get("content-desc", "")]).strip()


def _center(node: dict) -> tuple[int, int] | None:
    points = [int(n) for n in re.findall(r"\d+", node.get("bounds", ""))]
    return ((points[0] + points[2]) // 2, (points[1] + points[3]) // 2) if len(points) == 4 else None


def _screen_state(nodes: list[dict], app: str) -> tuple[str, tuple[int, int] | None]:
    labels = [_text(node) for node in nodes]
    all_text = " ".join(labels).lower()
    if any(phrase in all_text for phrase in (
        "won't work for your device", "not compatible with your device",
        "isn't compatible with your device", "your device isn't compatible",
        "your device is not compatible", "not available for your device",
    )):
        return "incompatible", None
    if any(phrase in all_text for phrase in (
        "not available in your country", "not available in your region",
    )):
        return "unavailable", None
    if any(phrase in all_text for phrase in (
        "sign in to google play", "sign in to the play store", "add a google account",
        "verify it's you", "choose an account", "complete account setup",
    )):
        return "needs_auth", None
    # The package-specific intent should have opened the requested listing.
    # Require its visible title before acting on an Install button.
    app_name = app.strip().lower()
    title_visible = bool(app_name and any(app_name in label.lower() for label in labels))
    if not title_visible:
        return "unknown", None
    # Play often exposes both a button and its child label as separate nodes
    # with the same bounds. They represent one control, not two choices.
    install_points = {_center(node) for node in nodes
                      if _text(node).strip().lower() == "install"
                      and node.get("enabled") != "false"}
    install_points.discard(None)
    if len(install_points) == 1:
        return "install", install_points.pop()
    if any(label.strip().lower() == "open" for label in labels):
        return "open", None
    if any(word in all_text for word in ("pending", "installing", "downloading", "verifying")):
        return "downloading", None
    return "unknown", None


def ensure_installed(adb: str, serial: str, package: str, app: str,
                     report: Callable[[str, str], None], stopped: Callable[[], bool],
                     timeout_seconds: int = 300) -> None:
    if _installed(adb, serial, package):
        report("installed", "App is already installed")
        return
    report("opening_play", "Opening the app's Google Play listing")
    try:
        _adb(adb, serial, "shell", "am", "start", "-a", "android.intent.action.VIEW",
             "-d", f"market://details?id={package}", "-p", "com.android.vending")
    except (subprocess.SubprocessError, OSError) as exc:
        raise InstallBlocked("needs_review", "Could not open Google Play on the assigned device") from exc
    deadline = time.monotonic() + timeout_seconds
    install_tapped = False
    unrecognized = 0
    while time.monotonic() < deadline:
        if stopped():
            raise InstallBlocked("paused", "Operator requested stop during Play installation")
        if _installed(adb, serial, package):
            report("installed", "Google Play installed the app")
            return
        try:
            raw = _adb(adb, serial, "exec-out", "uiautomator", "dump", "/dev/tty", timeout=25)
        except (subprocess.SubprocessError, OSError):
            time.sleep(3)
            continue
        state, point = _screen_state(_ui_nodes(raw), app)
        if state == "incompatible":
            raise InstallBlocked("incompatible", "Google Play says this app is incompatible with the assigned device")
        if state == "unavailable":
            raise InstallBlocked("unavailable", "Google Play says this app is unavailable for this account or region")
        if state == "needs_auth":
            raise InstallBlocked("needs_auth", "Sign in to Google Play on this device, then resume the run")
        if state == "install" and point and not install_tapped:
            _adb(adb, serial, "shell", "input", "tap", str(point[0]), str(point[1]))
            install_tapped = True
            report("downloading", "Install requested from Google Play")
        elif state in ("downloading", "open") or (state == "install" and install_tapped):
            report("downloading", "Waiting for Google Play installation")
        else:
            unrecognized += 1
            if unrecognized >= 5:
                raise InstallBlocked("needs_review", "Play Store needs operator attention; listing or account screen was not recognized")
        time.sleep(3)
    raise InstallBlocked("needs_review", "Google Play installation did not finish within five minutes")
