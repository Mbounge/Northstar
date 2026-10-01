"""Validate social evidence and publish via short-lived signed upload URLs.

The collector never holds Supabase's service role key. Northstar's server verifies
the tenant app, signs uploads, checks evidence, then registers an immutable snapshot.
"""

from __future__ import annotations

import copy
import json
import mimetypes
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests


def validate_feed(records, capture_dir: Path, configured_socials: dict):
    if not isinstance(records, list):
        raise ValueError("Monitor output is not a post list")
    root = capture_dir.resolve()
    good = []
    seen = set()
    counts = {platform: 0 for platform in configured_socials}
    rejected = 0
    platform_keys = {"linkedin": "linkedin", "x": "twitter", "twitter": "twitter", "instagram": "instagram"}
    for item in records:
        if not isinstance(item, dict):
            rejected += 1
            continue
        platform = platform_keys.get(str(item.get("platform", "")).casefold())
        if platform not in configured_socials:
            rejected += 1
            continue
        # A profile grid or a login/error screen is not a captured post.
        if item.get("type") == "Grid" or not str(item.get("entity") or "").strip() or not str(item.get("post_text") or item.get("raw_text") or "").strip():
            rejected += 1
            continue
        raw = item.get("screenshot")
        if not isinstance(raw, str):
            rejected += 1
            continue
        image = Path(raw).resolve()
        if image.parent != root / "screenshots" or not image.is_file() or image.stat().st_size < 1000:
            rejected += 1
            continue
        identity = (platform, str(item.get("url") or ""), image.name)
        if identity in seen:
            continue
        seen.add(identity)
        normalized = copy.deepcopy(item)
        normalized["screenshot"] = str(image)
        comments = normalized.get("comments_screenshot")
        if comments:
            comment_image = Path(str(comments)).resolve()
            normalized["comments_screenshot"] = str(comment_image) if comment_image.parent == root / "screenshots" and comment_image.is_file() else None
        good.append(normalized)
        counts[platform] += 1
    coverage = {platform: {"status": "captured" if count else "no_verified_posts", "posts": count,
                           "profile": configured_socials[platform]} for platform, count in counts.items()}
    return good, {"sources": coverage, "rejected_records": rejected}


def publish_snapshot(target: dict, run_id: str, records: list, capture_dir: Path) -> str:
    endpoint = os.environ.get("NORTHSTAR_MARKETING_PUBLISH_URL", "").rstrip("/")
    token = os.environ.get("NORTHSTAR_MARKETING_PUBLISH_TOKEN", "")
    if not endpoint.startswith("https://") or not token:
        raise RuntimeError("Northstar signed publishing is not configured")
    headers = {"Authorization": f"Bearer {token}"}
    prepared = copy.deepcopy(records)
    images = {}
    for record in prepared:
        for field in ("screenshot", "comments_screenshot"):
            raw = record.get(field)
            if not raw:
                continue
            path = Path(raw)
            images[path.name] = path
            record[field] = "screenshots/" + path.name
    identity = {"tenant_id": target["tenant_id"], "app_name": target["app_name"], "run_id": run_id, "files": sorted(images)}
    session = requests.Session()
    response = session.post(endpoint, headers=headers, json={**identity, "phase": "prepare"}, timeout=60)
    if not response.ok:
        raise RuntimeError(f"Northstar could not prepare snapshot ({response.status_code})")
    prepared_upload = response.json()
    uploads = prepared_upload["uploads"]
    def upload_image(item):
        filename, image = item
        upload = requests.put(uploads[filename], headers={"Content-Type": mimetypes.guess_type(filename)[0] or "image/jpeg"},
                              data=image.read_bytes(), timeout=60)
        if not upload.ok:
            raise RuntimeError(f"Screenshot upload failed ({upload.status_code})")

    with ThreadPoolExecutor(max_workers=8) as pool:
        for completed in as_completed([pool.submit(upload_image, item) for item in images.items()]):
            completed.result()
    feed = json.dumps(prepared, ensure_ascii=False).encode()
    upload = session.put(uploads["master_feed.json"], headers={"Content-Type": "application/json"}, data=feed, timeout=60)
    if not upload.ok:
        raise RuntimeError(f"Feed upload failed ({upload.status_code})")
    response = session.post(endpoint, headers=headers, json={**identity, "phase": "finalize",
        "snapshot_id": prepared_upload["snapshot_id"], "ticket": prepared_upload["ticket"]}, timeout=60)
    if not response.ok:
        raise RuntimeError(f"Northstar rejected snapshot validation ({response.status_code})")
    return response.json()["snapshot_id"]
