#!/usr/bin/env python3
"""Collect a selected, official Apple listing as separate research evidence.

The Android package is never assumed to identify an iOS listing. Admin selects
an Apple track ID from search results; the exact lookup result is retained.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "NorthstarAppResearch/1.0"})
    with urllib.request.urlopen(request, timeout=35) as response:
        if response.status != 200:
            raise RuntimeError(f"Apple returned HTTP {response.status}")
        return response.read()


def search(term: str, country: str = "ca") -> list[dict]:
    if not term.strip() or len(term) > 100:
        raise ValueError("Enter an app name to search")
    query = urllib.parse.urlencode({"term": term, "country": country, "entity": "software", "limit": 15})
    result = json.loads(fetch(f"https://itunes.apple.com/search?{query}"))
    return [{"track_id": row.get("trackId"), "title": row.get("trackName"),
             "seller": row.get("sellerName"), "bundle_id": row.get("bundleId"),
             "icon_url": row.get("artworkUrl100"), "url": row.get("trackViewUrl")}
            for row in result.get("results", []) if row.get("trackId")]


def _write(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    os.replace(temp, path)


def _image(url: str, destination: Path, format_name: str) -> dict:
    raw = fetch(url)
    with Image.open(io.BytesIO(raw)) as image:
        image.verify()
    with Image.open(io.BytesIO(raw)) as image:
        destination.parent.mkdir(parents=True, exist_ok=True)
        if format_name == "JPEG":
            image.convert("RGB").save(destination, "JPEG", quality=90, optimize=True)
        else:
            image.convert("RGBA").save(destination, "PNG", optimize=True)
        size = (image.width, image.height)
    return {"file": str(destination.relative_to(destination.parents[1])),
            "width": size[0], "height": size[1],
            "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(), "source_url": url}


def research(session: Path, app_name: str, track_id: int, country: str = "ca") -> dict:
    if track_id <= 0 or not re.fullmatch(r"[a-z]{2}", country):
        raise ValueError("Invalid App Store listing")
    session = session.resolve()
    folder = session / "app_store"
    status = session / "app_store_research.json"
    try:
        url = f"https://itunes.apple.com/lookup?id={track_id}&country={country}&entity=software"
        payload = json.loads(fetch(url))
        results = payload.get("results") or []
        if len(results) != 1 or results[0].get("trackId") != track_id:
            raise RuntimeError("Apple did not return the selected listing")
        record = results[0]
        icon_url = record.get("artworkUrl512") or record.get("artworkUrl100")
        if not icon_url or not record.get("trackName") or not record.get("sellerName"):
            raise RuntimeError("The selected listing is missing identity or icon evidence")
        folder.mkdir(parents=True, exist_ok=True)
        _write(folder / "itunes_lookup.json", payload)
        icon = _image(icon_url, folder / "icons/app_icon_512x512.png", "PNG")
        screenshots = []
        for index, image_url in enumerate(record.get("screenshotUrls") or record.get("ipadScreenshotUrls") or [], 1):
            screenshots.append(_image(image_url, folder / f"screenshots/carousel_{index:02d}.jpg", "JPEG"))
        description = record.get("description") or ""
        opening = " ".join(re.split(r"(?<=[.!?])\s+", description.strip())[:2])[:500]
        version = record.get("version") or "Unknown"
        release = record.get("currentVersionReleaseDate") or "Unknown"
        manifest = {
            "schema_version": "northstar-official-app-store-1", "app_name": app_name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "store_platform": "ios", "storefront": country.upper(),
            "source": "Apple iTunes Lookup API", "source_url": url,
            "app_store_url": record.get("trackViewUrl"), "track_id": track_id,
            "bundle_id": record.get("bundleId"),
            "raw_data": {
                "hero": {"title": record["trackName"], "subtitle": record.get("subtitle") or record.get("primaryGenreName") or ""},
                "description": description,
                "app_info": {"Seller": record["sellerName"], "Category": record.get("primaryGenreName") or "Unknown",
                             "Version": version, "Rating": str(record.get("averageUserRating") or ""),
                             "Rating Count": str(record.get("userRatingCount") or 0),
                             "Compatibility": record.get("minimumOsVersion") or "Unknown",
                             "Age Rating": record.get("contentAdvisoryRating") or "Unknown"},
                "version_history": {"full_text": f"Version {version} · {release}\n{record.get('releaseNotes') or ''}"},
                "developer": {"name": record["sellerName"], "url": record.get("sellerUrl")},
                "raw_reviews": [], "competitors": [],
            },
            "icons": {"app_icon": "icons/app_icon_512x512.png"},
            "screenshots": {"app_icon": "icons/app_icon_512x512.png",
                            "carousel": [entry["file"] for entry in screenshots]},
            "intelligence": {"source": "deterministic_official_metadata",
                             "executive_summary": f"{record['trackName']} is listed in {record.get('primaryGenreName') or 'the App Store'} by {record['sellerName']}. {opening}"},
            "asset_evidence": {"icon": icon, "screenshots": screenshots},
            "limitations": ["This is an iOS App Store listing; the Android app may differ.",
                            "The listing identity was selected in Admin, not inferred from the Android package."],
        }
        _write(folder / "app_store_manifest.json", manifest)
        result = {"stage": "ready_for_review", "track_id": track_id,
                  "title": record["trackName"], "seller": record["sellerName"],
                  "screenshots": len(screenshots), "source_url": record.get("trackViewUrl"),
                  "finished_at": datetime.now(timezone.utc).isoformat()}
        _write(status, result)
        return result
    except Exception as exc:
        _write(status, {"stage": "failed", "track_id": track_id, "error": str(exc)})
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--session", type=Path, required=True)
    parser.add_argument("--app", required=True)
    parser.add_argument("--track-id", type=int, required=True)
    args = parser.parse_args()
    print(json.dumps(research(args.session, args.app, args.track_id)))
