"""
TEARDOWN FLOW GENERATOR v2.1 — Manifest-Driven Tab-Based Taxonomy
===================================================================
Organizes MobileSpy teardown screenshots into a hierarchical flow taxonomy
using the session_manifest.json `tabs` array as the GROUND TRUTH structure.

ARCHITECTURE:
  Phase 0: Build deterministic tab skeleton from manifest["tabs"]
           Each tab becomes a root node with its exact screenshots pre-assigned.
  Phase 1: AI organizes WITHIN each tab — creating sub-flows for survey captures,
           child pages, interactive flows, modals, in-place interactions.
  Phase 2: Structural validation + AI label refinement.
  Phase 3: Screen detail enrichment for frontend.

KEY DESIGN DECISION:
The manifest already tells us exactly which screenshots belong to which tab.
We do NOT ask the AI to figure out tab groupings. The AI's job is ONLY to
create meaningful sub-flow organization within each tab.

Usage:
    Standalone:
        python teardown_flow_generator.py <session_dir> [api_key]

    Via hook:
        from teardown_flow_generator import run_flow_generation_hook
        result = await run_flow_generation_hook(session_dir, api_key, cost_tracker=t)

Output:
    <session_dir>/enriched/flows.json
"""

import asyncio
import json
import os
import sys
import re
import time
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any, Set, Tuple
from openai_processing_client import ProcessingClient, MODEL, environment_key
from navigation_taxonomy import normalize_navigation_roots

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')
log = logging.getLogger("TeardownFlowGen")

SCHEMA_VERSION = "2.1.0"


# =============================================================================
# COST TRACKER
# =============================================================================
class FlowGenCostTracker:
    PRICING = {}

    def __init__(self):
        self.start_time = time.time()
        self.usage_log = {}

    def track(self, model_name, usage_metadata):
        if not usage_metadata:
            return
        if model_name not in self.usage_log:
            self.usage_log[model_name] = {"input": 0, "output": 0, "calls": 0}
        self.usage_log[model_name]["input"] += getattr(usage_metadata, 'input_tokens', 0) or 0
        self.usage_log[model_name]["output"] += getattr(usage_metadata, 'output_tokens', 0) or 0
        self.usage_log[model_name]["calls"] += 1

    def get_report(self):
        total = 0.0
        for m, s in self.usage_log.items():
            r = self.PRICING.get(m)
            if r:
                total += (s["input"] / 1e6) * r["in"] + (s["output"] / 1e6) * r["out"]
        return {
            "total_estimated_cost_usd": round(total, 6) if self.PRICING else None,
            "total_api_calls": sum(x["calls"] for x in self.usage_log.values()),
        }


