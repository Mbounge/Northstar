"""
APP TEARDOWN POST-PROCESSOR v3.0 (Upgraded - Flow Aware & Resume Enabled)
========================================================================
A purpose-built post-processor for MobileSpy's non-linear app exploration.

CORE DIFFERENCES IN FLOW-AWARE v3.0:
1. Stateful Resume — checks if enriched files exist on disk, instantly loading them
   to hydrate memory without API calls, allowing smooth pause-and-resume.
2. Compressed Context — prunes session memory prompt context to the absolute essentials
   to prevent network/API bottlenecks on deep runs (500+ screens).
3. Flow-Aware Traversal — instead of walking a flat filesystem, the processor
   traverses the deduplicated taxonomy in flows.json in logical order (Spines first,
   then parallel Branches).
4. Context Injections — passes the active flow's design name, parent tab, and branch
   label directly to the LLM to guarantee highly accurate, targeted extractions.

SCHEMA CONTRACT (100% Compatible):
Produces the same top-level output shape as previous versions for frontend dashboards:
  - Per-screenshot: enriched JSON with elements, classification, copy_analysis,
    exploration_position, competitive_signals, strategic_interpretation, screen_intelligence
  - Session: session_intelligence.json with executive_summary, competitive_profile,
    app_architecture, copy_intelligence, dark_pattern_audit, pattern_library,
    monetization_intelligence, ux_quality_assessment, exploration_summary, glossary
"""

import asyncio
import json
import os
import sys
import time
import re
import hashlib
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from openai_processing_client import ProcessingClient, MODEL, environment_key
from collections import Counter, defaultdict
from difflib import SequenceMatcher
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')
log = logging.getLogger("TeardownPostProcessor")

try:
    from apk_analyzer import (
        load_apk_intelligence,
        build_apk_context_for_prompt,
        hydrate_memory_from_apk,
        APKAnalyzer,
    )
    APK_ANALYZER_AVAILABLE = True
except ImportError:
    APK_ANALYZER_AVAILABLE = False

SCHEMA_VERSION = "3.0.0"

# =============================================================================
# MACRO MARKET TAXONOMY
# =============================================================================
MACRO_MARKETS = [
    "Entertainment & Media", "Social & Dating", "Communication",
    "Shopping & E-Commerce", "Health & Wellness", "Medical & Healthcare",
    "Food & Drink", "Travel & Navigation", "Lifestyle & Hobbies",
    "Sports", "Real Estate", "Gaming", "Productivity & Workspaces",
    "Collaboration & Teams", "Business Operations & ERP", "Sales & CRM",
    "HR & Recruitment", "Marketing & Analytics", "Finance & Accounting",
    "Design & Creative Tools", "Developer & IT Tools", "Cybersecurity & Identity",
    "Personal Finance & Wealth", "Education & Learning",
    "Artificial Intelligence", "Web3 & Crypto", "Creator Economy",
    "Utilities & Infrastructure"
]


# =============================================================================
# UX QUALITY SCORING REGISTRY
# =============================================================================
UX_REGISTRY = {
    "dead_end_screen":                      6,
    "deep_navigation_nesting":              3,
    "inconsistent_back_navigation":         4,
    "hidden_critical_feature":              5,
    "confusing_information_architecture":   4,
    "no_clear_home_return":                 5,
    "tab_content_mismatch":                 3,
    "forced_paywall_no_skip":              10,
    "paywall_with_skip":                    4,
    "interstitial_ad_no_skip":              7,
    "interstitial_ad_with_skip":            3,
    "rewarded_ad_prompt":                   2,
    "hidden_pricing":                       5,
    "currency_obfuscation":                 4,
    "aggressive_upsell_frequency":          5,
    "misleading_free_trial":                6,
    "auth_gate_blocking_content":           5,
    "empty_state_no_guidance":              3,
    "loading_delay_excessive":              2,
    "feature_not_discoverable":             4,
    "broken_or_error_screen":               5,
    "content_behind_unnecessary_gate":      4,
    "form_excessive_fields":                3,
    "dark_pattern_confirmshaming":          4,
    "dark_pattern_forced_continuity":       5,
    "dark_pattern_misdirection":            4,
    "dark_pattern_hidden_costs":            6,
    "dark_pattern_roach_motel":             5,
    "dark_pattern_trick_questions":         4,
    "notification_spam_prompt":             3,
    "manipulative_gamification":            3,
    "forced_rating_prompt":                 2,
    "intrusive_permission_request":         3,
}

PILLAR_MAPPING = {
    "navigation": [
        "dead_end_screen", "deep_navigation_nesting", "inconsistent_back_navigation",
        "hidden_critical_feature", "confusing_information_architecture",
        "no_clear_home_return", "tab_content_mismatch",
    ],
    "monetization": [
        "forced_paywall_no_skip", "paywall_with_skip", "interstitial_ad_no_skip",
        "interstitial_ad_with_skip", "rewarded_ad_prompt", "hidden_pricing",
        "currency_obfuscation", "aggressive_upsell_frequency", "misleading_free_trial",
    ],
    "accessibility": [
        "auth_gate_blocking_content", "empty_state_no_guidance", "loading_delay_excessive",
        "feature_not_discoverable", "broken_or_error_screen",
        "content_behind_unnecessary_gate", "form_excessive_fields",
    ],
    "engagement": [
        "dark_pattern_confirmshaming", "dark_pattern_forced_continuity",
        "dark_pattern_misdirection", "dark_pattern_hidden_costs",
        "dark_pattern_roach_motel", "dark_pattern_trick_questions",
        "notification_spam_prompt", "manipulative_gamification",
        "forced_rating_prompt", "intrusive_permission_request",
    ],
}


def _get_severity(points: int) -> str:
    if points >= 6:   return "high"
    elif points >= 3: return "medium"
    else:             return "low"


def _compute_grade(score: int) -> str:
    if score <= 12:   return "A"
    elif score <= 25: return "B"
    elif score <= 30: return "B/C"
    elif score <= 45: return "C"
    elif score <= 60: return "D"
    elif score <= 68: return "D/F"
    else:             return "F"


def _get_pillar(label: str) -> str:
    for pillar, labels in PILLAR_MAPPING.items():
        if label in labels:
            return pillar
    return "other"


