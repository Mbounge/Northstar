"""Open only Northstar's isolated Chrome collector for one-time social sign-in."""

from __future__ import annotations

import subprocess

from install_mac_worker import CHROME, chrome_arguments
from mac_collector import COLLECTOR_CHROME_DATA_DIR
import service

SOCIAL_URLS = (
    "https://www.linkedin.com/feed/",
    "https://x.com/home",
    "https://www.instagram.com/",
)


def launch_command() -> list[str]:
    browser_args = chrome_arguments()[1:]
    return ["open", "-na", str(CHROME.parents[2]), "--args", *browser_args, *SOCIAL_URLS]


def main() -> None:
    service.CHROME_DATA_DIR = str(COLLECTOR_CHROME_DATA_DIR)
    if service.collector_owns_debugging_port():
        print("Northstar collector Chrome is already running; reusing it.")
        return
    listener = subprocess.run(["lsof", "-nP", "-iTCP:9222", "-sTCP:LISTEN", "-Fp"],
                              capture_output=True, text=True, check=False, timeout=3)
    if listener.returncode not in (0, 1):
        raise RuntimeError("Could not verify ownership of port 9222")
    if listener.stdout.strip():
        raise RuntimeError("Port 9222 belongs to another process; refusing to start a collector")
    COLLECTOR_CHROME_DATA_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    subprocess.run(launch_command(), check=True)
    print("Northstar collector Chrome opened. Sign in to LinkedIn, X, and Instagram in that new window.")


if __name__ == "__main__":
    main()
