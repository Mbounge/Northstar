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


def _lane_path(lane: dict) -> str:
    return str(lane.get("canonical_path") or lane.get("name") or "")


def _issue(path: str, reason: str, *, uncertain: bool = False) -> dict:
    depth = len(_parts(path))
    detail = reason.strip()
    if len(detail) >= 260 and not detail.endswith((".", "!", "?", "…")):
        detail += "… [agent note clipped]"
    return {
        "path": path,
        "reason": detail,
        # This describes scope, not a judgement about business importance.
        "impact": "unverified" if uncertain else "broad" if depth <= 2 else "local",
    }


def _open_checks(lanes: list[dict], progress: dict, manifest: dict | None = None) -> list[dict]:
    checks: list[dict] = []
    seen: set[tuple[str, str]] = set()

    def add(check: dict) -> None:
        key = (check["path"].casefold(), check["reason"].casefold())
        if check["path"] and check["reason"] and key not in seen:
            seen.add(key)
            checks.append(check)

    for path, stages in progress.items():
        if not isinstance(stages, dict):
            continue
        pending = stages.get("_pristine_pending_captures")
        if not isinstance(pending, dict):
            continue
        for item in pending.values():
            if isinstance(item, dict):
                scope = str(item.get("scope") or path)
                reason = str(item.get("reason") or "Capture could not be verified")
                add(_issue(scope, reason))

    for lane in lanes:
        path = _lane_path(lane)
        status = lane.get("capture_status")
        if status == "capture_limit_reached" and not any(
            check["path"] == path and "capture limit" in check["reason"].casefold()
            for check in checks
        ):
            add(_issue(path, "Capture limit reached; the end of this page was not confirmed."))

    for item in (manifest or {}).get("overlay_misroutes") or []:
        if isinstance(item, dict) and not item.get("resolved"):
            root, action = str(item.get("root") or ""), str(item.get("item") or "")
            add(_issue(f"{root} > {action}",
                       "Menu action reached an unrelated page; the intended destination needs a verified retry.",
                       uncertain=True))
    for item in (manifest or {}).get("blocked_menu_destinations") or []:
        if isinstance(item, dict):
            root, action = str(item.get("root") or ""), str(item.get("item") or "")
            add(_issue(f"{root} > {action}",
                       str(item.get("reason") or "The app closed before this menu destination could be captured."),
                       uncertain=True))
    for item in (manifest or {}).get("external_destinations") or []:
        if isinstance(item, dict):
            root, action = str(item.get("root") or ""), str(item.get("item") or "")
            add(_issue(f"{root} > {action}",
                       str(item.get("reason") or "This action left the app; the destination is unverified."),
                       uncertain=True))
    for root, gate in ((manifest or {}).get("exploration_deferred") or {}).items():
        if isinstance(gate, dict) and gate.get("status") == "gated_destination":
            evidence = str(gate.get("reason") or "").strip()
            add(_issue(str(root),
                       (f"Access prerequisite: {evidence}. The tab's content is not verified yet."
                        if evidence else "The tab opened a first-use or access prerequisite; its actual content is not verified yet."),
                       uncertain=True))

    for lane in lanes:
        path = _lane_path(lane)
        if (lane.get("type") in ("prerequisite", "overlay_menu_item_root_jump",
                                  "root_overlay_menu", "overlay_menu_item",
                                  "global_menu", "global_section")
                or len(_parts(path)) > 2 or not (lane.get("survey_screenshots") or lane.get("interactions"))
                or any(check["path"] == path or check["path"].startswith(path + " > ") for check in checks)):
            continue
        stages = progress.get(path) if isinstance(progress.get(path), dict) else {}
        if stages.get("survey") == "partial":
            add(_issue(path, "The section survey has not reached a verified end."))
        elif stages.get("interaction") == "partial":
            add(_issue(path, "The section's interaction pass is not fully verified."))
        elif stages.get("survey") == "complete" and stages.get("interaction") != "complete":
            add(_issue(path, "An interaction pass has not been verified yet.", uncertain=True))
        elif stages.get("interaction") == "complete" and stages.get("survey") != "complete":
            add(_issue(path, "The survey end has not been verified yet.", uncertain=True))
        elif stages.get("survey") != "complete" or stages.get("interaction") != "complete":
            add(_issue(path, "A complete survey and interaction checkpoint is not recorded yet.", uncertain=True))
    # A root checkpoint and its child section can report the same failed
    # observation. Keep the more specific path rather than double-counting it.
    return [check for check in checks if not any(
        other is not check and other["reason"].casefold() == check["reason"].casefold()
        and other["path"].startswith(check["path"] + " > ")
        for other in checks
    )]


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


def _summary(name: str, lanes: list[dict], progress: dict, current_path: str,
             checks: list[dict], gated: bool = False) -> dict:
    current = current_path == name or current_path.startswith(name + " > ")
    screens = {
        path for lane in lanes for path in lane.get("survey_screenshots", [])
        if isinstance(path, str)
    }
    direct = [lane for lane in lanes if len(_parts(str(lane.get("canonical_path") or lane.get("name") or ""))) <= 2]
    destination_evidence = any(
        lane.get("type") not in ("prerequisite", "overlay_menu_item_root_jump")
        and (lane.get("survey_screenshots") or lane.get("interactions"))
        for lane in lanes
    )
    return {
        "name": name,
        "state": ("needs_followup" if destination_evidence else "access_required")
                 if gated else _state(lanes, progress, current),
        "screens": len(screens),
        "open_checks": [check for check in checks if check["path"] == name or check["path"].startswith(name + " > ")],
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

    checks = _open_checks(lanes, progress, manifest)
    deferred = manifest.get("exploration_deferred") or {}
    tabs = [_summary(name, [lane for lane in lanes if lane.get("root_path") == name
                      or str(lane.get("canonical_path") or lane.get("name") or "") == name],
                     progress, active_path, checks,
                     isinstance(deferred.get(name), dict)
                     and deferred[name].get("status") == "gated_destination")
            for name in dict.fromkeys(roots)]
    visited = sum(tab["state"] not in ("not_reached", "access_required") for tab in tabs)
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
