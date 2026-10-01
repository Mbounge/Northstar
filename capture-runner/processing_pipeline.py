#!/usr/bin/env python3
"""Checkpointed processing of one immutable Android capture's canonical evidence.

The original manifest and screenshots are never rewritten. A prepared taxonomy
is a reviewable input to enrichment, not a claim that the partial audit passed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

PROCESSING = Path(__file__).with_name("processing")
sys.path.insert(0, str(PROCESSING))
from flow_maker_spy import (build_and_save_taxonomy_json,
                            build_deterministic_structures, generate_html)

FINISHED = {"complete", "finished_early"}


def _read(path: Path) -> dict:
    try:
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def _atomic(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    with temp.open("w") as output:
        json.dump(value, output, ensure_ascii=False, indent=2)
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())
    os.replace(temp, path)


def _status(session: Path, **changes) -> dict:
    path = session / "processing_pipeline.json"
    value = _read(path)
    value.update(changes, updated_at=datetime.now(timezone.utc).isoformat())
    _atomic(path, value)
    return value


def _canonical_refs(manifest: dict, session: Path) -> list[Path]:
    root = (session / "screenshots").resolve()
    paths: dict[str, Path] = {}
    seen_lanes: set[str] = set()
    for lane in manifest.get("tabs") or []:
        if not isinstance(lane, dict):
            raise ValueError("Canonical manifest contains a non-object lane")
        name = lane.get("canonical_path") or lane.get("name")
        if not isinstance(name, str) or not name or name in seen_lanes:
            raise ValueError(f"Duplicate or invalid canonical lane: {name}")
        seen_lanes.add(name)
        raw = list(lane.get("survey_screenshots") or [])
        for item in lane.get("interactions") or []:
            if isinstance(item, dict):
                raw.extend(item.get("screenshot_files") or item.get("screenshots") or [])
        for value in raw:
            if not isinstance(value, str) or not value.endswith(".png"):
                raise ValueError(f"Invalid screenshot reference in {name}")
            path = Path(value)
            path = (path if path.is_absolute() else root / path).resolve()
            if path.parent != root:
                raise ValueError(f"Screenshot outside this capture in {name}: {path}")
            if not path.is_file():
                raise ValueError(f"Missing screenshot in {name}: {path.name}")
            paths.setdefault(path.name, path)
    if not paths:
        raise ValueError("No canonical screenshot evidence")
    return list(paths.values())


def _evidence_sha256(refs: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(refs, key=lambda item: item.name):
        digest.update(path.name.encode())
        digest.update(b"\0")
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        digest.update(b"\0")
    return digest.hexdigest()


def _flow_refs(flows: list[dict]) -> set[str]:
    names: set[str] = set()
    for flow in flows:
        names.update(Path(path).name for path in flow.get("spine") or [])
        for branch in flow.get("branches") or []:
            names.update(Path(path).name for path in branch.get("screenshots") or [])
    return names


def _registry_status(session: Path) -> str:
    run = _read(session.parent / "runs.json").get(session.name)
    return str(run.get("status") or "") if isinstance(run, dict) else ""


def inspect(session: Path, *, verify_pixels: bool = False) -> dict:
    session = session.resolve()
    status = _registry_status(session)
    if status not in FINISHED:
        raise ValueError(f"Capture must be finished before processing; current state: {status or 'unknown'}")
    manifest_path = session / "session_manifest.json"
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    if not isinstance(manifest, dict) or not isinstance(manifest.get("tabs"), list):
        raise ValueError("Capture manifest is missing canonical lanes")
    refs = _canonical_refs(manifest, session)
    if verify_pixels:
        for path in refs:
            with Image.open(path) as image:
                image.verify()
    flows = build_deterministic_structures(manifest)
    if not flows or _flow_refs(flows) != {path.name for path in refs}:
        raise ValueError("Flow taxonomy does not cover exactly the canonical screenshots")
    return {
        "session": session,
        "manifest": manifest,
        "manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(),
        "source_screens_sha256": _evidence_sha256(refs),
        "capture_status": status,
        "audit_status": str(_read(session / "unattended_audit.json").get("status") or "unknown"),
        "canonical_screens": len(refs),
        "canonical_files": {path.name for path in refs},
        "saved_screens": len(list((session / "screenshots").glob("*.png"))),
        "lanes": len(manifest["tabs"]),
        "flows": flows,
    }


def prepare(session: Path) -> dict:
    _status(session.resolve(), stage="preparing", error=None, worker_pid=os.getpid())
    info = inspect(session, verify_pixels=True)
    session = info["session"]
    out = session / "flows"
    out.mkdir(exist_ok=True)
    taxonomy = out / "flows.json"
    pending = out / ".flows.json.pending"
    build_and_save_taxonomy_json(info["manifest"].get("app") or session.name,
                                 info["flows"], pending)
    generated = _read(pending)
    generated_refs = {
        Path(path).name
        for root in generated.get("taxonomy") or []
        for lane in root.get("children") or []
        for path in ((lane.get("spine") or []) + [
            item for branch in lane.get("branches") or []
            for item in branch.get("screenshots") or []
        ])
    }
    if generated_refs != _flow_refs(info["flows"]):
        pending.unlink(missing_ok=True)
        raise ValueError("Saved taxonomy omitted canonical screenshot evidence")
    os.replace(pending, taxonomy)
    presentation = []
    for flow in info["flows"]:
        presentation.append({**flow,
            "spine": ["../screenshots/" + Path(path).name for path in flow["spine"]],
            "branches": [{**branch, "screenshots": [
                "../screenshots/" + Path(path).name for path in branch["screenshots"]]}
                for branch in flow["branches"]]})
    html = out / "index.html"
    html_pending = out / ".index.html.pending"
    html_pending.write_text(generate_html(info["manifest"].get("app") or session.name,
                                          presentation))
    os.replace(html_pending, html)
    return _status(session, stage="prepared", error=None,
                   worker_pid=None,
                   source_manifest_sha256=info["manifest_sha256"],
                   source_screens_sha256=info["source_screens_sha256"],
                   source_run_id=session.name, capture_status=info["capture_status"],
                   audit_status=info["audit_status"],
                   canonical_screens=info["canonical_screens"],
                   saved_screens=info["saved_screens"], lanes=info["lanes"],
                   boards=len(info["flows"]),
                   taxonomy="flows/flows.json", preview="flows/index.html")


def _enrichment_valid(session: Path, expected: set[str]) -> bool:
    manifest = _read(session / "enriched/enriched_manifest.json")
    entries = manifest.get("enriched_screenshots") or []
    if len(entries) != len(expected) or {
        Path(str(item.get("screenshot") or "")).name
        for item in entries if isinstance(item, dict)
    } != expected:
        return False
    folder = session / "enriched"
    for item in entries:
        if not isinstance(item, dict):
            return False
        path = folder / str(item.get("enriched_file") or "")
        value = _read(path)
        if not path.is_file() or value.get("extraction_meta", {}).get("provider") != "openai":
            return False
    intelligence = _read(session / "enriched/session_intelligence.json")
    profile = intelligence.get("competitive_profile") or {}
    return (isinstance(intelligence.get("executive_summary"), str)
            and bool(intelligence["executive_summary"].strip())
            and isinstance(profile, dict)
            and bool(str(profile.get("macro_market") or "").strip())
            and str(profile.get("macro_market")).strip() != "Unclassified"
            and bool(str(profile.get("micro_niche") or "").strip()))


def _flows_valid(session: Path, expected: set[str]) -> bool:
    result = _read(session / "enriched/flows.json")
    catalog = result.get("screen_catalog") or []
    if len(catalog) != len(expected) or {
        Path(str(item.get("screenshot_file") or "")).name
        for item in catalog if isinstance(item, dict)
    } != expected:
        return False
    assigned: set[int] = set()
    def walk(nodes):
        for node in nodes:
            assigned.update(n for n in node.get("screens") or [] if isinstance(n, int))
            walk(node.get("children") or [])
    walk(result.get("taxonomy") or [])
    return assigned == set(range(1, len(expected) + 1))


def run(session: Path) -> dict:
    session = session.resolve()
    info = inspect(session)
    current = _read(session / "processing_pipeline.json")
    if current.get("source_manifest_sha256") and current["source_manifest_sha256"] != info["manifest_sha256"]:
        raise ValueError("Capture manifest changed after preparation; review the source before reprocessing")
    if current.get("source_screens_sha256") and current["source_screens_sha256"] != info["source_screens_sha256"]:
        raise ValueError("Canonical screenshots changed after preparation; review the source before reprocessing")
    if current.get("source_manifest_sha256") != info["manifest_sha256"]:
        prepare(session)
    if not (session / "flows/flows.json").is_file():
        prepare(session)
    expected = info["canonical_files"]
    log_path = session / "processing_pipeline.log"
    try:
        with log_path.open("ab") as log:
            if not _enrichment_valid(session, expected):
                _status(session, stage="preprocessing", error=None, started_at=time.time(),
                        worker_pid=os.getpid())
                result = subprocess.run([sys.executable, "-u", str(PROCESSING / "post_processor_spy2.py"),
                                         str(session)], cwd=PROCESSING, stdout=log,
                                        stderr=subprocess.STDOUT, check=False)
                if result.returncode or not _enrichment_valid(session, expected):
                    raise RuntimeError("Screen preprocessing did not produce a complete, verified set")
            if not _flows_valid(session, expected):
                _status(session, stage="flow_generation", error=None,
                        worker_pid=os.getpid())
                result = subprocess.run([sys.executable, "-u", str(PROCESSING / "flow_generator_spy.py"),
                                         str(session)], cwd=PROCESSING, stdout=log,
                                        stderr=subprocess.STDOUT, check=False)
                if result.returncode or not _flows_valid(session, expected):
                    raise RuntimeError("Generated flow taxonomy omitted canonical screens")
        if _evidence_sha256(_canonical_refs(info["manifest"], session)) != info["source_screens_sha256"]:
            raise RuntimeError("Canonical screenshots changed during processing")
        return _status(session, stage="ready_for_review", error=None,
                       finished_at=time.time(), worker_pid=None)
    except Exception as exc:
        return _status(session, stage="failed", error=str(exc), worker_pid=None)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", type=Path, required=True)
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--run", action="store_true")
    args = parser.parse_args()
    try:
        result = run(args.session) if args.run else prepare(args.session) if args.prepare else {
            key: value for key, value in inspect(args.session).items()
            if key not in ("session", "manifest", "flows", "canonical_files")}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1 if result.get("stage") == "failed" else 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        if args.session.is_dir():
            _status(args.session.resolve(), stage="failed", error=str(exc), worker_pid=None)
        print(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
