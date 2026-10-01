"""
FLOW_MAKER v2.0 (Deterministic Offline Edition)
==============================================
Deterministic Structural Engine + Figma-Style Board Generator + Self-Healing Dedup.

Key Features:
- 100% Offline & Deterministic: Zero AI-calls, zero internet access, and zero API costs.
- Original Sequential Architecture: Processes parent flows and nested branches sequentially.
- Self-Healing Content-Aware Deduplication: Uses full-screen pixel hashing to
  prune identical manifest references without hiding app-header or bottom-nav changes
  while preserving the raw capture corpus by default.
- Dual-Compatible Schema: Outputs a flows.json that respects the legacy V1 taxonomy
  structure while containing V2 parallel Spine and Branches metadata lanes.
- Portable Web Workspace: Outputs a self-contained index.html with a visual board layout.
"""

import os
import sys
import json
import hashlib
import re
import shutil
import tempfile
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

# =============================================================================
# IMAGE UTILITIES (Local Deduplication & Hash Generation)
# =============================================================================

def _compute_content_hash(path: str) -> str:
    """
    Hash the entire decoded screen. A changed app header, tab indicator, or
    bottom action is a real state difference, even if the body is identical.
    Keeping an occasional clock-drift repeat is safer than deleting that state.
    """
    if not os.path.exists(path):
        return ""
    if not PIL_AVAILABLE:
        # Fallback to raw file hash if PIL is not installed
        try:
            with open(path, "rb") as f:
                return hashlib.md5(f.read()).hexdigest()
        except:
            return ""
    try:
        with Image.open(path) as image:
            img = image.convert("RGB")
            digest = hashlib.sha256()
            digest.update(f"{img.width}x{img.height}:".encode("ascii"))
            digest.update(img.tobytes())
            return digest.hexdigest()
    except Exception as e:
        print(f"      ⚠️ Content hash calculation failed for {path}: {e}")
        try:
            with open(path, "rb") as f:
                return hashlib.md5(f.read()).hexdigest()
        except:
            return ""

# =============================================================================
# SELF-HEALING MANIFEST DEDUPLICATION ENGINE
# =============================================================================

