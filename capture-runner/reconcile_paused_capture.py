#!/usr/bin/env python3
"""Apply an evidence-reviewed lane correction to a paused capture.

The original PNGs and append-only reports are never deleted. A plan may move
or exclude canonical lanes, attach previously diagnostic evidence, and retire
stale checkpoint entries. The operation writes backups before both JSON files.
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path


def _load(path: Path) -> dict:
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise ValueError(f"Expected an object in {path}")
    return value


def _atomic(path: Path, value: dict) -> None:
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    os.replace(temp, path)


def _png(session: Path, basename: str) -> str:
    if Path(basename).name != basename or not basename.endswith(".png"):
        raise ValueError(f"Invalid screenshot basename: {basename}")
    path = session / "screenshots" / basename
    if not path.is_file():
        raise ValueError(f"Screenshot is missing: {path}")
    with path.open("rb") as handle:
        header = handle.read(8)
    if header != bytes([137, 80, 78, 71, 13, 10, 26, 10]):
        raise ValueError(f"Screenshot is missing or not PNG: {path}")
    return str(path)


def _validate_lanes(session: Path, manifest: dict) -> None:
    paths = set()
    screenshot_root = (session / "screenshots").resolve()
    for lane in manifest.get("tabs", []):
        if not isinstance(lane, dict):
            raise ValueError("Manifest contains a non-object lane")
        name = lane.get("canonical_path") or lane.get("name")
        if not isinstance(name, str) or not name or name in paths:
            raise ValueError(f"Duplicate or invalid canonical lane: {name}")
        paths.add(name)
        for value in lane.get("survey_screenshots") or []:
            path = Path(value).resolve()
            if path.parent != screenshot_root:
                raise ValueError(f"Lane references a screenshot outside the session: {path}")
            _png(session, path.name)


def _lane(manifest: dict, path: str) -> dict:
    found = [item for item in manifest.get("tabs", []) if isinstance(item, dict)
             and (item.get("canonical_path") or item.get("name")) == path]
    if len(found) != 1:
        raise ValueError(f"Expected exactly one canonical lane {path!r}; found {len(found)}")
    return found[0]


def reconcile(session: Path, plan: dict) -> tuple[dict, dict, list[str]]:
    manifest = copy.deepcopy(_load(session / "session_manifest.json"))
    memory = copy.deepcopy(_load(session / "agent_memory.json"))
    _validate_lanes(session, manifest)
    events: list[str] = []
    for change in plan.get("move_lanes", []):
        source, target = change["from"], change["to"]
        if any((item.get("canonical_path") or item.get("name")) == target
               for item in manifest.get("tabs", []) if isinstance(item, dict)):
            raise ValueError(f"Target lane already exists: {target}")
        lane = _lane(manifest, source)
        lane.update(name=target, canonical_path=target,
                    root_path=target.split(" > ", 1)[0], type=change["type"])
        events.append(f"moved {source} -> {target}")
    for change in plan.get("exclude_lanes", []):
        lane = _lane(manifest, change["path"])
        manifest["tabs"].remove(lane)
        manifest.setdefault("excluded_captures", []).append({
            "path": change["path"], "reason": change["reason"],
            "survey_screenshots": lane.get("survey_screenshots") or [],
            "classification": "diagnostic_only",
        })
        events.append(f"excluded {change['path']} from canonical lanes")
    for change in plan.get("add_lanes", []):
        path = change["path"]
        if any((item.get("canonical_path") or item.get("name")) == path
               for item in manifest.get("tabs", []) if isinstance(item, dict)):
            raise ValueError(f"Lane already exists: {path}")
        manifest.setdefault("tabs", []).append({
            "name": path, "canonical_path": path,
            "root_path": path.split(" > ", 1)[0],
            "type": change["type"],
            "survey_screenshots": [_png(session, name) for name in change["screenshots"]],
            "interactions": [],
        })
        events.append(f"attached {path}")
    for context in plan.get("misrouted_capture_contexts", []):
        reports = [item for item in manifest.get("pristine_capture_results", [])
                   if isinstance(item, dict) and item.get("context") == context]
        if not reports:
            raise ValueError(f"Capture report not found: {context}")
        for report in reports:
            report["misrouted_diagnostic"] = True
        events.append(f"marked {context} as diagnostic")
    for change in plan.get("clear_pending_captures", []):
        root, context = change["root"], change["context"]
        pending = (memory.get("tab_progress", {}).get(root, {})
                   .get("_pristine_pending_captures", {}))
        if context not in pending:
            raise ValueError(f"Pending capture not found: {root}/{context}")
        del pending[context]
        if not pending:
            memory["tab_progress"][root].pop("_pristine_pending_captures", None)
        events.append(f"retired misattributed pending capture {root}/{context}")
    for root in plan.get("clear_preflight_deferred", []):
        if root in manifest.get("preflight_deferred", {}):
            manifest["preflight_deferred"].pop(root)
            events.append(f"cleared historical preflight deferral {root}")
    for item in plan.get("overlay_misroutes", []):
        record = dict(item)
        record["diagnostic_screenshot"] = _png(session, item["screenshot"])
        record.pop("screenshot")
        record["resolved"] = False
        manifest.setdefault("overlay_misroutes", []).append(record)
        events.append(f"recorded unresolved {item['root']} > {item['item']} misroute")
    for path in plan.get("reset_progress", []):
        memory.setdefault("tab_progress", {}).setdefault(path, {})["survey"] = "partial"
        memory["tab_progress"][path]["interaction"] = "partial"
        events.append(f"queued verified recapture of {path}")
    event = {"at": datetime.now(timezone.utc).isoformat(),
             "source": "paused_capture_review", "events": events}
    manifest.setdefault("reconciliation_events", []).append(event)
    memory.setdefault("reconciliation_events", []).append(event)
    _validate_lanes(session, manifest)
    return manifest, memory, events


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    session = args.session.resolve()
    status = _load(session / "capture_supervisor_status.json")
    if status.get("state") != "paused":
        parser.error("The supervisor must be paused before reconciliation")
    plan = _load(args.plan)
    manifest, memory, events = reconcile(session, plan)
    print(json.dumps({"session": str(session), "apply": args.apply,
                      "events": events}, ensure_ascii=False, indent=2))
    if not args.apply:
        return 0
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for name in ("session_manifest.json", "agent_memory.json"):
        shutil.copy2(session / name, session / f"{name}.before-reconciliation-{stamp}")
    _atomic(session / "session_manifest.json", manifest)
    _atomic(session / "agent_memory.json", memory)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
