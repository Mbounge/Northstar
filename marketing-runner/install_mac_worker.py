"""Install the local social collector and its SSH return tunnel as LaunchAgents."""

from __future__ import annotations

import os
import plistlib
import subprocess
import sys
from pathlib import Path

from mac_collector import dedicated_chrome_data_dir

RUNNER = Path(__file__).resolve().parent
PROJECT = RUNNER.parent
DATA = PROJECT.parent.parent / "outputs" / "marketing-collector"
LAUNCH_AGENTS = Path.home() / "Library/LaunchAgents"
SSH_KEY = Path.home() / ".ssh/id_rsa"
HOST = "root@49.12.126.233"
CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
LABELS = ("ai.usenorthstar.marketing.browser", "ai.usenorthstar.marketing.collector", "ai.usenorthstar.marketing.tunnel")


def definitions(chrome_data_dir: str | None = None) -> dict[str, dict]:
    isolated_dir = dedicated_chrome_data_dir(chrome_data_dir or "")
    return {
        LABELS[0]: {
            "Label": LABELS[0],
            "ProgramArguments": [str(CHROME), f"--user-data-dir={isolated_dir}",
                                 "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
                                 "--disable-sync", "--no-first-run", "--no-default-browser-check"],
            "RunAtLoad": True,
            "KeepAlive": True,
            "ThrottleInterval": 15,
            "StandardOutPath": str(DATA / "browser.stdout.log"),
            "StandardErrorPath": str(DATA / "browser.stderr.log"),
        },
        LABELS[1]: {
            "Label": LABELS[1],
            "ProgramArguments": [sys.executable, str(RUNNER / "mac_collector.py")],
            "WorkingDirectory": str(PROJECT),
            "EnvironmentVariables": {"NORTHSTAR_MARKETING_CHROME_DATA_DIR": isolated_dir},
            "RunAtLoad": True,
            "KeepAlive": True,
            "ThrottleInterval": 15,
            "StandardOutPath": str(DATA / "service.stdout.log"),
            "StandardErrorPath": str(DATA / "service.stderr.log"),
        },
        LABELS[2]: {
            "Label": LABELS[2],
            "ProgramArguments": [
                "/usr/bin/ssh", "-N", "-T", "-i", str(SSH_KEY),
                "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new",
                "-o", "ExitOnForwardFailure=yes", "-o", "ServerAliveInterval=15",
                "-o", "ServerAliveCountMax=3",
                "-R", "127.0.0.1:18790:127.0.0.1:8790", HOST,
            ],
            "RunAtLoad": True,
            "KeepAlive": True,
            "ThrottleInterval": 15,
            "StandardOutPath": str(DATA / "tunnel.stdout.log"),
            "StandardErrorPath": str(DATA / "tunnel.stderr.log"),
        },
    }


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"install", "uninstall"}:
        raise SystemExit("Usage: python install_mac_worker.py install|uninstall")
    chrome_data_dir = None
    if sys.argv[1] == "install":
        if not CHROME.is_file():
            raise SystemExit("Google Chrome is not installed at the expected app path")
        if not SSH_KEY.is_file():
            raise SystemExit("The documented capture-host SSH key is unavailable")
        if not (PROJECT / ".env.development.local").is_file():
            raise SystemExit("The local ignored environment file is unavailable")
        chrome_data_dir = dedicated_chrome_data_dir(os.environ.get("NORTHSTAR_MARKETING_CHROME_DATA_DIR", ""))
    domain = f"gui/{os.getuid()}"
    DATA.mkdir(parents=True, exist_ok=True)
    LAUNCH_AGENTS.mkdir(parents=True, exist_ok=True)
    entries = list(definitions(chrome_data_dir).items())
    if sys.argv[1] == "uninstall":
        entries.reverse()
    for label, definition in entries:
        path = LAUNCH_AGENTS / f"{label}.plist"
        subprocess.run(["launchctl", "bootout", domain, str(path)], capture_output=True, check=False)
        if sys.argv[1] == "uninstall":
            path.unlink(missing_ok=True)
            print(f"Removed {label}")
            continue
        with path.open("wb") as output:
            plistlib.dump(definition, output)
        subprocess.run(["launchctl", "bootstrap", domain, str(path)], check=True)
        print(f"Started {label}")


if __name__ == "__main__":
    main()