# =============================================================================
# FLOW GENERATOR
# =============================================================================
class TeardownFlowGenerator:

    MODEL = MODEL

    def __init__(self, session_dir: str, api_key: str, cost_tracker=None):
        self.session_dir = session_dir
        self.screenshot_dir = os.path.join(session_dir, "screenshots")
        self.enriched_dir = os.path.join(session_dir, "enriched")
        self.client = ProcessingClient(api_key=api_key)

        if cost_tracker is not None:
            self.cost_tracker = cost_tracker
            self._owns_tracker = False
        else:
            self.cost_tracker = FlowGenCostTracker()
            self._owns_tracker = True

        # Load data sources
        self.manifest = self._load_json(os.path.join(session_dir, "session_manifest.json"))
        self.agent_memory = self._load_json(os.path.join(session_dir, "agent_memory.json"))
        self.session_intel = self._load_json(os.path.join(self.enriched_dir, "session_intelligence.json"))
        self.enriched_manifest = self._load_json(os.path.join(self.enriched_dir, "enriched_manifest.json"))

        self.app_name = self.manifest.get("app", "Unknown") if self.manifest else "Unknown"
        self.app_package = self.manifest.get("package", "") if self.manifest else ""

        # Build the master file->step mapping from the enriched manifest
        self.file_to_step = self._build_file_to_step_map()
        self.file_to_enriched = {
            os.path.basename(entry.get("screenshot", "")): entry.get("enriched_file", "")
            for entry in (self.enriched_manifest or {}).get("enriched_screenshots", [])
            if entry.get("screenshot") and entry.get("enriched_file")
        }

        # Build the enriched metadata lookup (step -> enriched data)
        self.enriched_by_step = self._build_enriched_lookup()

        # Build the deterministic tab skeleton from manifest
        self.tab_skeleton = self._build_tab_skeleton()

        # All screenshot files across all tabs (for the screen catalog)
        self.all_screenshot_files = self._collect_all_files()

        total_screens = sum(len(tab["screenshot_steps"]) for tab in self.tab_skeleton)
        log.info(f"TeardownFlowGenerator v2.1 initialized")
        log.info(f"  App: {self.app_name}")
        log.info(f"  Tabs in manifest: {len(self.tab_skeleton)}")
        log.info(f"  Total screenshots mapped: {total_screens}")

    # =========================================================================
    # DATA LOADING
    # =========================================================================
    def _load_json(self, path: str) -> Optional[Dict]:
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            log.warning(f"  Error loading {path}: {e}")
            return None

    def _build_file_to_step_map(self) -> Dict[str, int]:
        """Map screenshot filename -> timeline_step number."""
        mapping = {}
        if not self.enriched_manifest:
            if os.path.exists(self.screenshot_dir):
                files = sorted(
                    [f for f in os.listdir(self.screenshot_dir) if f.endswith(".png")],
                    key=lambda x: os.path.getmtime(os.path.join(self.screenshot_dir, x))
                )
                for i, f in enumerate(files):
                    mapping[f] = i + 1
            return mapping

        for entry in self.enriched_manifest.get("enriched_screenshots", []):
            screenshot = entry.get("screenshot", "")
            step = entry.get("step")
            if screenshot and step is not None:
                mapping[screenshot] = step
                mapping[os.path.basename(screenshot)] = step
        return mapping

    def _build_enriched_lookup(self) -> Dict[int, Dict]:
        """Load all enriched JSONs and index by timeline_step."""
        lookup = {}
        if not self.enriched_manifest:
            return lookup
        for entry in self.enriched_manifest.get("enriched_screenshots", []):
            enriched_file = entry.get("enriched_file")
            step = entry.get("step")
            if not enriched_file or step is None:
                continue
            filepath = os.path.join(self.enriched_dir, enriched_file)
            if not os.path.exists(filepath):
                continue
            data = self._load_json(filepath)
            if data:
                lookup[step] = data
        return lookup

    def _collect_all_files(self) -> List[str]:
        if not os.path.exists(self.screenshot_dir):
            return []
        files = [f for f in os.listdir(self.screenshot_dir) if f.endswith(".png")]
        files.sort(key=lambda x: os.path.getmtime(os.path.join(self.screenshot_dir, x)))
        return files

    # =========================================================================
    # PHASE 0: BUILD DETERMINISTIC TAB SKELETON FROM MANIFEST
    # =========================================================================
    def _build_tab_skeleton(self) -> List[Dict]:
        """
        Read manifest["tabs"] and build root-level taxonomy.
        Each tab becomes a root node with screenshots pre-assigned.
        DETERMINISTIC — no AI involved.
        """
        if not self.manifest or "tabs" not in self.manifest:
            log.warning("  No tabs in manifest — falling back to filename inference")
            return self._build_skeleton_from_filenames()

        tabs = self.manifest.get("tabs", [])
        skeleton = []

        for tab_entry in tabs:
            tab_name = tab_entry.get("canonical_path") or tab_entry.get("name", "Unknown Tab")
            tab_type = tab_entry.get("type", "default_view")

            # Collect ALL screenshot paths from this tab entry
            all_paths = list(tab_entry.get("survey_screenshots", []))
            for interaction in tab_entry.get("interactions", []):
                if isinstance(interaction, dict):
                    interaction_paths = list(dict.fromkeys(
                        (interaction.get("screenshots") or [])
                        + (interaction.get("screenshot_files") or [])
                    ))
                    for ss in interaction_paths:
                        if isinstance(ss, str) and ss not in all_paths:
                            all_paths.append(ss)

            # Convert file paths -> timeline_step numbers
            steps = []
            for path in all_paths:
                basename = os.path.basename(path)
                step = self.file_to_step.get(basename) or self.file_to_step.get(path)
                if step is not None:
                    steps.append(step)
            steps.sort()

            # Parse tab name: "Search > SEARCH COLLEGES" -> parent/sub
            parts = [p.strip() for p in tab_name.split(">")]
            parent_tab = tab_entry.get("root_path") or (parts[0] if parts else tab_name)
            sub_view = " > ".join(parts[1:]) if len(parts) > 1 else None

            # Classify screenshots by role from filename
            screenshots_by_role = self._classify_by_role(all_paths)

            skeleton.append({
                "manifest_name": tab_name,
                "path_id": tab_entry.get("path_id"),
                "parent_path": tab_entry.get("parent_path"),
                "depth": tab_entry.get("depth", max(0, len(parts) - 1)),
                "opened_by": tab_entry.get("opened_by"),
                "primary_surface_id": tab_entry.get("primary_surface_id"),
                "capture_segments": tab_entry.get("capture_segments", []),
                "capture_status": tab_entry.get("capture_status"),
                "capture_complete": tab_entry.get("capture_complete"),
                "capture_outcome": tab_entry.get("capture_outcome"),
                "parent_tab": parent_tab,
                "sub_view": sub_view,
                "tab_type": tab_type,
                "screenshot_steps": steps,
                "screenshot_paths": all_paths,
                "screenshots_by_role": screenshots_by_role,
            })

        # Group sub-views under their parent tab
        skeleton = self._merge_sub_views(skeleton)

        log.info(f"  Tab skeleton: {len(skeleton)} root tabs")
        for tab in skeleton:
            subs = tab.get("sub_views", [])
            total = len(tab["screenshot_steps"])
            sub_info = f" ({len(subs)} sub-views)" if subs else ""
            log.info(f"    {tab['label']}: {total} screens{sub_info}")
            for sv in subs:
                log.info(f"      {sv['label']}: {len(sv['screenshot_steps'])} screens")

        return skeleton

    def _classify_by_role(self, paths: List[str]) -> Dict[str, List[str]]:
        roles = {
            "survey": [], "child_page": [], "in_place": [],
            "modal": [], "search": [], "toggle": [],
            "flow": [], "profile_actions": [], "other": [],
        }
        for path in paths:
            fname = os.path.basename(path).lower()
            if "survey" in fname or "pristine" in fname:
                roles["survey"].append(path)
            elif fname.startswith("child_"):
                roles["child_page"].append(path)
            elif fname.startswith("inplace_") or fname.startswith("inplace_scroll_"):
                roles["in_place"].append(path)
            elif fname.startswith("modal_"):
                roles["modal"].append(path)
            elif fname.startswith("search_"):
                roles["search"].append(path)
            elif fname.startswith("toggle_"):
                roles["toggle"].append(path)
            elif "flow" in fname:
                roles["flow"].append(path)
            elif "profile_actions" in fname or "accordion" in fname:
                roles["profile_actions"].append(path)
            else:
                roles["other"].append(path)
        return {k: v for k, v in roles.items() if v}

    def _merge_sub_views(self, skeleton: List[Dict]) -> List[Dict]:
        """Merge sub-views under their parent tab."""
        parent_map: Dict[str, Dict] = {}
        standalone = []

        for entry in skeleton:
            parent = entry["parent_tab"]
            sub = entry.get("sub_view")

            if sub:
                if parent not in parent_map:
                    parent_map[parent] = {
                        "label": parent,
                        "id": self._slugify(parent),
                        "description": f"The {parent} tab of {self.app_name}",
                        "screenshot_steps": [],
                        "sub_views": [],
                        "canonical_lanes": [],
                    }
                parent_node = parent_map[parent]
                parent_node["screenshot_steps"].extend(entry["screenshot_steps"])
                lane_metadata = {
                    key: entry.get(key) for key in (
                        "manifest_name", "path_id", "parent_path", "depth",
                        "opened_by", "primary_surface_id", "capture_segments",
                        "capture_status", "capture_complete", "capture_outcome",
                    )
                }
                parent_node["canonical_lanes"].append(lane_metadata)
                parent_node["sub_views"].append({
                    "label": sub,
                    "id": f"{self._slugify(parent)}__{self._slugify(sub)}",
                    "description": f"{sub} view within {parent}",
                    "manifest_name": entry["manifest_name"],
                    "tab_type": entry["tab_type"],
                    "screenshot_steps": sorted(entry["screenshot_steps"]),
                    "screenshots_by_role": entry.get("screenshots_by_role", {}),
                    **lane_metadata,
                })
            else:
                if parent in parent_map or any(item["parent_tab"] == parent and item.get("sub_view") for item in skeleton):
                    if parent not in parent_map:
                        parent_map[parent] = {
                            "label": parent, "id": self._slugify(parent),
                            "description": f"The {parent} section of {self.app_name}",
                            "screenshot_steps": [], "sub_views": [], "canonical_lanes": [],
                        }
                    p = parent_map[parent]
                    p["screenshot_steps"].extend(entry["screenshot_steps"])
                    lane_metadata = {
                        key: entry.get(key) for key in (
                            "manifest_name", "path_id", "parent_path", "depth",
                            "opened_by", "primary_surface_id", "capture_segments",
                            "capture_status", "capture_complete", "capture_outcome",
                        )
                    }
                    p.setdefault("canonical_lanes", []).append(lane_metadata)
                    p["sub_views"].insert(0, {
                        "label": "Default View",
                        "id": f"{self._slugify(parent)}__default",
                        "description": f"Default view of {parent}",
                        "manifest_name": entry["manifest_name"],
                        "tab_type": entry["tab_type"],
                        "screenshot_steps": sorted(entry["screenshot_steps"]),
                        "screenshots_by_role": entry.get("screenshots_by_role", {}),
                        **lane_metadata,
                    })
                else:
                    standalone.append({
                        "label": parent,
                        "id": self._slugify(parent),
                        "description": f"The {parent} tab of {self.app_name}",
                        "manifest_name": entry["manifest_name"],
                        "tab_type": entry["tab_type"],
                        "screenshot_steps": sorted(entry["screenshot_steps"]),
                        "screenshots_by_role": entry.get("screenshots_by_role", {}),
                        "sub_views": [],
                        "canonical_lanes": [{
                            key: entry.get(key) for key in (
                                "manifest_name", "path_id", "parent_path", "depth",
                                "opened_by", "primary_surface_id", "capture_segments",
                                "capture_status", "capture_complete", "capture_outcome",
                            )
                        }],
                        **{key: entry.get(key) for key in (
                            "path_id", "parent_path", "depth", "opened_by",
                            "primary_surface_id", "capture_segments", "capture_status",
                            "capture_complete", "capture_outcome",
                        )},
                    })

        for node in parent_map.values():
            node["screenshot_steps"] = sorted(set(node["screenshot_steps"]))

        return list(parent_map.values()) + standalone

    def _build_skeleton_from_filenames(self) -> List[Dict]:
        """Fallback when manifest has no tabs."""
        tab_groups: Dict[str, List[int]] = {}
        for filename in self.all_screenshot_files:
            tab = self._infer_tab(filename)
            step = self.file_to_step.get(filename)
            if step is not None:
                tab_groups.setdefault(tab, []).append(step)
        return [
            {
                "label": tab, "id": self._slugify(tab),
                "description": f"Screens from {tab}",
                "screenshot_steps": sorted(steps), "sub_views": [],
            }
            for tab, steps in tab_groups.items()
        ]

    def _infer_tab(self, filename: str) -> str:
        fname = filename.lower()
        patterns = [
            (r'tab_([a-z_]+?)_(?:default|survey|pristine|interaction|sectioned|tabbed|chat|form)', 1),
        ]
        for pattern, group in patterns:
            match = re.search(pattern, fname)
            if match:
                return match.group(group).replace("_", " ").title()
        if fname.startswith("child_"):
            return "Child Pages"
        if "menu" in fname:
            return "Menu"
        return "Other"

    def _slugify(self, text: str) -> str:
        return re.sub(r'[^a-z0-9]+', '_', text.lower()).strip('_')[:50]

    # =========================================================================
    # AI CALL
    # =========================================================================
    async def _ai_call(self, prompt: str, model: str = None) -> Optional[Dict]:
        model = model or self.MODEL
        result, usage = await self.client.json(prompt, model=model)
        self.cost_tracker.track(model, usage)
        return result

    # =========================================================================
    # PHASE 1: AI SUB-FLOW ORGANIZATION WITHIN EACH TAB
    # =========================================================================
    async def _organize_tab_subflows(self) -> List[Dict]:
        """For each tab, ask AI to organize screenshots into sub-flows."""
        log.info("  PHASE 1: Organizing sub-flows within tabs...")
        taxonomy = []

        for tab in self.tab_skeleton:
            tab_label = tab["label"]
            tab_id = tab.get("id", self._slugify(tab_label))
            tab_steps = tab["screenshot_steps"]
            sub_views = tab.get("sub_views", [])

            log.info(f"    {tab_label}: {len(tab_steps)} screens")

            if not tab_steps:
                continue

            if sub_views:
                children = await self._organize_multi_subview_tab(tab_label, tab_id, sub_views)
            else:
                children = await self._organize_single_tab(
                    tab_label, tab_id, tab_steps,
                    tab.get("screenshots_by_role", {})
                )

            taxonomy.append({
                "id": tab_id,
                "label": tab_label,
                "description": tab.get("description", f"The {tab_label} section"),
                "screens": sorted(tab_steps),
                "screen_count": len(tab_steps),
                "children": children,
                "canonical_lanes": tab.get("canonical_lanes", []),
            })

        return taxonomy

    async def _organize_multi_subview_tab(self, tab_label: str, tab_id: str,
                                        sub_views: List[Dict]) -> List[Dict]:
        """Always flatten — combine all sub-view screens and organize directly."""
        all_steps = []
        combined_by_role = {}

        for sv in sub_views:
            all_steps.extend(sv["screenshot_steps"])
            for role, paths in sv.get("screenshots_by_role", {}).items():
                combined_by_role.setdefault(role, []).extend(paths)

        all_steps = sorted(set(all_steps))

        return await self._organize_single_tab(
            tab_label, tab_id, all_steps, combined_by_role
        )

    async def _organize_single_tab(self, context_label: str, parent_id: str,
                                     steps: List[int],
                                     by_role: Dict[str, List[str]],
                                     nesting_prefix: str = None) -> List[Dict]:
        """Ask AI to organize a flat list of screenshots into sub-flows."""
        prefix = nesting_prefix or parent_id

        # Build screen context
        screen_lines = []
        for step in sorted(steps):
            enriched = self.enriched_by_step.get(step)
            if enriched:
                meta = enriched.get("extraction_meta", {})
                cls = enriched.get("classification", {})
                copy = enriched.get("copy_analysis", {})
                exploration = enriched.get("exploration_position",
                                          enriched.get("flow_position", {}))
                filename = meta.get("source_screenshot", "")
                role = self._filename_role(filename)

                screen_lines.append(
                    f"Screen {step} [{role}]: {cls.get('screen_type', '?')} — "
                    f"{cls.get('screen_type_detail', '')[:80]}\n"
                    f"    Headline: {copy.get('primary_headline', 'none')}\n"
                    f"    CTA: {copy.get('primary_cta_text', 'none')}\n"
                    f"    Feature: {exploration.get('feature_demonstrated', 'none')}\n"
                    f"    File: {filename}"
                )
            else:
                for fname in self.all_screenshot_files:
                    if self.file_to_step.get(fname) == step:
                        screen_lines.append(f"Screen {step} [{self._filename_role(fname)}]: {fname}")
                        break
                else:
                    screen_lines.append(f"Screen {step}: (no metadata)")

        role_summary = {k: len(v) for k, v in by_role.items()}

        # Small tabs -> deterministic grouping
        if len(steps) < 8:
            return self._deterministic_subflows(prefix, steps, by_role)

        prompt = f"""SUB-FLOW ORGANIZER for "{context_label}" in {self.app_name}

Organize {len(steps)} screenshots from "{context_label}" into meaningful sub-flows.
Tab assignment is FIXED — all screens belong to "{context_label}".
Create 2-6 sub-flows grouped by USER TASK or CONTENT TYPE.

CRITICAL NAMING CONVENTION (MOBBIN STYLE):
Name the sub-flows based on the ACTION happening or the SPECIFIC FEATURE being viewed.
- Use Gerunds (Verbs ending in -ing) for actions: "Searching for players", "Viewing player profile", "Adding to collection", "Filtering results", "Logging in".
- Use clean Nouns for distinct sections: "Settings", "Standings", "TV schedule", "Widgets".
- DO NOT use robotic terms like "In-Place Interactions", "Page Browse", "Child Page", or "Modal".
- DO NOT include the app name or tab name in the sub-flow label (it's redundant).

ROLE DISTRIBUTION: {json.dumps(role_summary)}

SCREENS:
{chr(10).join(screen_lines)}

OUTPUT JSON:
{{
    "sub_flows": [
        {{
            "id": "{prefix}__slug",
            "label": "Descriptive Name",
            "description": "What this sub-flow covers",
            "screens": [ascending step integers]
        }}
    ]
}}

RULES:
- Every screen in [{', '.join(str(s) for s in sorted(steps))}] must appear in exactly one sub-flow
- Ascending order within each sub-flow
- IDs start with "{prefix}__"
"""
        result = await self._ai_call(prompt)

        if result and isinstance(result.get("sub_flows"), list):
            children = []
            assigned = set()
            allowed = set(steps)
            for sf in result["sub_flows"]:
                if not isinstance(sf, dict):
                    continue
                screens = sorted({s for s in sf.get("screens", []) if isinstance(s, int) and s in allowed and s not in assigned})
                if not screens:
                    continue
                assigned.update(screens)
                children.append({
                    "id": sf.get("id", f"{prefix}__unknown"),
                    "label": sf.get("label", "Unknown"),
                    "description": sf.get("description", ""),
                    "screens": screens, "screen_count": len(screens),
                    "children": [],
                })

            if not children:
                return self._deterministic_subflows(prefix, steps, by_role)
            # Fix missing screens
            missing = allowed - assigned
            if missing:
                log.warning(f"      AI missed {len(missing)} screens — assigning to first sub-flow")
                if children:
                    children[0]["screens"].extend(sorted(missing))
                    children[0]["screens"].sort()
                    children[0]["screen_count"] = len(children[0]["screens"])
            return children

        log.warning(f"      AI failed — using deterministic fallback")
        return self._deterministic_subflows(prefix, steps, by_role)

    def _deterministic_subflows(self, prefix: str, steps: List[int],
                                 by_role: Dict[str, List[str]]) -> List[Dict]:
        """Create sub-flows from filename roles when AI unnecessary or fails."""
        children = []
        assigned = set()

        labels = {
            "survey": "Browsing main feed",
            "child_page": "Viewing details",
            "in_place": "Interacting with content",
            "modal": "Viewing overlays",
            "search": "Searching",
            "toggle": "Adjusting filters",
            "flow": "Completing process",
            "profile_actions": "Managing profile",
            "other": "Other screens",
        }

        for role_name, paths in by_role.items():
            role_steps = []
            for path in paths:
                step = self.file_to_step.get(os.path.basename(path))
                if step is not None and step in steps:
                    role_steps.append(step)
                    assigned.add(step)
            if role_steps:
                children.append({
                    "id": f"{prefix}__{role_name}",
                    "label": labels.get(role_name, role_name.replace("_", " ").title()),
                    "description": f"{labels.get(role_name, role_name)} screenshots",
                    "screens": sorted(role_steps), "screen_count": len(role_steps),
                    "children": [],
                })

        leftover = [s for s in steps if s not in assigned]
        if leftover:
            if children:
                children[0]["screens"].extend(leftover)
                children[0]["screens"].sort()
                children[0]["screen_count"] = len(children[0]["screens"])
            else:
                children.append({
                    "id": f"{prefix}__all", "label": "All Screens",
                    "description": "All screenshots",
                    "screens": sorted(leftover), "screen_count": len(leftover),
                    "children": [],
                })
        return children

    def _filename_role(self, filename: str) -> str:
        fname = filename.lower()
        if "survey" in fname or "pristine" in fname: return "survey"
        if fname.startswith("child_"): return "child_page"
        if fname.startswith("inplace_"): return "in_place"
        if fname.startswith("modal_"): return "modal"
        if fname.startswith("search_"): return "search"
        if fname.startswith("toggle_"): return "toggle"
        if "flow" in fname: return "flow"
        if "profile_actions" in fname or "accordion" in fname: return "profile_actions"
        return "other"


    async def _promote_to_root_folders(self, taxonomy: List[Dict]) -> List[Dict]:
        """
        AI pass: review all sub-flows and promote worthy ones to root-level folders.
        Mirrors how Mobbin surfaces Menu, Profile, Settings etc. as top-level entries
        alongside the main nav tabs.
        """
        # Build a summary of all current sub-flows for the AI
        subflow_lines = []
        for tab in taxonomy:
            for child in tab.get("children", []):
                subflow_lines.append(
                    f"  tab={tab['label']} | id={child['id']} | "
                    f"label={child['label']} | screens={child['screens'][:4]}... "
                    f"({child['screen_count']} screens)"
                )

        prompt = f"""FLOW TAXONOMY ROOT PROMOTION for "{self.app_name}"

    The app has these main nav tabs as root folders: {[t['label'] for t in taxonomy]}

    Here are all the current sub-flows sitting inside those tabs:
    {chr(10).join(subflow_lines)}

    Your job: identify sub-flows that deserve to be PROMOTED to their own root-level folder,
    separate from the main nav tabs — exactly like Mobbin does.

    PROMOTE when a sub-flow represents:
    - A distinct app section accessed via a menu, drawer, or sidebar (e.g. "Menu")
    - A cross-tab feature with significant screen coverage (e.g. "Player Profile", "Team Profile")
    - Account/settings screens (e.g. "Account & Settings")
    - A modal or overlay flow that spans multiple tabs (e.g. "Paywall", "Onboarding")
    - Any coherent user journey that feels like its own "place" in the app

    DO NOT promote:
    - Sub-flows with fewer than 5 screens
    - Sub-flows that are clearly scoped to one tab's content
    - Things that are already well-placed

    NAMING: Short, clean, Mobbin-style. Nouns for sections, gerunds for flows.
    Examples: "Player profiles", "Team profiles", "Menu", "Account", "Settings",
    "Paywall", "Tools & scouting"

    OUTPUT JSON:
    {{
        "promotions": [
            {{
                "source_id": "exact id of the sub-flow to promote",
                "new_root_label": "Clean root folder name",
                "new_root_id": "snake_case_id",
                "reason": "Why this deserves root-level status"
            }}
        ]
    }}
    """
        result = await self._ai_call(prompt)

        if not result or not result.get("promotions"):
            return taxonomy

        for promotion in result["promotions"]:
            source_id = promotion.get("source_id")
            new_label = promotion.get("new_root_label")
            new_id = promotion.get("new_root_id")

            if not all([source_id, new_label, new_id]):
                continue

            # Find and extract the sub-flow from its parent tab
            promoted_node = None
            for tab in taxonomy:
                children = tab.get("children", [])
                for child in children:
                    if child["id"] == source_id:
                        promoted_node = child
                        tab["children"] = [c for c in children if c["id"] != source_id]
                        # Update parent tab screen count
                        remaining = [s for c in tab["children"] for s in c.get("screens", [])]
                        tab["screens"] = sorted(set(remaining))
                        tab["screen_count"] = len(tab["screens"])
                        break
                if promoted_node:
                    break

            if promoted_node:
                log.info(f"    ⬆️  Promoted '{promoted_node['label']}' → root '{new_label}' "
                         f"({promoted_node['screen_count']} screens)")
                taxonomy.append({
                    "id": new_id,
                    "label": new_label,
                    "description": promotion.get("reason", ""),
                    "screens": promoted_node["screens"],
                    "screen_count": promoted_node["screen_count"],
                    "children": promoted_node.get("children", []),
                })

        return taxonomy

    # =========================================================================
    # PHASE 2: VALIDATION + LABEL REFINEMENT
    # =========================================================================
    async def _validate_and_refine(self, taxonomy: List[Dict]) -> Tuple[List[Dict], List[str]]:
        log.info("  PHASE 2: Validation & label refinement...")

        all_assigned: Set[int] = set()
        self._collect_all_screens(taxonomy, all_assigned)
        all_expected = set()
        for tab in self.tab_skeleton:
            all_expected.update(tab["screenshot_steps"])

        missing = all_expected - all_assigned
        if missing:
            log.warning(f"    {len(missing)} screens missing — force-assigning")
            taxonomy = self._force_assign_missing(taxonomy, missing)

        self._fix_counts(taxonomy)

        # AI label refinement
        summary = self._taxonomy_to_summary(taxonomy)

        prompt = f"""SUB-FLOW LABEL REFINEMENT for "{self.app_name}"

Here is the current flow taxonomy. The ROOT folders (like 'Home', 'Search', 'Profile') are EXACT TAB NAMES from the app. DO NOT TOUCH THEM.

Your job is ONLY to improve the nested SUB-FLOW labels (the ones inside the root folders) to perfectly match premium UX research tools like Mobbin.

{summary}

CRITICAL RULES FOR SUB-FLOWS:
1. ACTION ORIENTED: Use "-ing" gerunds for interactive sequences (e.g., "Searching for players", "Filtering roster", "Viewing highlights", "Editing profile").
2. STATIC SECTIONS: Use clean nouns for static pages (e.g., "Settings", "Standings", "Match center").
3. BAN ROBOT WORDS: Completely remove words like "Browse", "Child Page", "Modal", "Interaction", "Flow", "In-Place".
4. KEEP IT SHORT: 1-4 words max.

OUTPUT JSON:
{{
    "label_updates": [
        {{ "id": "only_ids_with_double_underscores__like_this", "new_label": "Searching for content", "new_description": "User searches for specific media" }}
    ],
    "changes_made": ["Refined sub-flows into actions"]
}}
"""
        refinement = await self._ai_call(prompt)
        changes = []

        if refinement:
            updates = refinement.get("label_updates", [])
            changes = refinement.get("changes_made", [])
            update_map = {u["id"]: u for u in updates if "id" in u}
            self._apply_label_updates(taxonomy, update_map)
            log.info(f"    {len(updates)} label refinements applied")
            for c in changes[:8]:
                log.info(f"      {c}")

        return taxonomy, changes

    def _taxonomy_to_summary(self, nodes: List[Dict], indent=0) -> str:
        lines = []
        for node in nodes:
            p = "  " * indent
            lines.append(f"{p}[{node.get('id', '?')}] \"{node.get('label', '?')}\" "
                         f"({node.get('screen_count', 0)} screens) — {node.get('description', '')[:80]}")
            for child in node.get("children", []):
                lines.append(f"{p}  [{child.get('id', '?')}] \"{child.get('label', '?')}\" "
                             f"({child.get('screen_count', 0)} screens) — {child.get('description', '')[:80]}")
                for gc in child.get("children", []):
                    lines.append(f"{p}    [{gc.get('id', '?')}] \"{gc.get('label', '?')}\" "
                                 f"({gc.get('screen_count', 0)} screens) — {gc.get('description', '')[:80]}")
        return "\n".join(lines)

    def _apply_label_updates(self, nodes: List[Dict], update_map: Dict[str, Dict]):
        for node in nodes:
            nid = node.get("id", "")
            if nid in update_map:
                # HARD BLOCK: Only allow label updates on sub-flows (IDs containing double underscore __)
                if "__" in nid:
                    u = update_map[nid]
                    if u.get("new_label"):
                        node["label"] = u["new_label"]
                    if u.get("new_description"):
                        node["description"] = u["new_description"]
                else:
                    log.info(f"    🛡️ Protected root tab '{node.get('label', '')}' from AI rename")
            self._apply_label_updates(node.get("children", []), update_map)

    # =========================================================================
    # PHASE 3: SCREEN CATALOG
    # =========================================================================
    def _build_screen_catalog(self) -> List[Dict]:
        log.info("  PHASE 3: Building screen catalog...")
        entries = []
        for filename in self.all_screenshot_files:
            step = self.file_to_step.get(filename)
            if step is None:
                continue
            enriched = self.enriched_by_step.get(step, {})
            cls = enriched.get("classification", {})
            copy = enriched.get("copy_analysis", {})
            exploration = enriched.get("exploration_position",
                                      enriched.get("flow_position", {}))

            display_label = (
                copy.get("primary_headline")
                or cls.get("screen_type_detail")
                or exploration.get("feature_demonstrated")
                or cls.get("screen_type", "Screen")
            )
            if display_label and len(display_label) > 60:
                display_label = display_label[:57] + "..."

            entries.append({
                "timeline_step": step,
                "screenshot_file": filename,
                "enriched_file": self.file_to_enriched.get(filename),
                "display_label": display_label,
                "screen_type": cls.get("screen_type", "unknown"),
                "screen_role": self._filename_role(filename),
                "primary_headline": copy.get("primary_headline"),
                "primary_cta_text": copy.get("primary_cta_text"),
                "is_auth_gate": exploration.get("is_auth_gate", False),
                "is_paywall": exploration.get("is_paywall", False),
                "pricing_visible": enriched.get("competitive_signals", {}).get("pricing_visible", False),
            })

        entries.sort(key=lambda e: e["timeline_step"])
        return entries

    # =========================================================================
    # STRUCTURAL HELPERS
    # =========================================================================
    def _collect_all_screens(self, nodes: List[Dict], result: Set[int]):
        for node in nodes:
            for s in node.get("screens", []):
                if isinstance(s, int):
                    result.add(s)
            self._collect_all_screens(node.get("children", []), result)

    def _fix_counts(self, nodes: List[Dict]):
        for node in nodes:
            node["screen_count"] = len(node.get("screens", []))
            self._fix_counts(node.get("children", []))

    def _force_assign_missing(self, taxonomy: List[Dict], missing: Set[int]) -> List[Dict]:
        for step in sorted(missing):
            assigned = False
            for node in taxonomy:
                ns = node.get("screens", [])
                if ns:
                    if min(ns) <= step <= max(ns):
                        node["screens"].append(step)
                        node["screens"] = sorted(set(node["screens"]))
                        assigned = True
                        break
            if not assigned and taxonomy:
                taxonomy[-1]["screens"].append(step)
                taxonomy[-1]["screens"] = sorted(set(taxonomy[-1]["screens"]))
        return taxonomy

    def _count_flows(self, nodes: List[Dict]) -> int:
        c = len(nodes)
        for n in nodes:
            c += self._count_flows(n.get("children", []))
        return c

    def _max_depth(self, nodes: List[Dict], current=1) -> int:
        if not nodes:
            return 0
        d = current
        for n in nodes:
            if n.get("children"):
                d = max(d, self._max_depth(n["children"], current + 1))
        return d

    def _print_tree(self, nodes: List[Dict], indent=0):
        for node in nodes:
            p = "  " * indent
            label = node.get("label", "?")
            count = node.get("screen_count", 0)
            screens = node.get("screens", [])
            preview = str(screens[:6])
            if len(screens) > 6:
                preview = preview[:-1] + ", ...]"
            icon = "\U0001f4c2" if node.get("children") else "\U0001f4c4"
            log.info(f"  {p}{icon} {label} ({count} screens) {preview}")
            if node.get("children"):
                self._print_tree(node["children"], indent + 1)

    # =========================================================================
    # MAIN RUN
    # =========================================================================
    async def run(self) -> Dict:
        start = time.time()

        if not self.enriched_manifest or not self.session_intel:
            return {"error": "OpenAI preprocessing must complete before flow generation"}

        expected_steps = set()
        for tab in self.tab_skeleton:
            expected_steps.update(tab["screenshot_steps"])
        total = len(expected_steps)
        log.info(f"\n{'=' * 60}")
        log.info(f"TEARDOWN FLOW GENERATOR v2.1")
        log.info(f"  App: {self.app_name}")
        log.info(f"  Tabs: {len(self.tab_skeleton)}, Screenshots: {total}")
        log.info(f"{'=' * 60}\n")

        if not self.tab_skeleton:
            return {"error": "No tab structure found"}

        taxonomy = await self._organize_tab_subflows()
        if not taxonomy:
            return {"error": "Organization failed"}

        # Keep manifest root tabs fixed. AI may organize and label within each tab.
        taxonomy, changes = await self._validate_and_refine(taxonomy)
        taxonomy = normalize_navigation_roots(taxonomy, self.agent_memory)
        assigned_steps = set()
        self._collect_all_screens(taxonomy, assigned_steps)
        if assigned_steps != expected_steps:
            return {"error": f"Flow taxonomy evidence mismatch: {len(expected_steps - assigned_steps)} missing, {len(assigned_steps - expected_steps)} extra"}
        screen_catalog = self._build_screen_catalog()

        elapsed = time.time() - start

        output = {
            "schema_version": SCHEMA_VERSION,
            "generator_version": "2.1.0",
            "generated_at": datetime.now().isoformat(),
            "processing_time_seconds": round(elapsed, 2),
            "app": {"name": self.app_name, "package": self.app_package},
            "summary": {
                "total_screens": total,
                "total_flows": self._count_flows(taxonomy),
                "total_root_flows": len(taxonomy),
                "max_depth": self._max_depth(taxonomy),
            },
            "taxonomy": taxonomy,
            "screen_catalog": screen_catalog,
            "refinement_changes": changes,
        }

        output_path = os.path.join(self.enriched_dir, "flows.json")
        os.makedirs(self.enriched_dir, exist_ok=True)
        with open(output_path, "w") as f:
            json.dump(output, f, indent=2)

        cost = self.cost_tracker.get_report() if self._owns_tracker else {}

        log.info(f"\n{'=' * 60}")
        log.info(f"FLOW GENERATION COMPLETE")
        log.info(f"  Screens: {total} | Root flows: {len(taxonomy)} | "
                 f"Total: {output['summary']['total_flows']} | Depth: {output['summary']['max_depth']}")
        log.info(f"  Time: {elapsed:.1f}s")
        if cost:
            log.info(f"  Calls: {cost.get('total_api_calls', 0)} | "
                     f"Cost: ${cost.get('total_estimated_cost_usd', 0)}")
        log.info(f"{'=' * 60}")
        self._print_tree(taxonomy)

        return output


# =============================================================================
# HOOK + CLI
# =============================================================================
async def run_flow_generation_hook(session_dir: str, api_key: str,
                                    cost_tracker=None) -> Dict:
    gen = TeardownFlowGenerator(session_dir, api_key, cost_tracker=cost_tracker)
    return await gen.run()

run_flow_generation = run_flow_generation_hook

async def main():
    if len(sys.argv) < 2:
        print("Usage: python teardown_flow_generator.py <session_dir> [api_key]")
        sys.exit(1)
    sd = sys.argv[1]
    key = environment_key()
    if not key:
        sys.exit("ERROR: Set OPENAI_API_KEY or MOBILESPY_OPENAI_API_KEYS in this terminal")
    gen = TeardownFlowGenerator(sd, key)
    r = await gen.run()
    if r.get("error"):
        sys.exit(f"ERROR: {r['error']}")
    print(f"Done. {os.path.join(sd, 'enriched', 'flows.json')}")

if __name__ == "__main__":
    asyncio.run(main())