# =============================================================================
# EXPLORATION-AWARE SESSION MEMORY
# =============================================================================
class TeardownSessionMemory:
    """Accumulates system and design intelligence across non-linear tab exploration."""

    def __init__(self, app_name: str, app_macro_market: str = "Unclassified", app_micro_niche: str = "Unclassified"):
        self.app_name = app_name
        self.app_macro_market = app_macro_market
        self.app_micro_niche = app_micro_niche

        self.screens_processed = 0
        self.current_tab = None
        self.current_phase = "exploration"

        self.tabs_discovered: List[str] = []
        self.sections_by_tab: Dict[str, List[str]] = {}
        self.screen_type_inventory: Dict[str, int] = {}
        self.navigation_hierarchy: List[Dict] = []

        self.features_discovered: List[Dict] = []
        self.features_gated: List[str] = []
        self.features_free: List[str] = []
        self.interactive_flows_completed: List[Dict] = []

        self.content_types_seen: List[str] = []
        self.content_density_by_tab: Dict[str, str] = {}

        self.pricing_seen: Dict = {}
        self.paywalls_encountered: List[Dict] = []
        self.ad_encounters: List[Dict] = []
        self.in_app_currencies: List[str] = []
        self.monetization_touchpoints: List[Dict] = []

        self.game_mechanics: List[str] = []
        self.engagement_loops: List[Dict] = []
        self.reward_systems: List[str] = []

        self.dark_patterns_found: List[Dict] = []
        self.ux_issues: List[Dict] = []
        self.auth_gates: List[Dict] = []
        self.blocked_paths: List[Dict] = []

        self.glossary: Dict[str, Dict] = {}

        self.value_propositions: List[str] = []
        self.cta_history: List[Dict] = []
        self.messaging_tones: List[str] = []

        self.screen_summaries: List[Dict] = []

    def to_prompt_context(self) -> str:
        """Serialize highly optimized, lean memory context to prevent payload bottlenecks."""
        sections = []
        sections.append(f"APP: {self.app_name} (Market: {self.app_macro_market} | Niche: {self.app_micro_niche})")
        sections.append(f"CURRENT TAB: {self.current_tab or 'unknown'}")
        sections.append(f"PHASE: {self.current_phase}")

        # Keep only the last 5 discovered glossary terms to illustrate visual vocabulary
        if self.glossary:
            recent_terms = list(self.glossary.items())[-5:]
            g_lines = [f'  "{t}": {info.get("definition", "?")}' for t, info in recent_terms]
            sections.append("GLOSSARY SAMPLES:\n" + "\n".join(g_lines))

        # Keep only the last 4 views for immediate step-by-step transition context
        if self.screen_summaries:
            recent_screens = self.screen_summaries[-4:]
            s_lines = [f"  Step {s['step']}: [{s.get('tab', '?')}] {s['summary'][:80]}" for s in recent_screens]
            sections.append("RECENT VIEWS:\n" + "\n".join(s_lines))

        # Compress features and pricing into simple, comma-separated lists
        if self.features_free:
            sections.append(f"FREE FEATURES (Sample): {', '.join(self.features_free[-5:])}")
        if self.features_gated:
            sections.append(f"GATED FEATURES (Sample): {', '.join(self.features_gated[-5:])}")
        if self.pricing_seen:
            sections.append(f"OBSERVED PLANS: {', '.join(list(self.pricing_seen.keys())[-3:])}")

        return "\n\n".join(sections)

    def update_from_extraction(self, extraction: Dict, screenshot_info: Dict):
        """Update memory after each screenshot extraction."""
        self.screens_processed += 1
        step = screenshot_info.get("timeline_step", self.screens_processed)
        tab = screenshot_info.get("tab", self.current_tab)
        phase = screenshot_info.get("exploration_phase", self.current_phase)

        if tab and tab not in self.tabs_discovered:
            self.tabs_discovered.append(tab)
        if tab:
            self.current_tab = tab
        if phase:
            self.current_phase = phase

        # Screen type tracking
        screen_type = extraction.get("classification", {}).get("screen_type", "unknown")
        self.screen_type_inventory[screen_type] = self.screen_type_inventory.get(screen_type, 0) + 1

        # Glossary
        intel = extraction.get("screen_intelligence", {})
        if not isinstance(intel, dict): intel = {}
        resolved = intel.get("unknown_terms_resolved", {})
        if isinstance(resolved, dict):
            for term, defn in resolved.items():
                if term and term not in self.glossary:
                    self.glossary[term] = {"definition": str(defn), "first_seen_step": step}
        new_terms = intel.get("new_terms_to_remember", {})
        if isinstance(new_terms, dict):
            for term, defn in new_terms.items():
                if term and term not in self.glossary:
                    self.glossary[term] = {"definition": str(defn), "first_seen_step": step}

        # Feature gating
        comp_signals = extraction.get("competitive_signals", {})
        if not isinstance(comp_signals, dict): comp_signals = {}
        fg = comp_signals.get("feature_gating", {})
        if not isinstance(fg, dict): fg = {}
        for feat in fg.get("gated_features_mentioned", []):
            if isinstance(feat, str) and feat not in self.features_gated:
                self.features_gated.append(feat)
        for feat in fg.get("free_features_mentioned", []):
            if isinstance(feat, str) and feat not in self.features_free:
                self.features_free.append(feat)

        # Pricing
        pricing = comp_signals.get("pricing_details", {})
        if not isinstance(pricing, dict): pricing = {}
        if pricing.get("plans") and isinstance(pricing["plans"], list):
            for plan in pricing["plans"]:
                if isinstance(plan, dict):
                    self.pricing_seen[plan.get("name", "unknown")] = plan

        # Monetization
        is_paywall = any(kw in screen_type.lower() for kw in ("paywall", "upsell", "subscription", "pricing", "premium"))
        if is_paywall:
            self.paywalls_encountered.append({"step": step, "type": screen_type, "tab": tab})
            self.monetization_touchpoints.append({"screen": step, "type": screen_type, "tab": tab})

        # In-app currencies
        for curr in extraction.get("competitive_signals", {}).get("in_app_currencies", []):
            if curr and curr not in self.in_app_currencies:
                self.in_app_currencies.append(curr)

        # Game mechanics
        gamification_elements = comp_signals.get("gamification_elements", [])
        if isinstance(gamification_elements, list):
            for element in gamification_elements:
                val = element.get("mechanic", str(element)) if isinstance(element, dict) else str(element)
                val_clean = val.lower().strip()
                if val_clean and val_clean not in ("none", "n/a", "null", "false"):
                    if val_clean not in self.game_mechanics:
                        self.game_mechanics.append(val_clean)

        # UX issues
        exploration_pos = extraction.get("exploration_position", {})
        if not isinstance(exploration_pos, dict): exploration_pos = {}
        ux_issues_raw = exploration_pos.get("ux_issues", [])
        if not isinstance(ux_issues_raw, list): ux_issues_raw = []
        for issue in ux_issues_raw:
            if isinstance(issue, dict) and issue.get("issue"):
                existing = [u.get("issue") for u in self.ux_issues]
                if issue["issue"] not in existing:
                    issue["step"] = step
                    issue["tab"] = tab
                    self.ux_issues.append(issue)

        # Dark patterns
        strat_interp = extraction.get("strategic_interpretation", {})
        if not isinstance(strat_interp, dict): strat_interp = {}
        dark_patterns_raw = strat_interp.get("dark_patterns", [])
        if not isinstance(dark_patterns_raw, list): dark_patterns_raw = []
        for dp in dark_patterns_raw:
            if isinstance(dp, dict) and dp.get("pattern_type") not in ("none", "unknown", "", None):
                dp["step"] = step
                dp["tab"] = tab
                self.dark_patterns_found.append(dp)

        # Value propositions
        copy = extraction.get("copy_analysis", {})
        if not isinstance(copy, dict): copy = {}
        vp = copy.get("value_proposition")
        if vp and isinstance(vp, str) and vp not in self.value_propositions:
            self.value_propositions.append(vp)

        # CTAs
        if copy.get("primary_cta_text") and isinstance(copy["primary_cta_text"], str):
            self.cta_history.append({
                "step": step, "text": copy["primary_cta_text"],
                "framing": copy.get("primary_cta_framing", "unknown"),
            })

        # Auth gates
        if exploration_pos.get("is_auth_gate"):
            self.auth_gates.append({"step": step, "tab": tab, "type": screen_type})

        # Screen summary
        classification = extraction.get("classification", {})
        if not isinstance(classification, dict): classification = {}
        screen_desc = (classification.get("screen_type_detail", "") or intel.get("narrative", "")[:120])
        self.screen_summaries.append({
            "step": step, "tab": tab or "unknown",
            "type": screen_type,
            "summary": screen_desc[:150],
            "phase": phase,
        })

    def to_dict(self) -> Dict:
        return {
            "schema_version": SCHEMA_VERSION,
            "app_name": self.app_name,
            "app_macro_market": self.app_macro_market,
            "app_micro_niche": self.app_micro_niche,
            "screens_processed": self.screens_processed,
            "tabs_discovered": self.tabs_discovered,
            "sections_by_tab": self.sections_by_tab,
            "screen_type_inventory": self.screen_type_inventory,
            "features_gated": self.features_gated,
            "features_free": self.features_free,
            "game_mechanics": self.game_mechanics,
            "in_app_currencies": self.in_app_currencies,
            "pricing_seen": self.pricing_seen,
            "paywalls_encountered": self.paywalls_encountered,
            "monetization_touchpoints": self.monetization_touchpoints,
            "dark_patterns_found": self.dark_patterns_found,
            "ux_issues": self.ux_issues,
            "auth_gates": self.auth_gates,
            "glossary": self.glossary,
            "value_propositions": self.value_propositions,
            "screen_summaries": self.screen_summaries,
        }


# =============================================================================
# COST TRACKER
# =============================================================================
class PostProcessorCostTracker:
    PRICING = {}

    def __init__(self, session_dir=None):
        self.start_time = time.time()
        self.session_dir = session_dir
        self.usage_log = {}

    def track(self, model_name, usage_metadata):
        if not usage_metadata:
            return
        if model_name not in self.usage_log:
            self.usage_log[model_name] = {"input": 0, "output": 0, "calls": 0}
        self.usage_log[model_name]["input"] += getattr(usage_metadata, 'input_tokens', 0) or 0
        self.usage_log[model_name]["output"] += getattr(usage_metadata, 'output_tokens', 0) or 0
        self.usage_log[model_name]["calls"] += getattr(usage_metadata, 'request_count', 1) or 1

    def get_report(self):
        dur = time.time() - self.start_time
        total = 0.0
        breakdown = []
        for m, s in self.usage_log.items():
            r = self.PRICING.get(m)
            c = ((s["input"] / 1e6) * r["in"] + (s["output"] / 1e6) * r["out"]) if r else 0.0
            total += c
            breakdown.append({
                "model": m, "calls": s["calls"],
                "input_tokens": s["input"], "output_tokens": s["output"],
                "estimated_cost": round(c, 6),
            })
        return {
            "duration_seconds": round(dur, 2),
            "total_estimated_cost_usd": round(total, 6) if self.PRICING else None,
            "total_api_calls": sum(x["calls"] for x in breakdown),
            "total_input_tokens": sum(x["input_tokens"] for x in breakdown),
            "total_output_tokens": sum(x["output_tokens"] for x in breakdown),
            "model_breakdown": breakdown,
        }

    def save_report(self):
        if self.session_dir:
            try:
                with open(os.path.join(self.session_dir, "post_processor_cost.json"), "w") as f:
                    json.dump(self.get_report(), f, indent=2)
            except IOError:
                pass


