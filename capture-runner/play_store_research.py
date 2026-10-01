#!/usr/bin/env python3
"""Capture an Android app's public Google Play identity before device capture.

The public page's structured SoftwareApplication record is the source of truth.
If Google changes its markup, fail visibly rather than guessing app identity.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from app_store_research import _image, _write

PACKAGE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$")


def lookup(package: str) -> dict:
    if not PACKAGE.fullmatch(package):
        raise ValueError("Invalid Android package")
    url = f"https://play.google.com/store/apps/details?id={package}&hl=en_CA&gl=CA"
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; NorthstarAppResearch/1.0)"})
    with urllib.request.urlopen(request, timeout=35) as response:
        if response.status != 200:
            raise RuntimeError(f"Google Play returned HTTP {response.status}")
        page = response.read(5_000_000).decode("utf-8", errors="replace")
    candidates = re.findall(r'<script\s+type="application/ld\+json"[^>]*>(.*?)</script>', page, re.S)
    record = next((row for raw in candidates for row in [json.loads(html.unescape(raw))]
                   if isinstance(row, dict) and row.get("@type") == "SoftwareApplication"
                   and str(row.get("operatingSystem", "")).upper() == "ANDROID"), None)
    if not record or f"id={package}" not in str(record.get("url") or ""):
        raise RuntimeError("Google Play did not return a verified listing for this package")
    if not record.get("name") or not (record.get("author") or {}).get("name") or not record.get("image"):
        raise RuntimeError("Google Play listing is missing app identity or icon")
    return {"url": url, "record": record}


def research(session: Path, app_name: str, package: str) -> dict:
    session = session.resolve()
    folder = session / "app_store"
    status = session / "app_store_research.json"
    try:
        source = lookup(package)
        record = source["record"]
        folder.mkdir(parents=True, exist_ok=True)
        _write(folder / "play_listing.json", source)
        icon = _image(record["image"], folder / "icons/app_icon_512x512.png", "PNG")
        author = record["author"]["name"]
        rating = record.get("aggregateRating") or {}
        manifest = {
            "schema_version": "northstar-official-play-store-1", "app_name": app_name,
            "timestamp": datetime.now(timezone.utc).isoformat(), "store_platform": "android",
            "storefront": "CA", "source": "Google Play public app listing",
            "source_url": source["url"], "app_store_url": source["url"], "package_id": package,
            "raw_data": {"hero": {"title": record["name"], "subtitle": record.get("description") or ""},
                         "description": record.get("description") or "",
                         "app_info": {"Seller": author, "Category": str(record.get("applicationCategory") or "Unknown").replace("_", " ").title(),
                                      "Rating": str(rating.get("ratingValue") or ""),
                                      "Rating Count": str(rating.get("ratingCount") or "")},
                         "developer": record["author"], "raw_reviews": [], "competitors": []},
            "icons": {"app_icon": "icons/app_icon_512x512.png"},
            "screenshots": {"app_icon": "icons/app_icon_512x512.png", "carousel": []},
            "intelligence": {"source": "deterministic_official_metadata",
                             "executive_summary": f"{record['name']} is listed on Google Play by {author}. {record.get('description') or ''}"},
            "asset_evidence": {"icon": icon, "screenshots": []},
            "limitations": ["Google Play public structured data supplies app identity, icon, category and aggregate rating; it does not provide a complete promotional screenshot set.",
                            "The Android capture screens are separate evidence of the installed app."],
        }
        _write(folder / "app_store_manifest.json", manifest)
        result = {"stage": "ready_for_review", "package_id": package,
                  "title": record["name"], "seller": author, "screenshots": 0,
                  "source_url": source["url"], "finished_at": datetime.now(timezone.utc).isoformat()}
        _write(status, result)
        return result
    except Exception as exc:
        _write(status, {"stage": "failed", "package_id": package,
                        "error": str(exc), "failed_at": time.time()})
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--session", type=Path, required=True)
    parser.add_argument("--app", required=True)
    parser.add_argument("--package", required=True)
    args = parser.parse_args()
    print(json.dumps(research(args.session, args.app, args.package)))
