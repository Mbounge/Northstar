#!/usr/bin/env python3
"""Run one Android onboarding session with durable, conservative status."""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
from tempfile import NamedTemporaryFile
from datetime import datetime, timezone
from pathlib import Path

from play_install import InstallBlocked, ensure_installed


SCRIPT = Path(os.environ.get("ONBOARDING_SCRIPT", "./onboarding_mobile2.py")).expanduser().resolve()
PYTHON = os.environ.get("ONBOARDING_PYTHON", sys.executable)
STOP_REQUESTED = False
CHILD: subprocess.Popen | None = None


def _status(session: Path, state: str, reason: str, phase: str | None = None) -> None:
    payload = {
        "state": state, "reason": reason, "phase": phase,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    target = session / "capture_supervisor_status.json"
    temp = target.with_suffix(".json.tmp")
    temp.write_text(json.dumps(payload, indent=2) + "\n")
    os.replace(temp, target)


def _stop(_signum, _frame) -> None:
    global STOP_REQUESTED
    STOP_REQUESTED = True
    if CHILD is not None and CHILD.poll() is None:
        CHILD.send_signal(signal.SIGINT)


def _manifest_result(session: Path) -> dict:
    try:
        manifest = json.loads((session / "onboarding_manifest.json").read_text())
        return manifest.get("result", {}) if isinstance(manifest, dict) else {}
    except (OSError, ValueError):
        return {}


def _identity_email(path: Path) -> str:
    data = json.loads(path.read_text())
    if not isinstance(data, dict):
        raise ValueError("Onboarding identity profile must be a JSON object")
    identity = data.get("identity")
    email = identity.get("email", "") if isinstance(identity, dict) else ""
    if not isinstance(email, str) or "@" not in email:
        raise ValueError("Onboarding identity profile needs identity.email")
    return email.strip()


def _verify_screenshot(adb: str, serial: str) -> None:
    """Exercise the same ADB-to-temporary-file path used by the agent."""
    with NamedTemporaryFile(suffix=".png") as screenshot:
        subprocess.run([adb, "-s", serial, "shell", "screencap", "-p", "/sdcard/screen.png"],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
        subprocess.run([adb, "-s", serial, "pull", "/sdcard/screen.png", screenshot.name],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
        # ADB writes through a separate process, so reopen rather than read
        # the NamedTemporaryFile handle's stale buffer.
        with open(screenshot.name, "rb") as saved:
            header = saved.read(8)
        if header != b"\x89PNG\r\n\x1a\n":
            raise ValueError("ADB did not produce a readable PNG")


def supervise(app: str, package: str, serial: str, session: Path) -> int:
    global CHILD
    session.mkdir(parents=True, exist_ok=True)
    adb = os.environ.get("CAPTURE_ADB", "adb")
    profile = Path(os.environ["ONBOARDING_IDENTITY_PROFILE"]).expanduser().resolve()
    email = _identity_email(profile)
    if not os.environ.get("ONBOARDING_PASSWORD"):
        raise ValueError("ONBOARDING_PASSWORD is required")
    if not SCRIPT.is_file():
        raise ValueError("Onboarding agent is not installed")

    def report(phase: str, message: str) -> None:
        _status(session, "provisioning", message, phase)
        print(message, flush=True)

    try:
        ensure_installed(adb, serial, package, app, report, lambda: STOP_REQUESTED)
    except InstallBlocked as exc:
        state = "paused" if exc.state == "paused" else "needs_review"
        _status(session, state, exc.reason, exc.state)
        return 0 if state == "paused" else 2

    if STOP_REQUESTED:
        _status(session, "paused", "operator requested stop")
        return 0

    try:
        _verify_screenshot(adb, serial)
    except (OSError, ValueError, subprocess.SubprocessError):
        _status(session, "needs_review", "Device screenshot capture failed; check ADB and writable TMPDIR")
        return 2

    # The onboarding script uses plain `adb shell`, so ANDROID_SERIAL is
    # essential when several dedicated emulators run on the same host.
    env = os.environ.copy()
    env.update({
        "ANDROID_SERIAL": serial,
        "ONBOARDING_PACKAGE": package,
        "ONBOARDING_APP_NAME": app,
        "ONBOARDING_EMAIL": email,
        "ONBOARDING_IDENTITY_PROFILE": str(profile),
    })
    resumed = (session / "session_resume_state.json").is_file()
    if not resumed:
        # A new onboarding session must see the welcome screen. Never clear
        # data on resume: it may contain the account that onboarding created.
        subprocess.run([adb, "-s", serial, "shell", "pm", "clear", package],
                       check=True, timeout=30, stdout=subprocess.DEVNULL)
    _status(session, "running", "Onboarding agent is exploring the account flow")
    command = [PYTHON, "-u", str(SCRIPT), "--app-name", app,
               "--package", package, "--resume", str(session), "--continue-current"]
    CHILD = subprocess.Popen(command, cwd=SCRIPT.parent, env=env, stdin=subprocess.DEVNULL)
    exit_code = CHILD.wait()
    CHILD = None
    if STOP_REQUESTED:
        _status(session, "paused", "operator requested stop")
        return 0

    result = _manifest_result(session)
    status = str(result.get("status", ""))
    screens = len(list((session / "screenshots").glob("*.png")))
    if status.startswith("COMPLETED_") and screens > 0 and result.get("settled_home_reached"):
        _status(session, "complete", "Onboarding reached a settled home with saved evidence")
        return 0
    reason = (f"Onboarding ended with {status}" if status else
              f"Onboarding exited {exit_code} without a complete manifest")
    _status(session, "needs_review", reason)
    return 2


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", required=True)
    parser.add_argument("--package", required=True)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--session", type=Path, required=True)
    parser.add_argument("--run-id", required=True)
    args = parser.parse_args()
    if os.environ.get("NORTHSTAR_CAPTURE_RUN_ID") != args.run_id:
        parser.error("Run ID does not match the runner environment")
    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)
    try:
        return supervise(args.app, args.package, args.serial, args.session)
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        _status(args.session, "needs_review", str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
