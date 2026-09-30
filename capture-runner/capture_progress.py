"""Small, evidence-backed progress summary for the capture console.

The agent's audit is authoritative for completion. This view only describes
which known navigation surfaces have actually produced saved evidence.
"""

from __future__ import annotations

import json
from pathlib import Path


def _read(path: Path) -> dict:
    try:
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def _parts(path: str) -> list[str]:
    return [part.strip() for part in path.split(">") if part.strip()]


def _state(lanes: list[dict], progress: dict, current: bool) -> str:
    if not lanes:
        return "not_reached"
    evidenced = [lane for lane in lanes if lane.get("survey_screenshots") or lane.get("interactions")]
    if not evidenced:
        return "not_reached"
    if current:
        return "capturing"
    def done(lane: dict) -> bool:
        path = str(lane.get("canonical_path") or lane.get("name") or "")
        stages = progress.get(path) if isinstance(progress.get(path), dict) else {}
        return stages.get("survey") == "complete" and stages.get("interaction") == "complete"
    if all(done(lane) for lane in evidenced):
        return "done"
    return "needs_followup"


def _summary(name: str, lanes: list[dict], progress: dict, current_path: str) -> dict:
    current = current_path == name or current_path.startswith(name + " > ")
    screens = {
        path for lane in lanes for path in lane.get("survey_screenshots", [])
        if isinstance(path, str)
    }
    direct = [lane for lane in lanes if len(_parts(str(lane.get("canonical_path") or lane.get("name") or ""))) <= 2]
    return {
        "name": name,
        "state": _state(lanes, progress, current),
        "screens": len(screens),
        "subviews": [
            {
                "name": str(lane.get("canonical_path") or lane.get("name") or ""),
                "state": _state([lane], progress, current_path == str(lane.get("canonical_path") or lane.get("name") or "")),
                "screens": len(lane.get("survey_screenshots") or []),
            }
            for lane in direct if str(lane.get("canonical_path") or lane.get("name") or "") != name
        ],
    }


def build_progress(directory: Path, *, active: bool = False) -> dict:
    manifest = _read(directory / "session_manifest.json")
    memory = _read(directory / "agent_memory.json")
    lanes = [lane for lane in manifest.get("tabs", []) if isinstance(lane, dict)]
    progress = memory.get("tab_progress") if isinstance(memory.get("tab_progress"), dict) else {}
    current_path = str(memory.get("current_location") or "")
    active_path = current_path if active else ""

    roots: list[str] = []
    reconciliations = [item for item in manifest.get("root_tab_reconciliation") or [] if isinstance(item, dict)]
    verified = [item for item in reconciliations if item.get("status") in ("verified_same_identities", "initialized")]
    for item in reversed(verified or reconciliations):
        if isinstance(item, dict) and isinstance(item.get("live_names"), list):
            roots = [name.strip() for name in item["live_names"] if isinstance(name, str) and name.strip()]
            if roots:
                break
    if not roots:
        index = memory.get("tab_index_map") or {}
        if isinstance(index, dict):
            roots = [name for _, name in sorted(index.items(), key=lambda pair: int(pair[0]) if str(pair[0]).isdigit() else 999)
                     if isinstance(name, str) and name]
    if not roots:
        roots = list(dict.fromkeys(str(lane.get("root_path") or "") for lane in lanes
                                  if lane.get("root_path") and lane.get("type") not in ("global_menu", "global_section")))

    tabs = [_summary(name, [lane for lane in lanes if lane.get("root_path") == name
                      or str(lane.get("canonical_path") or lane.get("name") or "") == name], progress, active_path)
            for name in dict.fromkeys(roots)]
    visited = sum(tab["state"] != "not_reached" for tab in tabs)
    done = sum(tab["state"] == "done" for tab in tabs)

    def area(kind: str, labels: set[str]) -> dict:
        matching = [lane for lane in lanes if any(
            part.casefold() in labels or (kind == "Settings" and part.casefold().startswith("settings"))
            for part in _parts(str(lane.get("canonical_path") or lane.get("name") or ""))
        )]
        screens = {path for lane in matching for path in lane.get("survey_screenshots", []) if isinstance(path, str)}
        return {"name": kind, "state": _state(matching, progress, any(
            str(lane.get("canonical_path") or lane.get("name") or "") == active_path for lane in matching
        )) if matching else "not_identified", "screens": len(screens)}

    screen_dir = directory / "screenshots"
    try:
        latest_screen = max((path.stat().st_mtime for path in screen_dir.glob("*.png") if path.is_file()), default=None)
    except OSError:
        latest_screen = None
    return {
        "tabs": tabs,
        "areas": [area("Profile", {"profile", "my profile", "account", "my account"}),
                  area("Settings", {"settings", "preferences", "settings & privacy"})],
        "identified_tabs": len(tabs),
        "visited_tabs": visited,
        "done_tabs": done,
        "navigation_percent": round(100 * visited / len(tabs)) if tabs else None,
        "current_path": current_path or None,
        "current_phase": memory.get("current_phase"),
        "last_screen_at": latest_screen,
    }
