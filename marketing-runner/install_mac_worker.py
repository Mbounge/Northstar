"""Install the local social collector and its SSH return tunnel as LaunchAgents."""

from __future__ import annotations

import os
import plistlib
import subprocess
import sys
from pathlib import Path

RUNNER = Path(__file__).resolve().parent
PROJECT = RUNNER.parent
DATA = PROJECT.parent.parent / "outputs" / "marketing-collector"
LAUNCH_AGENTS = Path.home() / "Library/LaunchAgents"
SSH_KEY = Path.home() / ".ssh/id_rsa"
HOST = "root@49.12.126.233"
LABELS = ("ai.usenorthstar.marketing.collector", "ai.usenorthstar.marketing.tunnel")


def definitions() -> dict[str, dict]:
    return {
        LABELS[0]: {
            "Label": LABELS[0],
            "ProgramArguments": [sys.executable, str(RUNNER / "mac_collector.py")],
            "WorkingDirectory": str(PROJECT),
            "RunAtLoad": True,
            "KeepAlive": True,
            "ThrottleInterval": 15,
            "StandardOutPath": str(DATA / "service.stdout.log"),
            "StandardErrorPath": str(DATA / "service.stderr.log"),
        },
        LABELS[1]: {
            "Label": LABELS[1],
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
    if sys.argv[1] == "install":
        if not SSH_KEY.is_file():
            raise SystemExit("The documented capture-host SSH key is unavailable")
        if not (PROJECT / ".env.development.local").is_file():
            raise SystemExit("The local ignored environment file is unavailable")
    domain = f"gui/{os.getuid()}"
    DATA.mkdir(parents=True, exist_ok=True)
    LAUNCH_AGENTS.mkdir(parents=True, exist_ok=True)
    for label, definition in definitions().items():
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
