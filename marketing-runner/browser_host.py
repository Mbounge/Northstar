"""Run the dedicated persistent Chrome context used by LinkedIn collection."""

import os
from pathlib import Path

from playwright.sync_api import sync_playwright


profile = Path(os.environ.get("NORTHSTAR_MARKETING_LINKEDIN_PROFILE", "/var/lib/northstar/marketing/linkedin-browser"))
profile.mkdir(parents=True, exist_ok=True)
with sync_playwright() as playwright:
    chrome = os.environ.get("NORTHSTAR_MARKETING_CHROME_BINARY") or playwright.chromium.executable_path
    os.execv(chrome, [chrome,
        f"--user-data-dir={profile}",
        "--remote-debugging-address=127.0.0.1",
        "--remote-debugging-port=9222",
        "--no-first-run", "--no-default-browser-check",
        "--disable-dev-shm-usage", "--no-sandbox",
        "--window-size=1280,820", "about:blank"])