# =============================================================================
# MAIN PROCESSOR (Flow-Aware & Resume Enabled)
# =============================================================================
class TeardownPostProcessor:

    EXTRACTION_MODEL = MODEL
    SYNTHESIS_MODEL = MODEL

    def __init__(self, session_dir: str, api_key: str, cost_tracker=None):
        self.session_dir = session_dir
        self.screenshot_dir = os.path.join(session_dir, "screenshots")
        self.output_dir = os.path.join(session_dir, "enriched")
        self.client = ProcessingClient(api_key=api_key)
        self.api_key = api_key

        if cost_tracker is not None:
            self.cost_tracker = cost_tracker
            self._owns_cost_tracker = False
        else:
            self.cost_tracker = PostProcessorCostTracker(session_dir=self.output_dir)
            self._owns_cost_tracker = True

        self.manifest = self._load_json("session_manifest.json")
        self.agent_memory = self._load_json("agent_memory.json")
        self.flows_json = self._load_json("flows/flows.json") # Hook to deterministic V2 lanes

        app_name = self.manifest.get("app", "Unknown") if self.manifest else "Unknown"
        initial_category = (self.agent_memory.get("app_type") or "Unclassified") if self.agent_memory else "Unclassified"

        # Start with the initial category parsed as the micro niche.
        # The Synthesis phase will cleanly re-map this to the strict Macro/Micro taxonomy.
        self.memory = TeardownSessionMemory(
            app_name=app_name,
            app_macro_market="Unclassified",
            app_micro_niche=initial_category
        )
        self.memory.app_category = initial_category

        # Hydrate memory from agent's exploration metadata
        self._hydrate_from_agent_memory()

        # Load APK intelligence if available
        self.apk_intel = None
        if APK_ANALYZER_AVAILABLE:
            self.apk_intel = load_apk_intelligence(session_dir)
            if self.apk_intel:
                log.info(f"  APK intelligence loaded: "
                         f"{len(self.apk_intel.get('color_palette', []))} colors, "
                         f"framework={self.apk_intel.get('framework', 'unknown')}")
                hydrate_memory_from_apk(self.memory, self.apk_intel)

        self.enriched_screenshots: List[Dict] = []
        self.session_intelligence: Dict = {}

        os.makedirs(self.output_dir, exist_ok=True)
        log.info(f"TeardownPostProcessor v3.0 initialized for: {session_dir}")
        log.info(f"  App: {app_name} ({self.memory.app_macro_market} | {self.memory.app_micro_niche})")

    def _load_json(self, filename: str) -> Optional[Dict]:
        path = os.path.join(self.session_dir, filename)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return None

    def _hydrate_from_agent_memory(self):
        """Pre-populate session memory from MobileSpy's rich agent_memory.json."""
        if not self.agent_memory:
            return

        app_map = self.agent_memory.get("app_structure_progress", {})
        if app_map:
            log.info(f"  Hydrating from agent memory: {app_map.get('total_nodes', 0)} nodes, "
                     f"{app_map.get('explored', 0)} explored")

        section_meta = self.agent_memory.get("section_metadata", {})
        for section_name, meta in section_meta.items():
            tab = self.memory.current_tab or "unknown"
            if tab not in self.memory.sections_by_tab:
                self.memory.sections_by_tab[tab] = []
            if section_name not in self.memory.sections_by_tab[tab]:
                self.memory.sections_by_tab[tab].append(section_name)

        tab_progress = self.agent_memory.get("tab_progress", {})
        for tab_name in tab_progress:
            if tab_name not in self.memory.tabs_discovered:
                self.memory.tabs_discovered.append(tab_name)

        blocked = self.agent_memory.get("blocked_paths", [])
        for bp in blocked:
            if isinstance(bp, dict):
                path = bp.get("path", "")
                reason = bp.get("reason", "")
                if "auth" in reason.lower():
                    self.memory.auth_gates.append({"path": path, "reason": reason})
                self.memory.blocked_paths.append(bp)

        dismissed = self.agent_memory.get("dismissed_dialogs", [])
        for d in dismissed:
            if isinstance(d, str) and d not in ("unknown",):
                self.memory.ux_issues.append({
                    "issue": f"interruption_{d}",
                    "description": f"A {d} dialog was encountered and dismissed",
                    "severity": "low",
                })

        understanding = self.agent_memory.get("app_understanding", "")
        if understanding:
            self.memory.app_micro_niche = self.agent_memory.get("app_type", self.memory.app_micro_niche)

    # =========================================================================
    # TIMELINE CONSTRUCTION — FLOW-AWARE HIERARCHICAL TRAVERSAL
    # =========================================================================
    def _build_flow_aware_timeline(self) -> List[Dict]:
        """
        Traverses the target application's screen inventory by walking the
        deduplicated flows/taxonomy generated by flow_maker_v2.py.
        This provides perfect chronological delta context for the AI.
        """
        screenshots = []
        seen_filenames = set()

        # If flows.json is not available, gracefully fallback to chronological files walk
        if not self.flows_json or "taxonomy" not in self.flows_json:
            log.warning("  flows/flows.json not found. Falling back to flat timeline.")
            if not os.path.exists(self.screenshot_dir):
                return []
            files = [f for f in os.listdir(self.screenshot_dir) if f.endswith(".png")]
            files.sort(key=lambda x: os.path.getmtime(os.path.join(self.screenshot_dir, x)))
            for i, filename in enumerate(files):
                screenshots.append({
                    "path": os.path.join(self.screenshot_dir, filename),
                    "filename": filename,
                    "timeline_step": i + 1,
                    "tab": "Unknown Tab",
                    "exploration_phase": "general_exploration",
                    "screen_role": "general",
                    "flow_context": "General exploration of unmapped screens.",
                    "branch_context": ""
                })
            return screenshots

        step_idx = 1

        # Walk the master taxonomy hierarchy (Roots -> Flows -> Lanes)
        for root_node in self.flows_json.get("taxonomy", []):
            root_name = root_node.get("label", "Unknown Tab")

            for child_flow in root_node.get("children", []):
                flow_label = child_flow.get("label", "Unknown Flow")
                is_pristine = child_flow.get("is_pristine", False)

                # 1. Traverse the Spine (Pristine Survey)
                for path in child_flow.get("spine", []):
                    fname = os.path.basename(path)
                    if fname in seen_filenames:
                        continue
                    seen_filenames.add(fname)

                    screenshots.append({
                        "path": os.path.join(self.screenshot_dir, fname),
                        "filename": fname,
                        "timeline_step": step_idx,
                        "tab": root_name,
                        "exploration_phase": "survey_capture",
                        "screen_role": "pristine_capture",
                        "flow_context": flow_label,
                        "branch_context": "Phase A — Pristine Survey (Top-to-bottom scroll survey of the core page view)"
                    })
                    step_idx += 1

                # 2. Traverse the Branches (Interactive pathways)
                for branch in child_flow.get("branches", []):
                    branch_label = branch.get("label", "Interactive Journey")
                    branch_desc = branch.get("description", "")

                    for path in branch.get("screenshots", []):
                        fname = os.path.basename(path)
                        if fname in seen_filenames:
                            continue
                        seen_filenames.add(fname)

                        screenshots.append({
                            "path": os.path.join(self.screenshot_dir, fname),
                            "filename": fname,
                            "timeline_step": step_idx,
                            "tab": root_name,
                            "exploration_phase": "child_page_exploration",
                            "screen_role": "child_page",
                            "flow_context": flow_label,
                            "branch_context": f"Phase B+C — {branch_label} ({branch_desc})"
                        })
                        step_idx += 1

        log.info(f"  Timeline built via flows.json: {len(screenshots)} flow-mapped screens.")
        return screenshots

    # =========================================================================
    # COGNITIVE SCREEN EXTRACTION
    # =========================================================================
    async def _ai_extract(self, prompt: str, images: List[bytes],
                          model: str = None) -> Optional[Dict]:
        """Cognitive extraction runner."""
        model = model or self.EXTRACTION_MODEL
        result, usage = await self.client.json(prompt, images=images, model=model)
        self.cost_tracker.track(model, usage)
        return result

    async def _extract_screenshot(self, screenshot_info: Dict,
                                   index: int, total: int) -> Dict:
        start_time = time.time()
        filepath = screenshot_info["path"]
        filename = screenshot_info["filename"]
        step = screenshot_info["timeline_step"]
        tab = screenshot_info.get("tab", "Unknown")
        phase = screenshot_info.get("exploration_phase", "unknown")
        role = screenshot_info.get("screen_role", "general")
        flow_ctx = screenshot_info.get("flow_context", "Unknown Page")
        branch_ctx = screenshot_info.get("branch_context", "")

        log.info(f"[{index + 1}/{total}] {filename} | tab={tab} | flow='{flow_ctx}'")

        with open(filepath, "rb") as f:
            img_bytes = f.read()

        memory_context = self.memory.to_prompt_context()

        apk_context = (
            build_apk_context_for_prompt(self.apk_intel)
            if self.apk_intel else
            "APK GROUND-TRUTH: Not available — infer colors and fonts from screenshots."
        )

        prompt = f"""APP TEARDOWN INTELLIGENCE EXTRACTION v3.0

You are an expert competitive intelligence analyst interpreting a captured screen
of "{self.memory.app_name}" ({self.memory.app_category}). Only report what the evidence supports.

This is SCREEN {step} of {total}.

━━━ FLOW-AWARE CONTEXT (MANDATORY TARGETING) ━━━
The automated agent captured this screen during the following visual context:
- Tab Location:     {tab}
- Active Flow:      {flow_ctx}
- Specific Step:    {branch_ctx}

Use this context to inform your structural analysis. You are not evaluating this
screen in a vacuum; you know exactly what user flow and interaction it represents.

SESSION MEMORY (everything learned from prior screens):
{memory_context}

{apk_context}

OUTPUT JSON:
{{
    "elements": {{
        "buttons": [
            {{ "text": "button text", "type": "primary|secondary|icon|fab", "action_hint": "what it likely does" }}
        ],
        "inputs": [
            {{ "label": "field label", "input_type": "text|email|password|search|number", "placeholder": "hint text" }}
        ],
        "text_blocks": [
            {{ "text": "visible text content", "role": "heading|body|caption|label|stat|badge", "prominence": "high|medium|low" }}
        ],
        "navigation": {{
            "has_bottom_nav": false,
            "has_back_button": false,
            "has_close_button": false,
            "has_top_tabs": false,
            "has_hamburger_menu": false,
            "bottom_nav_items": [],
            "active_nav_item": null,
            "has_progress_indicator": false,
            "breadcrumb_depth": 0
        }},
        "media": [
            {{ "type": "image|video|animation|icon", "description": "what the media shows" }}
        ],
        "toggles_and_checks": []
    }},
    "classification": {{
        "screen_type": "specific_type (e.g., skill_tree_home, lesson_quiz, profile_detail, subscription_upsell, search_results, settings_page, leaderboard, shop, achievement_list, etc.)",
        "screen_type_detail": "Detailed description for competitive analysis",
        "structural_purpose": "navigation_hub|content_display|transaction|settings|gamification|social|onboarding|monetization|utility",
        "content_density": "empty|sparse|moderate|dense|overwhelming",
        "layout": {{
            "pattern": "list|grid|card|hero|form|dashboard|tree|feed|chat|map|detail|modal",
            "scroll_direction": "vertical|horizontal|both|none",
            "has_floating_elements": false
        }},
        "social_proof": {{
            "has_social_proof": false,
            "social_proof_claims": []
        }},
        "secondary_types": []
    }},
    "copy_analysis": {{
        "primary_headline": null,
        "primary_subheadline": null,
        "primary_cta_text": null,
        "primary_cta_framing": "action|benefit|urgency|social|commitment_low",
        "secondary_cta_text": null,
        "value_proposition": null,
        "messaging_angle": "benefit_led|feature_led|social_proof_led|urgency_led|educational|instructional|gamified|transactional",
        "tone": "casual|professional|playful|educational|motivational|urgent|neutral",
        "microcopy": [],
        "persuasion_techniques": []
    }},
    "exploration_position": {{
        "timeline_screen_number": {step},
        "tab": "{tab}",
        "exploration_phase": "{phase}",
        "screen_role": "{role}",
        "is_auth_gate": false,
        "is_paywall": false,
        "is_ad": false,
        "is_core_feature_screen": false,
        "feature_demonstrated": "What app feature this screen showcases, if any",
        "navigation_depth": 0,
        "ux_issues": [
            {{
                "issue": "specific UX issue label from the registry",
                "description": "Plain English explanation",
                "severity": "low|medium|high"
            }}
        ],
        "user_value_on_this_screen": "What value does the user get here?"
    }},
    "competitive_signals": {{
        "pricing_visible": false,
        "pricing_details": {{}},
        "feature_gating": {{
            "gated_features_mentioned": [],
            "free_features_mentioned": []
        }},
        "in_app_currencies": [],
        "gamification_elements": [],
        "engagement_mechanics": [],
        "tech_signals": {{}},
        "partnerships": {{}}
    }},
    "strategic_interpretation": {{
        "design_decisions": [
            "Specific design choice and its likely strategic motivation"
        ],
        "dark_patterns": [
            {{
                "pattern_type": "confirmshaming|forced_continuity|misdirection|hidden_costs|roach_motel|trick_questions|hard_to_close_ad|aggressive_upsell|disguised_ad|forced_registration|none",
                "description": "Exactly how this pattern manifests.",
                "user_impact": "How this frustrates or manipulates the user, and the potential risk to long-term trust.",
                "severity": "mild|moderate|aggressive",
                "affected_element": "Which element"
            }}
        ],
        "competitive_positioning": "What this screen reveals about market positioning",
        "notable_absences": []
    }},
    "screen_intelligence": {{
        "narrative": "2-4 paragraphs in plain English. What does this screen reveal about the app's architecture, business model, and user experience? How does it connect to the parent flow: '{flow_ctx}'? What would a competitor learn from this?",
        "key_findings": [
            {{
                "finding": "Specific finding",
                "evidence": "What on this screen supports it",
                "competitive_relevance": "Why a competitor would care"
            }}
        ],
        "unknown_terms_resolved": {{}},
        "new_terms_to_remember": {{}}
    }},
    "design_signals": {{
        "colors_observed": [
            {{
                "hex": "#XXXXXX",
                "label": "vivid blue",
                "semantic_role": "primary_action | background | text_primary | text_secondary | accent | success | error | warning | surface | navigation | gamification | decorative",
                "confidence": "exact (from APK tokens) | high | medium | low",
                "where_used": "Which UI elements use this color on this screen",
                "apk_token_match": "Token name if this matches an APK ground-truth color, else null"
            }}
        ],
        "typography_observed": {{
            "font_family_guess": "Best guess at font family name based on letterform analysis",
            "confirmed_by_apk": false,
            "weights_visible": ["regular", "bold"],
            "type_scale_levels": 3,
            "type_scale_notes": "Brief description of heading/body/caption size relationships",
            "custom_or_system": "custom | google_font | system",
            "font_personality": "geometric_sans | humanist_sans | slab_serif | transitional_serif | display | monospace"
        }},
        "shape_language": {{
            "corner_radius": "sharp_0px | subtle_4px | rounded_8px | rounded_12px | pill | fully_circular | mixed",
            "corner_radius_px_estimate": 8,
            "card_style": "flat | subtle_shadow | strong_shadow | outlined | neumorphic | none",
            "button_shape": "sharp | rounded | pill",
            "uses_borders_for_separation": false,
            "uses_elevation_for_separation": true
        }},
        "spacing_density": "tight | comfortable | generous | overwhelming",
        "iconography": {{
            "style": "filled | outlined | duotone | sharp | rounded | custom_illustration | mixed | none",
            "stroke_weight": "thin | regular | medium | thick",
            "size_feel": "small | medium | large",
            "color_treatment": "monochrome | colored | multicolor"
        }},
        "imagery_style": "none | photography | flat_vector | 3d_rendered | character_illustration | abstract | mixed",
        "animation_signals": "none | subtle_transitions | prominent_animations | heavy_animations",
        "dark_mode": false,
        "design_system_consistency": "very_consistent | mostly_consistent | some_inconsistencies | chaotic",
        "notable_components": [
            {{
                "component_type": "primary_button | card | chip | avatar | tab_bar | bottom_sheet | input | badge | progress_bar | etc",
                "visual_description": "Concise description of visual treatment",
                "notable_detail": "What makes this component visually distinctive"
            }}
        ]
    }}
}}
"""
        result = await self._ai_extract(prompt, [img_bytes])
        elapsed = time.time() - start_time

        if not result:
            raise RuntimeError(f"Extraction failed for {filename}")
        required = ("classification", "copy_analysis", "competitive_signals",
                    "exploration_position", "strategic_interpretation", "screen_intelligence")
        absent = [key for key in required if not isinstance(result.get(key), dict) or not result[key]]
        if absent:
            # A completed JSON response can still omit a late section of the large
            # extraction schema. Repair only those sections, using the same image,
            # before updating memory or committing this screen to the cache.
            log.warning(f"    Repairing omitted extraction sections for {filename}: {absent}")
            section_guidance = {
                "classification": "screen_type, screen_type_detail, structural_purpose, content_density, layout, social_proof, secondary_types",
                "copy_analysis": "primary_headline, primary_subheadline, primary_cta_text, primary_cta_framing, secondary_cta_text, value_proposition, messaging_angle, tone, microcopy, persuasion_techniques",
                "competitive_signals": "pricing_visible, pricing_details, feature_gating, in_app_currencies, gamification_elements, engagement_mechanics, tech_signals, partnerships",
                "exploration_position": "timeline_screen_number, tab, exploration_phase, screen_role, is_auth_gate, is_paywall, is_ad, is_core_feature_screen, feature_demonstrated, navigation_depth, ux_issues, user_value_on_this_screen",
                "strategic_interpretation": "design_decisions (with likely motivations), dark_patterns (only when visible), competitive_positioning, notable_absences",
                "screen_intelligence": "narrative (2-4 grounded paragraphs), key_findings (each with finding, evidence, competitive_relevance), unknown_terms_resolved, new_terms_to_remember",
            }
            repair_prompt = (
                f"Complete the missing analysis for this screenshot of {self.memory.app_name}. "
                f"It belongs to tab '{tab}', flow '{flow_ctx}', step '{branch_ctx}'. "
                "Use the image as evidence; distinguish observation from inference. "
                "Return one JSON object containing ONLY the requested top-level keys, "
                "each with a substantive object value. Do not invent visible facts.\n"
                + "\n".join(f"{key}: {section_guidance[key]}" for key in absent)
            )
            repair = await self._ai_extract(repair_prompt, [img_bytes])
            for key in absent:
                if isinstance(repair.get(key), dict) and repair[key]:
                    result[key] = repair[key]
            absent = [key for key in required if not isinstance(result.get(key), dict) or not result[key]]
            if absent:
                raise RuntimeError(f"Extraction repair for {filename} still omitted required objects: {absent}")

        # Update learning memory
        self.memory.update_from_extraction(result, screenshot_info)

        # Log intelligence summary
        intel = result.get("screen_intelligence", {})
        if intel.get("narrative"):
            log.info(f"    📝 {intel['narrative'][:150]}...")

        result["extraction_meta"] = {
            "processor_version": SCHEMA_VERSION,
            "model_used": self.EXTRACTION_MODEL,
            "provider": "openai",
            "extraction_timestamp": datetime.now().isoformat(),
            "processing_time_seconds": round(elapsed, 2),
            "source_screenshot": filename,
            "timeline_step": step,
            "tab": tab,
            "exploration_phase": phase,
            "screen_role": role,
            "flow_context": flow_ctx,
            "branch_context": branch_ctx
        }

        return result

    # =========================================================================
    # UX QUALITY SCORING
    # =========================================================================
    def _compute_ux_quality_score(self) -> Dict:
        """Deterministic UX quality scoring based on exploration findings."""
        events = []
        breakdown = {}

        def register(label: str, screen_idx: int, detail: str = "", tab: str = ""):
            pts = UX_REGISTRY.get(label, 3)
            sev = _get_severity(pts)
            pillar = _get_pillar(label)
            events.append({
                "label": label, "points": pts, "screen_index": screen_idx,
                "detail": detail, "severity": sev, "pillar": pillar,
                "tab": tab,
            })
            if label not in breakdown:
                breakdown[label] = {
                    "count": 0, "total_points": 0, "screens": [],
                    "severity": sev, "description": detail, "pillar": pillar,
                }
            e = breakdown[label]
            e["count"] += 1
            e["total_points"] += pts
            e["screens"].append(screen_idx)
            if len(detail) > len(e["description"]):
                e["description"] = detail

        # Walk enriched screenshots
        for enriched in self.enriched_screenshots:
            meta = enriched.get("extraction_meta", {})
            step = meta.get("timeline_step", 0)
            tab = meta.get("tab", "")
            fname = meta.get("source_screenshot", "").lower()
            screen_type = enriched.get("classification", {}).get("screen_type", "").lower()

            if "ad_" in fname or "interstitial" in screen_type:
                register("interstitial_ad_with_skip", step, "Advertisement interruption", tab)
            if any(kw in screen_type for kw in ("paywall", "upsell", "subscription")):
                register("paywall_with_skip", step, f"Monetization gate: {screen_type}", tab)

            if enriched.get("exploration_position", {}).get("is_auth_gate"):
                register("auth_gate_blocking_content", step, "Login/signup wall blocking content access", tab)

            if "blocked" in fname:
                register("content_behind_unnecessary_gate", step, "Content blocked during exploration", tab)

            for issue in enriched.get("exploration_position", {}).get("ux_issues", []):
                if isinstance(issue, dict):
                    label = issue.get("issue", "")
                    if label in UX_REGISTRY:
                        register(label, step, issue.get("description", ""), tab)
                    else:
                        for reg_label in UX_REGISTRY:
                            if (label.lower().replace(" ", "_") in reg_label or
                                reg_label in label.lower().replace(" ", "_")):
                                register(reg_label, step, issue.get("description", ""), tab)
                                break

            dark_patterns = enriched.get("strategic_interpretation", {}).get("dark_patterns", [])
            if isinstance(dark_patterns, dict):
                dark_patterns = [dark_patterns] if dark_patterns.get("pattern_type") else []
            for dp in dark_patterns if isinstance(dark_patterns, list) else []:
                if not isinstance(dp, dict):
                    continue
                pt = dp.get("pattern_type", "")
                if pt and pt not in ("none", "unknown"):
                    reg_label = f"dark_pattern_{pt}"
                    if reg_label in UX_REGISTRY:
                        register(reg_label, step, dp.get("description", ""), tab)

        for ag in self.memory.auth_gates:
            if isinstance(ag, dict):
                step = ag.get("step", 0)
                register("auth_gate_blocking_content", step, ag.get("reason", "Auth gate detected"), ag.get("tab", ""))

        for bp in self.memory.blocked_paths:
            if isinstance(bp, dict) and "auth" not in bp.get("reason", "").lower():
                register("content_behind_unnecessary_gate", 0, f"Blocked: {bp.get('path', '?')} — {bp.get('reason', '?')}")

        paywall_count = len(self.memory.paywalls_encountered)
        if paywall_count >= 3:
            register("aggressive_upsell_frequency", 0, f"{paywall_count} paywall/upsell screens encountered across the app")

        raw_score = sum(ev["points"] for ev in events)
        total_score = min(100, raw_score)
        grade = _compute_grade(total_score)

        pillar_scores = {
            "navigation": min(25, sum(ev["points"] for ev in events if ev["pillar"] == "navigation")),
            "monetization": min(25, sum(ev["points"] for ev in events if ev["pillar"] == "monetization")),
            "accessibility": min(25, sum(ev["points"] for ev in events if ev["pillar"] == "accessibility")),
            "engagement": min(25, sum(ev["points"] for ev in events if ev["pillar"] == "engagement")),
        }

        return {
            "total_score": total_score,
            "grade": grade,
            "raw_score": raw_score,
            "pillar_scores": pillar_scores,
            "events": events,
            "breakdown": breakdown,
            "total_events_detected": len(events),
            "total_screenshots_analyzed": len(self.enriched_screenshots),
        }

    # =========================================================================
    # SESSION SYNTHESIS
    # =========================================================================
    async def _synthesize_session_intelligence(self) -> Dict:
        log.info("  Synthesizing session-level intelligence...")

        all_screen_types = []
        all_ctas = []
        all_headlines = []
        dark_pattern_rich: Dict[str, Dict] = {}
        dark_pattern_freq: Dict[str, int] = {}
        ux_issue_rich: Dict[str, Dict] = {}
        all_narratives = []
        all_key_findings = []
        feature_screens: Dict[str, List[int]] = {}
        total_paywalls = 0

        for screen_idx, enriched in enumerate(self.enriched_screenshots):
            screen_number = screen_idx + 1
            st = enriched.get("classification", {}).get("screen_type", "unknown")
            all_screen_types.append(st)

            copy = enriched.get("copy_analysis", {})
            if copy.get("primary_cta_text"):
                all_ctas.append(copy["primary_cta_text"])
            if copy.get("primary_headline"):
                all_headlines.append(copy["primary_headline"])

            if any(kw in st.lower() for kw in ("paywall", "upsell", "subscription")):
                total_paywalls += 1

            feat = enriched.get("exploration_position", {}).get("feature_demonstrated")
            if feat and feat not in ("null", "None", ""):
                feature_screens.setdefault(feat, []).append(screen_number)

            dark_patterns = enriched.get("strategic_interpretation", {}).get("dark_patterns", [])
            if isinstance(dark_patterns, dict):
                dark_patterns = [dark_patterns] if dark_patterns.get("pattern_type") else []
            for dp in dark_patterns if isinstance(dark_patterns, list) else []:
                if not isinstance(dp, dict):
                    continue
                pt = dp.get("pattern_type", "unknown")
                if pt in ("none", "unknown", "", None): continue
                dark_pattern_freq[pt] = dark_pattern_freq.get(pt, 0) + 1
                if pt not in dark_pattern_rich:
                    dark_pattern_rich[pt] = {
                        "count": 0, "description": dp.get("description", ""),
                        "user_impact": dp.get("user_impact", ""),
                        "severity": dp.get("severity", "mild"),
                        "screen_indices": [],
                    }
                dark_pattern_rich[pt]["count"] += 1
                dark_pattern_rich[pt]["screen_indices"].append(screen_number)

            for issue in enriched.get("exploration_position", {}).get("ux_issues", []):
                if isinstance(issue, dict):
                    label = issue.get("issue", "unknown")
                    if label not in ux_issue_rich:
                        ux_issue_rich[label] = {
                            "count": 0, "description": issue.get("description", ""),
                            "severity": issue.get("severity", "medium"),
                            "screen_indices": [],
                        }
                    ux_issue_rich[label]["count"] += 1
                    ux_issue_rich[label]["screen_indices"].append(screen_number)

            intel = enriched.get("screen_intelligence", {})
            if intel.get("narrative"):
                all_narratives.append(intel["narrative"])
            all_key_findings.extend(intel.get("key_findings", []))

        ux_result = self._compute_ux_quality_score()
        ux_score = ux_result["total_score"]
        ux_grade = ux_result["grade"]
        pillar_scores = ux_result["pillar_scores"]

        synthesis_data = {
            "app_name": self.memory.app_name,
            "app_macro_market": self.memory.app_macro_market,
            "app_micro_niche": self.memory.app_micro_niche,
            "total_screenshots": len(self.enriched_screenshots),
            "tabs_discovered": self.memory.tabs_discovered,
            "sections_by_tab": self.memory.sections_by_tab,
            "screen_type_distribution": dict(Counter(all_screen_types).most_common(20)),
            "total_paywalls": total_paywalls,
            "features_discovered": feature_screens,
            "gated_features": self.memory.features_gated,
            "free_features": self.memory.features_free,
            "game_mechanics": self.memory.game_mechanics,
            "in_app_currencies": self.memory.in_app_currencies,
            "pricing_data": self.memory.pricing_seen,
            "monetization_touchpoints": self.memory.monetization_touchpoints,
            "auth_gates": len(self.memory.auth_gates),
            "blocked_paths": len(self.memory.blocked_paths),
            "dark_patterns_detailed": dark_pattern_rich,
            "ux_issues_detailed": ux_issue_rich,
            "ux_quality_score": ux_score,
            "ux_grade": ux_grade,
            "pillar_scores": pillar_scores,
            "glossary_terms": list(self.memory.glossary.keys()),
        }

        narrative_summary = "\n\n---\n\n".join([
            f"SCREEN {i+1}:\n{n[:500]}"
            for i, n in enumerate(all_narratives[:25])
        ])

        apk_design_context = ""
        if self.apk_intel:
            apk_design_context = f"""
APK GROUND-TRUTH DESIGN TOKENS:
Colors ({len(self.apk_intel.get('color_palette', []))} extracted):
{json.dumps(self.apk_intel.get('semantic_color_roles', {}), indent=2)}

Typography:
{json.dumps(self.apk_intel.get('typography', {}).get('font_families_summary', []), indent=2)}

Icon dominant colors:
{json.dumps(self.apk_intel.get('icons', {}).get('dominant_colors', []), indent=2)}

Coverage: {json.dumps(self.apk_intel.get('extraction_coverage', {}), indent=2)}
"""

        prompt = f"""SESSION-LEVEL TEARDOWN INTELLIGENCE SYNTHESIS v3.0

You are producing an evidence-based competitive intelligence report for "{self.memory.app_name}"
from the captured screens. The capture audit status is
"{(self._load_json('unattended_audit.json') or {}).get('status', 'unknown')}".
Do not claim a complete product teardown when the audit is partial or unknown.
Describe unobserved features, outcomes, and monetization as unverified.

MANDATORY TAXONOMY - MACRO MARKET:
In your response, you must classify the app under exactly ONE of the following macro market options:
{json.dumps(MACRO_MARKETS, indent=2)}

AGGREGATED METRICS:
{json.dumps(synthesis_data, indent=2)}

{apk_design_context}

APP GLOSSARY:
{json.dumps(self.memory.glossary, indent=2)}

PER-SCREEN NARRATIVES (excerpts):
{narrative_summary[:8000]}

KEY FINDINGS:
{json.dumps(all_key_findings[:25], indent=2)}

WRITING STYLE:
- Clinical, data-driven product strategist tone
- Objective and unbiased — state facts and strategic implications neutrally
- NO acronyms without full definitions
- Reference screen numbers when citing evidence
- This is a FULL APP TEARDOWN, not an onboarding analysis

OUTPUT JSON:
{{
    "executive_summary": "Comprehensive 300-500 word narrative covering: what this app is, how it's structured (tabs, features, content types), its business model and monetization strategy, key engagement mechanics, notable UX patterns (positive and negative), and what the overall architecture reveals about the company's product strategy. Be specific — reference features, screen numbers, and mechanics by name.",

    "competitive_profile": {{
        "macro_market": "MUST select exactly one value from the provided MANDATORY TAXONOMY list",
        "micro_niche": "Strictly 2-4 words maximum. A concise, punchy descriptor of the exact product niche (e.g., 'Collaborative Wiki & Docs', 'Language Learning', 'Expense Tracking'). Do NOT use generic filler words like 'platform', 'app', 'system', 'software', or 'tool'.",
        "primary_function": "Core job-to-be-done this app serves",
        "monetization_model": "freemium|subscription|ad_supported|in_app_purchase|hybrid|free",
        "monetization_details": "Detailed description of how the app makes money",
        "target_audience_signals": [],
        "target_audience_description": "Who this app is built for, based on evidence",
        "maturity_assessment": "early|growing|mature|enterprise",
        "maturity_reasoning": "Evidence-based reasoning",
        "competitive_moat": "Structural advantages observed",
        "differentiation_signals": []
    }},

    "app_architecture": {{
        "navigation_model": "bottom_tabs|hamburger|tab_bar|single_scroll|hybrid — describe the primary navigation paradigm",
        "navigation_description": "How users move through the app — tabs, sections, depth",
        "tab_structure": [
            {{
                "tab_name": "Home",
                "purpose": "What this tab serves",
                "content_types": ["type1", "type2"],
                "key_features": ["feature1"],
                "monetization_present": false
            }}
        ],
        "content_taxonomy": "What types of content the app serves and how they're organized",
        "depth_assessment": "How many levels deep the navigation goes",
        "information_architecture_quality": "excellent|good|adequate|poor — with reasoning",
        "key_architectural_insight": "The most important structural takeaway"
    }},

    "feature_inventory": {{
        "core_features": [
            {{
                "feature_name": "name",
                "description": "what it does",
                "access_level": "free|gated|premium",
                "screens_observed": []
            }}
        ],
        "total_features_discovered": 0,
        "features_gated_behind_paywall": [],
        "features_gated_behind_auth": [],
        "features_freely_accessible": [],
        "feature_completeness_assessment": "How complete the feature set appears"
    }},

    "monetization_intelligence": {{
        "revenue_model": "Primary revenue model",
        "monetization_touchpoints_count": {len(self.memory.monetization_touchpoints)},
        "monetization_aggressiveness": "none|subtle|moderate|aggressive|very_aggressive",
        "monetization_timing": "Where and how monetization appears in the user journey",
        "pricing_transparency": "transparent|partially_hidden|fully_hidden",
        "pricing_details": {json.dumps(self.memory.pricing_seen)},
        "in_app_currencies": {json.dumps(self.memory.in_app_currencies)},
        "currency_purpose": "What in-app currencies can buy",
        "free_vs_paid_positioning": "How the app differentiates free and paid tiers",
        "key_monetization_insight": "Most important monetization takeaway"
    }},

    "engagement_analysis": {{
        "gamification_mechanics": {json.dumps(self.memory.game_mechanics)},
        "gamification_sophistication": "none|basic|moderate|advanced|industry_leading",
        "engagement_loops": [
            {{
                "loop_name": "name",
                "description": "How this engagement loop works",
                "mechanic_type": "streak|progression|social|collection|competition"
            }}
        ],
        "retention_hooks": [],
        "social_features": [],
        "personalization_signals": []
    }},

    "copy_intelligence": {{
        "dominant_tone": "casual|professional|playful|educational|motivational",
        "messaging_consistency": "consistent|mixed|inconsistent",
        "cta_framing_distribution": {{}},
        "unique_microcopy_patterns": [],
        "tone_shifts": "Any identified shifts in messaging tone across the app"
    }},

    "dark_pattern_audit": {{
        "patterns_found": [
            {{
                "pattern_type": "type",
                "description": "Objective description",
                "user_impact": "How this manipulates user behavior and the risk to retention.",
                "severity": "mild|moderate|aggressive",
                "affected_element": "element",
                "screens": []
            }}
        ],
        "ethical_design_score": 7,
        "ethical_design_reasoning": "Objective rationale",
        "industry_comparison": "How this compares to category norms"
    }},

    "pattern_library": [
        {{
            "pattern_name": "name",
            "description": "A rich 2-3 sentence analysis explaining WHAT the pattern is, WHY it works psychologically or functionally, and HOW it impacts the user experience.",
            "screen_indices": [],
            "category": "ux_best_practice|engagement_pattern|persuasion_pattern|dark_pattern|monetization_pattern|navigation_pattern",
            "effectiveness_assessment": "How well this pattern works",
            "competitive_insight": "Specifically what a competitor should learn or copy from this pattern."
        }}
    ],

    "ux_quality_assessment": {{
        "total_ux_score": {ux_score},
        "ux_grade": "{ux_grade}",
        "pillar_scores": {json.dumps(pillar_scores)},
        "pillar_details": {{
            "navigation": "Assessment of navigation quality with specific evidence",
            "monetization": "Assessment of monetization pressure with specific evidence",
            "accessibility": "Assessment of content/feature accessibility with evidence",
            "engagement": "Assessment of engagement design ethics with evidence"
        }},
        "biggest_ux_issues": [
            {{
                "issue": "label",
                "description": "Plain English explanation with specific evidence",
                "severity": "low|medium|high",
                "screens": [],
                "pillar": "navigation|monetization|accessibility|engagement"
            }}
        ],
        "ux_strengths": [
            {{
                "factor": "Specific UX strength label",
                "description": "What the app does well from a UX perspective",
                "screens": []
            }}
        ],
        "category_benchmark": "How this UX quality compares to typical apps in this category"
    }},

    "brand_kit": {{
        "color_system": {{
            "canonical_palette": [
                {{
                    "hex": "#XXXXXX",
                    "label": "vivid blue",
                    "semantic_role": "primary",
                    "apk_token": "colorPrimary or null",
                    "confidence": "exact | high | medium",
                    "used_for": "Primary CTAs, active nav items, key UI highlights"
                }}
            ],
            "background_system": {{
                "primary_bg": "#XXXXXX",
                "surface_color": "#XXXXXX",
                "card_color": "#XXXXXX",
                "description": "2-3 levels of surface? Single tone? Dark mode?"
            }},
            "text_system": {{
                "primary_text": "#XXXXXX",
                "secondary_text": "#XXXXXX",
                "description": "Text color strategy"
            }},
            "accent_colors": [],
            "state_colors": {{
                "success": "#XXXXXX",
                "error": "#XXXXXX",
                "warning": "#XXXXXX"
            }},
            "gamification_colors": [],
            "color_harmony": "monochromatic | analogous | complementary | triadic | split_complementary",
            "color_temperature": "warm | cool | neutral | mixed",
            "brand_color_personality": "2-3 sentence designer's read on the brand's color strategy and what it communicates"
        }},
        "typography_system": {{
            "primary_font": "Font family name",
            "secondary_font": "Font family name or null",
            "font_source": "embedded | google_fonts | system | unknown",
            "weight_range": "Light (300) through Bold (700)",
            "type_scale": {{
                "display": null,
                "heading": null,
                "subheading": null,
                "body": null,
                "caption": null,
                "label": null
            }},
            "type_personality": "What the font choice communicates about the brand",
            "font_pairing_assessment": "How well the fonts work together"
        }},
        "shape_system": {{
            "dominant_corner_style": "Description of the app's corner radius language",
            "corner_radius_primary": "Xpx",
            "button_shape_language": "Description",
            "card_elevation_style": "Description",
            "shape_personality": "What the shape language communicates"
        }},
        "iconography_system": {{
            "icon_style": "filled | outlined | duotone | custom",
            "icon_library_guess": "Material Icons | Phosphor | Feather | Custom | Unknown",
            "icon_size_system": "Description of icon sizing",
            "icon_color_treatment": "Description"
        }},
        "design_language_summary": "3-5 sentence paragraph a designer could hand to a junior. Describe the overall visual language: what it feels like, what it communicates, what design decisions define it, and what category conventions it follows or breaks.",
        "design_system_maturity": {{
            "score": 7,
            "assessment": "mature | growing | inconsistent | immature",
            "evidence": "Specific observations about consistency, component reuse, etc.",
            "notable_inconsistencies": []
        }},
        "competitive_design_notes": "How does this design language compare to category peers? What's distinctive, what's derivative?",
        "figma_token_export": {{
            "colors": {{}},
            "typography": {{}},
            "border_radius": {{}}
        }}
    }},

    "glossary": {json.dumps(self.memory.glossary)}
}}
"""
        ai_synthesis = await self._ai_extract(prompt, [], model=self.SYNTHESIS_MODEL)
        profile = ai_synthesis.get("competitive_profile") if isinstance(ai_synthesis, dict) else None
        if not isinstance(ai_synthesis, dict) or not isinstance(ai_synthesis.get("executive_summary"), str) or not ai_synthesis["executive_summary"].strip():
            raise RuntimeError("Session synthesis omitted executive_summary")
        if not isinstance(profile, dict) or profile.get("macro_market") not in MACRO_MARKETS or not isinstance(profile.get("micro_niche"), str) or not profile["micro_niche"].strip():
            raise RuntimeError("Session synthesis did not classify the app's market and niche")

        session_intel = {
            "schema_version": SCHEMA_VERSION,
            "exploration_summary": {
                "total_screenshots": len(self.enriched_screenshots),
                "tabs_explored": self.memory.tabs_discovered,
                "total_unique_screen_types": len(set(all_screen_types)),
                "screen_type_distribution": dict(Counter(all_screen_types).most_common(20)),
                "total_paywalls_encountered": total_paywalls,
                "total_auth_gates": len(self.memory.auth_gates),
                "total_blocked_paths": len(self.memory.blocked_paths),
                "dark_pattern_types": dark_pattern_freq,
                "dark_patterns_detailed": dark_pattern_rich,
                "ux_issues_detailed": ux_issue_rich,
            },
            "ux_quality_report": {
                "total_ux_score": ux_score,
                "ux_grade": ux_grade,
                "pillar_scores": pillar_scores,
                "raw_score": ux_result["raw_score"],
                "ux_events": ux_result["events"],
                "ux_breakdown": ux_result["breakdown"],
                "total_events_detected": ux_result["total_events_detected"],
            },
            "feature_gating_map": {
                "gated_features": self.memory.features_gated,
                "free_features": self.memory.features_free,
            },
            "session_memory": self.memory.to_dict(),
        }

        if ai_synthesis:
            # Update memory state with newly refined taxonomies from LLM
            profile = ai_synthesis.get("competitive_profile", {})
            if profile:
                self.memory.app_macro_market = profile.get("macro_market", self.memory.app_macro_market)
                self.memory.app_micro_niche = profile.get("micro_niche", self.memory.app_micro_niche)

            for key in ["executive_summary", "competitive_profile", "app_architecture",
                        "feature_inventory", "monetization_intelligence", "engagement_analysis",
                        "copy_intelligence", "dark_pattern_audit", "pattern_library",
                        "ux_quality_assessment", "brand_kit", "glossary"]:
                session_intel[key] = ai_synthesis.get(key, {})
        else:
            session_intel["executive_summary"] = ""
            session_intel["competitive_profile"] = {}
            session_intel["app_architecture"] = {}
            session_intel["feature_inventory"] = {}
            session_intel["monetization_intelligence"] = {}
            session_intel["engagement_analysis"] = {}
            session_intel["copy_intelligence"] = {}
            session_intel["dark_pattern_audit"] = {}
            session_intel["pattern_library"] = []
            session_intel["ux_quality_assessment"] = {}
            session_intel["brand_kit"] = {}
            session_intel["glossary"] = self.memory.glossary

        return session_intel

    # =========================================================================
    # MAIN RUN
    # =========================================================================
    async def run(self) -> Dict:
        start_time = time.time()

        log.info(f"\n{'=' * 60}")
        log.info(f"APP TEARDOWN POST-PROCESSOR v3.0 (Flow-Aware & Resume-Enabled)")
        log.info(f"  App: {self.memory.app_name} ({self.memory.app_category})")
        log.info(f"  Session: {self.session_dir}")
        log.info(f"  Memory: Exploration-aware (tabs, sections, features)")
        log.info(f"{'=' * 60}\n")

        # Phase 0: APK analysis
        if APK_ANALYZER_AVAILABLE and not self.apk_intel:
            apk_path = None
            for f in os.listdir(self.session_dir):
                if f.endswith(".apk"):
                    apk_path = os.path.join(self.session_dir, f)
                    break

            if apk_path:
                log.info("PHASE 0: APK Analysis (apk_intelligence.json not found, running now)")
                log.info(f"{'-' * 40}")
                try:
                    analyzer = APKAnalyzer(self.session_dir, apk_path)
                    self.apk_intel = analyzer.run()
                    hydrate_memory_from_apk(self.memory, self.apk_intel)
                    log.info(f"  APK analysis complete: "
                             f"{len(self.apk_intel.get('color_palette', []))} colors extracted")
                except Exception as e:
                    log.warning(f"  APK analysis failed (non-fatal): {e}")
                    self.apk_intel = None

        # Phase 1: Build Flow-Aware Timeline
        screenshots = self._build_flow_aware_timeline()
        if not screenshots:
            log.warning("No unique screenshots found in flows.json. Aborting.")
            return {"error": "No screenshots found"}

        # Phase 2: Sequential extraction with semantic memory
        log.info(f"PHASE 1: Flow-Aware Extraction ({len(screenshots)} unique screens)")
        log.info(f"{'-' * 40}")

        for i, ss_info in enumerate(screenshots):
            safe_name = os.path.splitext(ss_info["filename"])[0]
            step_str = str(ss_info["timeline_step"]).zfill(3)
            out_path = os.path.join(self.output_dir, f"step_{step_str}_{safe_name}_enriched.json")

            # ── STATEFUL RESUME ENGINE (CRITICAL) ──
            # If this screenshot's enriched JSON already exists on disk, we bypass the API call
            # completely, load the cached file, and instantly hydrate our session memory in milliseconds.
            if os.path.exists(out_path):
                try:
                    with open(out_path, "r", encoding="utf-8") as f:
                        cached_enriched = json.load(f)

                    # Hydrate active memory and lists sequentially
                    if cached_enriched.get("extraction_meta", {}).get("provider") != "openai":
                        raise ValueError("Cached enrichment was not produced by OpenAI")
                    self.memory.update_from_extraction(cached_enriched, ss_info)
                    self.enriched_screenshots.append(cached_enriched)

                    if (i + 1) % 50 == 0 or i == len(screenshots) - 1:
                        log.info(f"    🔄 Catching up: [{i+1}/{len(screenshots)}] {ss_info['filename']} loaded from cache.")
                    continue
                except Exception as cache_err:
                    log.warning(f"    ⚠️ Failed to load cached enrichment for {ss_info['filename']}, re-processing: {cache_err}")

            # If not cached, execute the cognitive visual extraction
            enriched = await self._extract_screenshot(ss_info, i, len(screenshots))
            self.enriched_screenshots.append(enriched)

            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(enriched, f, indent=2, ensure_ascii=False)

            if (i + 1) % 10 == 0 or i == len(screenshots) - 1:
                mem_path = os.path.join(self.output_dir, "session_memory.json")
                with open(mem_path, "w", encoding="utf-8") as f:
                    json.dump(self.memory.to_dict(), f, indent=2, ensure_ascii=False)
                log.info(f"    💾 Memory: {len(self.memory.glossary)} terms, "
                        f"{len(self.memory.tabs_discovered)} tabs, "
                        f"{len(self.memory.game_mechanics)} mechanics")

            await asyncio.sleep(0)

        # Phase 3: Session-level synthesis
        log.info(f"\nPHASE 2: Session-level synthesis")
        log.info(f"{'-' * 40}")
        self.session_intelligence = await self._synthesize_session_intelligence()

        # Phase 4: Save outputs
        elapsed = time.time() - start_time
        cost_report = self.cost_tracker.get_report() if self._owns_cost_tracker else None

        session_path = os.path.join(self.output_dir, "session_intelligence.json")
        with open(session_path, "w", encoding="utf-8") as f:
            json.dump(self.session_intelligence, f, indent=2, ensure_ascii=False)

        mem_path = os.path.join(self.output_dir, "session_memory.json")
        with open(mem_path, "w", encoding="utf-8") as f:
            json.dump(self.memory.to_dict(), f, indent=2, ensure_ascii=False)

        stats = {
            "total_screenshots_processed": len(screenshots),
            "total_processing_time_seconds": round(elapsed, 2),
            "processor_version": SCHEMA_VERSION,
            "timestamp": datetime.now().isoformat(),
        }
        if cost_report:
            stats.update({
                "total_api_calls": cost_report["total_api_calls"],
                "total_input_tokens": cost_report["total_input_tokens"],
                "total_output_tokens": cost_report["total_output_tokens"],
                "estimated_cost_usd": cost_report["total_estimated_cost_usd"],
            })

        enriched_manifest = {
            "enriched_screenshots": [
                {
                    "screenshot": ss["filename"],
                    "enriched_file": f"step_{str(ss.get('timeline_step', 0)).zfill(3)}_{os.path.splitext(ss['filename'])[0]}_enriched.json",
                    "step": ss.get("timeline_step"),
                    "tab": ss.get("tab"),
                    "phase": ss.get("exploration_phase"),
                    "role": ss.get("screen_role"),
                }
                for ss in screenshots
            ],
            "session_intelligence": "session_intelligence.json",
            "session_memory": "session_memory.json",
            "processing_stats": stats,
        }
        with open(os.path.join(self.output_dir, "enriched_manifest.json"), "w", encoding="utf-8") as f:
            json.dump(enriched_manifest, f, indent=2, ensure_ascii=False)

        if self._owns_cost_tracker:
            self.cost_tracker.save_report()

        # ── Summary Log ──
        ux = self.session_intelligence.get("ux_quality_report", {})
        log.info(f"\n{'=' * 60}")
        log.info(f"TEARDOWN POST-PROCESSING COMPLETE (v3.0 - Flow-Aware & Resume-Enabled)")
        log.info(f"  Screenshots processed: {len(screenshots)}")
        log.info(f"  Processing time: {elapsed:.1f}s")
        log.info(f"  Tabs discovered: {self.memory.tabs_discovered}")
        log.info(f"  Glossary terms: {len(self.memory.glossary)}")
        log.info(f"  Game mechanics: {self.memory.game_mechanics}")
        log.info(f"  Paywalls: {len(self.memory.paywalls_encountered)}")
        log.info(f"  Dark patterns: {sum(1 for dp in self.memory.dark_patterns_found if dp.get('pattern_type') not in ('none', 'unknown'))}")
        log.info(f"  UX Grade: {ux.get('ux_grade', '?')} (score: {ux.get('total_ux_score', 0)}/100)")
        if ux.get("pillar_scores"):
            for pillar, score in ux["pillar_scores"].items():
                log.info(f"    {pillar}: {score}/25")
        if cost_report:
            log.info(f"  API calls: {cost_report['total_api_calls']}")
            log.info(f"  Estimated cost: {cost_report['total_estimated_cost_usd'] if cost_report['total_estimated_cost_usd'] is not None else 'unavailable'}")
        log.info(f"  Output: {self.output_dir}/")

        exec_summary = self.session_intelligence.get("executive_summary", "")
        if exec_summary:
            log.info(f"\n  EXECUTIVE SUMMARY:")
            log.info(f"  {exec_summary[:400]}...")

        log.info(f"{'=' * 60}")

        return {
            "status": "complete",
            "screenshots_processed": len(screenshots),
            "output_dir": self.output_dir,
            "session_intelligence": self.session_intelligence,
            "session_memory": self.memory.to_dict(),
            "processing_stats": stats,
        }


# =============================================================================
# CLI
# =============================================================================
async def main():
    if len(sys.argv) < 2:
        print("Usage: python teardown_post_processor.py <session_dir> [api_key]")
        sys.exit(1)

    session_dir = sys.argv[1]
    api_key = environment_key()

    if not api_key:
        print("ERROR: Set OPENAI_API_KEY or MOBILESPY_OPENAI_API_KEYS in this terminal")
        sys.exit(1)

    if not os.path.isdir(session_dir):
        print(f"ERROR: Not a directory: {session_dir}")
        sys.exit(1)

    processor = TeardownPostProcessor(session_dir, api_key)
    result = await processor.run()

    if result.get("error"):
        print(f"\nERROR: {result['error']}")
        sys.exit(1)

    print(f"\nDone. Output: {result['output_dir']}")


if __name__ == "__main__":
    asyncio.run(main())
