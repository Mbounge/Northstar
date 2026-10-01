"""Open only Northstar's isolated Chrome collector for one-time social sign-in."""

from __future__ import annotations

import subprocess

from install_mac_worker import CHROME, LABELS, definitions
from mac_collector import MANAGED_CHROME_DATA_DIR

SOCIAL_URLS = (
    "https://www.linkedin.com/feed/",
    "https://x.com/home",
    "https://www.instagram.com/",
)


def launch_command() -> list[str]:
    browser_args = definitions()[LABELS[0]]["ProgramArguments"][1:]
    return ["open", "-na", str(CHROME.parents[2]), "--args", *browser_args, *SOCIAL_URLS]


if __name__ == "__main__":
    MANAGED_CHROME_DATA_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    subprocess.run(launch_command(), check=True)
    print("Northstar collector Chrome opened. Sign in to LinkedIn, X, and Instagram in that new window.")