def execute_self_healing_deduplication(session_dir: Path, manifest: dict):
    """
    Performs content-aware local deduplication on Spines and Branches.
    Overwrites session_manifest.json on disk to permanently heal the session data,
    and removes unreferenced physical duplicate files from storage.
    """
    print("\n🧼 Executing Self-Healing Content-Aware Deduplication...")

    original_files = set()
    referenced_files = set()

    pruned_spine_count = 0
    pruned_branch_count = 0

    # 1. Gather all files initially listed in the manifest
    for tab in manifest.get("tabs", []):
        original_files.update(tab.get("survey_screenshots", []))
        for interaction in tab.get("interactions", []):
            if isinstance(interaction, dict):
                original_files.update(interaction.get("screenshot_files", []) or interaction.get("screenshots", []))

    # 2. Local Deduplication Loop
    for tab in manifest.get("tabs", []):
        tab_name = tab.get("name", "Unknown Tab")

        # A. Deduplicate the Survey Spine
        clean_spine = []
        seen_spine_hashes = set()

        for path in tab.get("survey_screenshots", []):
            if not path:
                continue
            h = _compute_content_hash(path)
            if h and h in seen_spine_hashes:
                pruned_spine_count += 1
                continue
            clean_spine.append(path)
            if h:
                seen_spine_hashes.add(h)

        tab["survey_screenshots"] = clean_spine
        referenced_files.update(clean_spine)

        # B. Deduplicate the Interaction Branches
        for interaction in tab.get("interactions", []):
            if not isinstance(interaction, dict):
                continue

            clean_branch = []
            seen_branch_hashes = set()

            # Read both V1 and V2 keys for safety
            raw_paths = interaction.get("screenshot_files", []) or interaction.get("screenshots", [])

            for path in raw_paths:
                if not path:
                    continue
                h = _compute_content_hash(path)
                if h and h in seen_branch_hashes:
                    pruned_branch_count += 1
                    continue
                clean_branch.append(path)
                if h:
                    seen_branch_hashes.add(h)

            # Write back to both keys to guarantee dual-compatibility
            interaction["screenshot_files"] = clean_branch
            interaction["screenshots"] = clean_branch
            referenced_files.update(clean_branch)

    # 3. Replace the manifest atomically. An interrupted builder must leave
    # either the old or the complete deduplicated trail available for resume.
    manifest_path = session_dir / "session_manifest.json"
    staged_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=session_dir,
            prefix=".session_manifest.", suffix=".tmp", delete=False,
        ) as f:
            staged_path = Path(f.name)
            json.dump(manifest, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(staged_path, manifest_path)
    finally:
        if staged_path is not None and staged_path.exists():
            staged_path.unlink()

    print(f"  ✨ Manifest self-healed on disk.")
    print(f"     Pruned {pruned_spine_count} duplicate viewport(s) from Spines.")
    print(f"     Pruned {pruned_branch_count} duplicate viewport(s) from Branches.")

    # 4. Raw evidence is immutable by default.  Deduplication changes the
    # manifest view, not the original capture corpus.  Explicit physical
    # pruning remains opt-in for operators who have already archived a session.
    unreferenced_files = original_files - referenced_files
    deleted_files_count = 0
    prune_raw = os.getenv("MOBILESPY_PRUNE_RAW_DUPLICATES", "0").strip().lower() in (
        "1", "true", "yes", "on"
    )
    if prune_raw:
        for unref_path in unreferenced_files:
            if os.path.exists(unref_path):
                try:
                    os.remove(unref_path)
                    deleted_files_count += 1
                except Exception as e:
                    print(f"      ⚠️ Failed to delete physical duplicate {unref_path}: {e}")
    elif unreferenced_files:
        print(f"  🧾 Preserved {len(unreferenced_files)} raw duplicate capture file(s) as source evidence.")

    if deleted_files_count > 0:
        print(f"  🧹 Cleaned up {deleted_files_count} orphaned duplicate image files from disk.")

# =============================================================================
# CHRONOLOGICAL SORTING
# =============================================================================

def parse_sort_key(file_path: str) -> Tuple[int, int, str, int]:
    """Sorts mathematically by Step -> Priority -> Category -> Index"""
    if not isinstance(file_path, str):
        return (9999, 2, "", 0)

    fname = os.path.basename(file_path)

    # 1. Step Number
    step_match = re.match(r"^s(\d+)_", fname)
    step = int(step_match.group(1)) if step_match else 9999

    # 2. Category Name
    clean_cat = re.sub(r"^s\d+_(tab_|child_|flow_|grandchild_)?", "", fname)
    clean_cat = re.sub(r"_\d+_[a-f0-9]{6}\.png$", "", clean_cat)
    clean_cat = re.sub(r"_[a-f0-9]{6}\.png$", "", clean_cat)

    # 3. Priority (Pre-Clicks MUST be Priority 0 to always render first in storyboards!)
    is_pre_click = "pre_click" in fname.lower()
    is_main_survey = any(kw in fname.lower() for kw in ("survey", "pristine", "preflight", "external_page", "landing"))

    if is_pre_click:
        priority = 0
    elif is_main_survey:
        priority = 1
    else:
        priority = 2

    # 4. Sequence Index
    idx_match = re.search(r"_(\d+)_[a-f0-9]{6}\.png$", fname)
    idx = int(idx_match.group(1)) if idx_match else 0

    return step, priority, clean_cat, idx


def parse_spine_sort_key(file_path: str) -> int:
    """Sorts Spines strictly by their visual sequence index suffix (_00, _01, etc.)"""
    if not isinstance(file_path, str):
        return 9999
    fname = os.path.basename(file_path)
    # Extracts the sequence index (e.g. "_01" -> 1)
    idx_match = re.search(r"_(\d+)_[a-f0-9]{6}\.png$", fname)
    return int(idx_match.group(1)) if idx_match else 9999

def extract_step_number(file_path: str) -> int:
    """Extracts step number integer from screenshot path for legacy V1 screens compatibility."""
    if not file_path:
        return 9999
    fname = os.path.basename(file_path)
    match = re.match(r"^s(\d+)_", fname)
    return int(match.group(1)) if match else 9999

# =============================================================================
# DETERMINISTIC DATA STRUCTURING
# =============================================================================

def parse_name(name: str) -> Tuple[str, str]:
    """Split 'Tab > SubView' into (tab, subview)."""
    if " > " in name:
        parts = name.split(" > ", 1)
        return parts[0].strip(), parts[1].strip()
    return name.strip(), "Default"

def _make_flow_id(name: str) -> str:
    return re.sub(r"[^a-z0-9_]", "_", name.lower().strip()).strip("_")

def build_deterministic_structures(manifest: dict) -> List[dict]:
    """
    Parses manifest into a multi-lane structure matching Figma/Mobbin boards.
    Ensures strict separation between the Survey Spine and parallel Interaction Branches.
    """
    flows = []

    for entry in manifest.get("tabs", []):
        name = (entry.get("display_path") or entry.get("canonical_path")
                or entry.get("name", "Unknown"))
        parsed_tab_name, parsed_subview_name = parse_name(name)
        tab_name = entry.get("root_path") or parsed_tab_name
        subview_name = (
            name[len(tab_name):].lstrip(" >") or "Default"
            if name.startswith(tab_name) else parsed_subview_name
        )

        # 1. The Spine (Phase A Survey)
        spine = entry.get("survey_screenshots", [])
        spine = list(dict.fromkeys([s for s in spine if s])) # Remove string dupes
        # Manifest order is the canonical chronology.  Sorting solely by the
        # repeated _00/_01 suffix interleaves separate resume capture cohorts.

        # 2. The Branches (Phase B+C Interactions)
        branches = []
        for inter in entry.get("interactions", []):
            shots = inter.get("screenshot_files", []) or inter.get("screenshots", [])
            shots = list(dict.fromkeys([s for s in shots if s]))

            # FIXED: Do NOT sort branch screenshots mathematically.
            # Keep them in their pristine manifest order (which is already correct and chronological).

            if shots:
                el_name = inter.get("element", "Interaction")
                branches.append({
                    "raw_element_name": el_name,
                    "label": el_name,  # Ground-truth label
                    "description": f"Interaction storyboard demonstrating clicked element '{el_name}'.",
                    "screenshots": shots
                })

        # Sort branches chronologically by their first screenshot step
        branches.sort(key=lambda b: parse_sort_key(b["screenshots"][0]))

        screen_count = len(spine) + sum(len(b["screenshots"]) for b in branches)

        if screen_count == 0:
            continue

        flows.append({
            "id": _make_flow_id(name),
            "name": name,
            "path_id": entry.get("path_id"),
            "parent_path": entry.get("parent_path"),
            "depth": entry.get("depth"),
            "capture_segments": entry.get("capture_segments", []),
            "capture_status": entry.get("capture_status"),
            "capture_complete": entry.get("capture_complete"),
            "capture_outcome": entry.get("capture_outcome"),
            "opened_by": entry.get("opened_by"),
            "primary_surface_id": entry.get("primary_surface_id"),
            "tab": tab_name,
            "subview": subview_name,
            "label": name,  # Ground-truth label
            "description": f"Pristine survey of the {tab_name} section (subview: {subview_name}).",
            "spine": spine,
            "branches": branches,
            "screen_count": screen_count
        })

    return flows

# =============================================================================
# FILE SYSTEM COPY & REMAPPING
# =============================================================================

def copy_screenshots_figma(flows: List[dict], out_dir: Path) -> List[dict]:
    ss_dir = out_dir / "screenshots"
    ss_dir.mkdir(parents=True, exist_ok=True)

    path_map = {}
    missing_count = 0

    # Collect all required paths
    all_paths = set()
    for f in flows:
        all_paths.update(f["spine"])
        for b in f["branches"]:
            all_paths.update(b["screenshots"])

    # Physically copy files
    print("\n📁 Validating and copying physical screenshots...")
    for orig in all_paths:
        if not orig:
            continue

        if not os.path.exists(orig):
            print(f"   ❌ MISSING PHYSICAL FILE: {orig}")
            missing_count += 1
            continue

        fname = Path(orig).name
        dest = ss_dir / fname

        # Handle filename collisions
        if dest.exists() and str(dest) != orig:
            stem = Path(orig).stem
            ext = Path(orig).suffix
            h = hashlib.md5(orig.encode()).hexdigest()[:6]
            fname = f"{stem}_{h}{ext}"
            dest = ss_dir / fname

        try:
            shutil.copy2(orig, dest)
            path_map[orig] = f"screenshots/{fname}"
        except Exception as e:
            print(f"   ⚠️ Copy failed for {orig}: {e}")

    # Remap paths in the flow data
    for f in flows:
        f["spine"] = [path_map[s] for s in f["spine"] if s in path_map]
        for b in f["branches"]:
            b["screenshots"] = [path_map[s] for s in b["screenshots"] if s in path_map]

        f["screen_count"] = len(f["spine"]) + sum(len(b["screenshots"]) for b in f["branches"])

    if missing_count > 0:
        print(f"\n   ⚠️ WARNING: {missing_count} files listed in the manifest could not be found on disk.")
        print(f"   They will not appear in the HTML viewer until they are restored to the folder.")

    return flows

# =============================================================================
# EXPORT DUAL-COMPATIBLE V1/V2 SCHEMAS
# =============================================================================

def build_and_save_taxonomy_json(app_name: str, flows: List[dict], out_path: Path):
    """
    Constructs and exports a flows.json that strictly respects the legacy V1 taxonomy
    format while containing full V2 Spine and Branches parallel lanes in metadata.
    """
    roots_map = {}

    for f in flows:
        root_name = f["tab"]
        if root_name not in roots_map:
            roots_map[root_name] = {
                "id": "root_" + re.sub(r"\W+", "_", root_name.lower()).strip("_"),
                "label": root_name,
                "description": f"All flows and interactive features within the {root_name} section.",
                "is_nav_tab": True,
                "nav_order": 99,
                "screens": set(),
                "children": []
            }

        # Compile V1 flat step integer list for the root
        for path in f["spine"]:
            roots_map[root_name]["screens"].add(extract_step_number(path))
        for b in f["branches"]:
            for path in b["screenshots"]:
                roots_map[root_name]["screens"].add(extract_step_number(path))

        # Build Child Flow Node (fully satisfying V1, enriched with V2 fields)
        flow_steps = [extract_step_number(path) for path in f["spine"]]
        for b in f["branches"]:
            flow_steps.extend([extract_step_number(path) for path in b["screenshots"]])
        flow_steps = sorted(list(set(flow_steps)))

        roots_map[root_name]["children"].append({
            "id": f["id"],
            "label": f["label"],
            "description": f["description"],
            "screens": flow_steps,
            "screen_count": f["screen_count"],
            "is_pristine": len(f["spine"]) > 0,
            "is_panoramic_anchored": any("_panoramic_" in s.lower() for s in f["spine"]),
            "nav_order": 99,
            "final_order": 99,
            "children": [],
            # ── V2 SPECIFIC LANE INJECTION ──
            "tab": f["tab"],
            "subview": f["subview"],
            "path_id": f.get("path_id"),
            "parent_path": f.get("parent_path"),
            "depth": f.get("depth"),
            "capture_segments": f.get("capture_segments", []),
            "capture_status": f.get("capture_status"),
            "capture_complete": f.get("capture_complete"),
            "capture_outcome": f.get("capture_outcome"),
            "opened_by": f.get("opened_by"),
            "primary_surface_id": f.get("primary_surface_id"),
            "spine": f["spine"],
            "branches": f["branches"]
        })

    # Sort roots by structural relevance
    root_priority = {
        "home": 1, "explore": 2, "search": 2, "add": 3, "premium": 4,
        "profile": 5, "notifications": 6, "settings": 7, "messaging": 8, "chat": 8
    }

    taxonomy_list = []
    for r_name, r_node in roots_map.items():
        r_node["screens"] = sorted(list(r_node["screens"]))
        r_node["nav_order"] = root_priority.get(r_name.lower(), 99)

        # Sort children: Pristines/Surveys first, then chronological
        r_node["children"].sort(key=lambda c: (0 if c["is_pristine"] else 1, c["screens"][0] if c["screens"] else 0))
        taxonomy_list.append(r_node)

    taxonomy_list.sort(key=lambda r: r["nav_order"])

    # Save legacy/dual flows.json
    output_payload = {
        "schema_version": "24.0.0",
        "generator": "MobileSpy Flow Builder v2.0 (Deterministic Offline)",
        "generated_at": datetime.now().isoformat(),
        "app": {"name": app_name},
        "summary": {
            "total_root_sections": len(taxonomy_list),
            "total_child_flows": len(flows),
            "total_screens_kept": sum(f["screen_count"] for f in flows)
        },
        "taxonomy": taxonomy_list
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, indent=2, ensure_ascii=False)
    print(f"  \n✅ flows.json (V1/V2 Dual-Compatible) saved at {out_path}")

# =============================================================================
# GENERATE MULTI-LANE FIGMA-BOARD HTML
# =============================================================================

def generate_html(app_name: str, flows: List[dict]) -> str:
    flows_json = json.dumps(flows, indent=2)

    tabs_seen = []
    for f in flows:
        if f["tab"] not in tabs_seen:
            tabs_seen.append(f["tab"])

    sidebar_items = ""
    for tab in tabs_seen:
        tab_flows = [f for f in flows if f["tab"] == tab]
        items = ""
        for f in tab_flows:
            items += f"""
                <div class="flow-item" data-id="{f['id']}" onclick="selectFlow('{f['id']}')">
                    <span class="flow-name">{f['label']}</span>
                    <span class="flow-count">{f['screen_count']}</span>
                </div>"""
        sidebar_items += f"""
            <div class="tab-group">
                <div class="tab-group-header" onclick="toggleGroup(this)">
                    <span class="tab-icon">▸</span>
                    <span>{tab}</span>
                    <span class="tab-total">{len(tab_flows)} flows</span>
                </div>
                <div class="tab-group-flows">{items}</div>
            </div>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{app_name} — Figma Flow Viewer</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

  :root {{
    --bg: #0e0e10;
    --surface: #17171a;
    --surface2: #1f1f23;
    --border: #2a2a2e;
    --accent: #7c6aff;
    --text: #f0f0f2;
    --text2: #8a8a96;
    --text3: #55555e;
    --phone-w: 200px;
    --phone-h: 434px;
    --phone-radius: 28px;
    --sidebar-w: 320px;
  }}

  html, body {{ height: 100%; font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--text); overflow: hidden; }}

  .app {{ display: grid; grid-template-columns: var(--sidebar-w) 1fr; grid-template-rows: 56px 1fr; height: 100vh; }}

  header {{ grid-column: 1 / -1; display: flex; align-items: center; gap: 16px; padding: 0 24px; border-bottom: 1px solid var(--border); background: var(--surface); }}
  .app-name {{ font-size: 15px; font-weight: 600; letter-spacing: -0.3px; }}
  .badge {{ margin-left: auto; background: color-mix(in srgb, var(--accent) 15%, transparent); border: 1px solid var(--accent); color: var(--accent); border-radius: 20px; padding: 3px 10px; font-size: 11px; }}

  .sidebar {{ background: var(--surface); border-right: 1px solid var(--border); overflow-y: auto; display: flex; flex-direction: column; }}
  .sidebar-section {{ padding: 14px 16px 6px; font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--text3); }}
  .tab-group {{ border-bottom: 1px solid var(--border); }}
  .tab-group-header {{ display: flex; align-items: center; gap: 8px; padding: 10px 16px; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--text2); user-select: none; }}
  .tab-group-header:hover {{ color: var(--text); }}
  .tab-icon {{ font-size: 10px; transition: transform 0.2s; }}
  .tab-group-header.open .tab-icon {{ transform: rotate(90deg); }}
  .tab-total {{ margin-left: auto; font-size: 11px; color: var(--text3); }}
  .tab-group-flows {{ display: none; }}
  .tab-group-flows.open {{ display: block; }}
  .flow-item {{ display: flex; align-items: center; gap: 8px; padding: 8px 16px 8px 28px; cursor: pointer; font-size: 12.5px; color: var(--text2); }}
  .flow-item:hover {{ background: var(--surface2); color: var(--text); }}
  .flow-item.active {{ background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }}
  .flow-name {{ flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
  .flow-count {{ font-family: 'DM Mono', monospace; font-size: 10px; color: var(--text3); background: var(--surface2); border-radius: 10px; padding: 1px 7px; flex-shrink: 0; }}

  .main {{ display: flex; flex-direction: column; overflow: hidden; }}
  .toolbar {{ display: flex; align-items: center; gap: 12px; padding: 16px 24px; height: 76px; border-bottom: 1px solid var(--border); flex-shrink: 0; }}
  .flow-title {{ font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 3px; }}
  .flow-desc {{ font-size: 12px; color: var(--text2); max-width: 75%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
  .toolbar-right {{ margin-left: auto; display: flex; align-items: center; gap: 8px; }}
  .zoom-btn {{ background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; color: var(--text2); font-size: 12px; padding: 4px 10px; cursor: pointer; }}
  .zoom-btn:hover {{ color: var(--text); }}

  .canvas {{ flex: 1; overflow: auto; padding: 40px; background: #0a0a0c; }}

  .figma-board {{
      display: flex;
      flex-direction: column;
      gap: 50px;
      align-items: flex-start;
  }}

  .board-row {{
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      background: rgba(255,255,255,0.02);
      padding: 24px;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.05);
      width: 100%;
  }}

  .spine-row {{ border-color: color-mix(in srgb, var(--accent) 30%, transparent); background: color-mix(in srgb, var(--accent) 5%, transparent); }}

  .row-label {{
      font-size: 12px;
      font-weight: 600;
      color: var(--text2);
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 1px;
      display: flex;
      align-items: center;
      gap: 12px;
  }}
  .spine-row .row-label {{ color: var(--accent); }}

  .row-desc {{ font-size: 12px; color: var(--text2); margin-left: 52px; margin-bottom: 20px; max-width: 85%; line-height: 1.5; }}

  .row-track {{ display: flex; align-items: center; gap: 20px; }}

  .phone-wrap {{ display: flex; flex-direction: column; align-items: center; gap: 12px; cursor: pointer; flex-shrink: 0; transition: transform 0.15s; }}
  .phone-wrap:hover {{ transform: translateY(-4px); }}
  .phone {{ width: var(--phone-w); height: var(--phone-h); border-radius: var(--phone-radius); overflow: hidden; background: #111; border: 1.5px solid var(--border); box-shadow: 0 4px 24px rgba(0,0,0,0.4); }}
  .phone img {{ width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; pointer-events: none; }}
  .phone-index {{ font-family: 'DM Mono', monospace; font-size: 11px; color: var(--text3); }}
  .connector {{ color: var(--text3); font-size: 18px; padding: 0 8px; user-select: none; opacity: 0.5; }}

  .empty-state {{ display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; height: 100%; color: var(--text3); }}

  .lightbox {{ display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.92); z-index: 1000; align-items: center; justify-content: center; gap: 24px; }}
  .lightbox.open {{ display: flex; }}
  .lightbox img {{ max-height: 90vh; max-width: 45vw; border-radius: 20px; border: 1px solid var(--border); object-fit: contain; }}
  .lb-nav {{ position: absolute; top: 50%; transform: translateY(-50%); background: var(--surface); border: 1px solid var(--border); border-radius: 50%; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; color: var(--text); }}
  .lb-nav:hover {{ background: var(--surface2); }}
  .lb-prev {{ left: 20px; }}
  .lb-next {{ right: 20px; }}
  .lb-close {{ position: absolute; top: 20px; right: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 16px; color: var(--text2); }}
  .lb-info {{ position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); font-family: 'DM Mono', monospace; font-size: 12px; color: var(--text3); background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 4px 16px; }}

  .canvas.zoom-sm {{ --phone-w: 140px; --phone-h: 304px; --phone-radius: 20px; }}
  .canvas.zoom-lg {{ --phone-w: 260px; --phone-h: 565px; --phone-radius: 36px; }}
</style>
</head>
<body>

<div class="app">
  <header>
    <div>
      <span class="app-name">{app_name}</span>
      <span class="app-pkg">flows</span>
    </div>
    <div class="header-pill">
      <span class="badge" id="total-flows-badge">— flows</span>
      <span class="badge accent">Figma Board</span>
    </div>
  </header>

  <aside class="sidebar">
    <div class="sidebar-section">Flows</div>
    {sidebar_items}
  </aside>

  <main class="main">
    <div class="toolbar">
      <div>
        <div class="flow-title" id="flow-title">Select a flow</div>
        <div class="flow-desc" id="flow-desc">←</div>
      </div>
      <div class="toolbar-right">
        <button class="zoom-btn" onclick="setZoom('sm')">S</button>
        <button class="zoom-btn" onclick="setZoom('md')">M</button>
        <button class="zoom-btn" onclick="setZoom('lg')">L</button>
      </div>
    </div>
    <div class="canvas" id="canvas">
      <div class="empty-state">Select a flow from the sidebar</div>
    </div>
  </main>
</div>

<div class="lightbox" id="lightbox" onclick="closeLightboxOnBg(event)">
  <div class="lb-nav lb-prev" onclick="lbNav(-1)">‹</div>
  <img id="lb-img" src="" alt="">
  <div class="lb-nav lb-next" onclick="lbNav(1)">›</div>
  <div class="lb-close" onclick="closeLightbox()">✕</div>
  <div class="lb-info" id="lb-info"></div>
</div>

<script>
const FLOWS = {flows_json};
const FLOW_MAP = {{}};
FLOWS.forEach(f => FLOW_MAP[f.id] = f);

document.getElementById('total-flows-badge').textContent = FLOWS.length + ' flows';

document.querySelectorAll('.tab-group-header').forEach(h => {{
  h.classList.add('open');
  h.nextElementSibling.classList.add('open');
}});

function renderFlow(flow) {{
  const canvas = document.getElementById('canvas');
  document.getElementById('flow-title').textContent = flow.label;
  document.getElementById('flow-desc').textContent = flow.description;
  document.getElementById('flow-desc').title = flow.description;

  if (flow.screen_count === 0) {{
    canvas.innerHTML = '<div class="empty-state">No screenshots found</div>';
    return;
  }}

  let html = '<div class="figma-board">';
  let globalIdx = 0;
  window._currentScreenshots = [];

  // 1. Render Spine (Phase A)
  if (flow.spine && flow.spine.length > 0) {{
    html += '<div class="board-row spine-row">';
    html += '<div class="row-label"><span>Phase A — Pristine Survey</span></div>';
    html += '<div class="row-desc">Top-to-bottom survey capturing the page in its pristine, unmutated state.</div>';
    html += '<div class="row-track">';
    flow.spine.forEach((shot, i) => {{
      if (i > 0) html += '<div class="connector">→</div>';
      html += `
        <div class="phone-wrap" onclick="openLightbox(${{globalIdx}})">
          <div class="phone"><img src="${{shot}}" loading="lazy"></div>
          <span class="phone-index">${{i + 1}}</span>
        </div>`;
      window._currentScreenshots.push(shot);
      globalIdx++;
    }});
    html += '</div></div>';
  }}

  // 2. Render Branches (Phase B+C)
  if (flow.branches && flow.branches.length > 0) {{
    flow.branches.forEach((branch, bi) => {{
      html += '<div class="board-row branch-row">';
      html += `<div class="row-label"><span>Phase B+C — ${{branch.label}}</span></div>`;
      html += `<div class="row-desc">${{branch.description}}</div>`;
      html += '<div class="row-track">';
      branch.screenshots.forEach((shot, i) => {{
        if (i > 0) html += '<div class="connector">→</div>';
        html += `
          <div class="phone-wrap" onclick="openLightbox(${{globalIdx}})">
            <div class="phone"><img src="${{shot}}" loading="lazy"></div>
            <span class="phone-index">${{i + 1}}</span>
          </div>`;
        window._currentScreenshots.push(shot);
        globalIdx++;
      }});
      html += '</div></div>';
    }});
  }}

  html += '</div>';
  canvas.innerHTML = html;
  canvas.scrollTop = 0;
  canvas.scrollLeft = 0;
}}

let _activeFlowId = null;
function selectFlow(id) {{
  _activeFlowId = id;
  const flow = FLOW_MAP[id];
  if (!flow) return;

  document.querySelectorAll('.flow-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`[data-id="${{id}}"]`)?.classList.add('active');
  renderFlow(flow);
}}

function toggleGroup(header) {{
  header.classList.toggle('open');
  header.nextElementSibling.classList.toggle('open');
}}

function setZoom(level) {{
  const canvas = document.getElementById('canvas');
  canvas.classList.remove('zoom-sm', 'zoom-lg');
  if (level === 'sm') canvas.classList.add('zoom-sm');
  if (level === 'lg') canvas.classList.add('zoom-lg');
}}

let _lbIdx = 0;
function openLightbox(idx) {{
  _lbIdx = idx;
  updateLightbox();
  document.getElementById('lightbox').classList.add('open');
}}
function closeLightbox() {{
  document.getElementById('lightbox').classList.remove('open');
}}
function closeLightboxOnBg(e) {{
  if (e.target === document.getElementById('lightbox')) closeLightbox();
}}
function lbNav(dir) {{
  const shots = window._currentScreenshots || [];
  _lbIdx = (_lbIdx + dir + shots.length) % shots.length;
  updateLightbox();
}}
function updateLightbox() {{
  const shots = window._currentScreenshots || [];
  const s = shots[_lbIdx];
  if (!s) return;
  document.getElementById('lb-img').src = s;
  document.getElementById('lb-info').textContent = (_lbIdx + 1) + ' / ' + shots.length + '  ·  ' + s.split('/').pop();
}}

document.addEventListener('keydown', e => {{
  const lb = document.getElementById('lightbox');
  if (lb.classList.contains('open')) {{
    if (e.key === 'ArrowLeft') lbNav(-1);
    if (e.key === 'ArrowRight') lbNav(1);
    if (e.key === 'Escape') closeLightbox();
  }}
}});

if (FLOWS.length > 0) selectFlow(FLOWS[0].id);
</script>
</body>
</html>"""

# =============================================================================
# MAIN ORCHESTRATION PIPELINE
# =============================================================================

def main():
    if len(sys.argv) < 2:
        print("Usage: python flow_maker_deterministic.py <session_dir>")
        sys.exit(1)

    session_dir = sys.argv[1].rstrip("/")
    session_path = Path(session_dir)
    out_dir = session_path / "flows"
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest_path = session_path / "session_manifest.json"
    if not manifest_path.exists():
        print(f"ERROR: '{manifest_path}' not found.")
        sys.exit(1)

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    app_name = manifest.get("app", "App")
    print(f"\n🔍 Session directory loaded: {session_dir}")
    print(f"📱 App Name: {app_name}")

    # Run Local self-healing deduplication (crop checking)
    execute_self_healing_deduplication(session_path, manifest)

    # Reconstruct parallel timelines from updated manifest
    print(f"\n🧱 Reconstructing parallel lanes from manifest...")
    flows = build_deterministic_structures(manifest)

    # >>> FIXED: CHRONOLOGICAL SIDEBAR SORTING <<<
    # Helper to find the absolute earliest step number in a flow's Spine or Branches
    def get_flow_earliest_step(f: dict) -> int:
        steps = []
        if f.get("spine"):
            steps.extend([extract_step_number(path) for path in f["spine"]])
        for b in f.get("branches", []):
            if b.get("screenshots"):
                steps.extend([extract_step_number(path) for path in b["screenshots"]])
        return min(steps) if steps else 9999

    # Sort flows so "Default" views (main tab landing pages) are always first,
    # followed by all child/settings pages sorted in exact chronological order of exploration!
    flows.sort(key=lambda f: (
        0 if f["subview"].lower() == "default" else 1,
        get_flow_earliest_step(f)
    ))

    print(f"  → {len(flows)} structural boards mapped and chronologically sorted.")

    # Copy and remap screenshots
    flows = copy_screenshots_figma(flows, out_dir)

    # Save dual-compatible flows.json
    flows_json_path = out_dir / "flows.json"
    build_and_save_taxonomy_json(app_name, flows, flows_json_path)

    # Generate HTML Figma Board Viewer
    print(f"\n🎨 Generating visual HTML Figma-board...")
    html_content = generate_html(app_name, flows)
    html_path = out_dir / "index.html"
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)
    print(f"  ✅ index.html saved at {html_path}")

    total_screens = sum(f["screen_count"] for f in flows)
    print(f"\n{'='*70}")
    print(f"🎉 SUCCESS: Deterministic Figma Flow Board Complete!")
    print(f"   📂 Output Workspace: {out_dir}")
    print(f"   🎬 {len(flows)} Interactive Boards  ·  {total_screens} Total Screens")
    print(f"   🌐 Open to view: {html_path}")
    print(f"{'='*70}\n")

if __name__ == "__main__":
    main()
