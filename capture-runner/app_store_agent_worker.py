#!/usr/bin/env python3
"""Run the original Apple App Store browser researcher for an Admin capture.

The research algorithm lives unchanged in legacy_app_store_researcher.py. This
adapter supplies run-specific configuration and publishes its output contract.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import shutil
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    pending.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    os.replace(pending, path)


def research(session: Path, app: str, package: str) -> dict:
    session = session.resolve()
    status_path = session / "app_store_research.json"
    if not session.is_dir() or not app.strip() or not os.environ.get("OPENAI_API_KEY"):
        raise ValueError("Apple App Store research is not configured for this capture")
    lock_path = session.parent / "app-store-browser.lock"
    lock_path.touch(exist_ok=True)
    with lock_path.open("r+") as lock:
        write_json(status_path, {"stage": "researching", "phase": "waiting_for_browser",
                                 "package_id": package, "started_unix": time.time()})
        fcntl.flock(lock, fcntl.LOCK_EX)
        write_json(status_path, {"stage": "researching", "phase": "apple_store_browser",
                                 "package_id": package, "started_unix": time.time()})
        os.chdir(session)
        import legacy_app_store_researcher as original
        original.COMPANY_NAME = re.sub(r"[^A-Za-z0-9_-]+", "_", app).strip("_")[:80] or "app"
        original.APP_SEARCH_QUERY = app
        original.CHROME_CDP_URL = os.environ.get("NORTHSTAR_APP_STORE_CDP_URL", "http://127.0.0.1:9233")
        import asyncio
        agent = original.AppStoreResearcher()
        agent.manifest["app_name"] = app
        asyncio.run(agent.run())

    source_dir = (session / agent.data_dir).resolve()
    if not source_dir.is_relative_to(session / "data"):
        raise ValueError("App Store researcher wrote outside this capture")
    source_manifest = source_dir / "app_store_manifest.json"
    if not source_manifest.is_file():
        raise ValueError("The original App Store researcher did not finish a manifest")
    raw = json.loads(source_manifest.read_text())
    url = str(raw.get("app_store_url") or "")
    parsed = urlparse(url)
    match = re.search(r"/id(\d+)(?:[/?#]|$)", parsed.path)
    if parsed.hostname != "apps.apple.com" or "/app/" not in parsed.path or not match:
        raise ValueError("The researcher did not confirm an Apple App Store app")
    if not str((raw.get("intelligence") or {}).get("executive_summary") or "").strip():
        raise ValueError("The researcher did not finish its competitive intelligence")

    output = session / "app_store"
    output.mkdir(exist_ok=True)

    def copy_asset(value: str | None, folder: str, name: str | None = None) -> str | None:
        if not value:
            return None
        source = (session / value).resolve()
        if not source.is_relative_to(source_dir) or not source.is_file():
            raise ValueError("The researcher referenced a missing or unsafe image")
        basename = name or source.name
        if not re.fullmatch(r"[A-Za-z0-9_.-]+\.(?:png|jpg|jpeg)", basename):
            raise ValueError("The researcher produced an unsafe image name")
        relative = f"{folder}/{basename}"
        destination = output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        return relative

    screenshots = raw.get("screenshots") or {}
    icon = copy_asset(screenshots.get("app_icon"), "icons", "app_icon_512x512.png")
    carousel = [copy_asset(value, "screenshots") for value in screenshots.get("carousel") or []]
    if not icon or not carousel:
        raise ValueError("The Apple App Store icon or promotional screenshots were not captured")
    competitors = raw.get("raw_data", {}).get("competitors") or []
    for item in competitors:
        if isinstance(item, dict) and item.get("icon_path"):
            item["icon_path"] = copy_asset(item["icon_path"], "icons")

    storefront = parsed.path.strip("/").split("/", 1)[0].upper()
    normalized = {**raw, "store_platform": "ios", "source": "Original Apple App Store browser researcher",
                  "storefront": storefront, "track_id": int(match.group(1)), "package_id": package,
                  "screenshots": {**screenshots, "app_icon": icon, "carousel": carousel},
                  "icons": {"app_icon": icon},
                  "research_agent": "legacy_app_store_researcher.py"}
    write_json(output / "agent_manifest.json", json.loads(source_manifest.read_text()))
    write_json(output / "app_store_manifest.json", normalized)
    result = {"stage": "ready_for_review", "track_id": int(match.group(1)),
              "package_id": package, "title": str(raw.get("raw_data", {}).get("hero", {}).get("title") or app),
              "seller": str(raw.get("raw_data", {}).get("app_info", {}).get("Seller") or "Unknown"),
              "screenshots": len(carousel), "source_url": url,
              "review_count": len(raw.get("raw_data", {}).get("raw_reviews") or []),
              "competitor_count": len(competitors),
              "finished_at": datetime.now(timezone.utc).isoformat()}
    write_json(status_path, result)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--session", required=True, type=Path)
    parser.add_argument("--app", required=True)
    parser.add_argument("--package", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(research(args.session, args.app, args.package)), flush=True)
    except Exception as exc:
        write_json(args.session / "app_store_research.json", {"stage": "failed", "error": str(exc),
                    "package_id": args.package, "failed_at": datetime.now(timezone.utc).isoformat()})
        print(f"App Store research failed: {exc}", file=sys.stderr, flush=True)
        raise SystemExit(1)
