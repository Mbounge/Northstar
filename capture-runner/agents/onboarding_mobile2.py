#onboarding_mobile2.py

import asyncio
import base64
import json
import os
import sys
import time
import re
import subprocess
import random
import hashlib
import string
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
import shutil
import glob
from datetime import datetime
from openai import OpenAI
from tempfile import NamedTemporaryFile
from collections import defaultdict
import logging
import io
import copy
import uuid
from PIL import Image

try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = None
    np = None

# --- HOST SCREENSHOT LIBRARY ---
try:
    import pyautogui
except ImportError:
    print("⚠️ 'pyautogui' not found. Install it with: pip install pyautogui")
    pyautogui = None

# =============================================================================
# LOGGING & CONFIG
# =============================================================================
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')
log = logging.getLogger("OnboardingSpy")

def _load_api_keys():
    """
    Load OpenAI API keys from the environment.

    Supported:
      OPENAI_API_KEY=<single key>
      OPENAI_API_KEYS=<comma-separated keys>
      MOBILESPY_OPENAI_API_KEYS=<comma-separated keys>

    Generated source intentionally does not embed API secrets.
    """
    keys = []

    for env_name in (
        "MOBILESPY_OPENAI_API_KEYS",
        "OPENAI_API_KEYS",
        "OPENAI_API_KEY",
    ):
        value = os.environ.get(env_name, "").strip()
        if value:
            keys.extend(item.strip() for item in value.split(",") if item.strip())

    unique = []
    seen = set()
    for key in keys:
        if key not in seen:
            seen.add(key)
            unique.append(key)

    return unique


API_KEYS = _load_api_keys()
MODEL_ROSTER = ["gpt-6-luna"]
OPENAI_REASONING_EFFORT = os.getenv(
    "MOBILESPY_OPENAI_REASONING_EFFORT", "high"
).strip().casefold()
if OPENAI_REASONING_EFFORT not in {"none", "low", "medium", "high", "xhigh", "max"}:
    raise ValueError(
        "MOBILESPY_OPENAI_REASONING_EFFORT must be one of: "
        "none, low, medium, high, xhigh, max"
    )
OPENAI_IMAGE_DETAIL = os.getenv(
    "MOBILESPY_OPENAI_IMAGE_DETAIL", "high"
).strip().casefold()
if OPENAI_IMAGE_DETAIL not in {"auto", "low", "high"}:
    raise ValueError("MOBILESPY_OPENAI_IMAGE_DETAIL must be auto, low, or high")
try:
    OPENAI_MAX_OUTPUT_TOKENS = max(
        1024, int(os.getenv("MOBILESPY_OPENAI_MAX_OUTPUT_TOKENS", "8192"))
    )
except ValueError as exc:
    raise ValueError("MOBILESPY_OPENAI_MAX_OUTPUT_TOKENS must be an integer") from exc


class OnboardingAIUnavailable(RuntimeError):
    """Terminal provider failure that must checkpoint and pause onboarding."""


def _build_openai_response_input(prompt, images=None, detail=None):
    """Build one Responses API user item while preserving image order."""
    content = [{"type": "input_text", "text": str(prompt)}]
    image_detail = detail or OPENAI_IMAGE_DETAIL
    for img in images or []:
        if img is None:
            continue
        if not isinstance(img, (bytes, bytearray, memoryview)):
            raise TypeError("Onboarding image inputs must be PNG bytes")
        encoded = base64.b64encode(bytes(img)).decode("ascii")
        content.append({
            "type": "input_image",
            "image_url": f"data:image/png;base64,{encoded}",
            "detail": image_detail,
        })
    return [{"role": "user", "content": content}]


def _cli_value(*flags):
    """Pre-parse values needed before the agent object is constructed."""
    for i, arg in enumerate(sys.argv):
        for flag in flags:
            if arg.startswith(flag + "="):
                return arg.split("=", 1)[1].strip()
            if arg == flag and i + 1 < len(sys.argv):
                return sys.argv[i + 1].strip()
    return ""


def _safe_app_slug(value):
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value or "")).strip("_")
    return value or "App"


PACKAGE_NAME = (
    _cli_value("--package", "--package-name")
    or os.environ.get("ONBOARDING_PACKAGE", "").strip()
    or "com.tsenta.tsenta"
)
APP_NAME = (
    _cli_value("--app-name", "--app")
    or os.environ.get("ONBOARDING_APP_NAME", "").strip()
    or (
        "Tsenta"
        if PACKAGE_NAME == "com.tsenta.tsenta"
        else PACKAGE_NAME.rsplit(".", 1)[-1].replace("_", " ").title()
    )
)
APP_DATA_SLUG = _safe_app_slug(APP_NAME)

IDENTITY_EMAIL = (
    _cli_value("--email")
    or os.environ.get("ONBOARDING_EMAIL", "").strip()
)
IDENTITY_PASSWORD = (
    _cli_value("--password")
    or os.environ.get("ONBOARDING_PASSWORD", "").strip()
)

# Documents are opt-in for generic runs; pass --resume-pdf when appropriate.
DEFAULT_RESUME_PDF = os.path.expanduser(
    _cli_value("--resume-pdf", "--resume-file")
    or os.environ.get("ONBOARDING_RESUME_PDF", "").strip()
)
DEVICE_RESUME_DIR = "/sdcard/Download"

# Optional explicit university override.
# Blank/default means: let the vision model choose a REAL institution from the app's
# live autocomplete suggestions. Set --university / ONBOARDING_UNIVERSITY only
# when the caller intentionally wants to constrain that semantic value.
DEFAULT_UNIVERSITY = os.environ.get("ONBOARDING_UNIVERSITY", "").strip()

MAX_STEPS = 150
MAX_CLICK_RETRIES = 6
MAX_EXPLORATION_DEPTH = 12
MAX_CONSECUTIVE_UNKNOWNS = 4
MAX_SAME_SCREEN_REPEATS = 3
MAX_NAV_SEARCH_DEPTH = 6
MAX_BACKTRACK_ATTEMPTS = 5
MAX_FIELD_RETRIES = 3
MAX_POST_AUTH_STEPS = 40
MAX_VERIFICATION_WAIT = 60
MAX_SETTLED_CHECKS = 3

# Pacing — human-like delays
PACE_TAP_DELAY = (1.8, 3.5)
PACE_TYPE_CHAR_DELAY = (0.03, 0.08)
PACE_FIELD_DELAY = (1.0, 2.0)
PACE_NAVIGATION_DELAY = (2.0, 4.0)
PACE_SCROLL_DELAY = (1.5, 2.5)
PACE_PICKER_SWIPE_DELAY = (0.5, 1.0)


def human_delay(range_tuple):
    time.sleep(random.uniform(*range_tuple))


# =============================================================================
# OBSERVABILITY & COST TRACKING
# =============================================================================
class CostTracker:
    PRICING = {
        "gpt-6-luna":                      {"in": 0.10, "cached_in": 0.01, "out": 0.50},
        "gemini-3-flash-preview":           {"in": 0.50, "out": 3.00},
        "gemini-2.5-flash-preview-09-2025": {"in": 0.30, "out": 2.50},
        "gemini-2.5-flash-lite":            {"in": 0.10, "out": 0.40},
        "gemini-2.0-flash":                 {"in": 0.10, "out": 0.40},
        "default":                          {"in": 0.10, "cached_in": 0.10, "out": 0.50},
    }

    def __init__(self, session_dir):
        self.start_time = time.time()
        self.session_dir = session_dir
        self.usage_log = {}

    def track(self, model_name, usage_metadata):
        if not usage_metadata:
            return
        if model_name not in self.usage_log:
            self.usage_log[model_name] = {
                "input": 0, "cached_input": 0, "output": 0, "calls": 0
            }

        def _usage_value(obj, *names):
            for name in names:
                if isinstance(obj, dict) and name in obj:
                    return obj.get(name) or 0
                value = getattr(obj, name, None)
                if value is not None:
                    return value or 0
            return 0

        in_t = _usage_value(usage_metadata, "input_tokens", "prompt_token_count")
        out_t = _usage_value(usage_metadata, "output_tokens", "candidates_token_count")
        input_details = (
            usage_metadata.get("input_tokens_details")
            if isinstance(usage_metadata, dict)
            else getattr(usage_metadata, "input_tokens_details", None)
        )
        cached_t = min(in_t, _usage_value(input_details, "cached_tokens"))
        self.usage_log[model_name]["input"] += in_t
        self.usage_log[model_name]["cached_input"] += cached_t
        self.usage_log[model_name]["output"] += out_t
        self.usage_log[model_name]["calls"] += 1
        r = self.PRICING.get(model_name, self.PRICING["default"])
        call_cost = (
            ((in_t - cached_t) / 1e6) * r["in"]
            + (cached_t / 1e6) * r.get("cached_in", r["in"])
            + (out_t / 1e6) * r["out"]
        )
        cached_note = f" ({cached_t} cached)" if cached_t else ""
        print(
            f"         📊 [Cost] {model_name}: {in_t} in{cached_note} / "
            f"{out_t} out (~${round(call_cost, 6)})"
        )

    def save_report(self):
        end = time.time()
        dur = end - self.start_time
        total = 0.0
        breakdown = []
        for m, s in self.usage_log.items():
            r = self.PRICING.get(m, self.PRICING["default"])
            cached_t = min(s["input"], s.get("cached_input", 0))
            c = (
                ((s["input"] - cached_t) / 1e6) * r["in"]
                + (cached_t / 1e6) * r.get("cached_in", r["in"])
                + (s["output"] / 1e6) * r["out"]
            )
            total += c
            breakdown.append({
                "model": m, "calls": s["calls"],
                "input_tokens": s["input"],
                "cached_input_tokens": cached_t,
                "output_tokens": s["output"],
                "estimated_cost": round(c, 6),
            })
        report = {
            "timestamp": datetime.now().isoformat(),
            "duration_seconds": round(dur, 2),
            "duration_formatted": time.strftime("%H:%M:%S", time.gmtime(dur)),
            "total_estimated_cost_usd": round(total, 6),
            "total_api_calls": sum(x["calls"] for x in breakdown),
            "model_breakdown": breakdown,
        }
        try:
            path = f"{self.session_dir}/observability_log.json"
            with open(path, "w") as f:
                json.dump(report, f, indent=2)
            print(f"\n   💰 Cost report saved: {path}")
            print(f"   💰 Total: ${report['total_estimated_cost_usd']} | "
                  f"Calls: {report['total_api_calls']} | Duration: {report['duration_formatted']}")
        except IOError as e:
            print(f"      ⚠️ Could not save cost report: {e}")
        return report


# =============================================================================
# NAVIGATION KNOWLEDGE
# =============================================================================
SIGNUP_INDICATORS = [
    "sign up", "signup", "register", "create account", "create an account",
    "get started", "join", "join now", "join free", "new account",
    "sign up free", "start free", "try free", "continue with email",
    "continue with phone", "i'm new", "new here", "don't have an account",
    "create one", "new user", "first time", "get started here", "explore solutions",
    "choose your plan", "become a partner", "join as", "new to"
]

AUTH_INDICATORS = [
    "log in", "login", "sign in", "signin", "already have an account",
    "welcome back", "enter your email", "enter email", "enter your password"
]

NAV_EXPLORATION_PRIORITY = [
    {"keywords": ["sign up", "signup", "register", "create account", "get started",
                   "join", "join now", "sign up free", "start free", "try free"],
     "element_types": ["Button", "TextView", "ImageButton"],
     "priority": 100,
     "category": "direct_signup"},
    {"keywords": ["log in", "login", "sign in", "signin"],
     "element_types": ["Button", "TextView"],
     "priority": 90,
     "category": "login_then_signup"},
    {"keywords": ["profile", "account", "me", "my account", "my profile", "user"],
     "element_types": ["TextView", "ImageView", "FrameLayout", "LinearLayout"],
     "priority": 80,
     "category": "profile_tab"},
    {"keywords": ["more", "menu", "☰", "⋮", "navigate up", "open navigation",
                   "open drawer", "settings"],
     "element_types": ["ImageButton", "ImageView", "Button"],
     "priority": 70,
     "category": "menu_navigation"},
    {"resource_id_patterns": ["bottom_nav", "tab_bar", "navigation_bar",
                               "bottom_tab", "bnv_", "tab_layout"],
     "priority": 60,
     "category": "bottom_nav"},
    {"keywords": ["skip", "dismiss", "close", "not now", "maybe later",
                   "no thanks", "continue as guest", "×", "✕"],
     "element_types": ["Button", "TextView", "ImageButton", "ImageView"],
     "priority": 50,
     "category": "dismiss_overlay"},
    {"keywords": ["_scroll_down_"],
     "priority": 40,
     "category": "scroll_explore"},
    {"keywords": ["_swipe_left_"],
     "priority": 30,
     "category": "carousel_advance"},
]


# =============================================================================
# WIDGET CLASSIFICATION
# =============================================================================
WIDGET_TYPE_MAP = {
    "EditText": "text_input",
    "AutoCompleteTextView": "text_input",
    "MultiAutoCompleteTextView": "text_input",
    "TextInputEditText": "text_input",
    "SearchEditText": "text_input",
    "NumberPicker": "number_picker",
    "DatePicker": "date_picker",
    "TimePicker": "time_picker",
    "Spinner": "dropdown",
    "AppCompatSpinner": "dropdown",
    "CheckBox": "checkbox",
    "AppCompatCheckBox": "checkbox",
    "Switch": "toggle",
    "SwitchCompat": "toggle",
    "ToggleButton": "toggle",
    "RadioButton": "radio",
    "RadioGroup": "radio_group",
    "SeekBar": "slider",
    "RatingBar": "rating",
    "Button": "button",
    "AppCompatButton": "button",
    "MaterialButton": "button",
    "ImageButton": "button",
    "FloatingActionButton": "button",
    "TextView": "text",
    "ImageView": "image",
    "RecyclerView": "scrollable_list",
    "ListView": "scrollable_list",
    "ScrollView": "scrollable_container",
    "NestedScrollView": "scrollable_container",
    "ViewPager": "pager",
    "ViewPager2": "pager",
    "TabLayout": "tab_bar",
    "BottomNavigationView": "bottom_nav",
    "NavigationRailView": "nav_rail",
    "WebView": "webview",
}


def classify_widget(class_name):
    short = class_name.split(".")[-1] if class_name else ""
    if short in WIDGET_TYPE_MAP:
        return WIDGET_TYPE_MAP[short]
    for key, val in WIDGET_TYPE_MAP.items():
        if key.lower() in short.lower():
            return val
    lower = short.lower()
    if "edit" in lower or "input" in lower:
        return "text_input"
    if "button" in lower or "btn" in lower:
        return "button"
    if "check" in lower:
        return "checkbox"
    if "switch" in lower or "toggle" in lower:
        return "toggle"
    if "picker" in lower:
        return "number_picker"
    if "spinner" in lower or "dropdown" in lower:
        return "dropdown"
    if "seek" in lower or "slider" in lower:
        return "slider"
    if "web" in lower:
        return "webview"
    return "unknown"


# =============================================================================
# INFRASTRUCTURE
# =============================================================================

def compute_screen_hash(img_bytes):
    return hashlib.md5(img_bytes).hexdigest() if img_bytes else None

def compute_stable_content_hash(img_bytes):
    """
    Hashes the screen content while ignoring the top 6% (status bar).
    Prevents false-positives caused by the clock updating or battery changing.
    """
    if not img_bytes:
        return None
    try:
        from PIL import Image
        import io
        pil_img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
        w, h = pil_img.size
        # Crop out the top 6% (status bar) and bottom 2% (Android gesture pill)
        cropped = pil_img.crop((0, int(h * 0.06), w, int(h * 0.98)))
        return hashlib.md5(cropped.tobytes()).hexdigest()
    except Exception:
        # Fallback to standard hash if PIL fails
        return compute_screen_hash(img_bytes)

class NavigationNode:
    def __init__(self, screen_hash, description="", xml_fingerprint=""):
        self.screen_hash = screen_hash
        self.description = description
        self.xml_fingerprint = xml_fingerprint
        self.children = {}
        self.parent = None
        self.parent_action = None
        self.explored_actions = []
        self.has_signup = False
        self.is_dead_end = False
        self.depth = 0
        self.visit_count = 0
        self.available_actions = []

    def mark_dead_end(self):
        self.is_dead_end = True

    def add_child(self, action_desc, child_node):
        self.children[action_desc] = child_node
        child_node.parent = self
        child_node.parent_action = action_desc
        child_node.depth = self.depth + 1




class AgentMemory:
    MAX_LOG_SIZE = 500

    def __init__(self, session_dir=None):
        self.session_dir = session_dir
        self.history = []
        self.failed_actions = []
        self.visited_screens = []
        self.dismissed_dialogs = []
        self.explored_paths = []
        self.filled_fields = {}
        self.form_errors = []
        self.password_attempts = []
        self.captcha_detected = False
        self.webview_encountered = False
        self.back_stack = []
        self.screen_hash_history = []
        self.screen_signature_history = []
        self._save_counter = 0

    def add_thought(self, text):
        entry = f"[{datetime.now().strftime('%H:%M:%S')}] {text}"
        self.history.append(entry)
        if len(self.history) > self.MAX_LOG_SIZE:
            self.history = self.history[-self.MAX_LOG_SIZE:]
        self._maybe_save()

    def log_failure(self, action, reason):
        self.failed_actions.append({"action": action, "reason": reason, "time": time.time()})
        if len(self.failed_actions) > self.MAX_LOG_SIZE:
            self.failed_actions = self.failed_actions[-self.MAX_LOG_SIZE:]

    def record_screen(self, screen_hash, screen_sig, state):
        self.visited_screens.append({"hash": screen_hash, "sig": screen_sig, "state": state, "time": time.time()})
        self.screen_hash_history.append(screen_hash)
        self.screen_signature_history.append(screen_sig)

    def record_exploration(self, path_desc):
        self.explored_paths.append(path_desc)

    def mark_field_filled(self, field_name, value):
        self.filled_fields[field_name.lower().strip()] = value

    def is_field_filled(self, field_name):
        return field_name.lower().strip() in self.filled_fields

    def record_form_error(self, error_msg):
        self.form_errors.append({"error": error_msg, "time": time.time()})

    def is_screen_stuck(self, current_hash, threshold=None):
        threshold = threshold or MAX_SAME_SCREEN_REPEATS
        recent = self.screen_hash_history[-threshold:]
        return len(recent) >= threshold and all(h == current_hash for h in recent)

    def push_back_stack(self, state_desc):
        self.back_stack.append(state_desc)
        if len(self.back_stack) > 10:
            self.back_stack.pop(0)

    def get_context(self):
        return "\n".join(self.history[-15:])

    def get_recent_failures(self):
        return "\n".join(f["action"] + ": " + f["reason"] for f in self.failed_actions[-5:])

    def get_explored_paths(self):
        return "\n".join(self.explored_paths[-10:])

    def get_filled_summary(self):
        return ", ".join(f"{k}='{v}'" for k, v in self.filled_fields.items())

    def get_error_summary(self):
        return "\n".join(e["error"] for e in self.form_errors[-5:])

    def _maybe_save(self):
        self._save_counter += 1
        if self._save_counter % 10 == 0:
            self.save_memory()

    def save_memory(self):
        if not self.session_dir:
            return
        state = {
            "timestamp": datetime.now().isoformat(),
            "decision_log_count": len(self.history),
            "recent_decisions": self.history[-30:],
            "failed_actions": self.failed_actions[-20:],
            "visited_screens_count": len(self.visited_screens),
            "dismissed_dialogs": self.dismissed_dialogs,
            "explored_paths": self.explored_paths[-20:],
            "filled_fields": dict(self.filled_fields),
            "form_errors": [
                {"error": e["error"], "time": e["time"]}
                for e in self.form_errors
            ],
            "password_attempts": self.password_attempts,
            "captcha_detected": self.captcha_detected,
            "webview_encountered": self.webview_encountered,
            "back_stack": self.back_stack,
            "screen_hash_history": self.screen_hash_history[-30:],
            "screen_signature_history": self.screen_signature_history[-30:],
        }
        try:
            with open(f"{self.session_dir}/agent_memory.json", "w") as f:
                json.dump(state, f, indent=2)
        except IOError as e:
            print(f"      ⚠️ Could not save memory: {e}")


class PasswordGenerator:
    DEFAULT_RULES = {
        "min_length": 12,
        "max_length": 32,
        "require_upper": True,
        "require_lower": True,
        "require_digit": True,
        "require_special": True,
        "allowed_special": "!@#$%^&*",
        "no_special": False,
    }

    def __init__(self):
        self.rules = dict(self.DEFAULT_RULES)
        self.attempt = 0

    def update_rules(self, parsed_requirements):
        for key, val in parsed_requirements.items():
            if key in self.rules:
                self.rules[key] = val

    def generate(self):
        self.attempt += 1
        length = max(self.rules["min_length"], 12)
        length = min(length, self.rules["max_length"])
        chars = []
        if self.rules["require_upper"]:
            chars.append(random.choice(string.ascii_uppercase))
        if self.rules["require_lower"]:
            chars.append(random.choice(string.ascii_lowercase))
        if self.rules["require_digit"]:
            chars.append(random.choice(string.digits))
        if self.rules["require_special"] and not self.rules["no_special"]:
            chars.append(random.choice(self.rules["allowed_special"]))
        remaining = length - len(chars)
        pool = string.ascii_letters + string.digits
        if not self.rules["no_special"]:
            pool += self.rules["allowed_special"]
        chars.extend(random.choices(pool, k=remaining))
        random.shuffle(chars)
        return "".join(chars)


class Persona:
    def __init__(self):
        self.pw_gen = PasswordGenerator()

        # Stable identity values explicitly configured for this automation
        # identity. Do NOT create random/synthetic contact/history data here.
        self.email = IDENTITY_EMAIL
        self.password = IDENTITY_PASSWORD
        self.first_name = ""
        self.last_name = ""
        self.full_name = ""
        self.username = self.email.split("@", 1)[0] if "@" in self.email else ""

        # Cross-app facts are UNKNOWN until supplied by the identity profile.
        # Empty is intentional: missing data is safer than invented data.
        self.phone = ""
        self.dob_year = ""
        self.dob_month = ""
        self.dob_day = ""
        self.dob_full = ""
        self.dob_iso = ""
        self.gender = ""
        self.country = ""
        self.zip_code = ""
        self.city = ""
        self.state = ""
        self.address = ""
        self.age = ""
        self.university = DEFAULT_UNIVERSITY
        self.extra_values = {}

    def regenerate_password(self, parsed_requirements=None):
        if parsed_requirements:
            self.pw_gen.update_rules(parsed_requirements)
        self.password = self.pw_gen.generate()
        return self.password

    def get_value(self, key, target_desc=None):
        key = str(key or "").lower().replace(" ", "_").replace("-", "_")
        td = (target_desc or "").lower().replace(" ", "_").replace("-", "_")
        combined = f"{key} {td}"

        if any(kw in combined for kw in ["first", "fname", "given"]):
            return self.first_name
        if any(kw in combined for kw in ["last", "surname", "lname", "family"]):
            return self.last_name

        mapping = [
            (["email", "mail", "e_mail"], self.email),
            (["pass", "pw"], self.password),
            (["university", "college", "school", "institution"], self.university),
            (["full_name"], self.full_name),
            (["name"], self.full_name),
            (["user", "nick", "display", "handle", "screen"], self.username),
            (["phone", "mobile", "tel", "cell"], self.phone),
            (["dob_iso", "birth_iso"], self.dob_iso),
            (["birth_year", "year_of_birth"], self.dob_year),
            (["birth_month", "month_of_birth"], self.dob_month),
            (["birth_day", "day_of_birth"], self.dob_day),
            (["year"], self.dob_year),
            (["month"], self.dob_month),
            (["day"], self.dob_day),
            (["dob", "birth", "date_of", "birthday"], self.dob_full),
            (["age"], self.age),
            (["gender", "sex"], self.gender),
            (["country", "nation", "region"], self.country),
            (["zip", "postal"], self.zip_code),
            (["city", "town"], self.city),
            (["state", "province"], self.state),
            (["address", "street"], self.address),
        ]
        for keywords, value in mapping:
            if any(kw in key for kw in keywords):
                return value
        if td:
            for keywords, value in mapping:
                if any(kw in td for kw in keywords):
                    return value

        for lookup in (key, td):
            if lookup and lookup in self.extra_values:
                return self.extra_values[lookup]

        return None

    def as_dict(self, redact_password=False):
        data = {
            "email": self.email,
            "password": "[REDACTED]" if redact_password else self.password,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "full_name": self.full_name,
            "username": self.username,
            "phone": self.phone,
            "dob_year": self.dob_year,
            "dob_month": self.dob_month,
            "dob_day": self.dob_day,
            "dob_full": self.dob_full,
            "dob_iso": self.dob_iso,
            "gender": self.gender,
            "country": self.country,
            "zip_code": self.zip_code,
            "city": self.city,
            "state": self.state,
            "address": self.address,
            "age": self.age,
            "university": self.university,
        }
        data.update(self.extra_values)
        return data


# =============================================================================
# DEVICE CONTROLLER
# =============================================================================
class DeviceController:
    def __init__(self, package_name):
        self.package_name = package_name
        self.local_video_recorder = None
        self.screen_size = self._get_screen_size()
        self._gmail_package = "com.google.android.gm"
        self._browser_packages = [
            "com.android.chrome",
            "org.chromium.webview_shell",
            "com.android.browser",
        ]

    def adb(self, cmd, timeout=20):
        recorder = self.local_video_recorder
        if recorder is not None:
            recorder.before_command(cmd)
        try:
            r = subprocess.run(
                f"adb shell {cmd}", shell=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                timeout=timeout
            )
            return r.stdout.decode('utf-8', errors='ignore').strip()
        except subprocess.TimeoutExpired:
            print(f"      ⚠️ ADB command timed out after {timeout}s: {cmd[:100]}")
            return ""
        finally:
            if recorder is not None:
                recorder.after_command(cmd)

    def _get_screen_size(self):
        o = self.adb("wm size")
        if "Physical size:" in o:
            return list(map(int, o.split("Physical size: ")[1].strip().split("x")))
        return [1080, 2400]

    def get_screenshot_bytes(self):
        self.adb("screencap -p /sdcard/screen.png")
        try:
            with NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                subprocess.run(
                    f"adb pull /sdcard/screen.png {tmp.name}",
                    shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
                with open(tmp.name, "rb") as f:
                    data = f.read()
            os.unlink(tmp.name)
            return data if len(data) > 100 else None
        except:
            return None

    def get_host_screenshot_bytes(self):
        if not pyautogui:
            return None
        try:
            screenshot = pyautogui.screenshot()
            with io.BytesIO() as output:
                screenshot.save(output, format="PNG")
                data = output.getvalue()
            return data
        except Exception as e:
            print(f"      ⚠️ Host Screenshot failed: {e}")
            return None

    def get_ui_xml(self):
        # UIAutomator occasionally hangs on complex Compose/autocomplete screens.
        # IMPORTANT: remove the previous dump first. Otherwise a failed/timeout
        # dump can cause us to pull stale XML from the PREVIOUS screen and then
        # tap completely wrong coordinates.
        self.adb("rm -f /sdcard/window_dump.xml", timeout=3)
        self.adb("uiautomator dump /sdcard/window_dump.xml", timeout=8)

        exists = self.adb(
            "[ -s /sdcard/window_dump.xml ] && echo OK || echo MISSING",
            timeout=3
        )
        if "OK" not in exists:
            print("      ⚠️ UIAutomator produced no fresh hierarchy; using visual fallback")
            return ""

        try:
            with NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
                subprocess.run(
                    f"adb pull /sdcard/window_dump.xml {tmp.name}",
                    shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    timeout=8
                )
                with open(tmp.name, "r", encoding='utf-8', errors='ignore') as f:
                    data = f.read()
            os.unlink(tmp.name)

            # Reject obviously empty/corrupt hierarchy files.
            if "<hierarchy" not in data or len(data) < 100:
                print("      ⚠️ Fresh UI XML was empty/corrupt; using visual fallback")
                return ""
            return data
        except subprocess.TimeoutExpired:
            print("      ⚠️ UI XML pull timed out; continuing with visual state")
            try:
                os.unlink(tmp.name)
            except Exception:
                pass
            return ""
        except Exception:
            return ""

    def get_cdp_screenshot(self):
        """
        Attempts to forward the DevTools remote port 9222 and check connectivity.
        Returns None to transition smoothly to sequential mechanical scroll pages.
        """
        self.adb("adb forward tcp:9222 localabstract:chrome_devtools_remote")
        try:
            url = "http://localhost:9222/json/list"
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=1.5) as response:
                targets = json.loads(response.read().decode())
            if targets:
                print(f"      🌐 CDP Remote Debugging active on targets: {len(targets)}")
            return None
        except Exception:
            return None

    def capture_sequential_webview_pages(self, context_name, max_pages=3):
        """
        Takes cleanly formatted sequential screenshots of long-scrollable WebViews or browsers,
        automatically detecting when the bottom of the page is reached and returning the viewport
        precisely back to the top.
        """
        print(f"      🏞️ Capturing sequential WebView pages for '{context_name}'...")
        w, h = self.screen_size
        pages = []

        # Ensure we are top of the viewport
        self.fast_scroll_up(2)
        time.sleep(1.0)

        last_page_hash = None
        scrolled_count = 0

        for i in range(max_pages):
            print(f"         📸 Capturing sequential page {i+1}/{max_pages}...")
            img_bytes = self.get_screenshot_bytes()
            if not img_bytes:
                break

            # Use stable content hash (ignoring status/clock/battery bars) to check if content changed
            current_hash = compute_stable_content_hash(img_bytes)

            # If the screen content did not change, we have reached the bottom of the page
            if current_hash == last_page_hash:
                print(f"         🔚 Reached bottom of page (content stabilized on page {i}). Early exit.")
                break

            pages.append(img_bytes)
            last_page_hash = current_hash

            # If this is the last page, we do not need to scroll down further
            if i == max_pages - 1:
                break

            # Scroll down exactly 85% of viewport height
            start_y = int(h * 0.90)
            end_y = int(h * 0.15)
            self.adb(f"input swipe {w // 2} {start_y} {w // 2} {end_y} 600")
            scrolled_count += 1
            time.sleep(1.2)

        # Return cleanly back to the top by scrolling up exactly the number of times we scrolled down
        if scrolled_count > 0:
            print(f"         📜 Returning back to top of viewport (scrolled up {scrolled_count} times)...")
            self.fast_scroll_up(scrolled_count)

        return pages

    def clear_data(self):
        self.adb(f"pm clear {self.package_name}")

    def launch_app(self):
        self.adb(f"monkey -p {self.package_name} -c android.intent.category.LAUNCHER 1")
        time.sleep(6)

    def launch_package(self, package):
        self.adb(f"monkey -p {package} -c android.intent.category.LAUNCHER 1")
        time.sleep(4)

    def bring_to_front(self, package):
        self.adb(f"monkey -p {package} -c android.intent.category.LAUNCHER 1")
        time.sleep(3)

    def get_current_focused_package(self):
        result = self.adb("dumpsys window | grep mCurrentFocus")
        return result

    def is_package_in_foreground(self, package):
        focus = self.get_current_focused_package()
        return package in focus

    def tap(self, x, y):
        """
        Execute a screen tap only when coordinates are physically valid.

        This is a hard mechanical invariant: no model/runtime path may ever send
        absurd coordinates such as (95040, 2155200) to adb.
        """
        try:
            x = int(round(float(x)))
            y = int(round(float(y)))
        except (TypeError, ValueError):
            print(f"      🛡️ Refusing invalid tap coordinates: ({x}, {y})")
            return False

        w, h = self.screen_size
        if not (0 <= x < w and 0 <= y < h):
            print(
                f"      🛡️ Refusing OUT-OF-BOUNDS tap ({x}, {y}) "
                f"for screen {w}x{h}"
            )
            return False

        print(f"      👆 Tap ({x}, {y})")
        self.adb(f"input tap {x} {y}")
        human_delay(PACE_TAP_DELAY)
        return True

    def long_press(self, x, y, duration_ms=1000):
        print(f"      👆 Long Press ({x}, {y})")
        self.adb(f"input swipe {x} {y} {x} {y} {duration_ms}")

    def input_text_safe(self, text):
        for char in text:
            if char in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789":
                self.adb(f"input text '{char}'")
            elif char == " ":
                self.adb("input text '%s'")
            elif char == "@":
                self.adb("input text '@'")
            elif char == ".":
                self.adb("input text '.'")
            elif char == "_":
                self.adb("input text '_'")
            elif char == "-":
                self.adb("input text '-'")
            elif char == "+":
                self.adb("input text '+'")
            else:
                self.adb(f"input text '{char}'")
            time.sleep(random.uniform(0.03, 0.08))

    def clear_field(self):
        self.adb("input keyevent KEYCODE_MOVE_END")
        for _ in range(60):
            self.adb("input keyevent 67")

    def select_all_and_delete(self):
        self.adb("input keyevent --longpress 29")
        time.sleep(0.3)
        self.adb("input keyevent 67")

    def dismiss_keyboard(self):
        # Keyboard is disabled system-wide — nothing to dismiss.
        pass

    def press_back(self):
        print("      ⬅️ Back")
        self.adb("input keyevent 4")
        human_delay(PACE_NAVIGATION_DELAY)

    def press_enter(self):
        self.adb("input keyevent 66")

    def press_tab(self):
        self.adb("input keyevent 61")

    def press_home(self):
        self.adb("input keyevent 3")
        time.sleep(1)

    def press_recent_apps(self):
        self.adb("input keyevent 187")
        time.sleep(1.5)

    def swipe_within_bounds(self, x, y_start, y_end, duration=300):
        print(f"      📜 Swipe ({x}, {y_start}) -> ({x}, {y_end})")
        self.adb(f"input swipe {x} {y_start} {x} {y_end} {duration}")
        human_delay(PACE_PICKER_SWIPE_DELAY)

    def swipe_left(self):
        w, h = self.screen_size
        self.adb(f"input swipe {int(w * 0.85)} {int(h * 0.5)} {int(w * 0.15)} {int(h * 0.5)} {random.randint(350, 500)}")

    def swipe_right(self):
        w, h = self.screen_size
        self.adb(f"input swipe {int(w * 0.15)} {int(h * 0.5)} {int(w * 0.85)} {int(h * 0.5)} {random.randint(350, 500)}")

    def swipe_up(self, distance="half"):
        w, h = self.screen_size
        cx = w // 2
        magnitudes = {"small": (0.6, 0.4), "half": (0.7, 0.3), "large": (0.85, 0.15)}
        s, e = magnitudes.get(distance, (0.7, 0.3))
        print(f"      📜 Scroll Down ({distance})")
        self.adb(f"input swipe {cx} {int(h * s)} {cx} {int(h * e)} {random.randint(400, 600)}")

    def swipe_down(self, distance="half"):
        w, h = self.screen_size
        cx = w // 2
        magnitudes = {"small": (0.4, 0.6), "half": (0.3, 0.7), "large": (0.15, 0.85)}
        s, e = magnitudes.get(distance, (0.3, 0.7))
        print(f"      📜 Scroll Up ({distance})")
        self.adb(f"input swipe {cx} {int(h * s)} {cx} {int(h * e)} {random.randint(400, 600)}")

    def scroll_down_half(self):
        print("      📜 Scroll Down (half)")
        w, h = self.screen_size
        self.adb(f"input swipe {w // 2} {int(h * 0.75)} {w // 2} {int(h * 0.35)} 800")
        time.sleep(1.8)

    def fast_scroll_up(self, count):
        print("      📜 Fast Scroll Up")
        w, h = self.screen_size
        for _ in range(count):
            self.adb(f"input swipe {w // 2} {int(h * 0.3)} {w // 2} {int(h * 0.85)} 200")
            time.sleep(0.4)
        time.sleep(2.0)

    def get_current_package(self):
        result = self.adb("dumpsys window | grep mCurrentFocus")
        return result

    def is_keyboard_shown(self):
        result = self.adb("dumpsys input_method | grep mInputShown")
        return "mInputShown=true" in result

    def is_in_webview(self):
        focus = self.get_current_package()
        return "WebView" in focus or "chromium" in focus.lower() or "browser" in focus.lower()

    def is_gmail_installed(self):
        result = self.adb(f"pm list packages | grep {self._gmail_package}")
        return self._gmail_package in result

    def get_installed_browsers(self):
        installed = []
        for pkg in self._browser_packages:
            result = self.adb(f"pm list packages | grep {pkg}")
            if pkg in result:
                installed.append(pkg)
        return installed

    def open_url_in_browser(self, url):
        self.adb(f'am start -a android.intent.action.VIEW -d "{url}"')
        time.sleep(4)

    def open_gmail(self):
        if self.is_gmail_installed():
            self.launch_package(self._gmail_package)
            return True
        self.open_url_in_browser("https://mail.google.com")
        return True

    def disable_autofill(self):
        self.adb("settings put secure autofill_service null")
        self.adb("settings put secure autofill_user_data_enabled 0")
        self.adb("settings put global autofill_logging_level 0")
        # Disable Chrome autofill and save passwords
        self.adb("settings put secure smart_selection 0")
        print("      🚫 Autofill service disabled.")

    def enable_autofill(self):
        self.adb("settings put secure autofill_service com.google.android.gms/.autofill.service.AutofillService")
        self.adb("settings put secure autofill_user_data_enabled 1")
        print("      ✅ Autofill service re-enabled.")

    def return_to_app(self):
        self.bring_to_front(self.package_name)
        time.sleep(3)

    def push_file_to_device(self, local_path, device_path):
        """Push a host file to Android and make it visible to document pickers."""
        local_path = os.path.abspath(os.path.expanduser(str(local_path)))
        device_dir = os.path.dirname(device_path) or DEVICE_RESUME_DIR

        if not os.path.isfile(local_path):
            print(f"      ❌ Local file not found: {local_path}")
            return False

        try:
            subprocess.run(
                ["adb", "shell", "mkdir", "-p", device_dir],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False
            )
            result = subprocess.run(
                ["adb", "push", local_path, device_path],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False
            )
            if result.returncode != 0:
                print(f"      ❌ adb push failed: {(result.stderr or result.stdout).strip()[:250]}")
                return False

            # Notify MediaStore / DocumentsUI so a freshly pushed PDF appears immediately.
            subprocess.run(
                [
                    "adb", "shell", "am", "broadcast",
                    "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
                    "-d", f"file://{device_path}",
                ],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False
            )
            print(f"      📄 Resume staged on device: {device_path}")
            return True
        except Exception as e:
            print(f"      ❌ Failed to stage file on Android: {e}")
            return False


# =============================================================================
# UI HIERARCHY PARSER
# =============================================================================
class UIHierarchy:
    @staticmethod
    def parse_xml_to_string(xml_str, max_elements=80):
        if not xml_str:
            return "No XML Data"
        try:
            root = ET.fromstring(xml_str)
        except:
            return "XML Parse Error"

        elements = []
        for node in root.iter():
            bounds = node.attrib.get("bounds", "[0,0][0,0]")
            text = node.attrib.get("text", "")
            desc = node.attrib.get("content-desc", "")
            cls = node.attrib.get("class", "")
            clickable = node.attrib.get("clickable", "false")
            checkable = node.attrib.get("checkable", "false")
            checked = node.attrib.get("checked", "false")
            enabled = node.attrib.get("enabled", "true")
            scrollable = node.attrib.get("scrollable", "false")
            resource_id = node.attrib.get("resource-id", "")
            password = node.attrib.get("password", "false")
            focused = node.attrib.get("focused", "false")

            label = text or desc or ""
            short_cls = cls.split(".")[-1] if cls else ""
            widget_type = classify_widget(cls)

            flags = []
            if clickable == "true": flags.append("CLICK")
            if checkable == "true": flags.append(f"CHECK({'✓' if checked == 'true' else '○'})")
            if scrollable == "true": flags.append("SCROLL")
            if "EditText" in cls: flags.append("INPUT")
            if password == "true": flags.append("PASSWORD")
            if enabled == "false": flags.append("DISABLED")
            if focused == "true": flags.append("FOCUSED")

            if label or flags:
                flag_str = f" [{','.join(flags)}]" if flags else ""
                rid_str = f" id={resource_id}" if resource_id else ""
                elements.append(f"- [{short_cls}|{widget_type}] {label}{flag_str}{rid_str} | {bounds}")

        return "\n".join(elements[:max_elements])

    @staticmethod
    def find_clickable_elements(xml_str):
        if not xml_str:
            return []
        try:
            root = ET.fromstring(xml_str)
        except:
            return []

        elements = []
        for node in root.iter():
            clickable = node.attrib.get("clickable", "false") == "true"
            checkable = node.attrib.get("checkable", "false") == "true"
            if not (clickable or checkable):
                continue
            text = node.attrib.get("text", "")
            desc = node.attrib.get("content-desc", "")
            bounds = node.attrib.get("bounds", "")
            resource_id = node.attrib.get("resource-id", "")
            cls = node.attrib.get("class", "")
            short_cls = cls.split(".")[-1]
            enabled = node.attrib.get("enabled", "true") == "true"
            widget_type = classify_widget(cls)

            m = re.findall(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds)
            if m:
                x1, y1, x2, y2 = int(m[0][0]), int(m[0][1]), int(m[0][2]), int(m[0][3])
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                elements.append({
                    "text": text, "desc": desc, "class": short_cls,
                    "full_class": cls, "widget_type": widget_type,
                    "resource_id": resource_id, "bounds": bounds,
                    "center": (cx, cy), "rect": (x1, y1, x2, y2),
                    "checkable": checkable,
                    "checked": node.attrib.get("checked", "false") == "true",
                    "enabled": enabled
                })
        return elements

    @staticmethod
    def find_input_fields(xml_str):
        if not xml_str:
            return []
        try:
            root = ET.fromstring(xml_str)
        except:
            return []

        fields = []
        for node in root.iter():
            cls = node.attrib.get("class", "")
            wt = classify_widget(cls)
            if wt != "text_input":
                continue
            text = node.attrib.get("text", "")
            hint = node.attrib.get("content-desc", "")
            bounds = node.attrib.get("bounds", "")
            resource_id = node.attrib.get("resource-id", "")
            password = node.attrib.get("password", "false") == "true"
            enabled = node.attrib.get("enabled", "true") == "true"
            focused = node.attrib.get("focused", "false") == "true"

            m = re.findall(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds)
            if m:
                x1, y1, x2, y2 = int(m[0][0]), int(m[0][1]), int(m[0][2]), int(m[0][3])
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                text_norm = text.strip().lower()
                hint_norm = hint.strip().lower()
                placeholder_examples = {
                    "you@example.com", "name@example.com", "email@example.com",
                    "your@email.com", "your.email@example.com",
                }
                looks_like_placeholder = (
                    text_norm in placeholder_examples or
                    (not hint_norm and text_norm.startswith("enter your ")) or
                    (not hint_norm and text_norm in {
                        "email", "email address", "password", "first name",
                        "last name", "username", "phone number", "zip code",
                    })
                )

                fields.append({
                    "text": text, "hint": hint, "resource_id": resource_id,
                    "bounds": bounds, "center": (cx, cy), "rect": (x1, y1, x2, y2),
                    "is_empty": text == "" or text == hint or looks_like_placeholder,
                    "looks_like_placeholder": looks_like_placeholder,
                    "is_password": password, "enabled": enabled,
                    "focused": focused
                })
        return fields

    @staticmethod
    def find_picker_elements(xml_str):
        if not xml_str:
            return []
        try:
            root = ET.fromstring(xml_str)
        except:
            return []

        pickers = []
        for node in root.iter():
            cls = node.attrib.get("class", "")
            wt = classify_widget(cls)
            if wt not in ("number_picker", "date_picker", "time_picker", "dropdown"):
                continue
            bounds = node.attrib.get("bounds", "")
            text = node.attrib.get("text", "")
            desc = node.attrib.get("content-desc", "")
            resource_id = node.attrib.get("resource-id", "")

            m = re.findall(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds)
            if m:
                x1, y1, x2, y2 = int(m[0][0]), int(m[0][1]), int(m[0][2]), int(m[0][3])
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                child_texts = []
                for child in node.iter():
                    ct = child.attrib.get("text", "")
                    if ct:
                        child_texts.append(ct)
                pickers.append({
                    "type": wt, "text": text, "desc": desc,
                    "resource_id": resource_id, "bounds": bounds,
                    "center": (cx, cy), "rect": (x1, y1, x2, y2),
                    "child_values": child_texts,
                    "class": cls.split(".")[-1]
                })
        return pickers

    @staticmethod
    def has_scrollable(xml_str):
        if not xml_str:
            return False
        try:
            root = ET.fromstring(xml_str)
        except:
            return False

        scroll_classes = [
            "androidx.recyclerview.widget.RecyclerView",
            "android.widget.ListView",
            "android.widget.ScrollView",
            "android.widget.GridView"
        ]

        for n in root.iter():
            if n.attrib.get("scrollable") == "true":
                return True
            if any(sc in n.attrib.get("class", "") for sc in scroll_classes):
                return True

        return False

    @staticmethod
    def detect_webview(xml_str):
        if not xml_str:
            return False
        return "android.webkit.WebView" in xml_str or "android.widget.TextView" in xml_str and "id.awin.com" in xml_str

    @staticmethod
    def extract_visible_text(xml_str):
        if not xml_str:
            return ""
        try:
            root = ET.fromstring(xml_str)
        except:
            return ""
        texts = []
        for node in root.iter():
            t = node.attrib.get("text", "")
            if t:
                texts.append(t)
        return "\n".join(texts)

    @staticmethod
    def get_xml_fingerprint(xml_str):
        if not xml_str:
            return ""
        try:
            root = ET.fromstring(xml_str)
        except:
            return ""
        structure = []
        for node in root.iter():
            cls = node.attrib.get("class", "").split(".")[-1]
            rid = node.attrib.get("resource-id", "")
            structure.append(f"{cls}:{rid}")
        return hashlib.md5("|".join(structure).encode()).hexdigest()[:12]

    @staticmethod
    def get_screen_signature(xml_str):
        if not xml_str:
            return ""
        try:
            root = ET.fromstring(xml_str)
        except:
            return ""
        structure = []
        for node in root.iter():
            cls = node.attrib.get("class", "").split(".")[-1]
            rid = node.attrib.get("resource-id", "")
            text = node.attrib.get("text", "").strip()
            text_snippet = text[:20] if text else ""
            if cls or rid or text_snippet:
                structure.append(f"{cls}:{rid}:{text_snippet}")
        return hashlib.md5("|".join(structure).encode()).hexdigest()[:12]

    @staticmethod
    def get_viewport_fingerprint(xml_str):
        """
        Fingerprint the CURRENT visible viewport, not merely screen structure.

        Includes text, bounds, selected/checked/focused state. This is used for
        panorama restoration where two scroll positions may share the same
        classes/resource IDs but are NOT the same viewport.
        """
        if not xml_str:
            return ""
        try:
            root = ET.fromstring(xml_str)
        except Exception:
            return ""

        rows = []
        for node in root.iter():
            cls = node.attrib.get("class", "").split(".")[-1]
            rid = node.attrib.get("resource-id", "")
            txt = node.attrib.get("text", "").strip()
            desc = node.attrib.get("content-desc", "").strip()
            bounds = node.attrib.get("bounds", "")
            selected = node.attrib.get("selected", "false")
            checked = node.attrib.get("checked", "false")
            focused = node.attrib.get("focused", "false")
            if cls or rid or txt or desc:
                rows.append(
                    f"{cls}|{rid}|{txt[:80]}|{desc[:80]}|{bounds}|"
                    f"{selected}|{checked}|{focused}"
                )
        return hashlib.sha256("\n".join(rows).encode()).hexdigest()[:20]

    @staticmethod
    def catalog_interactive_elements(xml_str):
        if not xml_str:
            return []
        try:
            root = ET.fromstring(xml_str)
        except:
            return []

        elements = []
        for node in root.iter():
            clickable = node.attrib.get("clickable", "false") == "true"
            checkable = node.attrib.get("checkable", "false") == "true"
            scrollable = node.attrib.get("scrollable", "false") == "true"
            cls = node.attrib.get("class", "")
            wt = classify_widget(cls)

            if not (clickable or checkable or scrollable):
                continue

            text = node.attrib.get("text", "")
            desc = node.attrib.get("content-desc", "")
            resource_id = node.attrib.get("resource-id", "")
            enabled = node.attrib.get("enabled", "true") == "true"
            bounds = node.attrib.get("bounds", "")

            label = text or desc or resource_id or ""
            if not label and not scrollable:
                continue

            m = re.findall(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds)
            if not m:
                continue
            x1, y1, x2, y2 = int(m[0][0]), int(m[0][1]), int(m[0][2]), int(m[0][3])
            if (x2 - x1) < 10 or (y2 - y1) < 10:
                continue

            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

            signup_score = 0
            label_lower = label.lower()
            for indicator in SIGNUP_INDICATORS:
                if indicator in label_lower:
                    signup_score = 100
                    break
            for indicator in AUTH_INDICATORS:
                if indicator in label_lower:
                    signup_score = max(signup_score, 80)
                    break

            for pattern in NAV_EXPLORATION_PRIORITY:
                if "keywords" in pattern:
                    for kw in pattern["keywords"]:
                        if kw.startswith("_"):
                            continue
                        if kw in label_lower:
                            signup_score = max(signup_score, pattern["priority"])
                if "resource_id_patterns" in pattern:
                    for rp in pattern["resource_id_patterns"]:
                        if rp in resource_id.lower():
                            signup_score = max(signup_score, pattern["priority"])

            elements.append({
                "label": label,
                "text": text,
                "desc": desc,
                "resource_id": resource_id,
                "widget_type": wt,
                "center": (cx, cy),
                "rect": (x1, y1, x2, y2),
                "enabled": enabled,
                "clickable": clickable,
                "scrollable": scrollable,
                "signup_score": signup_score,
            })

        elements.sort(key=lambda e: e["signup_score"], reverse=True)
        return elements


# =============================================================================
# APP CATEGORY DETECTOR
# =============================================================================
class AppCategoryDetector:
    CATEGORY_RULES = {
        "fitness":    {"pkg": ["fit", "workout", "gym", "exercise", "training", "muscle"],
                       "text": ["workout", "exercise", "fitness", "reps", "sets", "cardio"]},
        "diet":       {"pkg": ["diet", "calorie", "cal", "nutrition", "food", "meal", "recipe", "keto", "fasting"],
                       "text": ["calorie", "nutrition", "meal plan", "macro", "diet", "food log", "weight loss"]},
        "health":     {"pkg": ["health", "medical", "med", "pharma", "wellness", "mental", "therapy", "sleep"],
                       "text": ["health", "wellness", "medical", "symptom", "doctor", "prescription", "sleep"]},
        "social":     {"pkg": ["social", "chat", "messenger", "community", "friend", "connect"],
                       "text": ["friends", "followers", "post", "share", "feed", "story", "message"]},
        "dating":     {"pkg": ["date", "dating", "match", "tinder", "bumble", "hinge", "love", "romance"],
                       "text": ["match", "swipe", "dating", "relationship", "singles", "profile photo"]},
        "finance":    {"pkg": ["bank", "finance", "pay", "wallet", "invest", "trade", "stock", "crypto", "money"],
                       "text": ["balance", "transfer", "payment", "invest", "portfolio", "bank", "wallet"]},
        "shopping":   {"pkg": ["shop", "store", "buy", "ecommerce", "cart", "market", "deal"],
                       "text": ["cart", "checkout", "buy now", "add to cart", "shop", "order", "delivery"]},
        "music":      {"pkg": ["music", "spotify", "audio", "podcast", "radio", "song", "playlist"],
                       "text": ["playlist", "song", "album", "artist", "listen", "podcast", "radio"]},
        "streaming":  {"pkg": ["video", "stream", "tv", "movie", "film", "watch", "netflix", "hulu"],
                       "text": ["watch", "stream", "episode", "series", "movie", "continue watching"]},
        "gaming":     {"pkg": ["game", "play", "quest", "puzzle", "arcade", "rpg"],
                       "text": ["play", "level", "score", "game", "quest", "character", "coins"]},
        "education":  {"pkg": ["edu", "learn", "study", "course", "school", "tutor", "language"],
                       "text": ["course", "lesson", "learn", "study", "quiz", "certificate", "progress"]},
        "productivity": {"pkg": ["task", "todo", "note", "project", "office", "doc", "calendar"],
                         "text": ["task", "project", "note", "calendar", "team", "workspace", "collaborate"]},
        "travel":     {"pkg": ["travel", "hotel", "flight", "book", "trip", "airline", "airbnb"],
                       "text": ["hotel", "flight", "booking", "trip", "destination", "check-in"]},
        "news":       {"pkg": ["news", "press", "journal", "times", "post", "media"],
                       "text": ["headline", "breaking", "article", "reporter", "subscribe", "newsletter"]},
        "vpn":        {"pkg": ["vpn", "proxy", "tunnel", "secure", "privacy"],
                       "text": ["vpn", "server", "encrypt", "protect", "privacy", "connect"]},
    }

    CATEGORY_SUBMIT_PATTERNS = {
        "fitness": ["start workout", "begin program", "start plan", "let's go",
                    "start my plan", "begin training", "activate plan"],
        "diet": ["start tracking", "begin diet", "start my plan", "start logging",
                 "begin journey", "track now", "start meal plan"],
        "health": ["book appointment", "start consultation", "submit intake",
                   "begin assessment", "start session"],
        "social": ["join community", "create profile", "find friends",
                   "start connecting", "join network"],
        "dating": ["find matches", "start matching", "discover people",
                   "begin swiping", "see who's nearby", "find love"],
        "finance": ["open account", "start investing", "activate card",
                    "fund account", "verify identity", "submit application",
                    "link bank", "confirm deposit"],
        "shopping": ["place order", "buy now", "complete purchase",
                     "confirm order", "pay now", "checkout"],
        "music": ["start listening", "start trial", "go premium",
                  "upgrade now", "start free trial"],
        "streaming": ["start watching", "begin trial", "start free trial",
                      "go premium", "subscribe now", "start membership"],
        "gaming": ["start playing", "begin adventure", "enter game",
                   "create character", "start quest"],
        "education": ["enroll now", "start learning", "begin course",
                      "start free trial", "join class"],
        "productivity": ["create workspace", "start project", "set up team",
                         "begin setup"],
        "travel": ["book now", "confirm booking", "reserve", "complete booking",
                   "pay and book"],
        "news": ["subscribe", "start subscription", "subscribe now",
                 "start reading", "unlock access"],
        "vpn": ["connect", "start protection", "activate vpn",
                "go premium", "start secure browsing"],
    }

    CATEGORY_PAYMENT_INDICATORS = {
        "finance": ["routing number", "ssn", "social security", "account number",
                    "wire transfer", "ach", "tax id", "ein"],
        "shopping": ["credit card", "cvv", "billing address", "shipping address",
                     "card number", "expiration date"],
        "streaming": ["billing", "credit card", "payment method", "free trial then",
                      "will be charged", "auto-renew"],
        "music": ["billing", "payment method", "free trial then", "auto-renew"],
        "default": ["credit card", "card number", "cvv", "billing", "payment",
                    "subscribe", "$", "€", "£", "¥", "/month", "/year",
                    "free trial", "auto-renew", "will be charged",
                    "recurring", "cancel anytime"],
    }

    def __init__(self, package_name, app_name):
        self.package_name = package_name.lower()
        self.app_name = app_name.lower()
        self.detected_category = None
        self.category_confidence = 0.0
        self.observed_text_samples = []
        self._detect_from_package()

    def _detect_from_package(self):
        best_cat = None
        best_score = 0
        for category, rules in self.CATEGORY_RULES.items():
            score = 0
            for fragment in rules["pkg"]:
                if fragment in self.package_name:
                    score += 3
                if fragment in self.app_name:
                    score += 2
            if score > best_score:
                best_score = score
                best_cat = category
        if best_score >= 2:
            self.detected_category = best_cat
            self.category_confidence = min(best_score / 6.0, 1.0)
        else:
            self.detected_category = "unknown"
            self.category_confidence = 0.0

    def refine_from_screen_text(self, visible_text):
        if not visible_text:
            return
        text_lower = visible_text.lower()
        self.observed_text_samples.append(text_lower[:500])
        if self.category_confidence >= 0.85:
            return
        scores = {}
        for category, rules in self.CATEGORY_RULES.items():
            score = 0
            for kw in rules["text"]:
                if kw in text_lower:
                    score += 1
            if category == self.detected_category:
                score += 2
            scores[category] = score
        best_cat = max(scores, key=scores.get)
        best_score = scores[best_cat]
        if best_score >= 3:
            self.detected_category = best_cat
            self.category_confidence = min(best_score / 6.0, 1.0)

    def get_category(self):
        return self.detected_category or "unknown"

    def get_submit_patterns(self):
        cat = self.get_category()
        patterns = list(self.CATEGORY_SUBMIT_PATTERNS.get(cat, []))
        patterns.extend([
            "create account", "create", "register", "sign up", "submit",
            "finish", "complete registration", "complete", "join now", "join",
            "confirm", "done", "finish signup", "complete signup"
        ])
        return patterns

    def get_payment_indicators(self):
        cat = self.get_category()
        indicators = list(self.CATEGORY_PAYMENT_INDICATORS.get(cat, []))
        indicators.extend(self.CATEGORY_PAYMENT_INDICATORS["default"])
        return list(set(indicators))

    def get_context_summary(self):
        cat = self.get_category()
        conf = self.category_confidence
        return (f"App Category: {cat} (confidence: {conf:.0%})\n"
                f"App: {self.app_name} ({self.package_name})\n"
                f"Category-specific submit buttons to watch for: "
                f"{', '.join(self.CATEGORY_SUBMIT_PATTERNS.get(cat, [])[:5])}")


# =============================================================================
# SIGNUP FLOW TRACKER
# =============================================================================
class SignupFlowTracker:
    def __init__(self):
        self.steps = []
        self.expected_fields = {}
        self.filled_fields = set()

        self.seen_terms_screen = False
        self.seen_payment_screen = False
        self.seen_plan_selection = False
        self.seen_verification = False
        self.seen_profile_setup = False
        self.seen_permissions = False
        self.seen_onboarding_quiz = False

        self.friction_counters = {
            "total_pre_auth_screens": 0,
            "quiz_screens": 0,
            "carousel_screens": 0,
            "form_screens": 0,
            "auth_choice_screens": 0,
            "paywalls_encountered": 0,
            "terms_screens": 0,
            "popups_dismissed": 0,
            "permissions_requested": 0,
            "loading_screens": 0,
            "error_screens": 0,
            "captcha_screens": 0,
        }

        self.current_step_index = 0
        self.screens_since_last_field = 0
        self.total_form_screens = 0
        self.step_had_fields = []

        self.account_creation_detected = False
        self.account_creation_step = None
        self.account_creation_method = None
        self.post_auth_steps = 0

    def record_step(self, screen_type, screen_desc, form_fields=None,
                    has_terms=False, has_payment=False, has_plan=False,
                    has_verification=False, has_profile_setup=False,
                    has_permissions=False, has_quiz=False):

        def get_field_name(item):
            if isinstance(item, dict):
                return item.get("field_name", "unknown")
            return str(item)

        step = {
            "index": len(self.steps),
            "screen_type": screen_type,
            "description": screen_desc[:100],
            "field_count": len(form_fields) if form_fields else 0,
            "fields": [get_field_name(f) for f in (form_fields or [])],
            "timestamp": time.time(),
            "is_post_auth": self.account_creation_detected,
        }
        self.steps.append(step)
        self.current_step_index = len(self.steps) - 1

        if self.account_creation_detected:
            self.post_auth_steps += 1
        else:
            self.friction_counters["total_pre_auth_screens"] += 1
            if screen_type == "ONBOARDING_QUIZ" or has_quiz:
                self.friction_counters["quiz_screens"] += 1
            if screen_type == "ONBOARDING_CAROUSEL":
                self.friction_counters["carousel_screens"] += 1
            if screen_type in ("FORM", "DATE_PICKER"):
                self.friction_counters["form_screens"] += 1
            if screen_type in ("AUTH_CHOICE", "SIGNUP_METHOD"):
                self.friction_counters["auth_choice_screens"] += 1
            if screen_type in ("PLAN_SELECTION", "PAYMENT") or has_payment or has_plan:
                self.friction_counters["paywalls_encountered"] += 1
            if screen_type == "OVERLAY/POPUP":
                self.friction_counters["popups_dismissed"] += 1
            if screen_type == "PERMISSION_DIALOG" or has_permissions:
                self.friction_counters["permissions_requested"] += 1
            if screen_type == "LOADING":
                self.friction_counters["loading_screens"] += 1
            if screen_type == "ERROR":
                self.friction_counters["error_screens"] += 1
            if screen_type == "CAPTCHA":
                self.friction_counters["captcha_screens"] += 1
            if has_terms:
                self.friction_counters["terms_screens"] += 1

        if form_fields:
            self.screens_since_last_field = 0
            self.total_form_screens += 1
            self.step_had_fields.append(True)
            for f in form_fields:
                if isinstance(f, dict):
                    name = f.get("field_name", "").lower().strip()
                    required = f.get("required", True)
                    val_type = f.get("value_type", "text")
                else:
                    name = str(f).lower().strip()
                    required = True
                    val_type = "text"

                if name and name not in self.expected_fields:
                    self.expected_fields[name] = {
                        "seen_on_step": self.current_step_index,
                        "required": required,
                        "value_type": val_type,
                    }
        else:
            self.screens_since_last_field += 1
            self.step_had_fields.append(False)

        if has_terms: self.seen_terms_screen = True
        if has_payment: self.seen_payment_screen = True
        if has_plan: self.seen_plan_selection = True
        if has_verification: self.seen_verification = True
        if has_profile_setup: self.seen_profile_setup = True
        if has_permissions: self.seen_permissions = True
        if has_quiz: self.seen_onboarding_quiz = True

    def mark_field_filled(self, field_name):
        self.filled_fields.add(field_name.lower().strip())

    def mark_account_created(self, method="signup"):
        self.account_creation_detected = True
        self.account_creation_step = self.current_step_index
        self.account_creation_method = method

    def get_completion_ratio(self):
        if not self.expected_fields:
            return 0.0
        filled_count = sum(
            1 for f in self.expected_fields
            if f in self.filled_fields or any(f in ff for ff in self.filled_fields)
        )
        return filled_count / len(self.expected_fields)

    def get_unfilled_fields(self):
        unfilled = []
        for field_name, info in self.expected_fields.items():
            is_filled = (field_name in self.filled_fields or
                         any(field_name in ff for ff in self.filled_fields))
            if not is_filled:
                unfilled.append(field_name)
        return unfilled

    def estimate_steps_remaining(self):
        if len(self.steps) < 2:
            return (999, 0.1)
        completion = self.get_completion_ratio()
        end_signals = 0
        if completion >= 0.8: end_signals += 2
        if self.seen_terms_screen: end_signals += 1
        if self.screens_since_last_field >= 2 and self.total_form_screens >= 2: end_signals += 1
        if self.seen_payment_screen: end_signals += 2

        if end_signals >= 3: return (0, 0.8)
        elif end_signals >= 2: return (1, 0.6)
        elif completion >= 0.5: return (2, 0.4)
        else: return (999, 0.2)

    def get_flow_summary(self):
        lines = [f"Signup Flow: {len(self.steps)} steps so far"]
        lines.append(f"  Form screens: {self.total_form_screens}")
        lines.append(f"  Expected fields: {list(self.expected_fields.keys())}")
        lines.append(f"  Filled fields: {list(self.filled_fields)}")
        lines.append(f"  Completion: {self.get_completion_ratio():.0%}")
        lines.append(f"  Account created: {self.account_creation_detected} "
                     f"(method: {self.account_creation_method}, step: {self.account_creation_step})")
        lines.append(f"  Post-auth steps: {self.post_auth_steps}")

        milestones = []
        if self.seen_terms_screen: milestones.append("terms")
        if self.seen_payment_screen: milestones.append("payment")
        if self.seen_plan_selection: milestones.append("plan_selection")
        if self.seen_verification: milestones.append("verification")
        if self.seen_profile_setup: milestones.append("profile_setup")
        if self.seen_onboarding_quiz: milestones.append("quiz")
        lines.append(f"  Milestones passed: {', '.join(milestones) or 'none'}")

        lines.append(f"  --- PRE-AUTH FRICTION METRICS ---")
        lines.append(f"  Total Pre-Auth Screens: {self.friction_counters['total_pre_auth_screens']}")
        lines.append(f"  Quiz/Preference Screens: {self.friction_counters['quiz_screens']}")
        lines.append(f"  Carousel Tutorials: {self.friction_counters['carousel_screens']}")
        lines.append(f"  Auth Choice Screens: {self.friction_counters['auth_choice_screens']}")
        lines.append(f"  Paywalls Encountered: {self.friction_counters['paywalls_encountered']}")
        lines.append(f"  Popups Dismissed: {self.friction_counters['popups_dismissed']}")

        est, conf = self.estimate_steps_remaining()
        lines.append(f"  Estimated steps remaining: {est} (confidence: {conf:.0%})")
        return "\n".join(lines)


# =============================================================================
# VERIFICATION TYPE ENUM
# =============================================================================
class VerificationType:
    NONE = "none"
    DEFERRABLE = "deferrable"
    HARD_EMAIL_CODE = "hard_email_code"
    HARD_EMAIL_LINK = "hard_email_link"
    HARD_SMS_CODE = "hard_sms_code"
    HARD_PHONE_CALL = "hard_phone_call"
    INLINE_EMAIL_CODE = "inline_email_code"
    INLINE_SMS_CODE = "inline_sms_code"
    OAUTH = "oauth"
    CAPTCHA = "captcha"
    UNKNOWN = "unknown"


# =============================================================================
# VERIFICATION HANDLER v2 — Reasoning-Driven
# =============================================================================
class VerificationHandlerV2:
    MAX_VERIFICATION_STEPS = 25
    MAX_ATTEMPTS = 3

    def __init__(self, device, ai_call_fn, atomic_click_fn, capture_screen_fn,
                 persona_email, persona_password, app_name, target_package,
                 screenshot_dir=None, agent=None):
        self.device = device
        self._ai_call = ai_call_fn
        self._atomic_click = atomic_click_fn
        self._capture_screen = capture_screen_fn
        self.persona_email = persona_email
        self.persona_password = persona_password
        self.app_name = app_name
        self.target_package = target_package
        self.screenshot_dir = screenshot_dir
        self.agent = agent
        self.timeline = agent.timeline if agent else None
        self._verification_screenshot_counter = 0

        self.verification_type = VerificationType.NONE
        self.verification_plan = None
        self.code_extracted = None
        self.verification_attempts = 0
        self.verification_successful = False
        self.steps_taken = 0
        self.rejected_codes = set()
        self.resend_count = 0
        self.fresh_code_requested_at = None
        self.verification_challenge_started_at = None
        # Set when a run is resumed in VERIFICATION with a previously extracted
        # but not successfully verified code. Such a code is stale/untrusted:
        # request a fresh code BEFORE opening Gmail again.
        self.force_resend_before_email = False

        self.app_instructions = ""
        self.expected_post_verify_behavior = ""

    def _save_verification_screenshot(self, img_bytes, label, action="", target=""):
        if not img_bytes or not self.screenshot_dir:
            return None
        self._verification_screenshot_counter += 1
        safe_label = re.sub(r'[^\w]', '_', label)[:50]
        filename = (f"verification_{self._verification_screenshot_counter:02d}"
                    f"_{safe_label}_{uuid.uuid4().hex[:6]}.png")
        if self.agent is not None and hasattr(self.agent, "_save_canonical_screenshot"):
            filepath = self.agent._save_canonical_screenshot(img_bytes, filename)
            if not filepath:
                return None
            filename = os.path.basename(filepath)
            print(f"      📸 Verification screenshot: {filename}")
        else:
            filepath = f"{self.screenshot_dir}/{filename}"
            try:
                with open(filepath, "wb") as f:
                    f.write(img_bytes)
                print(f"      📸 Verification screenshot saved: {filename}")
            except IOError as e:
                print(f"      ⚠️ Could not save verification screenshot: {e}")
                return None

        if self.timeline is not None:
            self.timeline.append({
                "step": f"V{self._verification_screenshot_counter}",
                "state": "VERIFICATION",
                "action": action or label,
                "target": target,
                "screen_desc": label,
                "value_type": None,
                "phase": "VERIFICATION",
                "screenshot": filepath,
                "timestamp": time.time(),
                "pathway": self.agent.current_pathway if self.agent else "Common"
            })

        return filepath

    def _verification_foreground_context(self):
        """
        External verification intentionally leaves the target app.
        Gmail/browser are valid verification contexts, not navigation failures.
        """
        focus = self.device.get_current_focused_package() or ""
        low = focus.casefold()

        if self.target_package in focus:
            return "target_app"
        if self.device._gmail_package in focus:
            return "gmail"
        if any(pkg in focus for pkg in self.device._browser_packages):
            return "browser"
        if (
            "permissioncontroller" in low
            or "packageinstaller" in low
            or "systemui" in low
        ):
            return "system"
        return "other"

    async def _ensure_email_client_foreground(self):
        """
        Before a code/link is obtained, Gmail is the authoritative external
        context. If a wrong tap/back returns to the target app, reopen Gmail.
        """
        context = self._verification_foreground_context()

        if self.device.is_gmail_installed():
            if context != "gmail":
                print(
                    f"         📬 Verification context is '{context}', "
                    "reopening Gmail"
                )
                self.device.open_gmail()
                time.sleep(2.5)
            return self._verification_foreground_context() == "gmail"

        if context != "browser":
            print(
                f"         🌐 Verification context is '{context}', "
                "opening Gmail web"
            )
            self.device.open_url_in_browser("https://mail.google.com")
            time.sleep(3)
        return self._verification_foreground_context() == "browser"

    async def _verification_visual_point(self, img, goal, context="",
                                         min_confidence=0.72):
        """
        Locate an external verification control from the CURRENT screenshot.
        Uses normalized visual coordinates and never invokes target-app recovery.
        """
        if not img:
            return None

        # External-app controls are still normal Android UI. If the CURRENT
        # hierarchy exposes exact text such as "Search in mail", "OfferToday",
        # or a verification-email subject, use those real bounds before asking
        # vision to estimate coordinates.
        current_xml = self.device.get_ui_xml()
        if (
            self.agent is not None
            and hasattr(self.agent, "_ground_target_from_current_xml")
        ):
            structured = self.agent._ground_target_from_current_xml(
                current_xml,
                goal,
            )
            if structured:
                print(
                    f"         🎯 External structured target: "
                    f"'{goal}' -> {structured}"
                )
                return structured

        res = await self._ai_call(f"""
        EXTERNAL VERIFICATION VISUAL GROUNDING.

        GOAL:
        {goal}

        CURRENT CONTEXT:
        {context}

        Look ONLY at the CURRENT PHONE screenshot.

        Find the exact visible element that should be tapped NOW.

        RULES:
        - If opening an email, tap the EMAIL ROW / sender-subject row, not Gmail's
          search bar or toolbar.
        - If searching Gmail, tap the visible "Search in mail" control.
        - If tapping a verification link/button inside an email, tap that exact
          visible button/link.
        - Never use coordinates from an earlier screen.
        - If the requested control is not visible, found=false.
        - Return normalized PHONE coordinates.

        OUTPUT JSON:
        {{
          "found": true,
          "element_text": "exact visible label or row",
          "x_pct": 0.50,
          "y_pct": 0.45,
          "confidence": 0.95,
          "reasoning": "brief visual evidence"
        }}
        """, images=[img])

        if not res or not res.get("found"):
            return None

        confidence = float(res.get("confidence", 0) or 0)
        if confidence < min_confidence:
            return None

        try:
            x = int(float(res["x_pct"]) * self.device.screen_size[0])
            y = int(float(res["y_pct"]) * self.device.screen_size[1])
        except (KeyError, TypeError, ValueError):
            return None

        if not (
            0 <= x < self.device.screen_size[0]
            and 0 <= y < self.device.screen_size[1]
        ):
            return None

        print(
            f"         👁️ External visual target: "
            f"'{res.get('element_text', goal)}' at ({x}, {y}) "
            f"(conf={confidence:.2f})"
        )
        return (x, y)

    async def _verification_visual_click(self, img, goal, context="",
                                         allow_target_app=False):
        """
        Direct external-app click:
        current screenshot -> visual target -> direct tap -> observe result.

        No XML target re-resolution and no automatic return-to-target-app.
        """
        coords = await self._verification_visual_point(
            img, goal, context=context
        )
        if not coords:
            print(f"         ❌ Could not visually ground external target: {goal}")
            return {
                "clicked": False,
                "after_img": self._capture_screen(),
                "after_xml": self.device.get_ui_xml(),
                "foreground": self._verification_foreground_context(),
            }

        before_img = img
        before_context = self._verification_foreground_context()

        self.device.tap(coords[0], coords[1])
        time.sleep(1.2)

        after_img = self._capture_screen()
        after_xml = self.device.get_ui_xml()
        after_context = self._verification_foreground_context()

        if after_context == "target_app" and not allow_target_app:
            print(
                "         ⚠️ External click unexpectedly returned to target app; "
                "will reopen Gmail instead of reasoning from the wrong app"
            )
            return {
                "clicked": False,
                "unexpected_target_app": True,
                "after_img": after_img,
                "after_xml": after_xml,
                "foreground": after_context,
            }

        verify = None
        if after_img:
            verify = await self._ai_call(f"""
            EXTERNAL VERIFICATION ACTION CHECK.

            I intended to:
            "{goal}"

            Before-context: {before_context}
            After-context: {after_context}

            Compare the BEFORE and AFTER screenshots.

            Decide whether the intended action meaningfully succeeded.
            Examples:
            - opening an email -> email body/thread is now open
            - opening Gmail search -> search interface/input is active
            - clicking a verification link -> browser/target app/confirmation opened

            OUTPUT JSON:
            {{
              "success": true,
              "new_screen_type": "gmail_inbox|gmail_search|email_body|browser|target_app|other",
              "confidence": 0.95,
              "reasoning": "brief"
            }}
            """, images=[x for x in (before_img, after_img) if x])

        success = bool(
            verify
            and verify.get("success")
            and float(verify.get("confidence", 0) or 0) >= 0.68
        )

        return {
            "clicked": success,
            "after_img": after_img,
            "after_xml": after_xml,
            "foreground": after_context,
            "visual_check": verify or {},
        }

    async def _gmail_search_visual(self, search_query):
        """
        Search Gmail from the current verification state using visual grounding.
        """
        if not await self._ensure_email_client_foreground():
            return False

        current_img = self._capture_screen()
        if not current_img:
            return False

        result = await self._verification_visual_click(
            current_img,
            "Open Gmail's 'Search in mail' search field",
            context=(
                f"Target email from {self.app_name} was NOT visible in the "
                "current Gmail list, so search is now appropriate."
            ),
            allow_target_app=False,
        )

        if result.get("unexpected_target_app"):
            await self._ensure_email_client_foreground()
            return False

        search_img = result.get("after_img") or self._capture_screen()
        if not search_img:
            return False

        state = await self._ai_call("""
        GMAIL SEARCH FIELD CHECK.

        Look at the CURRENT screenshot.
        Is Gmail's search interface active and ready to receive a query?

        OUTPUT JSON:
        {
          "search_ready": true,
          "confidence": 0.95,
          "reasoning": "brief"
        }
        """, images=[search_img])

        if not (
            state
            and state.get("search_ready")
            and float(state.get("confidence", 0) or 0) >= 0.70
        ):
            print("         ❌ Gmail search field is not visually confirmed active")
            return False

        print(f"         ⌨️ Gmail search query: '{search_query}'")
        self.device.select_all_and_delete()
        self.device.clear_field()
        self.device.input_text_safe(search_query)
        time.sleep(0.4)
        self.device.press_enter()
        time.sleep(2.5)

        result_img = self._capture_screen()
        if result_img:
            safe_query = re.sub(r"[^\w]+", "_", search_query)[:30]
            self._save_verification_screenshot(
                result_img,
                "gmail_search_" + safe_query,
                action="GMAIL_SEARCH",
                target=search_query,
            )
        return True

    def _accessible_verification_emails(self):
        emails = set()
        primary = str(self.persona_email or "").strip().casefold()
        if primary and "@" in primary:
            emails.add(primary)

        if self.agent is not None:
            extras = getattr(self.agent.persona, "extra_values", {}) or {}
            for key in (
                "school_email",
                "university_email",
                "work_email",
                "business_email",
                "alternate_email",
            ):
                value = str(extras.get(key, "") or "").strip().casefold()
                if value and "@" in value:
                    emails.add(value)
        return emails

    @staticmethod
    def _extract_email_address(value):
        match = re.search(
            r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}",
            str(value or ""),
            flags=re.I,
        )
        return match.group(0).casefold() if match else ""

    def _verification_target_email_status(self, plan):
        mentioned = self._extract_email_address(
            plan.get("email_mentioned")
            or plan.get("app_instructions")
            or ""
        )
        accessible = self._accessible_verification_emails()
        return {
            "target_email": mentioned,
            "accessible": (not mentioned) or mentioned in accessible,
            "accessible_emails": sorted(accessible),
        }

    async def comprehend_verification_screen(self, img, xml_str):
        all_text = UIHierarchy.extract_visible_text(xml_str)
        xml_summary = UIHierarchy.parse_xml_to_string(xml_str)

        res = await self._ai_call(f"""
        VERIFICATION SCREEN DEEP COMPREHENSION.

        You are looking at a screen in the app "{self.app_name}" that is asking
        the user to verify their account. READ EVERY WORD on this screen carefully.

        VISIBLE TEXT:
        {all_text[:2000]}

        INTERACTIVE ELEMENTS:
        {xml_summary[:1500]}

        ANSWER ALL OF THESE QUESTIONS:

        1. VERIFICATION TYPE — What exactly is the app asking?
           - "email_link": A verification email/link has ALREADY been sent and the
             user must now act on that email.
           - "email_code": A code has ALREADY been sent and the user must enter it.
           - "sms_code": A code has ALREADY been sent via SMS/text and must be entered.
           - "oauth": External OAuth/social authentication is required NOW.
           - "captcha": Bot detection challenge.
           - "deferrable": Verification is optional / can be skipped.
           - "none": This is NOT YET an external verification challenge.

           IMPORTANT: If the current screen merely offers a local button such as
           "Email one-time password", "Get a magic link", "Send code", or
           "Send verification email" and nothing says it has been sent yet,
           return verification_type="none". The main observe→act loop must click
           that local button first and then inspect the next screen.

        2. EXACT INSTRUCTIONS — What does the app literally say to do?
           Quote the relevant text.

        3. POST-VERIFY BEHAVIOR — What will happen AFTER verification?
           - "auto_detect": App says it will automatically detect verification
           - "deep_link": The email link will open/return to the app directly
           - "manual_continue": There's a "Continue" / "I've verified" / "Done"
             button the user must tap AFTER verifying externally
           - "re_login": User needs to log in again after verifying
           - "unknown": App doesn't specify

        4. SKIP OPTION — Is there a way to skip/defer verification?

        5. RESEND OPTION — Is there a "Resend" / "Send again" button?

        6. TIMER — Is there a countdown timer or expiration mentioned?

        7. EMAIL TARGET — What email address is mentioned?

        8. BUTTONS ON SCREEN — List ALL buttons/tappable elements.

        OUTPUT JSON:
        {{
            "verification_type": "email_link",
            "app_instructions": "Exact quote of what the app says to do",
            "post_verify_behavior": "auto_detect|deep_link|manual_continue|re_login|unknown",
            "has_skip_option": false,
            "skip_button_text": null,
            "skip_button_coords": null,
            "has_resend_option": true,
            "resend_button_text": "Resend Link",
            "resend_button_coords": [540, 1600],
            "has_timer": false,
            "timer_text": null,
            "email_mentioned": "person@example.com",
            "has_manual_continue_button": false,
            "continue_button_text": null,
            "continue_button_coords": null,
            "has_open_email_button": true,
            "open_email_button_text": "Open Email",
            "open_email_button_coords": [540, 1400],
            "all_buttons": [
                {{"text": "Open Email", "coords":[540, 1400], "purpose": "Opens email app"}},
                {{"text": "Resend Link", "coords": [540, 1600], "purpose": "Resends verification"}}
            ],
            "confidence": 0.95,
            "reasoning": "The screen says 'We sent a link to person@example.com. Tap it to verify your account.'"
        }}
        """, images=[img])

        if res:
            self.verification_type = res.get("verification_type", VerificationType.UNKNOWN)
            self.app_instructions = res.get("app_instructions", "")
            self.expected_post_verify_behavior = res.get("post_verify_behavior", "unknown")

            email_status = self._verification_target_email_status(res)
            res["verification_target_email"] = email_status["target_email"]
            res["verification_target_accessible"] = email_status["accessible"]
            res["accessible_verification_emails"] = email_status["accessible_emails"]

            if (
                self.verification_type in (
                    "email_link", "hard_email_link",
                    "email_code", "hard_email_code", "inline_email_code",
                )
                and email_status["target_email"]
                and not email_status["accessible"]
            ):
                print(
                    f"      🚫 Verification target email "
                    f"'{email_status['target_email']}' is not accessible. "
                    f"Available email resources: "
                    f"{email_status['accessible_emails'] or ['none']}"
                )

            self.verification_plan = res
            fresh_img = self._capture_screen() or img
            self._save_verification_screenshot(
                fresh_img,
                f"comprehension_{self.verification_type}",
                action="COMPREHEND", target=f"verification_type={self.verification_type}"
            )
            print(f"      📖 Verification comprehension:")
            print(f"         Type: {self.verification_type}")
            print(f"         Instructions: {(self.app_instructions or '')[:100]}")
            print(f"         Post-verify: {self.expected_post_verify_behavior}")
            if res.get("has_skip_option"):
                print(f"         Skip available: '{res.get('skip_button_text')}'")
        else:
            self.verification_type = VerificationType.UNKNOWN
            self.verification_plan = {}

        return self.verification_plan or {}

    async def handle_verification(self, img, xml_str):
        self.verification_attempts += 1
        if self.verification_attempts > self.MAX_ATTEMPTS:
            return {"handled": False, "status": "max_attempts",
                    "detail": f"Failed after {self.MAX_ATTEMPTS} full verification cycles"}

        plan = await self.comprehend_verification_screen(img, xml_str)

        fresh_img = self._capture_screen() or img
        fresh_xml = self.device.get_ui_xml() or xml_str

        if not plan:
            return {"handled": False, "status": "comprehension_failed",
                    "detail": "Could not understand verification screen"}

        vtype = plan.get("verification_type", "unknown")

        if (
            vtype in (
                "email_link", "hard_email_link",
                "email_code", "hard_email_code", "inline_email_code",
            )
            and plan.get("verification_target_email")
            and not plan.get("verification_target_accessible", True)
        ):
            return {
                "handled": False,
                "status": "email_target_mismatch",
                "detail": (
                    f"Verification was sent to inaccessible email "
                    f"'{plan.get('verification_target_email')}'. "
                    "Backtrack and correct the email or choose another path."
                ),
                "target_email": plan.get("verification_target_email"),
                "accessible_emails": plan.get(
                    "accessible_verification_emails", []
                ),
            }

        if vtype == "deferrable":
            return await self._handle_skip(img, xml_str, plan)

        if vtype == "none":
            return {"handled": True, "status": "no_verification",
                    "detail": "Not a verification screen"}

        if vtype == "captcha":
            return {"handled": False, "status": "captcha_blocked",
                    "detail": "CAPTCHA detected — cannot handle automatically"}

        if vtype in ("sms_code", "hard_sms_code", "inline_sms_code"):
            return {"handled": False, "status": "sms_required",
                    "detail": "SMS verification required — cannot handle automatically"}

        if vtype == "oauth":
            return await self._handle_oauth(img, xml_str, plan)

        if vtype in ("email_link", "hard_email_link"):
            return await self._execute_email_link_verification(fresh_img, fresh_xml, plan)

        if vtype in ("email_code", "hard_email_code", "inline_email_code"):
            return await self._execute_email_code_verification(fresh_img, fresh_xml, plan)

        return await self._execute_email_link_verification(fresh_img, fresh_xml, plan)

    async def _execute_email_link_verification(self, app_img, app_xml, plan):
        print(f"\n      🔗 EMAIL LINK VERIFICATION — Reasoning Loop")
        print(f"         App says: \"{self.app_instructions[:120]}\"")
        print(f"         Expected behavior after clicking: {self.expected_post_verify_behavior}")

        print(f"         ⏳ Waiting 10s for email delivery...")
        time.sleep(10)

        has_gmail = self.device.is_gmail_installed()
        if has_gmail:
            print(f"         📬 Opening Gmail app...")
            self.device.open_gmail()
        else:
            print(f"         🌐 Opening Gmail in browser...")
            self.device.open_url_in_browser("https://mail.google.com")
        time.sleep(5)

        context = {
            "goal": f"Find and open the verification email from {self.app_name}, "
                    f"then click the verification link/button inside it.",
            "app_instructions": self.app_instructions,
            "email_address": self.persona_email,
            "current_location": "gmail_inbox",
            "link_clicked": False,
            "email_found": False,
            "email_opened": False,
            "confirmation_seen": False,
            "steps_in_gmail": 0,
        }

        self._link_verify_action_history = []

        for step in range(self.MAX_VERIFICATION_STEPS):
            context["steps_in_gmail"] += 1
            self.steps_taken += 1

            current_img = self._capture_screen()
            current_xml = self.device.get_ui_xml()

            if not current_img:
                print(f"         ⚠️ Cannot capture screen. Waiting...")
                time.sleep(3)
                continue

            all_text = UIHierarchy.extract_visible_text(current_xml)
            xml_summary = UIHierarchy.parse_xml_to_string(current_xml)

            if self.device.is_package_in_foreground(self.target_package):
                if context.get("link_clicked"):
                    print(f"         🎯 Deep-linked back to {self.app_name}!")
                    return await self._assess_post_verification(
                        "The verification link deep-linked back to the app"
                    )

                print(
                    f"         ⚠️ Returned to {self.app_name} before the "
                    "verification link was clicked; reopening Gmail"
                )
                await self._ensure_email_client_foreground()
                time.sleep(1.0)
                continue

            res = await self._ai_call(f"""
            VERIFICATION NAVIGATION — Step {step + 1}

            OVERALL GOAL: {context['goal']}

            APP'S ORIGINAL INSTRUCTIONS: "{context['app_instructions']}"

            PROGRESS SO FAR:
            - Email found: {context['email_found']}
            - Email opened: {context['email_opened']}
            - Verification link clicked: {context['link_clicked']}
            - Confirmation page seen: {context['confirmation_seen']}

            I am currently looking at a screen. It could be:
            - Gmail inbox (need to find the verification email)
            - Inside an email (need to find and click the verify button/link)
            - A browser page (maybe a confirmation page after clicking the link)
            - Gmail login page (need to sign in first)
            - A loading/error state

            VISIBLE TEXT:
            {all_text[:2000]}

            INTERACTIVE ELEMENTS:
            {xml_summary[:1500]}

            ANALYZE THIS SCREEN AND DECIDE WHAT TO DO NEXT.

            IMPORTANT:
            - If you see the Gmail inbox, look for an email from {self.app_name}
              (check sender names like noreply@, verify@, team@, etc.)
            - If you're inside an email, look for a verification BUTTON or LINK
              (like "Verify Email", "Confirm Account", "Click here", a big colored button)
            - If the email thread is collapsed (content hidden), you MUST click the sender name/subject to EXPAND it.
            - If you see a confirmation page ("Email verified!", "Success"), note it
            - If Gmail needs login, provide login steps
            - If nothing relevant is visible, try scrolling or refreshing

            If the email is not visible in the inbox after scrolling, use action=SEARCH
            to search Gmail. Set search_query to "{self.app_name}" or the app's likely
            sender name. The system will tap the search bar, type the query, and submit.
            Do NOT repeatedly tap the search bar — use SEARCH and the system handles typing.

            OUTPUT JSON:
            {{
                "screen_type": "gmail_inbox|email_body|email_collapsed|browser_confirmation|gmail_login|search_results|loading|error|target_app|unknown",
                "screen_description": "What I see on this screen",
                "action": "CLICK|SCROLL_DOWN|SCROLL_UP|REFRESH|WAIT|SEARCH|LOGIN|BACK|DONE|RETURN_TO_APP",
                "target_desc": "What to tap",
                "target_coords": [x, y],
                "search_query": "{self.app_name}",
                "reasoning": "Why this action",
                "email_found": true/false,
                "email_opened": true/false,
                "link_clicked": true/false,
                "verification_confirmed": false,
                "confirmation_message": null,
                "needs_gmail_login": false,
                "is_error": false,
                "error_detail": null
            }}
            """, images=[current_img])

            if not res:
                print(f"         ⚠️ AI reasoning failed. Waiting...")
                time.sleep(3)
                continue

            screen_type = res.get("screen_type", "unknown")
            action = res.get("action", "WAIT")
            target = res.get("target_desc", "")
            coords = res.get("target_coords")
            reasoning = res.get("reasoning", "")

            if res.get("email_found") and not context["email_found"]:
                context["email_found"] = True
                self._save_verification_screenshot(
                    current_img, "gmail_inbox_email_found",
                    action="EMAIL_FOUND", target=f"verification email from {self.app_name}"
                )
            elif res.get("email_found"):
                context["email_found"] = True
            if res.get("email_opened") and not context["email_opened"]:
                context["email_opened"] = True
                self._save_verification_screenshot(
                    current_img, "email_body_opened",
                    action="EMAIL_OPENED", target="verification email body"
                )
            elif res.get("email_opened"):
                context["email_opened"] = True
            if res.get("link_clicked"):
                context["link_clicked"] = True
            if res.get("verification_confirmed"):
                context["confirmation_seen"] = True
                self._save_verification_screenshot(
                    current_img, "verification_confirmed",
                    action="VERIFIED", target="email verification confirmed"
                )

            print(f"         [{step+1}] 👀 {screen_type}: {res.get('screen_description', '')[:80]}")
            print(f"[{step+1}] 👉 {action} -> '{target}' | {reasoning[:80]}")

            if action == "DONE" or res.get("verification_confirmed"):
                print(f"         ✅ Verification confirmed: {res.get('confirmation_message', 'Success')}")
                context["confirmation_seen"] = True
                self.device.return_to_app()
                time.sleep(3)
                return await self._assess_post_verification(
                    res.get("confirmation_message", "Verification confirmed in email/browser")
                )

            if action == "RETURN_TO_APP":
                print(f"         📱 Returning to {self.app_name}...")
                self.device.return_to_app()
                time.sleep(3)
                return await self._assess_post_verification(
                    "Returned to app after email verification flow"
                )

            if action == "CLICK" and target:
                click_result = await self._verification_visual_click(
                    current_img,
                    target,
                    context=(
                        f"Verification link flow, current screen={screen_type}. "
                        "If Gmail inbox: tap the email row. "
                        "If email body: tap the visible verification link/button."
                    ),
                    allow_target_app=bool(context["email_opened"]),
                )
                success = bool(click_result.get("clicked"))

                if click_result.get("unexpected_target_app"):
                    await self._ensure_email_client_foreground()

                if success:
                    print(f"         ✅ Visually clicked '{target}'")
                    if context["email_opened"] and not context["link_clicked"]:
                        time.sleep(4)
                        post_click_img = self._capture_screen()
                        if post_click_img:
                            self._save_verification_screenshot(
                                post_click_img, "post_link_click",
                                action="LINK_CLICKED", target="verification link in email"
                            )
                            post_result = await self._assess_post_link_click(post_click_img)
                            if post_result.get("verification_confirmed"):
                                context["link_clicked"] = True
                                context["confirmation_seen"] = True
                                print(f"         ✅ Link click led to confirmation!")
                                self._save_verification_screenshot(
                                    post_click_img, "link_click_confirmation",
                                    action="VERIFIED", target="confirmation page after link click"
                                )
                                self.device.return_to_app()
                                time.sleep(3)
                                return await self._assess_post_verification(
                                    post_result.get("detail", "Verified via email link")
                                )
                            elif post_result.get("returned_to_app"):
                                context["link_clicked"] = True
                                return await self._assess_post_verification(
                                    "Deep-linked back to app after clicking verify"
                                )
                            elif post_result.get("browser_opened"):
                                context["link_clicked"] = True
                                print(f"         🌐 Browser opened after link click. Observing...")
                                continue
                else:
                    print(f"         ❌ Failed to click '{target}'")

            elif action == "SCROLL_DOWN":
                self.device.swipe_up("half")
                time.sleep(1.5)

            elif action == "SCROLL_UP":
                self.device.swipe_down("half")
                time.sleep(1.5)

            elif action == "REFRESH":
                self.device.swipe_down("large")
                time.sleep(3)

            elif action == "WAIT":
                print(f"         ⏳ Waiting for email/page to load...")
                time.sleep(3)
                wait_img = self._capture_screen()
                if wait_img:
                    self._save_verification_screenshot(
                        wait_img, f"wait_step_{step}",
                        action="WAIT", target="waiting for content to load"
                    )

            elif action == "LOGIN":
                login_ok = await self._handle_gmail_login_reasoning(current_img, current_xml)
                if not login_ok:
                    return {"handled": False, "status": "gmail_login_failed",
                            "detail": "Could not log into Gmail"}

            elif action == "BACK":
                self.device.press_back()
                time.sleep(2)

            elif action == "SEARCH":
                search_query = (
                    str(res.get("search_query", "") or "").strip()
                    or self.app_name
                )
                print(f"         🔍 Searching Gmail for: '{search_query}'")
                await self._gmail_search_visual(search_query)
            else:
                time.sleep(2)

            self._link_verify_action_history.append(f"{action}:{target}")
            if len(self._link_verify_action_history) >= 3:
                last_3 = self._link_verify_action_history[-3:]
                if all(a == last_3[0] for a in last_3):
                    print(f"         ⚠️ Repeated same action 3 times: '{last_3[0]}'. Breaking loop.")
                    break

            human_delay(PACE_TAP_DELAY)

        print(f"         ❌ Verification loop exhausted ({self.MAX_VERIFICATION_STEPS} steps)")
        self.device.return_to_app()
        time.sleep(3)
        return {"handled": False, "status": "verification_loop_exhausted",
                "detail": f"Could not complete email link verification in {self.MAX_VERIFICATION_STEPS} steps"}

    async def _detect_code_failure_state(self, img, xml_str, attempted_code=""):
        """
        Detect whether the currently entered OTP/code has been rejected or expired.

        This is intentionally evaluated BEFORE retrying the same code. If the app
        says the code is wrong/expired, the correct next action is to request a
        fresh code, not type the same value again.
        """
        visible = UIHierarchy.extract_visible_text(xml_str or "")
        low = visible.casefold()

        hard_failure_terms = (
            "incorrect verification code",
            "incorrect code",
            "invalid verification code",
            "invalid code",
            "wrong verification code",
            "wrong code",
            "verification code expired",
            "code expired",
            "expired code",
            "code is no longer valid",
            "try a new code",
        )

        if any(term in low for term in hard_failure_terms):
            return {
                "rejected": True,
                "expired": "expir" in low,
                "resend_visible": "resend" in low,
                "resend_text": "Resend code",
                "reasoning": "Explicit verification-code failure text is visible",
            }

        if not img:
            return {
                "rejected": False,
                "expired": False,
                "resend_visible": False,
                "resend_text": "",
                "reasoning": "No screenshot",
            }

        res = await self._ai_call(f"""
        VERIFICATION CODE FAILURE CHECK.

        Attempted code:
        "{attempted_code or 'unknown'}"

        Inspect the CURRENT app screenshot.

        Determine whether the app is explicitly saying the entered verification
        code is incorrect, invalid, expired, or otherwise rejected.

        Also identify whether a visible control can request a FRESH code.

        Do NOT call an empty OTP field a rejection unless the screen actually
        communicates an error.

        OUTPUT JSON:
        {{
          "rejected": true/false,
          "expired": true/false,
          "error_message": "Incorrect verification code",
          "resend_visible": true/false,
          "resend_text": "Resend code",
          "confidence": 0.95,
          "reasoning": "brief"
        }}
        """, images=[img])

        if not res:
            return {
                "rejected": False,
                "expired": False,
                "resend_visible": False,
                "resend_text": "",
                "reasoning": "Visual check unavailable",
            }

        confidence = float(res.get("confidence", 0) or 0)
        return {
            "rejected": bool(res.get("rejected")) and confidence >= 0.70,
            "expired": bool(res.get("expired")),
            "resend_visible": bool(res.get("resend_visible")),
            "resend_text": str(res.get("resend_text", "") or "Resend code"),
            "reasoning": str(
                res.get("error_message")
                or res.get("reasoning")
                or ""
            ),
        }

    def _resend_cooldown_state(self, xml_str):
        """
        Detect the common state after a resend was ALREADY requested:
            Resend (57s), Resend in 00:57, Try again in 57 seconds, etc.

        A cooldown is positive evidence that the app already generated a fresh
        code. Do not press Resend again; go retrieve the newer message.
        """
        visible = UIHierarchy.extract_visible_text(xml_str or "")
        low = visible.casefold()

        patterns = [
            r"resend\s*\(?\s*(\d{1,3})\s*s(?:ec(?:ond)?s?)?\s*\)?",
            r"resend\s+in\s+(?:\d{1,2}:)?(\d{1,2})",
            r"try\s+again\s+in\s+(\d{1,3})\s*s(?:ec(?:ond)?s?)?",
            r"send\s+again\s+in\s+(\d{1,3})\s*s(?:ec(?:ond)?s?)?",
        ]
        for pattern in patterns:
            m = re.search(pattern, low)
            if m:
                try:
                    seconds = int(m.group(1))
                except Exception:
                    seconds = None
                return {
                    "active": True,
                    "seconds": seconds,
                    "text": visible,
                }

        return {"active": False, "seconds": None, "text": visible}

    async def _classify_gmail_screen(self):
        """Classify only the CURRENT Gmail visual state for navigation."""
        if self._verification_foreground_context() != "gmail":
            return "other"
        img = self._capture_screen()
        if not img:
            return "other"
        res = await self._ai_call("""
        GMAIL CURRENT-STATE CLASSIFICATION.

        Look only at the CURRENT Gmail screenshot.
        Classify it as exactly one of:
          inbox
          search_results
          search_input
          email_body
          other

        OUTPUT JSON:
        {"state":"inbox|search_results|search_input|email_body|other", "confidence":0.95}
        """, images=[img])
        if not res:
            return "other"
        if float(res.get("confidence", 0) or 0) < 0.65:
            return "other"
        return str(res.get("state", "other") or "other")

    async def _gmail_target_visible_now(self):
        """
        Inspect the CURRENT Gmail list/search screen.

        Returns semantic evidence only. It does not click anything.
        """
        if self._verification_foreground_context() != "gmail":
            return {
                "visible": False,
                "row_text": "",
                "confidence": 0.0,
                "reasoning": "Gmail not foreground",
            }

        img = self._capture_screen()
        xml_str = self.device.get_ui_xml()
        if not img:
            return {
                "visible": False,
                "row_text": "",
                "confidence": 0.0,
                "reasoning": "No screenshot",
            }

        visible_text = UIHierarchy.extract_visible_text(xml_str)
        app_in_xml = self.app_name.casefold() in visible_text.casefold()

        res = await self._ai_call(f"""
        GMAIL INBOX TARGET CHECK.

        Target app/sender:
        "{self.app_name}"

        Look ONLY at the CURRENT Gmail screenshot.

        QUESTION:
        Is a verification email from "{self.app_name}" visibly present RIGHT NOW
        as an inbox/search-results row?

        IMPORTANT:
        - If the matching email is visible, return visible=true.
        - Prefer the newest/topmost matching visible message.
        - Do NOT recommend scrolling or searching when the matching email is
          already visible.
        - This is only a visibility check. Do not click anything.

        XML says target name is present: {app_in_xml}

        OUTPUT JSON:
        {{
          "visible": true,
          "row_text": "OfferToday — Here's your verification code 6846",
          "confidence": 0.98,
          "reasoning": "The newest OfferToday email is the top visible row"
        }}
        """, images=[img])

        if not res:
            return {
                "visible": bool(app_in_xml),
                "row_text": self.app_name if app_in_xml else "",
                "confidence": 0.70 if app_in_xml else 0.0,
                "reasoning": "XML fallback",
            }

        confidence = float(res.get("confidence", 0) or 0)
        visible = bool(res.get("visible")) and confidence >= 0.68

        return {
            "visible": visible,
            "row_text": str(
                res.get("row_text", "") or self.app_name
            ).strip(),
            "confidence": confidence,
            "reasoning": str(res.get("reasoning", "") or ""),
        }

    async def _prepare_gmail_for_fresh_code_lookup(self):
        """
        Prepare Gmail for a fresh-code lookup using OBSERVE FIRST.

        Correct order:
          1. Open Gmail.
          2. If an unrelated email body is open, back to the list.
          3. OBSERVE the inbox/search results.
          4. If the target email is already visible, leave the screen alone.
          5. Search only when the target email is NOT visible.

        Returns:
          "visible"  -> matching target email is already visible
          "searched" -> Gmail search was actually submitted
          "failed"   -> could not prepare Gmail
        """
        if not await self._ensure_email_client_foreground():
            return "failed"

        # Get out of an arbitrary old email body, but never scroll the inbox.
        for _ in range(3):
            state = await self._classify_gmail_screen()
            if state == "email_body":
                print(
                    "         ⬅️ Fresh-code lookup: leaving previously open "
                    "email before inspecting inbox"
                )
                self.device.press_back()
                time.sleep(0.8)
                continue
            break

        target_state = await self._gmail_target_visible_now()
        if target_state.get("visible"):
            print(
                f"         ✅ Fresh-code lookup: '{self.app_name}' email is "
                f"ALREADY VISIBLE — {target_state.get('row_text')}"
            )
            if target_state.get("reasoning"):
                print(
                    f"            {target_state.get('reasoning')[:160]}"
                )
            print(
                "         🧭 Leaving Gmail exactly where it is; "
                "next observation will OPEN the visible email."
            )
            return "visible"

        print(
            f"         🔎 '{self.app_name}' email is not visibly present; "
            "using Gmail search now"
        )
        searched = await self._gmail_search_visual(self.app_name)
        return "searched" if searched else "failed"

    async def _request_fresh_email_code(self):
        """
        Ensure a fresh code has been requested.

        Returns:
          "requested"       -> this call tapped Resend successfully
          "already_pending" -> resend cooldown proves a fresh code was already sent
          "unavailable"     -> no enabled resend action/cooldown is currently available
        """
        if not self.device.is_package_in_foreground(self.target_package):
            print(
                f"         📱 Returning to {self.app_name} to inspect resend state"
            )
            self.device.return_to_app()
            time.sleep(1.5)

        img = self._capture_screen()
        xml_str = self.device.get_ui_xml()
        if not img:
            return "unavailable"

        cooldown = self._resend_cooldown_state(xml_str)
        if cooldown.get("active"):
            seconds = cooldown.get("seconds")
            print(
                "         ✅ A fresh code was ALREADY requested; "
                + (f"resend cooldown is {seconds}s" if seconds is not None else "resend cooldown is active")
            )
            if self.fresh_code_requested_at is None:
                self.fresh_code_requested_at = time.time()
            return "already_pending"

        failure = await self._detect_code_failure_state(
            img,
            xml_str,
            attempted_code=self.code_extracted or "",
        )

        point = await self._verification_visual_point(
            img,
            "Tap the enabled visible control labeled Resend / Resend code / Send new code",
            context=(
                f"{self.app_name} verification screen. "
                f"Current failure state: {failure.get('reasoning', '')}. "
                "Need exactly one fresh code request. Do not tap OTP boxes or a countdown timer."
            ),
            min_confidence=0.68,
        )

        if not point:
            # Re-read once: UI may have switched to countdown between screenshot
            # and grounding call.
            latest_xml = self.device.get_ui_xml()
            cooldown = self._resend_cooldown_state(latest_xml)
            if cooldown.get("active"):
                print("         ✅ Resend cooldown appeared; fresh code is already pending")
                if self.fresh_code_requested_at is None:
                    self.fresh_code_requested_at = time.time()
                return "already_pending"

            print("         ⏳ No enabled resend control yet")
            return "unavailable"

        print(
            f"         🔁 Requesting fresh verification code "
            f"(resend #{self.resend_count + 1})"
        )
        self.device.tap(point[0], point[1])
        time.sleep(1.5)

        after_img = self._capture_screen()
        after_xml = self.device.get_ui_xml()
        cooldown = self._resend_cooldown_state(after_xml)

        self.resend_count += 1
        self.fresh_code_requested_at = time.time()

        if after_img:
            self._save_verification_screenshot(
                after_img,
                f"resend_code_{self.resend_count}",
                action="RESEND_CODE",
                target="fresh verification code requested",
            )

        if cooldown.get("active"):
            print("         ✅ Resend accepted; cooldown is active")
        else:
            print("         ✅ Resend tap completed; treating fresh message as pending")

        if self.code_extracted:
            self.rejected_codes.add(str(self.code_extracted))
        self.code_extracted = None
        return "requested"

    async def _execute_email_code_verification(self, app_img, app_xml, plan):
        print(f"\n      🔢 EMAIL CODE VERIFICATION — Freshness-Aware Loop")
        print(f"         App says: \"{self.app_instructions[:120]}\"")

        self.verification_challenge_started_at = time.time()

        current_img = app_img or self._capture_screen()
        current_xml = app_xml or self.device.get_ui_xml()
        failure = await self._detect_code_failure_state(
            current_img,
            current_xml,
            attempted_code=self.code_extracted or "",
        )
        cooldown = self._resend_cooldown_state(current_xml)

        need_resend = bool(
            failure.get("rejected")
            or self.force_resend_before_email
        )

        # If a countdown is already active, someone already pressed Resend in the
        # normal observe→act loop. The correct next step is Gmail, not Resend again.
        fresh_already_pending = bool(cooldown.get("active"))
        if fresh_already_pending:
            need_resend = False
            if self.fresh_code_requested_at is None:
                self.fresh_code_requested_at = time.time()
            print(
                "         ✅ Resend cooldown is active — a fresh code is already "
                "pending. Going to Gmail instead of pressing Resend again."
            )

        if self.force_resend_before_email and not fresh_already_pending:
            if self.code_extracted:
                self.rejected_codes.add(str(self.code_extracted))
            print(
                "         🔁 Previous code is stale/rejected; need one fresh "
                "Resend before Gmail lookup."
            )
        elif failure.get("rejected") and not fresh_already_pending:
            if self.code_extracted:
                self.rejected_codes.add(str(self.code_extracted))
            print(
                f"         🚫 Existing code rejected: "
                f"{failure.get('reasoning', 'invalid/expired code')}"
            )

        for cycle in range(1, 4):
            print(f"\n         🔄 Verification code cycle {cycle}/3")

            fresh_lookup = True  # never trust an arbitrary already-open email

            if need_resend:
                resend_state = await self._request_fresh_email_code()
                if resend_state in ("requested", "already_pending"):
                    self.force_resend_before_email = False
                    need_resend = False
                    fresh_lookup = True
                    print("         ⏳ Waiting 4s for the newly requested email...")
                    time.sleep(4)
                else:
                    # Do not declare POST_AUTH or failure just because a cooldown/
                    # UI transition temporarily hides the Resend control.
                    latest_xml = self.device.get_ui_xml()
                    latest_cd = self._resend_cooldown_state(latest_xml)
                    if latest_cd.get("active"):
                        print("         ✅ Fresh-code cooldown detected after recheck")
                        need_resend = False
                        fresh_lookup = True
                    else:
                        return {
                            "handled": False,
                            "status": "resend_wait",
                            "detail": "Waiting for resend control/cooldown state",
                        }
            else:
                print("         ⏳ Waiting 4s for current verification email...")
                time.sleep(4)

            # ALWAYS search Gmail afresh for this app. This prevents a stale code
            # from a previously open email/thread from being accepted as current.
            code = await self._extract_code_via_reasoning_loop(
                excluded_codes=self.rejected_codes,
                force_fresh=fresh_lookup,
            )

            if not code:
                if cycle < 3:
                    print("         ⏳ No fresh code found yet; waiting and searching again")
                    time.sleep(4)
                    continue
                return {
                    "handled": False,
                    "status": "code_not_found",
                    "detail": "Could not locate a current verification email/code",
                }

            if str(code) in self.rejected_codes:
                print(f"         🚫 Ignoring rejected/stale code: {code}")
                continue

            print(f"         ✅ Extracted candidate fresh code: {code}")
            self.code_extracted = code

            print(f"         📱 Returning to {self.app_name}...")
            self.device.return_to_app()
            time.sleep(2.0)

            result = await self._enter_code_with_reasoning(code, plan)

            if result.get("status") in (
                "code_verified", "verified", "assumed_verified"
            ):
                self.force_resend_before_email = False
                return result

            if result.get("status") in ("code_rejected", "code_expired"):
                self.rejected_codes.add(str(code))
                self.code_extracted = code
                self.force_resend_before_email = True
                need_resend = True
                print(
                    f"         🚫 Code {code} was rejected. The next cycle must "
                    "request/use a newer code."
                )
                continue

            check_img = self._capture_screen()
            check_xml = self.device.get_ui_xml()
            failure = await self._detect_code_failure_state(
                check_img, check_xml, attempted_code=code
            )
            if failure.get("rejected"):
                self.rejected_codes.add(str(code))
                self.code_extracted = code
                self.force_resend_before_email = True
                need_resend = True
                continue

            return result

        return {
            "handled": False,
            "status": "verification_code_cycles_exhausted",
            "detail": "Fresh verification-code cycles exhausted",
        }

    async def _extract_code_via_reasoning_loop(self, excluded_codes=None, force_fresh=False):
        """
        Visually navigate Gmail until the actual verification email is open and
        the code is extracted.

        Before the code is found, Gmail/browser is an intentional external
        context. Unexpected return to the target app triggers a Gmail reopen.
        """
        excluded_codes = {
            str(code) for code in (excluded_codes or set()) if code
        }

        if not await self._ensure_email_client_foreground():
            return None

        extracted_code = None
        self._code_extract_action_history = []
        search_attempted = False

        if force_fresh:
            print(
                f"         📬 Looking specifically for the NEWEST {self.app_name} "
                "verification email"
            )
            prepared = await self._prepare_gmail_for_fresh_code_lookup()
            search_attempted = (prepared == "searched")
            time.sleep(0.8)

        for step in range(self.MAX_VERIFICATION_STEPS):
            self.steps_taken += 1

            foreground = self._verification_foreground_context()

            if foreground == "target_app":
                print(
                    f"         [{step+1}] ⚠️ Back in {self.app_name} before "
                    "code extraction; reopening Gmail"
                )
                await self._ensure_email_client_foreground()
                time.sleep(1.0)
                foreground = self._verification_foreground_context()

            if self.device.is_gmail_installed() and foreground != "gmail":
                await self._ensure_email_client_foreground()
                foreground = self._verification_foreground_context()

            current_img = self._capture_screen()
            current_xml = self.device.get_ui_xml()

            if not current_img:
                time.sleep(1.5)
                continue

            all_text = UIHierarchy.extract_visible_text(current_xml)
            code_from_text = self._regex_extract_code(all_text)

            res = await self._ai_call(f"""
            EMAIL CODE RETRIEVAL — VISUAL CLOSED LOOP — Step {step + 1}

            GOAL:
            Find the relevant verification email from "{self.app_name}" for
            account "{self.persona_email}", OPEN THE EMAIL, and extract its code.

            ANDROID FOREGROUND CONTEXT:
            {foreground}

            IMPORTANT:
            - Trust the CURRENT screenshot, never previous coordinates.
            - First identify which app/screen you are actually looking at.
            - This lookup belongs to the CURRENT verification attempt. Prefer the
              NEWEST visible {self.app_name} verification email/search result.
              Do not accept an arbitrary old email merely because it is already open.
            - If Gmail inbox/search results show the matching email, OPEN the
              exact visible email row IMMEDIATELY.
            - A visible target email ALWAYS takes priority over SEARCH, REFRESH,
              WAIT, or SCROLL_DOWN.
            - Do NOT scroll past a visible target verification email.
            - Do NOT tap Gmail's search bar when action=OPEN_EMAIL.
            - Use SEARCH only when the relevant email is NOT visible.
            - ONLY return code_found=true when the EMAIL BODY/THREAD is open.
            - If code is visible only in inbox preview, open the email first.
            - If the target app is visible instead of Gmail, action=REOPEN_GMAIL.
            - If an EMAIL BODY is open but it is NOT the target verification email,
              action=BACK. Return to the inbox/search-results first. Do not try
              to search from inside an unrelated email body.
            - In search results, pick the newest/relevant verification message
              using sender, subject and preview.

            XML TEXT (secondary evidence):
            {all_text[:2000]}

            Regex candidate from XML:
            {code_from_text or "none"}

            PREVIOUSLY REJECTED / STALE CODES — NEVER REUSE:
            {sorted(excluded_codes) if excluded_codes else "none"}

            If the open email contains one of those stale codes, do NOT return it.
            Navigate/search for the newest verification email instead.

            OUTPUT JSON:
            {{
              "screen_type": "gmail_inbox|gmail_search|gmail_search_results|email_body|gmail_login|target_app|loading|other",
              "screen_description": "what is visibly on screen",
              "email_visible": true,
              "email_subject_or_sender": "sender/subject",
              "is_target_email": false,
              "code_found": false,
              "extracted_code": "",
              "action": "OPEN_EMAIL|BACK|SEARCH|SCROLL_DOWN|REFRESH|WAIT|LOGIN|REOPEN_GMAIL|DONE",
              "target_desc": "exact visible email row or control",
              "search_query": "{self.app_name}",
              "confidence": 0.95,
              "reasoning": "why this is the next action"
            }}
            """, images=[current_img])

            if not res:
                time.sleep(1.5)
                continue

            screen_type = str(res.get("screen_type", "other"))
            action = str(res.get("action", "WAIT")).upper()
            target = str(res.get("target_desc", "") or "")
            confidence = float(res.get("confidence", 0) or 0)

            print(
                f"         [{step+1}] 👀 {screen_type} "
                f"(android={foreground}, conf={confidence:.2f}): "
                f"{str(res.get('reasoning', ''))[:110]}"
            )

            if foreground == "target_app":
                action = "REOPEN_GMAIL"

            if (
                screen_type == "email_body"
                and not bool(res.get("is_target_email", False))
            ):
                if action != "BACK":
                    print(
                        f"         [{step+1}] 🧭 Unrelated email body open; "
                        f"normalizing {action} -> BACK"
                    )
                action = "BACK"

            if (
                screen_type == "email_body"
                and res.get("code_found")
                and res.get("extracted_code")
            ):
                candidate = str(res.get("extracted_code", "")).strip()
                if re.fullmatch(r"[A-Za-z0-9]{4,10}", candidate):
                    if candidate in excluded_codes:
                        print(
                            f"         [{step+1}] 🚫 Email contains stale/rejected "
                            f"code {candidate}; searching for a newer message"
                        )
                        self.device.press_back()
                        time.sleep(0.8)
                        await self._gmail_search_visual(self.app_name)
                        search_attempted = True
                        time.sleep(1.0)
                        continue

                    print(f"         [{step+1}] 🔢 Code found visually: {candidate}")
                    self._save_verification_screenshot(
                        current_img,
                        f"email_code_found_{candidate}",
                        action="CODE_EXTRACTED",
                        target=f"code={candidate}",
                    )
                    return candidate

            if screen_type == "email_body" and code_from_text:
                if str(code_from_text) in excluded_codes:
                    print(
                        f"         [{step+1}] 🚫 Open email contains stale/rejected "
                        f"code {code_from_text}; searching for newer email"
                    )
                    self.device.press_back()
                    time.sleep(0.8)
                    await self._gmail_search_visual(self.app_name)
                    search_attempted = True
                    time.sleep(1.0)
                    continue

                print(
                    f"         [{step+1}] 🔢 Code found from open email XML: "
                    f"{code_from_text}"
                )
                self._save_verification_screenshot(
                    current_img,
                    f"email_code_regex_{code_from_text}",
                    action="CODE_EXTRACTED",
                    target=f"code={code_from_text} (open email)",
                )
                return code_from_text

            # Narrow navigation invariant: when the CURRENT Gmail list visibly
            # contains the target sender/app, searching/scrolling away from it is
            # mechanically irrational. Keep the semantic goal and open that row.
            if (
                screen_type in ("gmail_inbox", "gmail_search_results")
                and self.app_name.casefold() in all_text.casefold()
                and action in ("SEARCH", "SCROLL_DOWN", "REFRESH", "WAIT")
            ):
                print(
                    f"         [{step+1}] 🧭 '{self.app_name}' is already visible "
                    f"in the CURRENT Gmail list; normalizing {action} -> OPEN_EMAIL"
                )
                action = "OPEN_EMAIL"
                target = f"{self.app_name} verification email row"

            print(f"         [{step+1}] 👉 {action} -> '{target}'")

            if action == "BACK":
                print(
                    f"         [{step+1}] ⬅️ Leaving unrelated email body; "
                    "returning to inbox/search results"
                )
                self.device.press_back()
                time.sleep(1.0)

            elif action == "OPEN_EMAIL":
                click = await self._verification_visual_click(
                    current_img,
                    (
                        f"Open the visible verification email row from "
                        f"{self.app_name}. Expected row: "
                        f"{target or self.app_name}"
                    ),
                    context=(
                        f"Current Gmail state={screen_type}. "
                        "Tap the email row itself, never the search bar."
                    ),
                    allow_target_app=False,
                )

                if click.get("unexpected_target_app"):
                    await self._ensure_email_client_foreground()
                elif click.get("clicked"):
                    opened_img = click.get("after_img")
                    if opened_img:
                        self._save_verification_screenshot(
                            opened_img,
                            "gmail_email_opened",
                            action="EMAIL_OPENED",
                            target=target or self.app_name,
                        )
                time.sleep(0.8)

            elif action == "SEARCH":
                if screen_type == "email_body":
                    print(
                        f"         [{step+1}] ⬅️ SEARCH requested from inside an "
                        "email body; backing out first and re-observing"
                    )
                    self.device.press_back()
                    time.sleep(1.0)
                else:
                    query = (
                        str(res.get("search_query", "") or "").strip()
                        or self.app_name
                    )
                    search_attempted = True
                    await self._gmail_search_visual(query)

            elif action == "SCROLL_DOWN":
                self.device.swipe_up("half")
                time.sleep(1.0)

            elif action == "REFRESH":
                self.device.swipe_down("large")
                time.sleep(2.0)

            elif action == "LOGIN":
                await self._handle_gmail_login_reasoning(
                    current_img, current_xml
                )

            elif action == "REOPEN_GMAIL":
                await self._ensure_email_client_foreground()
                time.sleep(1.0)

            elif action == "WAIT":
                time.sleep(2.0)

            elif action == "DONE":
                break

            else:
                if (
                    screen_type in ("gmail_inbox", "gmail_search_results")
                    and not search_attempted
                ):
                    search_attempted = True
                    await self._gmail_search_visual(self.app_name)
                else:
                    time.sleep(1.0)

            signature = f"{screen_type}:{action}:{target}"
            self._code_extract_action_history.append(signature)

            if len(self._code_extract_action_history) >= 4:
                last_4 = self._code_extract_action_history[-4:]
                if all(x == last_4[0] for x in last_4):
                    print(
                        f"         ⚠️ Same Gmail action repeated 4 times: "
                        f"'{signature}'. Reopening Gmail/searching afresh."
                    )
                    await self._ensure_email_client_foreground()
                    await self._gmail_search_visual(self.app_name)
                    self._code_extract_action_history.clear()

        return extracted_code

    async def _enter_code_with_reasoning(self, code, plan):
        for step in range(8):
            self.steps_taken += 1

            current_img = self._capture_screen()
            current_xml = self.device.get_ui_xml()

            if not current_img:
                time.sleep(2)
                continue

            all_text = UIHierarchy.extract_visible_text(current_xml)
            xml_summary = UIHierarchy.parse_xml_to_string(current_xml)

            res = await self._ai_call(f"""
            ENTER VERIFICATION CODE — Step {step + 1}

            I have the verification code: "{code}"
            I need to enter it into the app and submit it.

            APP'S ORIGINAL INSTRUCTIONS: "{self.app_instructions}"

            VISIBLE TEXT:
            {all_text[:1500]}

            INTERACTIVE ELEMENTS:
            {xml_summary[:1500]}

            ANALYZE:
            - FIRST: Is there an explicit error saying this code is incorrect,
              invalid, expired, or wrong? If yes -> action=RESEND_CODE and
              code_rejected=true. DO NOT type the same code again.
            - Is there a code input field? -> Tap it, enter the code
            - Is there a "Verify" / "Submit" / "Confirm" button? -> Tap after entering
            - Is there a verification success message? -> We're done!
            - Are there multiple individual digit boxes? -> Tap first, type entire code

            OUTPUT JSON:
            {{
                "screen_description": "What I see",
                "action": "ENTER_CODE|CLICK_SUBMIT|DONE|TAP_FIELD_AND_TYPE|RESEND_CODE|WAIT",
                "code_rejected": false,
                "code_expired": false,
                "error_message": "",
                "resend_visible": false,
                "resend_button_text": "Resend code",
                "code_input_coords": [x, y],
                "submit_button_text": "Verify",
                "submit_button_coords":[x, y],
                "verification_complete": false,
                "reasoning": "Why"
            }}
            """, images=[current_img])

            if not res:
                time.sleep(2)
                continue

            action = str(res.get("action", "WAIT")).upper()
            print(f"[{step+1}] 👉 {action}: {res.get('reasoning', '')[:80]}")

            if (
                res.get("code_rejected")
                or action == "RESEND_CODE"
            ):
                reason = (
                    str(res.get("error_message", "") or "")
                    or str(res.get("reasoning", "") or "")
                    or "verification code rejected"
                )
                print(
                    f"         🚫 App rejected code {code}: {reason[:140]}"
                )
                self._save_verification_screenshot(
                    current_img,
                    f"code_rejected_{code}",
                    action="CODE_REJECTED",
                    target=reason,
                )
                return {
                    "handled": False,
                    "status": (
                        "code_expired"
                        if res.get("code_expired")
                        else "code_rejected"
                    ),
                    "detail": reason,
                }

            if res.get("verification_complete") or action == "DONE":
                self.verification_successful = True
                self._save_verification_screenshot(
                    current_img, "code_entry_verified",
                    action="VERIFIED", target=f"code {code} accepted"
                )
                return {"handled": True, "status": "code_verified",
                        "detail": f"Code {code} entered and verified"}

            if action in ("ENTER_CODE", "TAP_FIELD_AND_TYPE"):
                input_coords = await self._verification_visual_point(
                    current_img,
                    "Tap the verification code input field",
                    context=(
                        f"Back inside {self.app_name}. Need to enter code {code}. "
                        "Tap the code field / first OTP box, not resend/submit."
                    ),
                )
                if input_coords:
                    self.device.tap(input_coords[0], input_coords[1])
                    time.sleep(0.7)
                    self.device.clear_field()
                    time.sleep(0.3)
                    self.device.input_text_safe(code)
                    time.sleep(1)
                    self.device.dismiss_keyboard()
                    time.sleep(0.5)

                    post_entry_img = self._capture_screen()
                    if post_entry_img:
                        entry_check = await self._ai_call(f"""
                        I just entered verification code "{code}" into an input field.
                        Check the screen to see what happened:
                        - Did the app AUTOMATICALLY ADVANCE to the next step/screen?
                        - Did the code successfully appear in the field?
                        - Is the field still empty or showing the wrong code?

                        OUTPUT JSON:
                        {{
                          "auto_advanced": true/false,
                          "code_entered": true/false,
                          "code_rejected": true/false,
                          "code_expired": true/false,
                          "error_message": "",
                          "reasoning": "..."
                        }}
                        """, images=[post_entry_img])

                        if entry_check:
                            if entry_check.get("code_rejected"):
                                reason = (
                                    str(entry_check.get("error_message", "") or "")
                                    or str(entry_check.get("reasoning", "") or "")
                                    or "verification code rejected"
                                )
                                print(
                                    f"         🚫 Code {code} rejected immediately: "
                                    f"{reason[:140]}"
                                )
                                self._save_verification_screenshot(
                                    post_entry_img,
                                    f"code_rejected_{code}",
                                    action="CODE_REJECTED",
                                    target=reason,
                                )
                                return {
                                    "handled": False,
                                    "status": (
                                        "code_expired"
                                        if entry_check.get("code_expired")
                                        else "code_rejected"
                                    ),
                                    "detail": reason,
                                }

                            if entry_check.get("auto_advanced"):
                                print(f"         ✅ App auto-advanced to the next screen after code entry!")
                                self.verification_successful = True
                                self._save_verification_screenshot(
                                    post_entry_img, "code_auto_submitted",
                                    action="AUTO_SUBMITTED", target=f"code {code} accepted"
                                )
                                return {"handled": True, "status": "code_verified",
                                        "detail": f"Code {code} entered and auto-submitted"}

                            if not entry_check.get("code_entered", True):
                                print(f"         ⚠️ Code entry not confirmed. Retrying...")
                                self.device.tap(input_coords[0], input_coords[1])
                                time.sleep(0.5)
                                self.device.select_all_and_delete()
                                time.sleep(0.3)
                                self.device.clear_field()
                                time.sleep(0.3)
                                self.device.input_text_safe(code)
                                time.sleep(1)
                                self.device.dismiss_keyboard()
                                time.sleep(0.5)

                        self._save_verification_screenshot(
                            post_entry_img, f"code_entered_{code}",
                            action="CODE_ENTERED", target=f"code={code} in input field"
                        )

                submit_text = res.get("submit_button_text")
                if submit_text:
                    time.sleep(0.4)
                    fresh_img = self._capture_screen()
                    submit_point = await self._verification_visual_point(
                        fresh_img,
                        f"Tap the verification submit button labeled '{submit_text}'",
                        context=f"Code {code} has been entered in {self.app_name}",
                    )
                    if submit_point:
                        self.device.tap(submit_point[0], submit_point[1])
                        time.sleep(2.0)
                elif res.get("submit_button_coords"):
                    pre_submit_img = self._capture_screen()
                    submit_point = await self._verification_visual_point(
                        pre_submit_img,
                        "Tap the button/control that submits the verification code",
                        context=f"Code {code} is already entered",
                    )
                    if submit_point:
                        self.device.tap(submit_point[0], submit_point[1])
                    time.sleep(3)
                    post_submit_img = self._capture_screen()
                    if pre_submit_img and post_submit_img:
                        submit_check = await self._ai_call(f"""
                        I just tapped a submit button after entering verification code "{code}".
                        Did the screen change? Did verification succeed or fail?
                        OUTPUT JSON:
                        {{ "screen_changed": true/false, "verification_succeeded": false, "reasoning": "..." }}
                        """, images=[pre_submit_img, post_submit_img])
                        if submit_check:
                            if submit_check.get("verification_succeeded"):
                                self.verification_successful = True
                                self._save_verification_screenshot(
                                    post_submit_img, "code_submit_verified",
                                    action="CODE_SUBMITTED_VERIFIED", target=f"code {code} accepted"
                                )
                                return {"handled": True, "status": "code_verified",
                                        "detail": f"Code {code} entered and verified"}
                            elif not submit_check.get("screen_changed"):
                                print(f"         ⚠️ Submit tap didn't change screen. Will retry on next iteration.")
                else:
                    self.device.press_enter()
                time.sleep(3)

            elif action == "CLICK_SUBMIT":
                submit_text = res.get("submit_button_text", "Submit")
                submit_point = await self._verification_visual_point(
                    current_img,
                    f"Tap the verification submit button '{submit_text}'",
                    context=f"Verification code {code} is already entered",
                )
                if submit_point:
                    self.device.tap(submit_point[0], submit_point[1])
                time.sleep(2.5)
            else:
                time.sleep(2)

        return await self._assess_post_verification(
            f"Entered code {code}, checking if verification succeeded"
        )

    async def _assess_post_link_click(self, img):
        res = await self._ai_call(f"""
        I just clicked a verification link in an email. What happened?

        POSSIBLE OUTCOMES:
        1. A browser page opened showing "Email verified!" / "Success" / "Confirmed"
        2. The app opened automatically (deep link) showing a welcome or home screen
        3. A browser page opened asking me to do something else
        4. Nothing visible changed (link didn't work)
        5. An error page appeared

        Also check: Am I looking at:
        - The {self.app_name} app?
        - A web browser?
        - Still in Gmail?

        OUTPUT JSON:
        {{
            "verification_confirmed": true/false,
            "confirmation_message": "Email verified successfully!",
            "returned_to_app": false,
            "browser_opened": true,
            "still_in_gmail": false,
            "error_occurred": false,
            "current_screen": "browser_confirmation|app_home|app_welcome|gmail|error|unknown",
            "detail": "Browser opened with page saying 'Your email has been verified'",
            "next_step_hint": "Return to app"
        }}
        """, images=[img])

        return res if res else {
            "verification_confirmed": False,
            "returned_to_app": False,
            "browser_opened": False,
        }

    async def _assess_post_verification(self, context_detail):
        current_img = self._capture_screen()
        current_xml = self.device.get_ui_xml()

        if not current_img:
            self.verification_successful = True
            return {"handled": True, "status": "assumed_verified",
                    "detail": f"{context_detail} (could not capture post-verification screen)"}

        all_text = UIHierarchy.extract_visible_text(current_xml)
        xml_summary = UIHierarchy.parse_xml_to_string(current_xml)

        res = await self._ai_call(f"""
        POST-VERIFICATION ASSESSMENT.

        I just completed a verification flow for {self.app_name}.
        Context: {context_detail}
        The app originally said: "{self.app_instructions}"
        Expected post-verify behavior: {self.expected_post_verify_behavior}

        Now I'm looking at the app screen. DETERMINE:

        1. Did verification SUCCEED?
           - Is there a success/welcome/confirmed message?
           - Am I on a post-signup screen (home, onboarding, profile setup)?
           - Did the verification prompt go away?

        2. Did verification FAIL?
           - Is the "verify your email" screen still showing?
           - Is there an error message?

        3. Is there a "Continue" / "I've verified" / "Done" button I need to tap?

        4. Am I back at a SIGN UP FORM?
           - Do I see input fields (Name, Phone, Password) that still need filling?
           - This means verification deep-linked back to the signup flow.

        5. WARNING: GHOST OVERLAYS
           - XML sometimes reports "Permission Dialogs" that are INVISIBLE.
           - TRUST THE VISUAL SCREENSHOT. If you see a form and no dialog, assume it is a form.

        VISIBLE TEXT:
        {all_text[:1500]}

        INTERACTIVE ELEMENTS:
        {xml_summary[:1000]}

        OUTPUT JSON:
        {{
            "verification_succeeded": true/false,
            "confidence": 0.0-1.0,
            "evidence": "What I see that proves it succeeded/failed",
            "still_on_verification_screen": false,
            "has_continue_button": false,
            "continue_button_text": null,
            "continue_button_coords": null,
            "current_screen_type": "home|welcome|verification|error|onboarding|form|unknown",
            "is_signup_form": false,
            "needs_action": false,
            "action_needed": null,
            "action_coords": null
        }}
        """, images=[current_img])

        if not res:
            self.verification_successful = True
            return {"handled": True, "status": "assumed_verified",
                    "detail": context_detail}

        if res.get("is_signup_form") or res.get("current_screen_type") == "form":
            print(f"         📝 Returned to Sign Up Form. Resuming form fill.")
            return {"handled": False, "status": "returned_to_form", "detail": "Deep link returned to form, resuming fill"}

        succeeded = res.get("verification_succeeded", False)
        still_on_verification = res.get("still_on_verification_screen", False)

        if res.get("has_continue_button") and res.get("continue_button_coords"):
            text = res.get("continue_button_text", "Continue")
            coords = res["continue_button_coords"]
            print(f"         🔘 Tapping post-verification button: '{text}'")
            success = await self._atomic_click(
                current_img, current_xml, text, prefer_coords=tuple(coords)
            )
            time.sleep(2)

            if success:
                self.verification_successful = True
                return {"handled": True, "status": "verified_and_continued",
                        "detail": f"Verification succeeded, tapped '{text}' to continue"}
            else:
                print(f"         ❌ Post-verification click failed. Re-evaluating screen.")

        if res.get("needs_action") and res.get("action_coords"):
            action_text = res.get("action_needed", "Continue")
            action_coords = res["action_coords"]
            print(f"         🔘 Post-verification action: '{action_text}'")
            await self._atomic_click(
                current_img, current_xml, action_text,
                prefer_coords=tuple(action_coords)
            )
            time.sleep(2)

        if succeeded:
            self.verification_successful = True
            return {"handled": True, "status": "verified",
                    "detail": f"Verification confirmed: {res.get('evidence', '')}"}

        if still_on_verification:
            print(f"         ⚠️ Still on verification screen.")
            if self.expected_post_verify_behavior == "auto_detect":
                print(f"         ⏳ App said it auto-detects. Waiting 10s...")
                time.sleep(10)
                recheck_img = self._capture_screen()
                if recheck_img:
                    recheck_xml = self.device.get_ui_xml()
                    recheck_text = UIHierarchy.extract_visible_text(recheck_xml).lower()
                    if any(kw in recheck_text for kw in ["welcome", "home", "feed", "profile", "dashboard",
                            "verified", "success", "continue"]):
                        self.verification_successful = True
                        return {"handled": True, "status": "auto_detected_verified",
                                "detail": "App auto-detected verification after waiting"}

            return {"handled": False, "status": "still_on_verification",
                    "detail": f"Verification screen still showing. {res.get('evidence', '')}"}

        confidence = res.get("confidence", 0.5)
        if confidence >= 0.6:
            self.verification_successful = True
            return {"handled": True, "status": "likely_verified",
                    "detail": f"Likely verified (conf={confidence:.2f}): {res.get('evidence', '')}"}

        return {"handled": False, "status": "uncertain",
                "detail": f"Uncertain (conf={confidence:.2f}): {res.get('evidence', '')}"}

    async def _handle_gmail_login_reasoning(self, img, xml_str):
        print(f"         🔑 Gmail login required. Using reasoning loop...")

        for step in range(10):
            current_img = self._capture_screen()
            current_xml = self.device.get_ui_xml()

            if not current_img:
                time.sleep(2)
                continue

            all_text = UIHierarchy.extract_visible_text(current_xml)
            xml_summary = UIHierarchy.parse_xml_to_string(current_xml)

            res = await self._ai_call(f"""
            GMAIL LOGIN — Step {step + 1}

            I need to sign into Gmail with:
            - Email: {self.persona_email}
            - Password: {self.persona_password}

            VISIBLE TEXT:
            {all_text[:1500]}

            INTERACTIVE ELEMENTS:
            {xml_summary[:1500]}

            WHAT STEP ARE WE ON?
            - Email entry screen -> Enter email and tap Next
            - Password entry screen -> Enter password and tap Next
            - 2FA / verification -> Describe what's needed
            - Account chooser -> Select the right account
            - Already logged in -> Done!

            OUTPUT JSON:
            {{
                "login_step": "email_entry|password_entry|2fa|account_chooser|logged_in|unknown",
                "action": "ENTER_EMAIL|ENTER_PASSWORD|CLICK|SELECT_ACCOUNT|DONE",
                "input_field_coords": [x, y],
                "submit_button_text": "Next",
                "submit_button_coords":[x, y],
                "account_to_select": null,
                "account_coords": null,
                "is_logged_in": false,
                "reasoning": "Why"
            }}
            """, images=[current_img])

            if not res:
                time.sleep(2)
                continue

            login_step = res.get("login_step", "unknown")
            action = res.get("action", "WAIT")

            print(f"         [{step+1}] Login step: {login_step} -> {action}")

            if res.get("is_logged_in") or action == "DONE":
                return True

            if action == "ENTER_EMAIL":
                input_coords = res.get("input_field_coords")
                if input_coords:
                    self.device.tap(input_coords[0], input_coords[1])
                    time.sleep(1)
                    self.device.clear_field()
                    self.device.input_text_safe(self.persona_email)
                    time.sleep(1)
                submit_coords = res.get("submit_button_coords")
                if submit_coords:
                    self.device.tap(submit_coords[0], submit_coords[1])
                else:
                    self.device.press_enter()
                time.sleep(4)

            elif action == "ENTER_PASSWORD":
                input_coords = res.get("input_field_coords")
                if input_coords:
                    self.device.tap(input_coords[0], input_coords[1])
                    time.sleep(1)
                    self.device.clear_field()
                    self.device.input_text_safe(self.persona_password)
                    time.sleep(1)
                submit_coords = res.get("submit_button_coords")
                if submit_coords:
                    self.device.tap(submit_coords[0], submit_coords[1])
                else:
                    self.device.press_enter()
                time.sleep(6)

            elif action == "SELECT_ACCOUNT":
                acc_coords = res.get("account_coords")
                if acc_coords:
                    self.device.tap(acc_coords[0], acc_coords[1])
                    time.sleep(3)

            elif action == "CLICK":
                target = res.get("submit_button_text", "Next")
                coords = res.get("submit_button_coords")
                coord_tuple = tuple(coords) if coords else None
                await self._atomic_click(current_img, current_xml, target,
                                            prefer_coords=coord_tuple)
                time.sleep(3)
            else:
                time.sleep(2)

        return False

    async def _handle_skip(self, img, xml_str, plan):
        skip_text = plan.get("skip_button_text") or "Skip"
        skip_coords = plan.get("skip_button_coords")

        if skip_coords:
            coord_tuple = tuple(skip_coords)
            print(f"         ⏭️ Skipping verification: '{skip_text}'")
            success = await self._atomic_click(
                img, xml_str, skip_text, prefer_coords=coord_tuple
            )
            if success:
                return {"handled": True, "status": "skipped",
                        "detail": f"Tapped '{skip_text}' to skip verification"}

        clickable = UIHierarchy.find_clickable_elements(xml_str)
        skip_keywords = ["skip", "not now", "later", "remind me later",
                         "do this later", "maybe later", "continue without"]

        for el in clickable:
            el_text = f"{el['text']} {el['desc']}".lower()
            for kw in skip_keywords:
                if kw in el_text:
                    label = el['text'] or el['desc']
                    print(f"         ⏭️ Skipping via: '{label}'")
                    success = await self._atomic_click(
                        img, xml_str, label, prefer_coords=el['center']
                    )
                    if success:
                        return {"handled": True, "status": "skipped",
                                "detail": f"Tapped '{label}' to skip verification"}

        return {"handled": False, "status": "skip_not_found",
                "detail": "Classified as deferrable but couldn't find skip button"}

    async def _handle_oauth(self, img, xml_str, plan):
        all_text = UIHierarchy.extract_visible_text(xml_str)

        res = await self._ai_call(f"""
        OAUTH / GOOGLE SIGN-IN SCREEN.

        I need to sign in with: {self.persona_email}

        VISIBLE TEXT:
        {all_text[:1500]}

        ELEMENTS:
        {UIHierarchy.parse_xml_to_string(xml_str)[:1500]}

        Is my account ({self.persona_email}) visible in an account list?
        Or do I need to enter my email?

        OUTPUT JSON:
        {{
            "account_visible": true/false,
            "account_coords": [x, y],
            "needs_email_entry": false,
            "action": "SELECT_ACCOUNT|ENTER_EMAIL|CLICK",
            "target_desc": "{self.persona_email}",
            "target_coords":[540, 800]
        }}
        """, images=[img])

        if res and res.get("account_visible"):
            coords = res.get("account_coords") or res.get("target_coords")
            if coords:
                await self._atomic_click(img, xml_str,
                                            res.get("target_desc", self.persona_email),
                                            prefer_coords=tuple(coords))
                time.sleep(3)
                return {"handled": True, "status": "oauth_account_selected",
                        "detail": f"Selected Google account {self.persona_email}"}

        return {"handled": False, "status": "oauth_manual",
                "detail": "OAuth flow requires manual handling"}


    def _regex_extract_code(self, text):
        if not text:
            return None

        codes_6 = re.findall(r'\b(\d{6})\b', text)
        for code in codes_6:
            if not (1900 <= int(code) <= 2100):
                return code

        codes_4 = re.findall(r'\b(\d{4})\b', text)
        for code in codes_4:
            if not (1900 <= int(code) <= 2100):
                return code

        codes_8 = re.findall(r'\b(\d{8})\b', text)
        for code in codes_8:
            return code

        alpha_codes = re.findall(r'\b([A-Z0-9]{6,8})\b', text)
        for code in alpha_codes:
            if any(c.isdigit() for c in code) and any(c.isalpha() for c in code):
                return code

        return None


def _is_black_screen_static(img_bytes):
    if not img_bytes:
        return True
    try:
        img = Image.open(io.BytesIO(img_bytes))
        if img.mode != 'RGB':
            img = img.convert('RGB')
        width, height = img.size
        top_cutoff = int(height * 0.10)
        bottom_cutoff = int(height * 0.90)
        content_crop = img.crop((0, top_cutoff, width, bottom_cutoff))
        extrema = content_crop.getextrema()
        if extrema == ((0, 0), (0, 0), (0, 0)):
            return True
        return False
    except:
        return False


# =============================================================================
# POST-AUTH ONBOARDING HANDLER
# =============================================================================
class PostAuthHandler:
    def __init__(self, device, ai_call_fn, persona):
        self.device = device
        self._ai_call = ai_call_fn
        self.persona = persona
        self.settled_count = 0
        self.post_auth_screens_seen = []
        self.interests_selected = 0
        self.permissions_handled = 0
        self.tutorials_dismissed = 0
        self.tooltips_dismissed = 0

        self.step_records = []
        self.screen_type_history = []
        self.action_history = []
        self.failed_actions = []
        self.dismissed_items = []
        self.permissions_log = []
        self.interests_log = []
        self.upsell_encounters = []
        self.carousel_positions = {}
        self.screens_since_last_change = 0
        self.last_screen_type = None
        self.last_screen_hash = None
        self.consecutive_same_type = 0
        self.total_post_auth_steps = 0

        self.friction_counters = {
            "total_post_auth_screens": 0,
            "tutorial_screens": 0,
            "carousel_screens": 0,
            "interest_screens": 0,
            "permission_dialogs": 0,
            "tooltip_overlays": 0,
            "upsell_paywalls": 0,
            "profile_completion_screens": 0,
            "notification_prompts": 0,
            "loading_screens": 0,
            "welcome_screens": 0,
            "unknown_screens": 0,
        }

        self.settled_evidence = []
        self.home_screen_fingerprints = []

        self.dismiss_fail_count = 0
        self.last_dismiss_target = None
        self.skipped_overlays = []

    def record_step(self, step_num, screen_type, screen_desc, action, target,
                    reasoning="", action_result=None, screen_hash=None,
                    xml_fingerprint=None, pre_img_hash=None, post_img_hash=None):
        self.total_post_auth_steps += 1
        self.friction_counters["total_post_auth_screens"] += 1

        record = {
            "index": len(self.step_records),
            "global_step": step_num,
            "screen_type": screen_type,
            "screen_description": screen_desc[:150],
            "action": action,
            "target": target[:100] if target else "",
            "reasoning": reasoning[:200] if reasoning else "",
            "action_result": action_result,
            "screen_hash": screen_hash,
            "xml_fingerprint": xml_fingerprint,
            "pre_img_hash": pre_img_hash,
            "post_img_hash": post_img_hash,
            "timestamp": time.time(),
            "screens_since_last_change": self.screens_since_last_change,
        }
        self.step_records.append(record)
        self.screen_type_history.append(screen_type)
        self.action_history.append(action)

        type_to_counter = {
            "TUTORIAL_CAROUSEL": "tutorial_screens",
            "WELCOME_SCREEN": "welcome_screens",
            "INTEREST_SELECTION": "interest_screens",
            "PERMISSION_DIALOG": "permission_dialogs",
            "TOOLTIP_OVERLAY": "tooltip_overlays",
            "UPSELL_PAYWALL": "upsell_paywalls",
            "PROFILE_COMPLETION": "profile_completion_screens",
            "NOTIFICATION_PROMPT": "notification_prompts",
            "LOADING": "loading_screens",
        }
        counter_key = type_to_counter.get(screen_type, "unknown_screens")
        self.friction_counters[counter_key] = self.friction_counters.get(counter_key, 0) + 1

        if screen_type == self.last_screen_type:
            self.consecutive_same_type += 1
        else:
            self.consecutive_same_type = 0
        self.last_screen_type = screen_type

        if screen_hash and screen_hash == self.last_screen_hash:
            self.screens_since_last_change += 1
        else:
            self.screens_since_last_change = 0
        self.last_screen_hash = screen_hash

        return record

    def record_screen(self, screen_type):
        self.post_auth_screens_seen.append(screen_type)
        if screen_type == "TUTORIAL_CAROUSEL":
            self.tutorials_dismissed += 1
        elif screen_type == "PERMISSION_DIALOG":
            self.permissions_handled += 1
        elif screen_type == "TOOLTIP_OVERLAY":
            self.tooltips_dismissed += 1
        elif screen_type == "INTEREST_SELECTION":
            self.interests_selected += 1







    def add_settled_evidence(self, evidence):
        self.settled_evidence.append({
            "evidence": evidence,
            "timestamp": time.time(),
        })

    def record_home_fingerprint(self, xml_fingerprint):
        if xml_fingerprint not in self.home_screen_fingerprints:
            self.home_screen_fingerprints.append(xml_fingerprint)



    def estimate_post_auth_progress(self):
        if self.total_post_auth_steps == 0:
            return {"progress": 0.0, "confidence": 0.1, "reasoning": "No post-auth steps yet"}

        signals = 0
        total_weight = 0

        if self.settled_count >= 2:
            signals += 3
        total_weight += 3

        if any(st in ("HOME_FEED", "HOME", "FEED", "DASHBOARD")
               for st in self.screen_type_history[-3:]):
            signals += 2
        total_weight += 2

        if len(self.home_screen_fingerprints) >= 1:
            signals += 2
        total_weight += 2

        recent_types = self.screen_type_history[-5:]
        onboarding_types = {"TUTORIAL_CAROUSEL", "INTEREST_SELECTION", "WELCOME_SCREEN",
                           "PROFILE_COMPLETION", "UPSELL_PAYWALL"}
        recent_onboarding = sum(1 for t in recent_types if t in onboarding_types)
        if recent_onboarding == 0:
            signals += 2
        total_weight += 2

        progress = signals / max(total_weight, 1)
        confidence = min(self.total_post_auth_steps / 10, 1.0) * 0.5 + progress * 0.5

        return {
            "progress": round(progress, 2),
            "confidence": round(confidence, 2),
            "reasoning": (f"{self.total_post_auth_steps} steps, "
                         f"settled_count={self.settled_count}, "
                         f"recent_onboarding={recent_onboarding}")
        }

    def get_flow_summary(self):
        lines = [f"Post-Auth Flow: {self.total_post_auth_steps} steps"]
        lines.append(f"  Screen types seen: {len(set(self.screen_type_history))}")
        lines.append(f"  Screens since last change: {self.screens_since_last_change}")
        lines.append(f"  Consecutive same type: {self.consecutive_same_type}")

        lines.append(f"  --- POST-AUTH FRICTION METRICS ---")
        for key, val in self.friction_counters.items():
            if val > 0:
                lines.append(f"  {key}: {val}")

        lines.append(f"  --- ACTION RESULTS ---")
        lines.append(f"  Total actions: {len(self.action_history)}")
        lines.append(f"  Failed actions: {len(self.failed_actions)}")
        lines.append(f"  Permissions handled: {self.permissions_handled}")
        lines.append(f"  Interests selected: {self.interests_selected}")
        lines.append(f"  Tutorials dismissed: {self.tutorials_dismissed}")
        lines.append(f"  Upsell encounters: {len(self.upsell_encounters)}")

        progress = self.estimate_post_auth_progress()
        lines.append(f"  --- PROGRESS ---")
        lines.append(f"  Estimated progress: {progress['progress']:.0%}")
        lines.append(f"  Settled evidence: {len(self.settled_evidence)}")
        lines.append(f"  Home fingerprints: {len(self.home_screen_fingerprints)}")

        if self.failed_actions:
            lines.append(f"  --- RECENT FAILURES ---")
            for fa in self.failed_actions[-3:]:
                lines.append(f"    {fa['action']} -> {fa['target']}: {fa['detail'][:60]}")

        return "\n".join(lines)


    def get_summary(self):
        return {
            "screens_seen": len(self.post_auth_screens_seen),
            "screen_types": self.post_auth_screens_seen,
            "interests_selected": self.interests_selected,
            "permissions_handled": self.permissions_handled,
            "tutorials_dismissed": self.tutorials_dismissed,
            "tooltips_dismissed": self.tooltips_dismissed,
            "settled_confirmations": self.settled_count,
            "total_post_auth_steps": self.total_post_auth_steps,
            "friction_counters": self.friction_counters,
            "step_records": self.step_records[-20:],
            "failed_actions": self.failed_actions[-10:],
            "permissions_log": self.permissions_log,
            "interests_log": self.interests_log,
            "upsell_encounters": self.upsell_encounters,
            "dismissed_items": self.dismissed_items,
            "settled_evidence": self.settled_evidence,
            "home_screen_fingerprints": self.home_screen_fingerprints,
            "progress_estimate": self.estimate_post_auth_progress(),
        }


# =============================================================================
# ACCOUNT CREATION DETECTOR (Retrospective)
# =============================================================================
class AccountCreationDetector:
    POST_CREATION_INDICATORS = [
        "welcome", "you're in", "you're all set", "account created",
        "registration complete", "signup complete", "sign up complete",
        "congratulations", "success", "great!", "awesome!",
        "verify your email", "check your inbox", "we sent",
        "confirmation sent", "verification code", "enter the code",
        "choose your interests", "pick topics", "follow",
        "set up your profile", "complete your profile",
        "enable notifications", "allow notifications",
        "your feed", "home", "dashboard", "for you",
        "discover", "trending", "recommended",
    ]
    PRE_CREATION_INDICATORS = [
        "enter your email", "enter your password", "create a password",
        "date of birth", "what's your name", "choose a username",
        "sign up", "register", "create account", "log in", "sign in",
        "error", "invalid", "already exists", "try again",
        "password too", "too short", "too weak",
    ]

    PAYMENT_HARD_STOP_INDICATORS = [
        "card number", "cvv", "cvc", "billing address",
        "expiration date", "enter card details", "enter card",
        "add card",
    ]

    PAYMENT_SOFT_INDICATORS = [
        "credit card", "debit card", "payment method", "add payment",
        "google play", "app store", "in-app purchase",
        "subscribe", "premium", "upgrade",
    ]

    FREE_TRIAL_SAFE_INDICATORS = [
        "start free trial", "free trial", "try free", "7 day free",
        "14 day free", "30 day free", "free for",
    ]

    def __init__(self, ai_call_fn):
        self._ai_call = ai_call_fn
        self.creation_detected = False
        self.creation_evidence = []
        self.detection_history = []

    async def check_post_tap(self, pre_img, post_img, pre_xml, post_xml,
                              button_text, filled_fields):
        post_text = UIHierarchy.extract_visible_text(post_xml).lower()
        pre_text = UIHierarchy.extract_visible_text(pre_xml).lower()

        # Strict security guard: An account cannot possibly be created unless
        # we have either typed into auth fields OR clicked an OAuth login button.
        has_auth_fields = any(
            any(kw in fn.lower() for kw in ["email", "password", "pass", "username", "user", "phone"])
            for fn in filled_fields.keys()
        )
        has_oauth = any(
            kw in pre_text.lower() for kw in ["google", "apple", "facebook", "instagram", "twitter", "linkedin"]
        )

        if not has_auth_fields and not has_oauth:
            return {
                "account_created": False,
                "confidence": 1.0,
                "evidence": "No signup evidence (no auth fields filled and no OAuth clicked)",
                "requires_verification": False,
                "verification_type": None,
                "is_payment_wall": False,
                "is_free_trial_safe": False,
            }

        payment_hits = [ind for ind in self.PAYMENT_HARD_STOP_INDICATORS if ind in post_text]
        if payment_hits:
            free_hits = [ind for ind in self.FREE_TRIAL_SAFE_INDICATORS if ind in post_text]
            has_card_input_form = any(ind in post_text for ind in [
                "card number", "cvv", "cvc", "enter card details",
                "enter your card"])
            has_card_edit_fields = False
            try:
                input_fields = UIHierarchy.find_input_fields(post_xml)
                for f in input_fields:
                    combined = f"{f.get('hint', '')} {f.get('resource_id', '')}".lower()
                    if any(kw in combined for kw in ["card", "cvv", "cvc", "billing", "expir"]):
                        has_card_edit_fields = True
                        break
            except:
                pass

            if has_card_input_form and has_card_edit_fields and not free_hits:
                return {
                    "account_created": False,
                    "confidence": 0.95,
                    "evidence": f"Card entry form with input fields: {payment_hits}",
                    "requires_verification": False,
                    "verification_type": None,
                    "is_payment_wall": True,
                    "is_free_trial_safe": False,
                }

        post_signals = []
        pre_signals = []

        for indicator in self.POST_CREATION_INDICATORS:
            if indicator in post_text and indicator not in pre_text:
                post_signals.append(indicator)

        for indicator in self.PRE_CREATION_INDICATORS:
            if indicator in post_text:
                pre_signals.append(indicator)

        has_auth_fields = any(
            any(kw in fn.lower() for kw in ["email", "password", "pass", "username", "user", "phone"])
            for fn in filled_fields.keys()
        )

        valid_post_signals = post_signals
        if not has_auth_fields:
            weak_signals = ["home", "dashboard", "your feed", "for you", "discover", "trending", "recommended"]
            valid_post_signals = [s for s in post_signals if s not in weak_signals]

        if len(valid_post_signals) >= 2 and len(pre_signals) == 0:
            result = {
                "account_created": True,
                "confidence": 0.85,
                "evidence": f"Post-creation signals: {valid_post_signals}",
                "requires_verification": any("verif" in s or "code" in s or "inbox" in s
                                             for s in valid_post_signals),
                "verification_type": self._infer_verification_type(post_text),
                "is_payment_wall": False,
                "is_free_trial_safe": False,
            }
            self.creation_detected = True
            self.creation_evidence = valid_post_signals
            self.detection_history.append(result)
            return result

        res = await self._ai_call(f"""
        ACCOUNT CREATION DETECTION — RETROSPECTIVE.

        I just tapped "{button_text}" in the app.

        BEFORE TAP — screen showed:
        {pre_text[:800]}

        AFTER TAP — screen now shows:
        {post_text[:800]}

        Fields that were filled: {', '.join(f'{k}={v}' for k, v in filled_fields.items())}

        DETERMINE:
        1. Did account creation / registration JUST HAPPEN?
        2. Is the user now LOGGED IN when they weren't before?
        3. Did the app transition from a signup flow to a post-auth experience?
        4. Or is this just another step in the form / navigation?

        CRITICAL RULE: If the AFTER TAP screen shows an email inbox, Gmail, or an email message, YOU MUST output "account_created": false. Account creation is not confirmed until we return to the main app!

        Also check: Is there a PAYMENT FORM visible?

        OUTPUT JSON:
        {{
            "account_created": true/false,
            "confidence": 0.0-1.0,
            "evidence": "...",
            "screen_transition": "form_to_welcome",
            "requires_verification": false,
            "verification_type": "none|email_code|email_link|sms_code|deferrable",
            "is_payment_wall": false,
            "is_free_trial_safe": false,
            "still_in_form": false
        }}
        """, images=[pre_img, post_img])

        if res:
            created = res.get("account_created", False)
            if created:
                has_auth_fields = any(
                    any(kw in fn.lower() for kw in ["email", "password", "pass", "username", "user", "phone"])
                    for fn in filled_fields.keys()
                )
                has_oauth = any(
                    kw in pre_text.lower() for kw in ["google", "apple", "facebook", "instagram"]
                )

                if not has_auth_fields and not has_oauth:
                    print(f"      🛡️ OVERRIDE: AI hallucinated account creation on '{button_text}'. "
                          f"Forcing False (Guest Mode).")
                    created = False
                    res["evidence"] = f"[OVERRIDDEN] {res.get('evidence', '')} (No auth fields filled)"

            result = {
                "account_created": created,
                "confidence": res.get("confidence", 0.5),
                "evidence": res.get("evidence", ""),
                "requires_verification": res.get("requires_verification", False),
                "verification_type": res.get("verification_type", "none"),
                "is_payment_wall": res.get("is_payment_wall", False),
                "is_free_trial_safe": res.get("is_free_trial_safe", False),
            }
            if created:
                self.creation_detected = True
                self.creation_evidence.append(res.get("evidence", ""))
            self.detection_history.append(result)
            return result

        return {
            "account_created": False,
            "confidence": 0.3,
            "evidence": "AI check failed",
            "requires_verification": False,
            "verification_type": None,
            "is_payment_wall": False,
            "is_free_trial_safe": False,
        }

    def _infer_verification_type(self, text):
        if any(kw in text for kw in ["enter the code", "verification code", "digit code", "otp"]):
            return "email_code"
        if any(kw in text for kw in ["click the link", "tap the link", "confirmation link"]):
            return "email_link"
        if any(kw in text for kw in ["sms", "text message", "phone"]):
            return "sms_code"
        if any(kw in text for kw in ["verify your email", "check your inbox"]):
            return "email_link"
        return "none"

    def should_check(self, button_text, phase, filled_fields_count):
        if not button_text:
            return False
        if self.creation_detected:
            return False
        if phase == "EXPLORE":
            return False

        text_lower = button_text.lower().strip()

        dialog_dismissal_keywords = [
            "cancel", "ok", "close", "dismiss", "not now",
            "skip", "maybe later", "no thanks", "got it",
        ]
        if (text_lower in dialog_dismissal_keywords and
                phase in ("FORM_FILL", "SIGNUP") and
                filled_fields_count >= 2):
            return True

        submit_keywords = [
            "create account", "register", "sign up", "signup", "submit",
            "finish", "complete", "join", "join now", "confirm",
            "done", "create", "finalize", "activate",
        ]
        for kw in submit_keywords:
            if kw in text_lower:
                return True

        if phase == "FORM_FILL" and filled_fields_count >= 2:
            ambiguous = ["continue", "next", "get started", "let's go",
                         "start", "begin", "go", "ready"]
            for kw in ambiguous:
                if kw in text_lower:
                    return True

        if phase == "SIGNUP":
            safe_skip = ["back", "cancel", "show password", "hide password",
                         "forgot", "learn more", "help"]
            if not any(s in text_lower for s in safe_skip):
                return True

        return False


# =============================================================================
# PAYMENT WALL DETECTOR
# =============================================================================
class PaymentWallDetector:
    HARD_CARD_ENTRY_INDICATORS = [
        "card number", "credit card number", "debit card number",
        "cvv", "cvc", "security code",
        "expiration date", "exp date", "mm/yy", "mm / yy",
        "billing address", "billing info", "billing information",
        "enter card details", "add card", "add payment method",
        "payment information", "enter your card",
    ]

    SOFT_PAYMENT_INDICATORS = [
        "google play", "in-app purchase", "app store",
        "subscribe with google", "1-tap buy",
        "payment method",
        "subscribe now", "upgrade now", "go premium", "go pro",
        "auto-renew", "will be charged", "recurring",
        "start subscription", "unlock premium", "unlock pro",
        "per month", "per year", "per week",
    ]

    FREE_PATH_INDICATORS = [
        "skip", "no thanks", "not now", "maybe later", "close",
        "free", "free version", "free plan", "free tier",
        "basic plan", "basic", "starter",
        "continue with free", "limited version",
        "restore purchase", "already subscribed",
        "free trial", "start free trial", "try free",
        "start trial", "begin trial", "begin free trial",
        "7 day", "14 day", "30 day", "day free",
        "try for free", "get started free",
        "✕", "×",
    ]

    def __init__(self):
        self.payment_screens_seen = 0
        self.hard_wall_confirmed = False
        self.free_path_found = False
        self.free_trial_tapped = False

    def check_for_payment_wall(self, xml_str, img=None):
        text = UIHierarchy.extract_visible_text(xml_str).lower()
        clickable = UIHierarchy.find_clickable_elements(xml_str)

        marketing_plans = ["choose your plan", "pricing & plans", "advertisers", "agencies", "explore solutions"]
        has_marketing_plans = any(p in text for p in marketing_plans)

        input_fields = UIHierarchy.find_input_fields(xml_str)
        has_card_edit_fields = any(
            any(kw in f"{f.get('hint', '')} {f.get('resource_id', '')}".lower()
                for kw in ["card", "cvv", "cvc", "billing", "expir"])
            for f in input_fields
        )

        if has_marketing_plans and not has_card_edit_fields:
            return {
                "is_hard_wall": False,
                "has_free_path": True,
                "detail": "Promotional plan selector or persona funnel detected. Proceeding to find signup options.",
                "free_options": ["choose plan", "get started", "explore solutions"]
            }

        card_entry_hits = [ind for ind in self.HARD_CARD_ENTRY_INDICATORS if ind in text]
        card_input_fields = []
        for f in input_fields:
            combined = f"{f.get('hint', '')} {f.get('resource_id', '')}".lower()
            if any(kw in combined for kw in ["card", "cvv", "cvc", "billing", "expir"]):
                card_input_fields.append(combined)

        all_clickable_text = " ".join(
            f"{el['text']} {el['desc']}".lower() for el in clickable
        )
        free_hits = [ind for ind in self.FREE_PATH_INDICATORS if ind in all_clickable_text]
        has_close = self._has_close_button(clickable)
        free_text_hits = [ind for ind in self.FREE_PATH_INDICATORS if ind in text]

        if card_input_fields and not free_hits and not has_close:
            self.hard_wall_confirmed = True
            self.payment_screens_seen += 1
            return {
                "is_hard_wall": True,
                "has_free_path": False,
                "detail": f"Card entry form detected: {card_input_fields[:3]}",
                "free_options": [],
            }

        if card_entry_hits and (free_hits or has_close or free_text_hits):
            self.free_path_found = True
            return {
                "is_hard_wall": False,
                "has_free_path": True,
                "detail": f"Payment present but free path available: {free_hits or free_text_hits or ['close button']}",
                "free_options": free_hits or free_text_hits,
            }

        soft_hits = [ind for ind in self.SOFT_PAYMENT_INDICATORS if ind in text]
        if soft_hits:
            self.payment_screens_seen += 1
            if free_hits or has_close or free_text_hits:
                self.free_path_found = True
                return {
                    "is_hard_wall": False,
                    "has_free_path": True,
                    "detail": f"Soft payment indicators ({soft_hits[:3]}) with free path: {free_hits or free_text_hits or ['close']}",
                    "free_options": free_hits or free_text_hits,
                }
            else:
                return {
                    "is_hard_wall": False,
                    "has_free_path": False,
                    "detail": f"Payment screen ({soft_hits[:3]}) — no obvious free path yet, agent should explore",
                    "free_options": [],
                }

        return {
            "is_hard_wall": False,
            "has_free_path": True,
            "detail": "No payment indicators",
            "free_options": [],
        }

    def is_card_entry_form(self, xml_str):
        input_fields = UIHierarchy.find_input_fields(xml_str)
        card_keywords = ["card number", "card_number", "cvv", "cvc",
                         "expir", "billing", "zip code", "postal"]
        card_fields_found = 0
        for f in input_fields:
            combined = f"{f.get('hint', '')} {f.get('resource_id', '')}".lower()
            if any(kw in combined for kw in card_keywords):
                card_fields_found += 1
        return card_fields_found >= 2

    def _has_close_button(self, clickable):
        for el in clickable:
            text = (el.get('text', '') or '').strip()
            desc = (el.get('desc', '') or '').strip()
            cx, cy = el.get('center', (0, 0))

            if text.lower() == 'x' or text in ('✕', '×', '✖'):
                return True
            if desc.lower() in ('close', 'dismiss', 'close button', 'navigate up'):
                return True

            if cy < 350 and el.get('enabled', True):
                rect = el.get('rect', (0, 0, 0, 0))
                if rect:
                    btn_w = rect[2] - rect[0]
                    btn_h = rect[3] - rect[1]
                    if btn_w < 150 and btn_h < 150 and (cx < 200 or cx > 880):
                        return True

        return False

    def is_google_play_payment_sheet(self, xml_str):
        text = UIHierarchy.extract_visible_text(xml_str).lower()
        gp_signals = [
            "add payment method to your google account",
            "add a payment method to your google",
            "add card",
            "add paypal",
            "redeem code",
            "google play",
        ]
        hits = sum(1 for s in gp_signals if s in text)
        return hits >= 3


# =============================================================================
# BotChallengeHandler
# =============================================================================
class BotChallengeHandler:
    PRESS_AND_HOLD = "press_and_hold"
    SLIDE_TO_VERIFY = "slide_to_verify"
    CHECKBOX_ONLY = "checkbox_only"
    SIMPLE_QUESTION = "simple_question"
    IMAGE_GRID = "image_grid"
    PUZZLE = "puzzle"
    DISTORTED_TEXT = "distorted_text"
    UNKNOWN_CHALLENGE = "unknown"
    NOT_A_CHALLENGE = "none"

    MAX_ATTEMPTS_PER_TYPE = {
        "press_and_hold": 3,
        "slide_to_verify": 3,
        "checkbox_only": 2,
        "simple_question": 2,
        "image_grid": 1,
        "puzzle": 1,
        "distorted_text": 1,
        "unknown": 2,
    }

    def __init__(self, device, ai_call_fn, capture_screen_fn):
        self.device = device
        self._ai_call = ai_call_fn
        self._capture_screen = capture_screen_fn
        self.challenges_seen = []
        self.challenges_solved = 0
        self.challenges_failed = 0
        self.current_type = None
        self.current_attempts = 0

    async def classify_challenge(self, img, xml_str):
        all_text = UIHierarchy.extract_visible_text(xml_str).lower()

        challenge_keywords = [
            "press & hold", "press and hold", "hold to confirm",
            "slide to verify", "slide to unlock", "drag the slider",
            "i'm not a robot", "i am not a robot", "not a robot",
            "verify you are human", "prove you're not a robot",
            "confirm you are a human", "human verification",
            "complete the security check", "security challenge",
            "select all images", "click each image", "select all squares",
            "recaptcha", "hcaptcha", "funcaptcha", "arkose",
            "captcha", "bot detection", "challenge",
            "type the characters", "type the text", "enter the code",
            "solve this puzzle", "rotate the image",
        ]

        has_any_keyword = any(kw in all_text for kw in challenge_keywords)
        has_webview = UIHierarchy.detect_webview(xml_str)

        if not has_any_keyword and not has_webview:
            return self.NOT_A_CHALLENGE, {}

        if any(kw in all_text for kw in ["press & hold", "press and hold", "hold to confirm"]):
            return self.PRESS_AND_HOLD, {"detected_via": "keyword"}

        if any(kw in all_text for kw in ["slide to verify", "slide to unlock", "drag the slider"]):
            return self.SLIDE_TO_VERIFY, {"detected_via": "keyword"}

        if not any(kw in all_text for kw in [
            "i'm not a robot", "recaptcha", "hcaptcha", "captcha",
            "select all", "security check", "funcaptcha", "arkose",
            "verify you are human", "confirm you are a human",
        ]):
            if not has_webview:
                return self.NOT_A_CHALLENGE, {}

        res = await self._ai_call(f"""
        BOT CHALLENGE CLASSIFICATION.

        Is this screen a bot detection challenge / CAPTCHA? If so, what type?

        VISIBLE TEXT:
        {all_text[:1500]}

        CHALLENGE TYPES (pick one):
        - "press_and_hold": A button to press and hold for several seconds
        - "slide_to_verify": A slider to drag from left to right
        - "checkbox_only": A simple "I'm not a robot" checkbox (no image grid yet)
        - "simple_question": A text-based question (math, color, simple logic)
        - "image_grid": Select images matching a description (traffic lights, crosswalks, etc.)
        - "puzzle": Rotating image, sliding puzzle, jigsaw
        - "distorted_text": Type warped/distorted characters
        - "unknown": Some other bot challenge I can't classify
        - "none": This is NOT a bot challenge

        Be CONSERVATIVE — only classify as a challenge if it clearly IS one.
        Login forms, signup forms, verification code entry, and permission dialogs
        are NOT challenges.

        OUTPUT JSON:
        {{
            "is_challenge": true,
            "challenge_type": "checkbox_only",
            "confidence": 0.95,
            "challenge_description": "reCAPTCHA checkbox asking to confirm not a robot",
            "interactive_element": "I'm not a robot checkbox",
            "element_coords": [300, 800],
            "reasoning": "..."
        }}
        """, images=[img])

        if not res or not res.get("is_challenge"):
            return self.NOT_A_CHALLENGE, {}

        confidence = res.get("confidence", 0.5)
        if confidence < 0.7:
            return self.NOT_A_CHALLENGE, {}

        challenge_type = res.get("challenge_type", "unknown")
        valid_types = [
            self.PRESS_AND_HOLD, self.SLIDE_TO_VERIFY, self.CHECKBOX_ONLY,
            self.SIMPLE_QUESTION, self.IMAGE_GRID, self.PUZZLE,
            self.DISTORTED_TEXT, self.UNKNOWN_CHALLENGE,
        ]
        if challenge_type not in valid_types:
            challenge_type = self.UNKNOWN_CHALLENGE

        return challenge_type, res

    async def attempt_challenge(self, challenge_type, details, img, xml_str):
        self.current_type = challenge_type
        self.current_attempts = 0
        max_attempts = self.MAX_ATTEMPTS_PER_TYPE.get(challenge_type, 2)

        self.challenges_seen.append({
            "type": challenge_type,
            "description": details.get("challenge_description", ""),
            "timestamp": time.time(),
        })

        print(f"      🤖 Bot challenge: {challenge_type} (max {max_attempts} attempts)")

        for attempt in range(1, max_attempts + 1):
            self.current_attempts = attempt
            print(f"         Attempt {attempt}/{max_attempts}...")

            success = False

            if challenge_type == self.PRESS_AND_HOLD:
                success = await self._solve_press_and_hold(img, xml_str, details)

            elif challenge_type == self.SLIDE_TO_VERIFY:
                success = await self._solve_slide_to_verify(img, xml_str, details)

            elif challenge_type == self.CHECKBOX_ONLY:
                success = await self._solve_checkbox(img, xml_str, details)

            elif challenge_type == self.SIMPLE_QUESTION:
                success = await self._solve_simple_question(img, xml_str, details)

            elif challenge_type in (self.IMAGE_GRID, self.PUZZLE, self.DISTORTED_TEXT):
                success = await self._solve_visual_challenge(img, xml_str, details)

            elif challenge_type == self.UNKNOWN_CHALLENGE:
                success = await self._solve_unknown(img, xml_str, details)

            if success:
                print(f"         ✅ Challenge solved!")
                self.challenges_solved += 1
                return True

            time.sleep(2)
            img = self._capture_screen()
            xml_str = self.device.get_ui_xml()
            if not img:
                break

            still_challenge, _ = await self.classify_challenge(img, xml_str)
            if still_challenge == self.NOT_A_CHALLENGE:
                print(f"         ✅ Challenge screen gone — likely solved!")
                self.challenges_solved += 1
                return True

        print(f"         ❌ Failed to solve {challenge_type} after {max_attempts} attempts")
        self.challenges_failed += 1
        return False

    async def _solve_press_and_hold(self, img, xml_str, details):
        coords = details.get("element_coords")

        if not coords:
            res = await self._ai_call(f"""
            Find the "Press & Hold" button on this screen.
            I need its EXACT center coordinates.
            OUTPUT JSON:
            {{ "button_coords": [x, y], "reasoning": "..." }}
            """, images=[img])
            if res and res.get("button_coords"):
                coords = res["button_coords"]

        if not coords:
            print(f"         ⚠️ Could not locate Press & Hold button")
            return False

        print(f"         👆 Long-pressing at ({coords[0]}, {coords[1]}) for 4 seconds...")
        self.device.long_press(coords[0], coords[1], duration_ms=4000)
        time.sleep(5)
        return await self._check_if_cleared(img)

    async def _solve_slide_to_verify(self, img, xml_str, details):
        res = await self._ai_call(f"""
        Find the slider / drag handle on this verification screen.
        I need:
        - The START position (left side of slider handle)
        - The END position (right edge where I need to drag to)
        Both should be at the same Y coordinate (horizontal drag).

        OUTPUT JSON:
        {{
            "start_coords": [x, y],
            "end_coords": [x, y],
            "reasoning": "..."
        }}
        """, images=[img])

        if not res or not res.get("start_coords") or not res.get("end_coords"):
            print(f"         ⚠️ Could not locate slider")
            return False

        sx, sy = res["start_coords"]
        ex, ey = res["end_coords"]
        print(f"         👆 Sliding from ({sx}, {sy}) to ({ex}, {ey})...")

        duration = random.randint(600, 1200)
        self.device.adb(f"input swipe {sx} {sy} {ex} {ey} {duration}")
        time.sleep(3)
        return await self._check_if_cleared(img)

    async def _solve_checkbox(self, img, xml_str, details):
        coords = details.get("element_coords")

        if not coords:
            res = await self._ai_call(f"""
            Find the "I'm not a robot" checkbox or verification checkbox.
            OUTPUT JSON:
            {{ "checkbox_coords": [x, y], "reasoning": "..." }}
            """, images=[img])
            if res and res.get("checkbox_coords"):
                coords = res["checkbox_coords"]

        if not coords:
            print(f"         ⚠️ Could not locate checkbox")
            return False

        print(f"         👆 Tapping checkbox at ({coords[0]}, {coords[1]})...")
        self.device.tap(coords[0], coords[1])
        time.sleep(4)

        post_img = self._capture_screen()
        if not post_img:
            return False

        post_xml = self.device.get_ui_xml()
        post_type, _ = await self.classify_challenge(post_img, post_xml)

        if post_type == self.NOT_A_CHALLENGE:
            return True
        elif post_type == self.IMAGE_GRID:
            print(f"         🖼️ Checkbox escalated to image grid...")
            return False
        else:
            return False

    async def _solve_simple_question(self, img, xml_str, details):
        res = await self._ai_call(f"""
        BOT CHALLENGE: Answer the question on screen.

        Look at the challenge and determine the answer.
        If it's math (e.g., "What is 3 + 7?"), compute the answer.
        If it asks about an image or color, describe what you see.

        Also find where to enter the answer and where to submit.

        OUTPUT JSON:
        {{
            "answer": "10",
            "input_coords": [x, y],
            "submit_coords": [x, y],
            "reasoning": "The question asks what is 3 + 7, answer is 10"
        }}
        """, images=[img])

        if not res or not res.get("answer"):
            return False

        answer = str(res["answer"])
        input_coords = res.get("input_coords")
        submit_coords = res.get("submit_coords")

        if input_coords:
            self.device.tap(input_coords[0], input_coords[1])
            time.sleep(0.5)
            self.device.clear_field()
            self.device.input_text_safe(answer)
            time.sleep(0.5)
            self.device.dismiss_keyboard()
            time.sleep(0.5)

        if submit_coords:
            self.device.tap(submit_coords[0], submit_coords[1])
            time.sleep(3)

        return await self._check_if_cleared(img)

    async def _solve_visual_challenge(self, img, xml_str, details):
        res = await self._ai_call(f"""
        BOT CHALLENGE — VISUAL CHALLENGE ATTEMPT.

        I see a visual bot challenge on screen. Try to solve it.

        If it's an IMAGE GRID ("select all images with traffic lights"):
        - Identify which grid squares match the description
        - Return their coordinates

        If it's DISTORTED TEXT:
        - Read the warped characters
        - Return the text and where to type it

        If it's a PUZZLE:
        - Describe what action is needed (rotate, slide, etc.)
        - Return start and end coordinates for the gesture

        OUTPUT JSON:
        {{
            "can_attempt": true,
            "challenge_description": "Select all squares with traffic lights",
            "solution_type": "tap_multiple|type_text|swipe",
            "tap_coords": [[x1,y1], [x2,y2], [x3,y3]],
            "text_answer": null,
            "text_input_coords": null,
            "swipe_start": null,
            "swipe_end": null,
            "submit_coords": [x, y],
            "confidence": 0.3,
            "reasoning": "I can see traffic lights in squares 1, 4, and 7"
        }}
        """, images=[img])

        if not res or not res.get("can_attempt"):
            print(f"         ⚠️ AI cannot attempt this visual challenge")
            return False

        confidence = res.get("confidence", 0.3)
        print(f"         🎯 Attempting visual challenge (confidence: {confidence:.0%})...")

        solution_type = res.get("solution_type", "")

        if solution_type == "tap_multiple" and res.get("tap_coords"):
            for coords in res["tap_coords"]:
                self.device.tap(coords[0], coords[1])
                time.sleep(random.uniform(0.3, 0.8))
            time.sleep(1)
            if res.get("submit_coords"):
                self.device.tap(res["submit_coords"][0], res["submit_coords"][1])
                time.sleep(3)

        elif solution_type == "type_text" and res.get("text_answer"):
            if res.get("text_input_coords"):
                self.device.tap(res["text_input_coords"][0], res["text_input_coords"][1])
                time.sleep(0.5)
            self.device.input_text_safe(res["text_answer"])
            time.sleep(0.5)
            if res.get("submit_coords"):
                self.device.tap(res["submit_coords"][0], res["submit_coords"][1])
                time.sleep(3)

        elif solution_type == "swipe" and res.get("swipe_start") and res.get("swipe_end"):
            sx, sy = res["swipe_start"]
            ex, ey = res["swipe_end"]
            self.device.adb(f"input swipe {sx} {sy} {ex} {ey} {random.randint(500, 1000)}")
            time.sleep(3)
        else:
            return False

        return await self._check_if_cleared(img)

    async def _solve_unknown(self, img, xml_str, details):
        res = await self._ai_call(f"""
        BOT CHALLENGE — UNKNOWN TYPE.

        There is a bot/human verification challenge on this screen.
        Analyze it and tell me exactly what action to perform.

        Possible actions:
        - LONG_PRESS: Press and hold at coordinates for N seconds
        - TAP: Tap at coordinates
        - SWIPE: Swipe from point A to point B
        - TYPE: Enter text into a field
        - TAP_MULTIPLE: Tap several locations

        OUTPUT JSON:
        {{
            "action": "LONG_PRESS|TAP|SWIPE|TYPE|TAP_MULTIPLE",
            "coords": [x, y],
            "end_coords": [x, y],
            "duration_ms": 4000,
            "text": null,
            "tap_coords": [],
            "submit_coords": [x, y],
            "reasoning": "..."
        }}
        """, images=[img])

        if not res:
            return False

        action = res.get("action", "")
        coords = res.get("coords")

        if action == "LONG_PRESS" and coords:
            duration = res.get("duration_ms", 4000)
            self.device.long_press(coords[0], coords[1], duration_ms=duration)
            time.sleep(duration / 1000 + 2)

        elif action == "TAP" and coords:
            self.device.tap(coords[0], coords[1])
            time.sleep(3)

        elif action == "SWIPE" and coords and res.get("end_coords"):
            ex, ey = res["end_coords"]
            self.device.adb(f"input swipe {coords[0]} {coords[1]} {ex} {ey} 800")
            time.sleep(3)

        elif action == "TYPE" and res.get("text"):
            if coords:
                self.device.tap(coords[0], coords[1])
                time.sleep(0.5)
            self.device.input_text_safe(res["text"])
            if res.get("submit_coords"):
                self.device.tap(res["submit_coords"][0], res["submit_coords"][1])
            time.sleep(3)

        elif action == "TAP_MULTIPLE" and res.get("tap_coords"):
            for tc in res["tap_coords"]:
                self.device.tap(tc[0], tc[1])
                time.sleep(random.uniform(0.3, 0.8))
            if res.get("submit_coords"):
                self.device.tap(res["submit_coords"][0], res["submit_coords"][1])
            time.sleep(3)
        else:
            return False

        return await self._check_if_cleared(img)

    async def _check_if_cleared(self, pre_challenge_img):
        post_img = self._capture_screen()
        if not post_img:
            return False

        post_xml = self.device.get_ui_xml()
        post_type, _ = await self.classify_challenge(post_img, post_xml)

        if post_type == self.NOT_A_CHALLENGE:
            return True

        pre_hash = compute_screen_hash(pre_challenge_img)
        post_hash = compute_screen_hash(post_img)
        if pre_hash != post_hash:
            post_text = UIHierarchy.extract_visible_text(post_xml).lower()
            if any(kw in post_text for kw in ["success", "verified", "passed", "welcome",
                                                "continue", "email", "password", "sign up"]):
                return True

        return False

    def get_summary(self):
        return {
            "challenges_seen": len(self.challenges_seen),
            "challenges_solved": self.challenges_solved,
            "challenges_failed": self.challenges_failed,
            "challenge_history": self.challenges_seen,
        }


# =============================================================================
# MISCLICK RECOVERY CLASS
# =============================================================================


class PersistentTimeline(list):
    """Append-only timeline that survives Ctrl-C / resumed process runs."""

    def __init__(self, journal_path, manifest_path=None, run_id=None):
        self.journal_path = journal_path
        self.run_id = run_id or uuid.uuid4().hex[:8]
        entries = []

        if os.path.isfile(journal_path):
            try:
                with open(journal_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            item = json.loads(line)
                            if isinstance(item, dict):
                                entries.append(item)
                        except json.JSONDecodeError:
                            continue
            except OSError:
                pass
        elif manifest_path and os.path.isfile(manifest_path):
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    previous = json.load(f)
                previous_timeline = previous.get("timeline", [])
                if isinstance(previous_timeline, list):
                    entries.extend(x for x in previous_timeline if isinstance(x, dict))
            except (OSError, json.JSONDecodeError):
                pass

        super().__init__(entries)
        max_seq = 0
        for item in self:
            try:
                max_seq = max(max_seq, int(item.get("timeline_sequence", 0)))
            except (TypeError, ValueError):
                pass
        self._next_sequence = max(max_seq + 1, len(self) + 1)

        if self and not os.path.isfile(journal_path):
            self._rewrite_journal()

    def _rewrite_journal(self):
        try:
            os.makedirs(os.path.dirname(self.journal_path), exist_ok=True)
            with open(self.journal_path, "w", encoding="utf-8") as f:
                for item in self:
                    f.write(json.dumps(item, default=str) + "\n")
        except OSError:
            pass

    def append(self, item):
        if not isinstance(item, dict):
            return super().append(item)

        entry = dict(item)
        if not entry.get("timeline_sequence"):
            entry["timeline_sequence"] = self._next_sequence
            self._next_sequence += 1
        entry.setdefault("run_id", self.run_id)

        super().append(entry)
        try:
            os.makedirs(os.path.dirname(self.journal_path), exist_ok=True)
            with open(self.journal_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, default=str) + "\n")
        except OSError:
            pass


# =============================================================================
# ONBOARDING SPY v13.3.2 — SINGLE-PLANNER CORE + COMPLETE PERSONA + HOME/CTA INTEGRITY
# =============================================================================
class OnboardingSpy:
    def __init__(self):
        if not API_KEYS:
            raise RuntimeError(
                "No OpenAI API key configured. Set OPENAI_API_KEY, "
                "OPENAI_API_KEYS, or MOBILESPY_OPENAI_API_KEYS before launching "
                "onboarding_mobile2.py."
            )

        self.api_key = API_KEYS[0]
        self.client = OpenAI(api_key=self.api_key)
        date_str = datetime.now().strftime("%Y%m%d_%H%M")

        # NOTE: --resume is the existing SESSION resume directory.
        # --resume-pdf is the actual PDF document to upload during onboarding.
        self.resume_path = None
        self.resume_pdf_path = (
            os.path.abspath(DEFAULT_RESUME_PDF) if DEFAULT_RESUME_PDF else ""
        )
        default_identity_profile = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "onboarding_identity_profile.json",
        )
        configured_identity_profile = (
            os.environ.get("ONBOARDING_IDENTITY_PROFILE", "").strip()
            or os.environ.get("ONBOARDING_PERSONA_JSON", "").strip()
        )
        self.persona_json_path = os.path.abspath(os.path.expanduser(
            configured_identity_profile
            or (default_identity_profile if os.path.isfile(default_identity_profile) else "")
        )) if (configured_identity_profile or os.path.isfile(default_identity_profile)) else ""

        self.identity_profile = {}
        self.profile_flat = {}
        self.profile_loaded_keys = set()
        self.profile_provenance = {}
        self.profile_semantic_aliases = {}
        self.profile_policy = {}
        self._missing_profile_requirement = None

        self.university_value = DEFAULT_UNIVERSITY
        self.university_locked = bool(DEFAULT_UNIVERSITY)
        self.university_selected_from_ui = False
        self.continue_current = ("--continue-current" in sys.argv or "--no-wipe" in sys.argv)
        self._auto_reused_session = False
        self.run_id = datetime.now().strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:6]

        # Passive panorama recorder. It may capture/scroll/stitch, but it never
        # chooses or changes onboarding actions.
        self.passive_panoramas_enabled = "--no-panoramas" not in sys.argv

        # Primary capture profile is fast/conservative. If the stitcher rejects
        # that capture, the recorder automatically retries the SAME screen with
        # a proven high-overlap profile before giving up.
        self.panorama_scrolls = 12
        self.panorama_rescue_scrolls = 16

        for idx, arg in enumerate(sys.argv):
            if arg.startswith("--resume-pdf=") or arg.startswith("--resume-file="):
                self.resume_pdf_path = os.path.abspath(os.path.expanduser(arg.split("=", 1)[1]))
            elif arg in ("--resume-pdf", "--resume-file") and idx + 1 < len(sys.argv):
                self.resume_pdf_path = os.path.abspath(os.path.expanduser(sys.argv[idx + 1]))
            elif (
                arg.startswith("--persona-json=")
                or arg.startswith("--identity-profile=")
                or arg.startswith("--profile-json=")
            ):
                self.persona_json_path = os.path.abspath(
                    os.path.expanduser(arg.split("=", 1)[1].strip())
                )
            elif (
                arg in ("--persona-json", "--identity-profile", "--profile-json")
                and idx + 1 < len(sys.argv)
            ):
                self.persona_json_path = os.path.abspath(
                    os.path.expanduser(sys.argv[idx + 1].strip())
                )
            elif arg.startswith("--university="):
                raw_uni = arg.split("=", 1)[1].strip()
                if raw_uni.casefold() in ("", "auto", "model", "gemini", "none"):
                    self.university_value = ""
                    self.university_locked = False
                else:
                    self.university_value = raw_uni
                    self.university_locked = True
            elif arg == "--university" and idx + 1 < len(sys.argv):
                raw_uni = sys.argv[idx + 1].strip()
                if raw_uni.casefold() in ("", "auto", "model", "gemini", "none"):
                    self.university_value = ""
                    self.university_locked = False
                else:
                    self.university_value = raw_uni
                    self.university_locked = True
            elif arg.startswith("--panorama-scrolls="):
                try:
                    self.panorama_scrolls = max(1, int(arg.split("=", 1)[1]))
                except ValueError:
                    pass
            elif arg == "--panorama-scrolls" and idx + 1 < len(sys.argv):
                try:
                    self.panorama_scrolls = max(1, int(sys.argv[idx + 1]))
                except ValueError:
                    pass
            elif arg.startswith("--panorama-rescue-scrolls="):
                try:
                    self.panorama_rescue_scrolls = max(
                        1, int(arg.split("=", 1)[1])
                    )
                except ValueError:
                    pass
            elif arg == "--panorama-rescue-scrolls" and idx + 1 < len(sys.argv):
                try:
                    self.panorama_rescue_scrolls = max(
                        1, int(sys.argv[idx + 1])
                    )
                except ValueError:
                    pass
            elif arg == "--panoramas":
                self.passive_panoramas_enabled = True
            elif arg.startswith("--resume="):
                self.resume_path = arg.split("=", 1)[1]
            elif arg == "--resume" and idx + 1 < len(sys.argv):
                self.resume_path = sys.argv[idx + 1]

        if self.resume_path and os.path.exists(self.resume_path):
            self.data_dir = self.resume_path
        elif self.continue_current:
            candidates = [d for d in glob.glob(f"data/onboarding_{APP_DATA_SLUG}_*") if os.path.isdir(d)]
            candidates.sort(key=lambda d: os.path.getmtime(d), reverse=True)
            if candidates:
                self.data_dir = candidates[0]
                self.resume_path = self.data_dir
                self._auto_reused_session = True
            else:
                self.data_dir = f"data/onboarding_{APP_DATA_SLUG}_{date_str}"
        else:
            self.data_dir = f"data/onboarding_{APP_DATA_SLUG}_{date_str}"

        self.screenshot_dir = f"{self.data_dir}/screenshots"
        os.makedirs(self.screenshot_dir, exist_ok=True)

        # Canonical screenshot bookkeeping across resumed runs.
        self._screenshot_sequence = 0
        self._screenshot_hash_to_path = {}
        self._init_screenshot_catalog()

        self.device = DeviceController(PACKAGE_NAME)
        self.persona = Persona()
        self.persona.university = self.university_value
        self._apply_persona_json()

        explicit_email = (
            _cli_value("--email")
            or os.environ.get("ONBOARDING_EMAIL", "").strip()
        )
        explicit_password = (
            _cli_value("--password")
            or os.environ.get("ONBOARDING_PASSWORD", "").strip()
        )
        if explicit_email:
            self.persona.email = explicit_email
            self.profile_flat["email"] = explicit_email
            self.profile_loaded_keys.add("email")
        if explicit_password:
            self.persona.password = explicit_password
            self.profile_flat["password"] = explicit_password
            self.profile_loaded_keys.add("password")

        self.memory = AgentMemory(self.data_dir)
        self.tracker = CostTracker(self.data_dir)
        self.timeline = PersistentTimeline(
            f"{self.data_dir}/timeline_journal.jsonl",
            manifest_path=f"{self.data_dir}/onboarding_manifest.json",
            run_id=self.run_id,
        )

        self.panorama_report_dir = f"{self.data_dir}/panorama_reports"
        os.makedirs(self.panorama_report_dir, exist_ok=True)
        self._panorama_attempted_signatures = set()
        self._panorama_capture_count = 0
        for item in self.timeline:
            if not isinstance(item, dict):
                continue
            if item.get("action") == "PASSIVE_PANORAMA":
                key = item.get("panorama_key") or item.get("target")
                if key:
                    self._panorama_attempted_signatures.add(str(key))

        self.status = "INITIALIZING"

        self.app_category = AppCategoryDetector(PACKAGE_NAME, APP_NAME)
        self.flow_tracker = SignupFlowTracker()

        self.verification_handler = VerificationHandlerV2(
            device=self.device,
            ai_call_fn=self._ai_call,
            atomic_click_fn=self._verification_atomic_click,
            capture_screen_fn=self._capture_active_screen,
            persona_email=self.persona.email,
            persona_password=self.persona.password,
            app_name=APP_NAME,
            target_package=PACKAGE_NAME,
            screenshot_dir=self.screenshot_dir,
            agent=self,  # Pass the agent itself to track active pathway
        )

        self.post_auth_handler = PostAuthHandler(self.device, self._ai_call, self.persona)
        self.account_detector = AccountCreationDetector(self._ai_call)
        self.payment_detector = PaymentWallDetector()
        self.bot_handler = BotChallengeHandler(
            device=self.device,
            ai_call_fn=self._ai_call,
            capture_screen_fn=self._capture_active_screen,
        )

        self.phase = "EXPLORE"
        self.local_video_recorder = None
        self.local_video_guest_path = (
            "--local-video-bursts" in sys.argv
            and "--local-video-guest-path" in sys.argv
        )
        if "--local-video-bursts" in sys.argv:
            from local_onboarding_video import OnboardingBurstRecorder
            self.local_video_recorder = OnboardingBurstRecorder(
                self.data_dir,
                PACKAGE_NAME,
                context=lambda: {
                    "phase": self.phase,
                    "timeline_sequence": (
                        self.timeline[-1].get("timeline_sequence")
                        if self.timeline else None
                    ),
                },
            )
            self.device.local_video_recorder = self.local_video_recorder
        self.signup_found = False
        self.consecutive_unknowns = 0
        self.exploration_depth = 0
        self.form_reanalysis_count = 0
        self.blank_screenshot_streak = 0
        self.backtrack_count = 0
        self.scroll_attempts_this_screen = 0
        self.swipe_attempts_this_screen = 0
        self.crop_box = None
        self.settled_count = 0
        self._stuck_action_count = 0
        self._skip_next_screenshot = False

        # Resume upload lifecycle state.
        self.device_resume_path = None
        self.resume_upload_complete = False
        self.resume_upload_failures = 0
        # Older builds could falsely classify legal/privacy pages as resume
        # upload screens and persist BLOCKED_RESUME_UPLOAD. Validate that state
        # against the live UI on the next --continue-current run.
        self._validate_saved_resume_block_from_live_ui = False

        self.last_verification_result = None
        self.post_run_insights = {}

        # --continue-current must never assume authentication state merely because
        # disk resume state is missing/stale. The live screen is authoritative.
        self._needs_live_phase_recovery = False
        self._phase_recovery_reason = ""
        self.verification_recovery_context = None

        # Episodic decision memory. The model should know not merely what it
        # thought, but what ACTION on what SCREEN led to what NEXT SCREEN.
        self.action_transition_history = []
        self._pending_action_transition = None
        self.historical_decision_events = []

        self._dialog_dismiss_fail_count = 0
        self._dialog_dismiss_last_target = None

        self.discovered_roles = []
        self.explored_roles = {}
        self.current_role_exploring = None
        self.current_pathway = "Common"  # Track whether we are in Common, Pathway 1, Pathway 2, etc.

        print(f"🕵️ ONBOARDING SPY v13.3.2 (Single-Planner Core + Complete Persona + Home/CTA Integrity)")
        print("   🧠 Architecture: OBSERVE → ONE PLAN → ONE ACTION → OBSERVE")
        print(
            f"   🧠 AI provider: OpenAI {MODEL_ROSTER[0]} "
            f"(reasoning={OPENAI_REASONING_EFFORT}, image_detail={OPENAI_IMAGE_DETAIL})"
        )
        print(f"   📱 App: {APP_NAME} ({PACKAGE_NAME})")
        print(f"   🏷️ Detected category: {self.app_category.get_category()} (confidence: {self.app_category.category_confidence:.0%})")
        print(f"   👤 {self.persona.email}")
        print("   🔑 Password: [configured]")
        print(f"   📱 Screen: {self.device.screen_size}")
        print(f"   📬 Gmail installed: {self.device.is_gmail_installed()}")
        if self.resume_pdf_path:
            print(f"   📄 Resume/document PDF: {self.resume_pdf_path}")
            print(
                f"      {'✅ available' if os.path.isfile(self.resume_pdf_path) else '⚠️ missing'}"
            )
        else:
            print("   📄 Resume/document PDF: not configured")
        if self.persona_json_path:
            print(f"   👤 Persona profile: {self.persona_json_path}")
            if self.profile_semantic_aliases:
                print(
                    f"      🧭 Semantic mappings: "
                    f"{len(self.profile_semantic_aliases)} profile dimensions"
                )
            if self.profile_policy:
                print(
                    "      🛡️ Missing factual data policy: "
                    f"{self.profile_policy.get('missing_factual_data', 'skip_then_block')}"
                )
        if self.continue_current:
            print(f"   ▶️ Continue-current mode: app data will NOT be wiped")
        if self._auto_reused_session:
            print(f"   🧵 Reusing lifecycle session: {self.data_dir}")
        if self.persona.university:
            print(f"   🎓 University policy: PROFILE_CONSTRAINED -> {self.persona.university}")
        else:
            print("   🎓 University policy: PROFILE_REQUIRED (no arbitrary school invention)")

        pano_script = self._panorama_script_path()
        if self.passive_panoramas_enabled and os.path.isfile(pano_script):
            print(
                f"   🏞️ Passive panoramas: enabled via "
                f"{os.path.basename(pano_script)} "
                f"(primary={self.panorama_scrolls} scrolls; "
                f"high-overlap fallback={self.panorama_rescue_scrolls})"
            )
        elif self.passive_panoramas_enabled:
            print(
                f"   ⚠️ Passive panoramas requested, but stitcher missing: "
                f"{pano_script}"
            )
        else:
            print("   🏞️ Passive panoramas: disabled")

        self.device.disable_autofill()
        self._write_screenshot_index()

    @staticmethod
    def _profile_key_norm(value):
        return re.sub(r"[^a-z0-9]+", "_", str(value or "").casefold()).strip("_")

    def _flatten_identity_profile(self, data):
        flat = {}

        def walk(value, path=()):
            if isinstance(value, dict):
                for k, v in value.items():
                    walk(v, path + (self._profile_key_norm(k),))
                return
            if value is None:
                return
            if not path:
                return
            flat[".".join(path)] = value

        walk(data)
        return flat

    def _apply_persona_json(self):
        """
        Load the persistent cross-app identity profile.

        The profile is the source of truth for identity, employment, education,
        languages, skills, preferences, and resource addresses. Missing facts
        remain missing; the runtime will never ask the model to fabricate them.
        """
        if not self.persona_json_path:
            print(
                "      ⚠️ No onboarding_identity_profile.json configured. "
                "Only explicitly configured core identity values are available."
            )
            return

        if not os.path.isfile(self.persona_json_path):
            print(f"      ⚠️ Identity profile not found: {self.persona_json_path}")
            return

        try:
            with open(self.persona_json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as exc:
            print(f"      ⚠️ Could not load identity profile: {exc}")
            return

        if isinstance(data, dict) and isinstance(data.get("persona"), dict):
            # Backward-compatible flat persona JSON.
            data = data["persona"]

        if not isinstance(data, dict):
            print("      ⚠️ Identity profile JSON must be an object")
            return

        self.identity_profile = data
        self.profile_provenance = (
            data.get("provenance", {})
            if isinstance(data.get("provenance"), dict)
            else {}
        )
        self.profile_semantic_aliases = (
            data.get("semantic_aliases", {})
            if isinstance(data.get("semantic_aliases"), dict)
            else {}
        )
        self.profile_policy = (
            data.get("policy", {})
            if isinstance(data.get("policy"), dict)
            else {}
        )

        # Metadata is intentionally NOT flattened into identity values.
        value_data = {
            k: v
            for k, v in data.items()
            if k not in {"provenance", "semantic_aliases", "policy", "notes"}
        }
        raw = self._flatten_identity_profile(value_data)

        # Accept both nested v1 schema and older flat names.
        canonical_aliases = {
            "email": "email",
            "identity.email": "email",
            "password": "password",
            "identity.password": "password",
            "first_name": "first_name",
            "identity.first_name": "first_name",
            "last_name": "last_name",
            "identity.last_name": "last_name",
            "full_name": "full_name",
            "identity.full_name": "full_name",
            "username": "username",
            "identity.username": "username",

            "phone": "phone",
            "contact.phone": "phone",
            "address": "address",
            "contact.address": "address",
            "city": "city",
            "contact.city": "city",
            "state": "state",
            "province": "state",
            "contact.state": "state",
            "contact.province": "state",
            "country": "country",
            "contact.country": "country",
            "zip": "zip_code",
            "zip_code": "zip_code",
            "postal_code": "zip_code",
            "contact.zip": "zip_code",
            "contact.zip_code": "zip_code",
            "contact.postal_code": "zip_code",

            "dob": "dob_full",
            "date_of_birth": "dob_full",
            "dob_full": "dob_full",
            "demographics.dob": "dob_full",
            "demographics.date_of_birth": "dob_full",
            "demographics.dob_full": "dob_full",
            "dob_iso": "dob_iso",
            "demographics.dob_iso": "dob_iso",
            "dob_year": "dob_year",
            "demographics.dob_year": "dob_year",
            "dob_month": "dob_month",
            "demographics.dob_month": "dob_month",
            "dob_day": "dob_day",
            "demographics.dob_day": "dob_day",
            "age": "age",
            "demographics.age": "age",
            "gender": "gender",
            "demographics.gender": "gender",

            "school_email": "school_email",
            "resources.school_email": "school_email",
            "work_email": "work_email",
            "resources.work_email": "work_email",
            "resume_pdf": "resume_pdf",
            "resources.resume_pdf": "resume_pdf",

            "university": "university",
            "institution": "university",
            "school": "university",
            "education.university": "university",
            "education.institution": "university",
            "education.school": "university",
            "degree": "education_level",
            "education_level": "education_level",
            "education.degree": "education_level",
            "education.education_level": "education_level",
            "major": "major",
            "field_of_study": "major",
            "education.major": "major",
            "education.field_of_study": "major",
            "education_start": "education_start",
            "attendance_start": "education_start",
            "education.education_start": "education_start",
            "education.attendance_start": "education_start",
            "education_end": "education_end",
            "attendance_end": "education_end",
            "education.education_end": "education_end",
            "education.attendance_end": "education_end",
            "graduation_year": "graduation_year",
            "education.graduation_year": "graduation_year",

            "company": "current_company",
            "company_name": "current_company",
            "current_company": "current_company",
            "employer": "current_company",
            "employment.company": "current_company",
            "employment.company_name": "current_company",
            "employment.current_company": "current_company",
            "employment.employer": "current_company",
            "job_title": "job_title",
            "current_title": "job_title",
            "occupation": "job_title",
            "employment.job_title": "job_title",
            "employment.current_title": "job_title",
            "employment.occupation": "job_title",
            "job_description": "job_description",
            "employment.job_description": "job_description",
            "employment_start": "employment_start",
            "employment.employment_start": "employment_start",
            "employment_end": "employment_end",
            "employment.employment_end": "employment_end",

            "desired_role": "desired_roles",
            "desired_roles": "desired_roles",
            "job_roles": "desired_roles",
            "preferences.desired_role": "desired_roles",
            "preferences.desired_roles": "desired_roles",
            "preferences.job_roles": "desired_roles",
            "skills": "skills",
            "preferences.skills": "skills",
            "languages": "languages",
            "preferences.languages": "languages",
            "salary": "salary_expectation",
            "salary_expectation": "salary_expectation",
            "preferences.salary": "salary_expectation",
            "preferences.salary_expectation": "salary_expectation",
            "interests": "interests",
            "preferences.interests": "interests",
        }

        canonical = {}
        for path, value in raw.items():
            norm_path = self._profile_key_norm(path).replace("_", ".", 1) if False else path
            key = canonical_aliases.get(path)
            if key is None:
                # Try the final path component for backward-compatible flat input.
                key = canonical_aliases.get(path.split(".")[-1], path.split(".")[-1])
            canonical[key] = value

        self.profile_flat = canonical
        self.profile_loaded_keys = {
            k for k, v in canonical.items()
            if v not in (None, "", [], {})
        }

        persona_attrs = {
            "email", "password", "first_name", "last_name", "full_name",
            "username", "phone", "dob_year", "dob_month", "dob_day",
            "dob_full", "dob_iso", "gender", "country", "zip_code", "city",
            "state", "address", "age", "university",
        }

        for key, value in canonical.items():
            if value in (None, "", [], {}):
                continue
            if key == "resume_pdf":
                profile_resume = os.path.abspath(os.path.expanduser(str(value)))
                if not self.resume_pdf_path:
                    self.resume_pdf_path = profile_resume
                continue
            if key in persona_attrs:
                setattr(self.persona, key, str(value))
            else:
                self.persona.extra_values[key] = value

        if (
            "full_name" not in self.profile_loaded_keys
            and (
                "first_name" in self.profile_loaded_keys
                or "last_name" in self.profile_loaded_keys
            )
        ):
            self.persona.full_name = (
                f"{self.persona.first_name} {self.persona.last_name}"
            ).strip()
            self.profile_flat["full_name"] = self.persona.full_name
            self.profile_loaded_keys.add("full_name")

        print(
            f"      ✅ Cross-app identity profile loaded "
            f"({len(self.profile_loaded_keys)} authoritative values)"
        )

    def _profile_has(self, key):
        value = self.profile_flat.get(str(key or ""))
        return value not in (None, "", [], {})

    def _profile_value(self, key, default=None):
        value = self.profile_flat.get(str(key or ""), default)
        return default if value in (None, "", [], {}) else value

    def _profile_prompt_context(self):
        safe = {}
        for key, value in sorted(self.profile_flat.items()):
            if key == "password":
                safe[key] = "[CONFIGURED]"
            elif value not in (None, "", [], {}):
                safe[key] = value

        return {
            "values": safe,
            "semantic_aliases": self.profile_semantic_aliases,
            "policy": self.profile_policy,
        }

    def _profile_aliases_for(self, key, canonical_value):
        """
        Return profile-defined semantic equivalents for a canonical value.

        This is deterministic profile metadata, not a second planner. It lets
        one stable persona map across apps whose labels differ:
          Customer Support -> Customer Service / Customer Experience
          Bachelor of Arts -> Bachelor's Degree / Bachelor
          California State University, Los Angeles -> Cal State LA / CSULA
        """
        section = self.profile_semantic_aliases.get(str(key or ""), {})
        if not isinstance(section, dict):
            return []

        wanted = self._normalized_action_label(canonical_value)
        for canonical, aliases in section.items():
            if self._normalized_action_label(canonical) != wanted:
                continue
            if isinstance(aliases, str):
                aliases = [aliases]
            if isinstance(aliases, (list, tuple)):
                return [
                    str(x) for x in aliases
                    if str(x or "").strip()
                ]
        return []

    def _profile_allowed_labels(self, key):
        value = self._profile_value(key)
        if value in (None, "", [], {}):
            return []

        values = value if isinstance(value, (list, tuple)) else [value]
        labels = []
        for canonical in values:
            if str(canonical or "").strip():
                labels.append(str(canonical))
                labels.extend(self._profile_aliases_for(key, canonical))

        # Stable de-duplication
        seen = set()
        out = []
        for label in labels:
            norm = self._normalized_action_label(label)
            if norm and norm not in seen:
                seen.add(norm)
                out.append(label)
        return out


    def _init_screenshot_catalog(self):
        """Load the repaired screenshot sequence before a resumed run."""
        max_seq = 0
        try:
            names = [n for n in os.listdir(self.screenshot_dir) if n.lower().endswith(".png")]
        except OSError:
            names = []

        for name in names:
            m = re.match(r"^(\d{4,})_", name)
            if m:
                try:
                    max_seq = max(max_seq, int(m.group(1)))
                except ValueError:
                    pass

            path = os.path.join(self.screenshot_dir, name)
            try:
                with open(path, "rb") as f:
                    stable = compute_stable_content_hash(f.read())
                if stable and stable not in self._screenshot_hash_to_path:
                    self._screenshot_hash_to_path[stable] = path
            except OSError:
                pass

        self._screenshot_sequence = max_seq

    def _new_screenshot_path(self, stem):
        clean = re.sub(r"[^A-Za-z0-9._-]+", "_", str(stem)).strip("_")
        clean = re.sub(r"\.png$", "", clean, flags=re.IGNORECASE)
        self._screenshot_sequence += 1
        return os.path.join(
            self.screenshot_dir,
            f"{self._screenshot_sequence:04d}_{clean}.png",
        )

    def _save_canonical_screenshot(self, img_bytes, stem):
        """
        Append a unique visual state to the repaired chronology.
        Repeated visual states reuse their earlier screenshot path.
        """
        if not img_bytes:
            return None

        stable = compute_stable_content_hash(img_bytes)
        if stable:
            previous = self._screenshot_hash_to_path.get(stable)
            if previous and os.path.isfile(previous):
                print(f"      ♻️ Screenshot duplicate — reusing {os.path.basename(previous)}")
                return previous

        path = self._new_screenshot_path(stem)
        try:
            with open(path, "wb") as f:
                f.write(img_bytes)
        except IOError as e:
            self._screenshot_sequence = max(0, self._screenshot_sequence - 1)
            print(f"      ⚠️ Could not save screenshot: {e}")
            return None

        if stable:
            self._screenshot_hash_to_path[stable] = path
        return path

    def _ordered_screenshot_entries(self):
        """
        Numeric filename prefixes are authoritative. Preserve metadata created by
        the consolidation/ordering repair instead of replacing it with mtime order.
        """
        existing_meta = {}
        index_path = f"{self.data_dir}/screenshot_index.json"
        try:
            with open(index_path, "r", encoding="utf-8") as f:
                prior = json.load(f)
            prior_entries = prior.get("screenshots", []) if isinstance(prior, dict) else prior
            if isinstance(prior_entries, list):
                for entry in prior_entries:
                    if not isinstance(entry, dict):
                        continue
                    name = entry.get("filename")
                    if not name and entry.get("path"):
                        name = os.path.basename(str(entry["path"]))
                    if name:
                        existing_meta[name] = dict(entry)
        except (OSError, ValueError, TypeError):
            pass

        try:
            names = [n for n in os.listdir(self.screenshot_dir) if n.lower().endswith(".png")]
        except OSError:
            names = []

        def order_key(name):
            m = re.match(r"^(\d{4,})_", name)
            if m:
                return (0, int(m.group(1)), name)
            path = os.path.join(self.screenshot_dir, name)
            try:
                mt = os.path.getmtime(path)
            except OSError:
                mt = float("inf")
            return (1, mt, name)

        names.sort(key=order_key)

        entries = []
        for seq, name in enumerate(names, 1):
            path = os.path.join(self.screenshot_dir, name)
            try:
                mtime = os.path.getmtime(path)
            except OSError:
                continue
            entry = dict(existing_meta.get(name, {}))
            entry.update({
                "sequence": seq,
                "filename": name,
                "path": f"screenshots/{name}",
                "captured_at": entry.get("captured_at") or datetime.fromtimestamp(mtime).isoformat(),
                "mtime": mtime,
            })
            entries.append(entry)
        return entries

    def _write_screenshot_index(self):
        entries = self._ordered_screenshot_entries()
        path = f"{self.data_dir}/screenshot_index.json"
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump({
                    "schema_version": 2,
                    "updated_at": datetime.now().isoformat(),
                    "session_dir": self.data_dir,
                    "ordering": "numeric_filename_sequence",
                    "unique_screenshot_count": len(entries),
                    "screenshots": entries,
                }, f, indent=2)
        except OSError:
            pass
        return entries


















    def save_resume_state(self):
        # If the run stopped after account creation but before the true home screen,
        # persist POST_AUTH so --resume can continue the unfinished onboarding.
        phase_to_save = self.phase
        if (
            phase_to_save == "DONE"
            and self.flow_tracker.account_creation_detected
            and self.status != "COMPLETED_SETTLED"
        ):
            phase_to_save = "POST_AUTH"

        state = {
            "phase": phase_to_save,
            "phase_recovery_reason": self._phase_recovery_reason,
            "verification_recovery_context": self.verification_recovery_context,
            "status": self.status,
            "resume_pdf_path": self.resume_pdf_path,
            "resume_upload_complete": self.resume_upload_complete,
            "persona": {
                "email": self.persona.email,
                "password": self.persona.password,
                "first_name": self.persona.first_name,
                "last_name": self.persona.last_name,
                "username": self.persona.username,
                "phone": self.persona.phone,
                "dob_year": self.persona.dob_year,
                "dob_month": self.persona.dob_month,
                "dob_day": self.persona.dob_day,
                "dob_full": self.persona.dob_full,
                "dob_iso": self.persona.dob_iso,
                "gender": self.persona.gender,
                "country": self.persona.country,
                "zip_code": self.persona.zip_code,
                "city": self.persona.city,
                "state": self.persona.state,
                "address": self.persona.address,
                "age": self.persona.age,
                "university": self.persona.university,
                "extra_values": dict(self.persona.extra_values),
                "university_selected_from_ui": self.university_selected_from_ui,
                "university_policy": (
                    "explicit_override" if self.university_locked
                    else "model_from_live_ui"
                ),
            },
            "filled_fields": dict(self.memory.filled_fields),
            "flow_tracker_steps": self.flow_tracker.steps,
            "flow_tracker_expected_fields": self.flow_tracker.expected_fields,
            "flow_tracker_filled_fields": list(self.flow_tracker.filled_fields),
            "account_creation_detected": self.flow_tracker.account_creation_detected,
            "account_creation_method": self.flow_tracker.account_creation_method,
            "account_creation_step": self.flow_tracker.account_creation_step,
            "verification_successful": self.verification_handler.verification_successful,
            "verification_type": self.verification_handler.verification_type,
            "verification_code_extracted": self.verification_handler.code_extracted,
            "verification_rejected_codes": sorted(
                self.verification_handler.rejected_codes
            ),
            "verification_resend_count": self.verification_handler.resend_count,
            "verification_fresh_code_requested_at": (
                self.verification_handler.fresh_code_requested_at
            ),
            "verification_force_resend_before_email": (
                self.verification_handler.force_resend_before_email
            ),
            "action_transition_history": self.action_transition_history[-80:],
            "pending_action_transition": self._pending_action_transition,
            "post_auth_state": self.post_auth_handler.get_summary(),
        }
        path = f"{self.data_dir}/session_resume_state.json"
        try:
            with open(path, "w") as f:
                json.dump(state, f, indent=2)
            print(f"   💾 Resume state saved successfully: {path}")
        except IOError as e:
            print(f"      ⚠️ Could not save resume state: {e}")

    def load_resume_state(self, path_dir):
        path = f"{path_dir}/session_resume_state.json"
        if not os.path.exists(path):
            print(f"      ⚠️ Resume state file not found at {path}")
            return False

        try:
            with open(path, "r") as f:
                state = json.load(f)

            saved_phase = state.get("phase", "POST_AUTH")
            saved_status = str(state.get("status", "") or "")
            if (
                self.continue_current
                and saved_status == "BLOCKED_RESUME_UPLOAD"
            ):
                self._validate_saved_resume_block_from_live_ui = True
                print(
                    "   🧭 Saved BLOCKED_RESUME_UPLOAD will be validated "
                    "against the CURRENT live screen before trusting it."
                )

            saved_recovery_context = state.get("verification_recovery_context")
            if saved_recovery_context:
                self.verification_recovery_context = str(saved_recovery_context)

            if saved_phase == "DONE" and saved_status == "COMPLETED_SETTLED" and not state.get("account_creation_detected"):
                self.phase = "EXPLORE"
                print("   🧭 Reopening guest-home capture to find the account path")
            elif saved_phase == "POST_AUTH" and not self.continue_current:
                self.phase = "LOGIN_RESUME"
            else:
                self.phase = saved_phase
            self.status = "INITIALIZING"

            p_data = state.get("persona", {})

            saved_email = str(p_data.get("email", "") or "").strip()
            configured_email = str(self.persona.email or "").strip()
            if (
                saved_email
                and configured_email
                and saved_email.casefold() != configured_email.casefold()
            ):
                print(
                    f"   🛡️ Ignoring stale/invented resume email "
                    f"'{saved_email}'; configured identity is "
                    f"'{configured_email}'"
                )
            elif saved_email:
                self.persona.email = saved_email

            # Cross-app identity profile is authoritative. Resume state may
            # restore only keys that the profile itself explicitly authorizes.
            resume_keys = (
                "password", "first_name", "last_name", "username", "phone",
                "dob_year", "dob_month", "dob_day", "dob_full", "dob_iso",
                "gender", "country", "zip_code", "city", "state", "address",
                "age",
            )
            for key in resume_keys:
                if key in self.profile_loaded_keys:
                    # Keep the already-loaded profile value.
                    continue
                if key in ("password", "first_name", "last_name", "username"):
                    # Core configured identity may persist across resume.
                    value = p_data.get(key)
                    if value not in (None, ""):
                        setattr(self.persona, key, value)

            saved_extras = p_data.get("extra_values", {})
            if isinstance(saved_extras, dict):
                for key, value in saved_extras.items():
                    key = str(key)
                    if key in self.profile_loaded_keys and value is not None:
                        # Profile value already loaded; do not let old session
                        # state overwrite it.
                        continue

            if self._profile_has("university"):
                self.persona.university = str(self._profile_value("university"))
                self.university_selected_from_ui = False
            elif self.university_locked and self.university_value:
                self.persona.university = self.university_value
                self.profile_flat["university"] = self.university_value
                self.profile_loaded_keys.add("university")
            else:
                stale_uni = p_data.get("university", "")
                if stale_uni:
                    print(
                        f"      🛡️ Ignoring stale session university "
                        f"'{stale_uni}'; university must come from the "
                        "cross-app identity profile."
                    )
                self.persona.university = ""
                self.university_selected_from_ui = False

            self.memory.filled_fields = state.get("filled_fields", {})
            self.flow_tracker.steps = state.get("flow_tracker_steps", [])
            self.flow_tracker.expected_fields = state.get("flow_tracker_expected_fields", {})
            self.flow_tracker.filled_fields = set(state.get("flow_tracker_filled_fields", []))
            self.flow_tracker.account_creation_detected = state.get("account_creation_detected", False)
            self.flow_tracker.account_creation_method = state.get("account_creation_method")
            self.flow_tracker.account_creation_step = state.get("account_creation_step")

            # Older builds created a synthetic POST_AUTH state whenever
            # --continue-current had no JSON. If such a state was later saved on
            # Ctrl-C, it must not become permanent truth.
            synthetic_live_postauth = bool(
                self.continue_current
                and saved_phase == "POST_AUTH"
                and state.get("account_creation_method") == "continued_live_session"
                and not state.get("verification_successful", False)
            )
            if synthetic_live_postauth:
                print(
                    "   🧭 Ignoring legacy synthetic POST_AUTH resume state; "
                    "the current live screen will recover the real phase."
                )
                self.phase = "EXPLORE"
                self._needs_live_phase_recovery = True
                self._phase_recovery_reason = "legacy continued_live_session POST_AUTH inference"
                self.flow_tracker.account_creation_detected = False
                self.flow_tracker.account_creation_method = None
                self.flow_tracker.account_creation_step = None
                self.account_detector.creation_detected = False

            if state.get("verification_successful", False):
                self.verification_handler.verification_successful = True
            saved_vtype = state.get("verification_type")
            if saved_vtype:
                self.verification_handler.verification_type = saved_vtype
            saved_code = state.get("verification_code_extracted")
            if saved_code:
                self.verification_handler.code_extracted = str(saved_code)

            saved_rejected = state.get("verification_rejected_codes", [])
            if isinstance(saved_rejected, list):
                self.verification_handler.rejected_codes.update(
                    str(code) for code in saved_rejected if code
                )

            try:
                self.verification_handler.resend_count = int(
                    state.get("verification_resend_count", 0) or 0
                )
            except (TypeError, ValueError):
                self.verification_handler.resend_count = 0

            saved_fresh_requested_at = state.get(
                "verification_fresh_code_requested_at"
            )
            if saved_fresh_requested_at is not None:
                try:
                    self.verification_handler.fresh_code_requested_at = float(
                        saved_fresh_requested_at
                    )
                except (TypeError, ValueError):
                    self.verification_handler.fresh_code_requested_at = None

            persisted_force_resend = bool(
                state.get("verification_force_resend_before_email", False)
            )

            # Resume invariant:
            # If we are resuming an unfinished VERIFICATION session and a code
            # was already extracted previously, do NOT go straight back to Gmail.
            # We no longer know whether that one-time code was consumed, rejected,
            # or expired. Mark it stale and force the app's Resend control first.
            unresolved_saved_code = bool(
                saved_phase == "VERIFICATION"
                and saved_code
                and not state.get("verification_successful", False)
            )

            self.verification_handler.force_resend_before_email = bool(
                persisted_force_resend or unresolved_saved_code
            )

            if unresolved_saved_code:
                stale_code = str(saved_code)
                self.verification_handler.rejected_codes.add(stale_code)
                print(
                    f"   🔁 Verification resume: prior code {stale_code} is "
                    "stale/untrusted; RESEND will be pressed before Gmail."
                )

            saved_transitions = state.get("action_transition_history", [])
            if isinstance(saved_transitions, list):
                self.action_transition_history = [
                    item
                    for item in saved_transitions[-80:]
                    if isinstance(item, dict)
                ]

            pending_transition = state.get("pending_action_transition")
            if isinstance(pending_transition, dict):
                self._pending_action_transition = pending_transition

            # Older lifecycle runs do not have structural transition memory.
            # Bootstrap their ordered action history from timeline_journal.jsonl.
            self._load_historical_decision_events()

            saved_resume_pdf = state.get("resume_pdf_path")
            if saved_resume_pdf and not any(
                a.startswith("--resume-pdf") or a.startswith("--resume-file")
                for a in sys.argv
            ):
                self.resume_pdf_path = os.path.abspath(os.path.expanduser(saved_resume_pdf))
            self.resume_upload_complete = state.get("resume_upload_complete", False)

            print(f"   📂 Resume state loaded and applied from: {path}")
            return True
        except Exception as e:
            print(f"      ⚠️ Failed to load resume state: {e}")
            return False

    def _resume_upload_action_center(self, xml_str):
        """
        Return the center of a CURRENT visible actionable resume/CV upload control.

        Privacy policies and terms pages often *mention* resumes, documents,
        uploads, PDFs, etc. Text mentions are not evidence that the current screen
        is an upload step. We require an actual clickable/checkable UI control.
        """
        if not xml_str:
            return None

        strong_phrases = (
            "upload resume",
            "upload résumé",
            "upload cv",
            "upload a resume",
            "upload a résumé",
            "upload a cv",
            "upload a pdf",
            "choose resume",
            "choose résumé",
            "choose cv",
            "attach resume",
            "attach résumé",
            "attach cv",
            "add resume",
            "add résumé",
            "add cv",
            "select resume",
            "select résumé",
            "select cv",
        )

        generic_file_phrases = (
            "choose file",
            "choose a file",
            "select file",
            "select a file",
            "attach file",
            "browse files",
            "tap to choose",
        )

        try:
            root = ET.fromstring(xml_str)
        except Exception:
            return None

        candidates = []
        for node in root.iter():
            if node.attrib.get("visible-to-user", "true") == "false":
                continue
            if node.attrib.get("enabled", "true") == "false":
                continue

            clickable = (
                node.attrib.get("clickable", "false") == "true"
                or node.attrib.get("checkable", "false") == "true"
            )
            if not clickable:
                continue

            label = " ".join([
                node.attrib.get("text", "") or "",
                node.attrib.get("content-desc", "") or "",
                node.attrib.get("resource-id", "") or "",
            ])
            label_norm = re.sub(r"\s+", " ", label).casefold().strip()
            if not label_norm:
                continue

            strong = any(p in label_norm for p in strong_phrases)
            generic = any(p in label_norm for p in generic_file_phrases)
            if not (strong or generic):
                continue

            bounds = node.attrib.get("bounds", "")
            m = re.findall(
                r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',
                bounds,
            )
            if not m:
                continue
            x1, y1, x2, y2 = map(int, m[0])
            if x2 <= x1 or y2 <= y1:
                continue

            candidates.append({
                "center": ((x1 + x2) // 2, (y1 + y2) // 2),
                "area": (x2 - x1) * (y2 - y1),
                "strong": strong,
                "label": label_norm,
            })

        if not candidates:
            return None

        candidates.sort(
            key=lambda item: (
                1 if item["strong"] else 0,
                -item["area"],
            ),
            reverse=True,
        )
        return candidates[0]["center"]

    def _is_resume_upload_screen(self, visible_text, xml_str=None):
        """
        Detect an ACTUAL resume/CV upload step, not a legal/privacy page that
        happens to discuss collected resumes/documents/uploads.

        Required:
          * resume/résumé/CV semantics on the current screen, AND
          * a real current clickable upload/file control.
        """
        text_lower = re.sub(
            r"\s+",
            " ",
            str(visible_text or "").casefold(),
        )

        has_resume_semantics = any(
            term in text_lower
            for term in (
                "resume",
                "résumé",
                "curriculum vitae",
                " cv ",
                "your cv",
                "my cv",
            )
        )
        if not has_resume_semantics:
            return False

        action_center = self._resume_upload_action_center(xml_str)
        if not action_center:
            return False

        legal_page = any(
            phrase in text_lower
            for phrase in (
                "privacy policy",
                "terms of service",
                "terms and conditions",
                "personal data",
                "how do we collect",
                "data we collect",
                "last updated",
            )
        )

        # A legal page may mention "upload your resume" in prose. On a legal page
        # require the clickable control itself to carry explicit resume/CV wording;
        # generic file controls are not enough.
        if legal_page:
            try:
                root = ET.fromstring(xml_str or "")
            except Exception:
                return False

            explicit_action = False
            for node in root.iter():
                if node.attrib.get("visible-to-user", "true") == "false":
                    continue
                if node.attrib.get("clickable", "false") != "true":
                    continue
                label = " ".join([
                    node.attrib.get("text", "") or "",
                    node.attrib.get("content-desc", "") or "",
                    node.attrib.get("resource-id", "") or "",
                ]).casefold()
                if (
                    any(x in label for x in ("resume", "résumé", " cv"))
                    and any(x in label for x in ("upload", "attach", "choose", "select", "add"))
                ):
                    explicit_action = True
                    break
            if not explicit_action:
                return False

        return True

    def _xml_text_center(self, xml_str, needles):
        """Find the center of a visible XML node containing one of the requested strings."""
        if not xml_str:
            return None
        needles = [str(n).lower().strip() for n in needles if n]
        if not needles:
            return None
        try:
            root = ET.fromstring(xml_str)
        except Exception:
            return None

        best = None
        best_area = None
        for node in root.iter():
            label = " ".join([
                node.attrib.get("text", "") or "",
                node.attrib.get("content-desc", "") or "",
                node.attrib.get("resource-id", "") or "",
            ]).lower()
            if not any(n in label for n in needles):
                continue
            bounds = node.attrib.get("bounds", "")
            m = re.findall(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds)
            if not m:
                continue
            x1, y1, x2, y2 = map(int, m[0])
            if x2 <= x1 or y2 <= y1:
                continue
            area = (x2 - x1) * (y2 - y1)
            # Prefer the smallest matching node; it is usually the actual row/text target.
            if best is None or area < best_area:
                best = ((x1 + x2) // 2, (y1 + y2) // 2)
                best_area = area
        return best

    def _prepare_resume_pdf_for_device(self):
        if self.device_resume_path:
            return True

        local_path = os.path.abspath(os.path.expanduser(self.resume_pdf_path or ""))
        if not os.path.isfile(local_path):
            print(f"      ❌ Resume PDF missing: {local_path}")
            print("         Supply one with --resume-pdf /path/to/resume.pdf")
            return False

        if not local_path.lower().endswith(".pdf"):
            print(f"      ❌ Resume must be a PDF: {local_path}")
            return False

        try:
            with open(local_path, "rb") as f:
                if f.read(5) != b"%PDF-":
                    print(f"      ❌ Resume file does not look like a valid PDF: {local_path}")
                    return False
        except OSError as e:
            print(f"      ❌ Could not read resume PDF: {e}")
            return False

        source_name = os.path.basename(local_path) or "onboarding_document.pdf"
        safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", source_name).strip("_")
        if not safe_name.lower().endswith(".pdf"):
            safe_name += ".pdf"
        device_path = f"{DEVICE_RESUME_DIR}/{safe_name}"
        if not self.device.push_file_to_device(local_path, device_path):
            return False

        self.device_resume_path = device_path
        return True

    async def _assess_resume_upload_result(self, img, xml_str):
        if not img:
            return False
        all_text = UIHierarchy.extract_visible_text(xml_str)
        text_lower = all_text.lower()
        device_name = os.path.basename(
            self.device_resume_path
            or self.resume_pdf_path
            or "onboarding_document.pdf"
        )
        device_stem = os.path.splitext(device_name)[0].lower()

        if device_name.lower() in text_lower or device_stem in text_lower:
            return True

        # If we left the upload prompt entirely, selection almost certainly succeeded.
        if not self._is_resume_upload_screen(all_text):
            return True

        res = await self._ai_call(f"""
        RESUME UPLOAD RESULT CHECK.

        I just selected the PDF file "{device_name}" from the Android document picker.
        Look at the CURRENT APP SCREEN and decide whether the resume is now attached,
        uploaded, being parsed/processed, or whether the app advanced to the next onboarding step.

        Count as SUCCESS if:
        - the selected filename is shown,
        - the upload card changed to an attached/uploaded state,
        - the app says it is reading/parsing/processing the resume,
        - or the app advanced beyond the resume upload page.

        Count as FAILURE only if the original empty "Upload a PDF / Tap to choose a file"
        state is still present with no evidence that a file was selected.

        VISIBLE TEXT:
        {all_text[:1500]}

        OUTPUT JSON:
        {{"upload_accepted": true/false, "reasoning": "..."}}
        """, images=[img])
        return bool(res and res.get("upload_accepted"))

    async def handle_resume_upload(self, img, xml_str, target_desc="Upload a PDF", target_coords=None):
        """Stage the configured PDF, open Android's picker, and select that exact file."""
        print(f"      📄 RESUME UPLOAD — configured file: {self.resume_pdf_path}")

        if not self._prepare_resume_pdf_for_device():
            self.resume_upload_failures += 1
            return False

        # Make sure we are operating on the app's upload card, not arbitrary picker UI.
        # Use a direct mechanical tap here because leaving the app for DocumentsUI is the
        # EXPECTED result. Legacy retry-click recovery can otherwise mistake the
        # system picker for accidental navigation and immediately back out of it.
        upload_coords = None
        for el in UIHierarchy.find_clickable_elements(xml_str):
            label = f"{el.get('text', '')} {el.get('desc', '')} {el.get('resource_id', '')}".lower()
            if (
                ("upload" in label and any(k in label for k in ["pdf", "resume", "résumé", "file"]))
                or "choose a file" in label
            ):
                upload_coords = el.get("center")
                break

        if not upload_coords:
            upload_coords = self._xml_text_center(
                xml_str, ["upload a pdf", "tap to choose a file", "upload resume", "upload résumé"]
            )
        if not upload_coords and target_coords:
            upload_coords = tuple(target_coords)

        if upload_coords:
            print(f"         👆 Opening document picker at {upload_coords}")
            self.device.tap(int(upload_coords[0]), int(upload_coords[1]))
        else:
            print("         ⚠️ Upload control not resolved mechanically; trying one atomic grounded click")
            clicked = await self._execute_atomic_visual_click(
                img,
                xml_str,
                target_desc or "Upload a PDF",
                target_coords=None,
                screen_desc="Resume/CV upload screen",
            )
            if clicked is not True:
                print("         ❌ Could not open the resume document picker")
                self.resume_upload_failures += 1
                return False

        time.sleep(2.0)
        expected_name = os.path.basename(self.device_resume_path)
        expected_stem = os.path.splitext(expected_name)[0]
        file_tapped = False
        downloads_opened = False

        for picker_step in range(1, 13):
            focused = self.device.get_current_focused_package()
            cur_img = self._capture_active_screen()
            cur_xml = self.device.get_ui_xml()
            cur_text = UIHierarchy.extract_visible_text(cur_xml)
            cur_text_lower = cur_text.lower()

            if not cur_img:
                time.sleep(1.5)
                continue

            if PACKAGE_NAME in focused:
                accepted = await self._assess_resume_upload_result(cur_img, cur_xml)
                if accepted:
                    self.resume_upload_complete = True
                    self.resume_upload_failures = 0
                    print(f"      ✅ Resume upload accepted: {expected_name}")
                    self.memory.add_thought(f"Resume uploaded successfully: {expected_name}")
                    return True

                # Picker returned but app still shows the empty card: selection failed.
                if picker_step >= 2:
                    print("      ⚠️ Returned to app, but resume is not attached yet")
                    break
                time.sleep(1.5)
                continue

            print(f"         📂 Picker step {picker_step}/12 | foreground: {focused[:80]}")

            # 1) Strongest route: select the exact staged filename from XML.
            file_coords = self._xml_text_center(cur_xml, [expected_name, expected_stem])
            if file_coords and not file_tapped:
                print(f"         ✅ Found exact resume file '{expected_name}' at {file_coords}")
                self.device.tap(file_coords[0], file_coords[1])
                file_tapped = True
                time.sleep(2.0)
                continue

            # 2) Some pickers select a row first and then require an Open/Select button.
            if file_tapped:
                confirm_coords = self._xml_text_center(cur_xml, ["open", "select", "done"])
                if confirm_coords:
                    print(f"         👉 Confirming selected document at {confirm_coords}")
                    self.device.tap(confirm_coords[0], confirm_coords[1])
                    time.sleep(2.0)
                    continue

            # 3) If Recent does not show it, navigate to Downloads mechanically.
            if not downloads_opened:
                downloads_coords = self._xml_text_center(cur_xml, ["downloads", "download"])
                if downloads_coords:
                    print(f"         📁 Opening Downloads at {downloads_coords}")
                    self.device.tap(downloads_coords[0], downloads_coords[1])
                    downloads_opened = True
                    time.sleep(1.8)
                    continue

            # 4) Visual fallback for OEM/Google pickers whose useful row is missing from XML.
            nav = await self._ai_call(f"""
            ANDROID DOCUMENT PICKER NAVIGATION.

            A PDF resume has already been copied to the phone's Downloads folder as:
            "{expected_name}"

            GOAL: Select EXACTLY that PDF and return it to the calling app.
            Do not select any other file.

            Current visible text:
            {cur_text[:1200]}

            Decide the next single tap. Prefer, in order:
            1. the exact file "{expected_name}" if visible,
            2. Downloads if we need to navigate there,
            3. Open/Select/Done if the exact file is already selected.

            Return tap coordinates as NORMALIZED FRACTIONS from 0.0 to 1.0, not pixels.
            OUTPUT JSON:
            {{
                "action": "CLICK_FILE|OPEN_DOWNLOADS|CONFIRM|WAIT|FAIL",
                "target": "{expected_name}",
                "x_pct": 0.50,
                "y_pct": 0.50,
                "confidence": 0.90,
                "reasoning": "..."
            }}
            """, images=[cur_img])

            if not nav:
                time.sleep(1.5)
                continue

            nav_action = nav.get("action", "WAIT")
            if nav_action == "FAIL":
                break
            if nav_action == "WAIT":
                time.sleep(1.5)
                continue

            try:
                x_pct = max(0.03, min(0.97, float(nav.get("x_pct", 0.5))))
                y_pct = max(0.03, min(0.97, float(nav.get("y_pct", 0.5))))
            except (ValueError, TypeError):
                x_pct, y_pct = 0.5, 0.5

            x = int(self.device.screen_size[0] * x_pct)
            y = int(self.device.screen_size[1] * y_pct)
            print(f"         🤖 Picker fallback: {nav_action} -> ({x}, {y})")
            self.device.tap(x, y)
            if nav_action == "CLICK_FILE":
                file_tapped = True
            elif nav_action == "OPEN_DOWNLOADS":
                downloads_opened = True
            time.sleep(2.0)

        self.resume_upload_failures += 1
        print(f"      ❌ Resume upload failed (attempt {self.resume_upload_failures})")
        if not self.device.is_package_in_foreground(PACKAGE_NAME):
            self.device.press_back()
            time.sleep(1.5)
        return False

    async def perform_post_run_analysis(self):
        print(f"\n   🧠 Performing Post-Run Retrospective Analysis...")

        flow_summary = self.flow_tracker.get_flow_summary()
        post_auth_summary = json.dumps(self.post_auth_handler.get_summary())
        timeline_actions = [f"{t['step']}: {t['state']} -> {t['action']}" for t in self.timeline[-15:]]

        prompt = f"""
        POST-RUN RETROSPECTIVE ANALYSIS.

        You have just completed an automated run for the app "{APP_NAME}" ({PACKAGE_NAME}).

        INITIAL DETECTED CATEGORY: {self.app_category.get_category()}
        FINAL STATUS: {self.status}
        VERIFICATION: Type: {self.verification_handler.verification_type}, Successful: {self.verification_handler.verification_successful}

        FLOW SUMMARY:
        {flow_summary}

        POST-AUTH SUMMARY:
        {post_auth_summary}

        RECENT ACTIONS:
        {timeline_actions}

        TASK 1: RE-EVALUATE APP CATEGORY
        TASK 2: CLASSIFY ONBOARDING STRATEGY

        OUTPUT JSON:
        {{
            "final_app_category": "education",
            "category_reasoning": "Saw language translation quizzes",
            "onboarding_strategy": "soft_verification_growth_hacking",
            "strategy_reasoning": "...",
            "friction_level": "Low/Medium/High"
        }}
        """

        res = await self._ai_call(prompt)
        if res:
            self.post_run_insights = res
            print(f"      📊 Final Category: {res.get('final_app_category', 'Unknown')}")
            print(f"      📈 Strategy: {res.get('onboarding_strategy', 'Unknown')} ({res.get('friction_level', 'Unknown')} friction)")
        else:
            self.post_run_insights = {
                "final_app_category": self.app_category.get_category(),
                "category_reasoning": "AI Analysis failed, fallback to initial",
                "onboarding_strategy": "Unknown",
                "strategy_reasoning": "AI Analysis failed",
                "friction_level": "Unknown"
            }

    def _is_black_screen(self, img_bytes):
        return _is_black_screen_static(img_bytes)





    async def _get_and_refine_crop_box(self, full_host_img_bytes):
        if self.crop_box:
            print(f"      🖼️ Using cached crop box: {self.crop_box}")
            try:
                host_img_pil = Image.open(io.BytesIO(full_host_img_bytes))
                cropped_img = host_img_pil.crop(tuple(self.crop_box))
                with io.BytesIO() as output:
                    cropped_img.save(output, format="PNG")
                    return output.getvalue()
            except Exception as e:
                print(f"      ⚠️ Failed to apply cached crop: {e}. Recalibrating.")
                self.crop_box = None

        print(f"      🖼️ STARTING FAST PERCENTAGE-BASED CROP CALIBRATION...")
        host_img_pil = Image.open(io.BytesIO(full_host_img_bytes))
        width, height = host_img_pil.size

        res = await self._ai_call(f"""
        SCREENSHOT CROP CALIBRATION.

        TASK: Find the Android phone emulator's LCD DISPLAY AREA within this desktop screenshot.
        I need the INNER display area only — the part that shows app content.
        EXCLUDE: Window title bars, emulator toolbars, phone bezels/frames, and desktop background.

        ⚠️ CRITICAL: Provide coordinates as PERCENTAGES (0.00 to 1.00) relative to the image size.
        VLMs cannot calculate absolute pixels accurately. Do not use pixels.

        Example: If the phone fills the left third of the screen, starting slightly below the top:
        left_pct: 0.05, right_pct: 0.30, top_pct: 0.10, bottom_pct: 0.90

        OUTPUT JSON:
        {{
            "found_phone": true,
            "left_pct": 0.15,
            "top_pct": 0.05,
            "right_pct": 0.35,
            "bottom_pct": 0.95,
            "reasoning": "Phone is located on the left side, trimmed bezels and top window bar."
        }}
        """, images=[full_host_img_bytes])

        if not res or not res.get("found_phone"):
            print(f"      ⚠️ AI could not find the phone. Returning full desktop image.")
            return full_host_img_bytes

        x1 = int(max(0.0, min(1.0, float(res.get("left_pct", 0)))) * width)
        y1 = int(max(0.0, min(1.0, float(res.get("top_pct", 0)))) * height)
        x2 = int(max(0.0, min(1.0, float(res.get("right_pct", 1)))) * width)
        y2 = int(max(0.0, min(1.0, float(res.get("bottom_pct", 1)))) * height)

        if (x2 - x1) < (width * 0.1) or (y2 - y1) < (height * 0.2):
            print(f"      ⚠️ AI suggested impossibly small crop box. Returning full image.")
            return full_host_img_bytes

        self.crop_box = [x1, y1, x2, y2]
        print(f"      ✅ Crop calibrated: {self.crop_box} ({x2-x1}x{y2-y1}px)")

        try:
            cropped_img = host_img_pil.crop(tuple(self.crop_box))
            with io.BytesIO() as output:
                cropped_img.save(output, format="PNG")
                return output.getvalue()
        except Exception as e:
            print(f"      ⚠️ Crop failed: {e}")
            return full_host_img_bytes

    async def _ai_call(self, prompt, images=None):
        request_input = _build_openai_response_input(
            prompt,
            images=images,
            detail=OPENAI_IMAGE_DETAIL,
        )
        max_attempts = max(4, len(MODEL_ROSTER) * 2, len(API_KEYS) * 2)
        last_error = None
        loop = asyncio.get_event_loop()

        for attempt in range(max_attempts):
            model = MODEL_ROSTER[attempt % len(MODEL_ROSTER)]
            try:
                resp = await asyncio.wait_for(
                    loop.run_in_executor(
                        None,
                        lambda: self.client.responses.create(
                            model=model,
                            reasoning={"effort": OPENAI_REASONING_EFFORT},
                            input=request_input,
                            instructions=(
                                "Return only one valid JSON object. Follow the requested "
                                "keys and coordinate contract exactly. Do not use Markdown."
                            ),
                            text={"format": {"type": "json_object"}},
                            max_output_tokens=OPENAI_MAX_OUTPUT_TOKENS,
                            store=False,
                        ),
                    ),
                    timeout=300.0,
                )
                usage = getattr(resp, "usage", None)
                if usage:
                    self.tracker.track(model, usage)

                text = getattr(resp, "output_text", None)
                if not text:
                    last_error = RuntimeError(
                        f"OpenAI response status={getattr(resp, 'status', 'unknown')}, "
                        f"no output_text, incomplete_details="
                        f"{getattr(resp, 'incomplete_details', None)}"
                    )
                    print(f"         ⚠️ AI Error: {last_error}")
                    await asyncio.sleep(1)
                    continue
                text = text.strip()
                if text.startswith("```json"):
                    text = text[7:]
                if text.startswith("```"):
                    text = text[3:]
                if text.endswith("```"):
                    text = text[:-3]
                result = json.loads(text.strip())
                if isinstance(result, list):
                    result = result[0] if result else {}
                if not isinstance(result, dict):
                    result = {}
                return result
            except json.JSONDecodeError as e:
                print(f"         ⚠️ JSON Parse Error: {e}")
                last_error = e
                await asyncio.sleep(1)
            except asyncio.TimeoutError:
                print("         ⏰ OpenAI call timed out after 5 minutes; rotating key...")
                self._rotate_api_key()
                last_error = asyncio.TimeoutError("5 minute timeout")
                await asyncio.sleep(3)
            except Exception as e:
                err_str = str(e)
                status_code = getattr(e, "status_code", None)
                error_code = str(getattr(e, "code", "") or "").casefold()
                lower_error = err_str.casefold()
                print(f"         ⚠️ Full OpenAI error details: {err_str}")

                quota_failure = any(marker in lower_error or marker in error_code for marker in (
                    "insufficient_quota", "billing", "credit balance", "credits depleted",
                    "hard limit", "quota exceeded",
                ))
                permanent_request_failure = status_code in (400, 404, 422)
                auth_failure = status_code in (401, 403)

                if quota_failure or permanent_request_failure:
                    raise OnboardingAIUnavailable(
                        f"OpenAI request cannot continue ({status_code or error_code or 'terminal'}): "
                        f"{err_str}"
                    ) from e

                if auth_failure:
                    if len(API_KEYS) > 1 and attempt < len(API_KEYS) - 1:
                        self._rotate_api_key()
                        last_error = e
                        await asyncio.sleep(1)
                        continue
                    raise OnboardingAIUnavailable(
                        f"OpenAI authentication/model access failed ({status_code}): {err_str}"
                    ) from e

                if status_code == 429 or "rate limit" in lower_error:
                    self._rotate_api_key()
                    await asyncio.sleep(3 + attempt)
                elif status_code in (500, 502, 503, 504) or any(
                    code in err_str for code in ["500", "502", "503", "504"]
                ):
                    await asyncio.sleep(2 + attempt)
                else:
                    await asyncio.sleep(2)
                last_error = e

        raise OnboardingAIUnavailable(
            f"OpenAI failed after {max_attempts} bounded attempts: {last_error}"
        )

    def _rotate_api_key(self):
        if not API_KEYS:
            raise RuntimeError(
                "Cannot rotate OpenAI API key: no API keys are configured."
            )
        if not hasattr(self, '_current_key_index'):
            self._current_key_index = 0
        self._current_key_index = (self._current_key_index + 1) % len(API_KEYS)
        self.client = OpenAI(api_key=API_KEYS[self._current_key_index])
        print(f"         🔑 Rotated to API key #{self._current_key_index}")




    def _screen_key_short(self, sig):
        raw = str(sig or "")
        if not raw:
            return "none"
        return hashlib.sha1(raw.encode("utf-8", errors="ignore")).hexdigest()[:8]

    def _arm_action_transition(self, screen_sig, screen_desc, action, target,
                               step, reasoning=""):
        """
        Remember what we are ABOUT to do. The next main-loop observation closes
        this transition with the actual destination screen.
        """
        if not action or action in ("WAIT", "SETTLED_HOME"):
            return

        self._pending_action_transition = {
            "from_sig": screen_sig,
            "from_desc": screen_desc or "",
            "action": str(action),
            "target": str(target or ""),
            "reasoning": str(reasoning or "")[:300],
            "step": int(step),
            "timestamp": time.time(),
        }

    def _finalize_pending_transition(self, current_sig, current_text,
                                     current_phase):
        pending = self._pending_action_transition
        if not pending:
            return

        item = dict(pending)
        item["to_sig"] = current_sig
        item["to_text"] = re.sub(
            r"\s+", " ", str(current_text or "")
        ).strip()[:500]
        item["to_phase"] = current_phase
        item["changed"] = bool(
            pending.get("from_sig") != current_sig
        )

        self.action_transition_history.append(item)
        if len(self.action_transition_history) > 80:
            self.action_transition_history = self.action_transition_history[-80:]

        from_id = self._screen_key_short(item.get("from_sig"))
        to_id = self._screen_key_short(item.get("to_sig"))
        outcome = "changed" if item["changed"] else "no_change"
        print(
            f"      🧠 Transition memory: {from_id} -- "
            f"{item['action']} '{item['target']}' --> {to_id} ({outcome})"
        )

        self._pending_action_transition = None

    def _load_historical_decision_events(self):
        """
        Bootstrap useful action history from an existing lifecycle journal.

        Older runs did not save structural transition IDs, but their ordered
        screen/action descriptions still help the model recognize a repeated
        path choice after --continue-current.
        """
        path = os.path.join(self.data_dir, "timeline_journal.jsonl")
        if not os.path.isfile(path):
            return

        events = []
        try:
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        event = json.loads(line)
                    except Exception:
                        continue
                    if not isinstance(event, dict):
                        continue
                    action = str(event.get("action", "") or "")
                    target = str(event.get("target", "") or "")
                    desc = str(event.get("screen_desc", "") or "")
                    state = str(event.get("state", "") or "")
                    if action and action not in (
                        "WAIT", "CAPTURE", "BEGIN_DEFERRED_VERIFICATION"
                    ):
                        events.append({
                            "state": state,
                            "action": action,
                            "target": target,
                            "screen_desc": desc,
                            "timestamp": event.get("timestamp"),
                        })
        except Exception:
            return

        self.historical_decision_events = events[-40:]
        if self.historical_decision_events:
            print(
                f"   🧠 Loaded {len(self.historical_decision_events)} "
                "historical onboarding decisions"
            )



    def _decision_memory_context(self, current_sig, current_desc="", xml_str=""):
        """
        Passive episodic evidence only.

        Memory never decides/blocks/replaces an action. It simply tells the
        single planner what happened after earlier actions.
        """
        recent = self.action_transition_history[-12:]
        recent_lines = []
        for item in recent:
            recent_lines.append(
                f"- screen {self._screen_key_short(item.get('from_sig'))}: "
                f"{item.get('action')} '{item.get('target')}' -> "
                f"screen {self._screen_key_short(item.get('to_sig'))} "
                f"({'changed' if item.get('changed') else 'NO CHANGE'})"
            )

        historical_lines = []
        for event in self.historical_decision_events[-8:]:
            historical_lines.append(
                f"- [{event.get('state')}] "
                f"{event.get('action')} '{event.get('target')}' "
                f"on {str(event.get('screen_desc', ''))[:100]}"
            )

        blocked = []
        counts = defaultdict(int)
        for item in reversed(self.action_transition_history[-20:]):
            if item.get("from_sig") != current_sig or item.get("changed"):
                continue
            action = str(item.get("action", "") or "").upper()
            target = self._normalized_action_label(item.get("target", ""))
            if not action:
                continue
            counts[(action, target)] += 1

        for (action, target), count in counts.items():
            if count >= 2:
                blocked.append(
                    f"- DO NOT repeat {action} '{target}' on this unchanged "
                    f"viewport: it already produced NO CHANGE {count} times. "
                    "Choose a different visible control or satisfy the missing "
                    "requirement first."
                )

        return {
            "recent": "\n".join(recent_lines) if recent_lines else "(none yet)",
            "historical": (
                "\n".join(historical_lines)
                if historical_lines else "(none loaded)"
            ),
            "avoid": "\n".join(blocked) if blocked else (
                "(none — one mechanical retry is allowed; after two exact "
                "NO CHANGE results, do not repeat the same action/target)"
            ),
        }





    def _no_change_repeat_count(self, current_sig, action, target):
        action = str(action or "").upper()
        target_norm = self._normalized_action_label(target)
        count = 0
        for item in reversed(self.action_transition_history[-20:]):
            if item.get("from_sig") != current_sig:
                continue
            if item.get("changed"):
                continue
            if str(item.get("action", "") or "").upper() != action:
                continue
            if self._normalized_action_label(item.get("target", "")) != target_norm:
                continue
            count += 1
        return count

    async def analyze_screen(self, img, xml_str):
        """
        Single authoritative planner.

        This method decides WHAT to do next from the CURRENT screen only.
        Runtime helpers may ground/execute/verify that one action, but no other
        planner is allowed to replace the semantic decision on the same frame.
        """
        history = self.memory.get_context()
        filled = self.memory.get_filled_summary()
        all_text = UIHierarchy.extract_visible_text(xml_str)
        xml_summary = UIHierarchy.parse_xml_to_string(xml_str)
        category_ctx = self.app_category.get_context_summary()
        self.app_category.refine_from_screen_text(all_text)

        current_screen_sig = UIHierarchy.get_screen_signature(xml_str)
        decision_memory = self._decision_memory_context(
            current_screen_sig,
            current_desc=all_text[:500],
            xml_str=xml_str,
        )

        resume_available = os.path.isfile(self.resume_pdf_path)
        resources = {
            "primary_email": self.persona.email,
            "phone": self.persona.phone or None,
            "resume_pdf_available": resume_available,
            "resume_pdf_path": self.resume_pdf_path if resume_available else None,
            "school_email": self.persona.extra_values.get("school_email"),
            "work_email": self.persona.extra_values.get("work_email"),
        }
        profile_context = self._profile_prompt_context()

        stuck_note = ""
        if self._stuck_action_count > 0:
            stuck_note = (
                f"The current screen has remained visually unchanged for "
                f"{self._stuck_action_count} recent observation(s). Treat that as "
                "evidence of a possible mechanical miss. One fresh re-grounded "
                "retry is acceptable. If the exact same action/target has already "
                "produced NO CHANGE twice, do NOT repeat it again; identify the "
                "missing requirement or choose a different visible control."
            )

        if self.local_video_guest_path:
            run_goal = (
                "Complete the app's visible first-run onboarding through its "
                "Get started / continue-as-guest path until the ordinary usable "
                "home is reached. Do not enter Sign in or Sign up when guest "
                "onboarding is available."
            )
            account_checkpoint = (
                "LOCAL VIDEO GUEST PROOF: A settled guest home IS completion "
                "of this local onboarding capture. Do not seek account creation "
                "or external verification. Finish all blocking in-app setup "
                "steps, then choose SETTLED_HOME on the ordinary usable home."
            )
            settled_rule = "the ordinary usable guest product home is reached"
            prefer_settled_rule = (
                "When the primary product is usable, prefer SETTLED_HOME over "
                "chasing optional account or profile-improvement cards."
            )
        else:
            run_goal = (
                "Complete signup/registration and all onboarding until the "
                "ordinary returning-user home/feed/dashboard is reached."
            )
            account_checkpoint = (
                f"Account creation confirmed: {self.flow_tracker.account_creation_detected}. "
                "A usable guest home is not completion of this account-onboarding run. "
                "If no account has been created, inspect visible account/profile/menu "
                "entry points for Log in, Join, Register, or Create an account. "
                "Follow that path before choosing SETTLED_HOME. If the app genuinely "
                "offers no account path after inspecting its entry points, use STOP "
                "with screen_type=ACCOUNT_UNAVAILABLE and describe the inspected places."
            )
            settled_rule = "account creation has been confirmed for this run"
            prefer_settled_rule = (
                "When the primary product is usable and an account has been "
                "created, prefer SETTLED_HOME over chasing optional profile cards."
            )

        res = await self._ai_call(f"""
        UNIVERSAL ANDROID ONBOARDING PLANNER — ONE ACTION ONLY.

        Goal:
        {run_goal}

        ACCOUNT CHECKPOINT:
        {account_checkpoint}

        APP:
        {APP_NAME} ({PACKAGE_NAME})

        CURRENT PHASE (metadata only):
        {self.phase}

        CATEGORY CONTEXT:
        {category_ctx}

        PERSONA / AUTHORITATIVE IDENTITY:
        - Email: {self.persona.email}
        - Password: {self.persona.password}
        - First name: {self.persona.first_name}
        - Last name: {self.persona.last_name}
        - Full name: {self.persona.full_name}
        - Phone: {self.persona.phone}
        - DOB: {self.persona.dob_full}
        - City: {self.persona.city}
        - State/region: {self.persona.state}
        - Country: {self.persona.country}
        - Zip/postal: {self.persona.zip_code}

        AVAILABLE RESOURCES:
        {json.dumps(resources, ensure_ascii=False)}

        AUTHORITATIVE CROSS-APP PROFILE:
        {json.dumps(profile_context, ensure_ascii=False, indent=2)}

        PROFILE INTEGRITY CONTRACT:
        - This profile is the ONLY source of truth for personal facts, work history,
          education history, languages, skills, salary preferences, and persistent
          cross-app preferences.
        - NEVER invent/guess a company, employer, job title, job description,
          university/institute, degree, major, attendance/employment dates,
          language, skill, salary, address, phone, DOB, or other personal fact.
        - For a visible selectable question, choose an option only when it matches
          the authoritative profile or one of its authorized semantic aliases.
        - You MAY reason freely about purely app-local navigation choices
          (tabs, permissions, Next/Back/Skip, layout/navigation) because those do
          not create a biographical fact.
        - If the profile lacks the requested fact and a visible Skip/Not now/Back
          path exists, use that visible path.
        - If the field/question is required and no profile value exists, return
          action=STOP, screen_type=PROFILE_DATA_REQUIRED and target_desc beginning
          with "missing_profile:" followed by the missing semantic key.
        - override_value is NOT permission to fabricate. For factual/profile fields,
          override_value must exactly reflect the profile or be null.

        PREVIOUSLY FILLED:
        {filled}

        RECENT MEMORY:
        {history}

        RECENT ACTION -> RESULT TRANSITIONS:
        {decision_memory['recent']}

        PRIOR RUN DECISIONS:
        {decision_memory['historical']}

        TRANSITION WARNINGS:
        {decision_memory['avoid']}

        RECOVERY OBJECTIVE:
        {self.verification_recovery_context or "(none)"}

        PROFILE DATA REQUIREMENT FROM PRIOR ATTEMPT:
        {self._missing_profile_requirement or "(none)"}

        STUCK NOTE:
        {stuck_note or "(none)"}

        CURRENT VISIBLE TEXT:
        {all_text[:1800]}

        CURRENT UI TREE:
        {xml_summary[:5000]}

        CORE CONTRACT:
        1. OBSERVE the CURRENT screenshot and UI only.
        2. Decide exactly ONE semantic action.
        3. Runtime grounds/executes that one action.
        4. Then the agent OBSERVES again before any further decision.
        5. Do not plan several UI steps ahead.

        ATOMIC ACTIONS:
        - CLICK: tap one currently visible control/row/card/option/button.
        - FILL_FIELD: focus one currently visible labeled text field and enter one value.
        - SCROLL_DOWN / SCROLL_UP: one scroll only.
        - SWIPE_LEFT: one swipe only.
        - PRESS_BACK: one back navigation only.
        - WAIT: wait briefly when the UI is genuinely loading/changing.
        - UPLOAD_RESUME: use only on an actual current resume/CV upload screen
          with a visible actionable upload/choose-file control and an available PDF.
          If the current visible row/card merely says "Add your resume",
          "Upload resume", "Add CV", etc. and clicking it OPENS the upload flow,
          use CLICK on that row/card first. Observe again before UPLOAD_RESUME.
        - SETTLED_HOME: use when this is the ordinary returning-user product
          home/feed/dashboard, the primary product is already usable, AND
          {settled_rule}.
          Optional profile-enrichment cards such as "Add your resume",
          "Complete your profile", "Add job preferences", or visibility/settings
          suggestions embedded inside a real dashboard do NOT prevent SETTLED_HOME.
          A blocking onboarding gate that must be completed before the product can
          be used DOES prevent SETTLED_HOME.
        - STOP: only when there is a genuine terminal/blocking condition that
          cannot be solved with available resources. Missing required authoritative
          profile data is such a condition; use screen_type=PROFILE_DATA_REQUIRED
          and target_desc="missing_profile:<key>".
          An app with no account option after inspecting its visible account,
          profile, and settings navigation may use screen_type=ACCOUNT_UNAVAILABLE.
          A visible service or network policy refusal of account creation may
          use screen_type=ACCOUNT_SERVICE_BLOCKED. Do not retry the same signup
          submission or work around a provider-side block.

        IMPORTANT BEHAVIOR:
        - There is NO autocomplete mode and NO dropdown mode.
          * Closed selector visible -> CLICK it.
          * Next observation shows options -> CLICK one visible option.
          * Search field visible -> FILL_FIELD.
          * Next observation shows search results -> CLICK one visible result.
        - There is NO hidden role/path fast path. Choose only among roles visible NOW.
        - There is NO second post-auth planner. This decision owns the next action.
        - Do not scroll/search away from a currently visible target you need.
        - Do not invent identity OR profile/history/preference information.
        - First Name and Last Name are distinct visible fields. Match the visible label.
        - School/work email is a separate resource. Never fabricate an institutional address.
        - If a required path needs a resource that does not exist, backtrack one
          visible step at a time and choose a viable alternative.
        - For consent, click the actual checkbox/toggle control, not Terms/Privacy hyperlinks.
        - Optional marketing/newsletter consent should remain unchecked unless it
          is genuinely required to proceed.
        - A Privacy Policy / Terms page is a legal page, not a resume upload page.
        - A screen that offers "Send code", "Email OTP", "Get magic link", etc.
          still has a LOCAL action first. CLICK it before external verification.
        - A true external verification challenge says a code/link WAS SENT,
          asks to ENTER a code, says CHECK INBOX, or shows a resend state.
        - If a resend countdown is active, a fresh request is already pending.
        - Do not mark SETTLED_HOME while a visible CTA is a BLOCKING gate to
          entering/using the product. However, optional profile-completion or
          profile-improvement CTAs embedded inside an already usable home/feed
          do NOT block SETTLED_HOME.
        - {prefer_settled_rule}
        - If a value/action missed mechanically, one fresh re-grounded retry is
          allowed. If RECENT ACTION -> RESULT shows the exact action/target
          produced NO CHANGE twice on this viewport, DO NOT repeat it again.

        SCREEN CLASSIFICATION:
        Use a descriptive screen_type such as:
        SPLASH_SCREEN, AUTH_CHOICE, SIGNUP_METHOD, LOGIN, FORM, VERIFICATION,
        ROLE_SELECTION, ONBOARDING_CAROUSEL, ONBOARDING_QUIZ, WELCOME_SCREEN,
        PROFILE_COMPLETION, PERMISSION_DIALOG, OVERLAY/POPUP, PAYMENT,
        PLAN_SELECTION, APPLICATION_PENDING, RESUME_UPLOAD, HOME, FEED,
        DASHBOARD, LOADING, ERROR, CAPTCHA, UNKNOWN.

        VERIFICATION FLAG:
        Set is_verification_screen=true only for a true external verification
        challenge. If a local "send/get code" action remains, keep it false and
        choose that local action.

        OUTPUT JSON ONLY:
        {{
          "screen_description": "concise description of what is visibly on screen",
          "screen_type": "FORM",
          "action": "CLICK|FILL_FIELD|SCROLL_DOWN|SCROLL_UP|SWIPE_LEFT|PRESS_BACK|WAIT|UPLOAD_RESUME|SETTLED_HOME|STOP",
          "target_desc": "exact visible semantic target, or empty for scroll/back/wait",
          "target_coords": [540, 1200],
          "value_type": "email|password|first_name|last_name|phone|zip_code|text|etc",
          "override_value": null,
          "reasoning": "why this one action is the correct next step",
          "is_verification_screen": false,
          "screenshot_label": "short descriptive slug"
        }}
        """, images=[img])

        if not isinstance(res, dict):
            return {
                "screen_description": "Could not classify current screen",
                "screen_type": "UNKNOWN",
                "action": "WAIT",
                "target_desc": "",
                "target_coords": None,
                "value_type": "text",
                "override_value": None,
                "reasoning": "Planner returned no usable decision",
                "is_verification_screen": False,
                "screenshot_label": "unknown",
            }

        return res



    @staticmethod
    def _normalized_action_label(value):
        return re.sub(r"[^a-z0-9]+", " ", str(value or "").casefold()).strip()

    def _looks_like_onboarding_exit_cta(self, label, contextual=False):
        norm = self._normalized_action_label(label)
        if not norm:
            return False

        direct = (
            "start swiping",
            "start exploring",
            "start browsing",
            "start matching",
            "see matches",
            "view matches",
            "enter app",
            "continue to app",
            "go to dashboard",
            "open dashboard",
            "launch app",
            "take me there",
        )
        if any(p in norm for p in direct):
            return True

        if contextual:
            generic = (
                "continue",
                "get started",
                "lets go",
                "let s go",
                "finish",
                "done",
                "next",
                "got it",
                "ok",
            )
            return any(
                norm == p
                or norm.startswith(p + " ")
                or (" " + p + " ") in (" " + norm + " ")
                for p in generic
            )

        return False

    def _completion_context_present(self, screen_type, screen_desc, xml_str):
        visible = (
            UIHierarchy.extract_visible_text(xml_str).casefold()
            if xml_str else ""
        )
        context = f"{screen_desc or ''} {visible}".casefold()

        completion_markers = (
            "you're all set",
            "you’re all set",
            "all set",
            "profile is ready",
            "profile ready",
            "setup complete",
            "onboarding complete",
            "ready to start",
            "ready to go",
        )

        transitional_types = {
            "WELCOME_SCREEN", "CONFIRMATION", "TUTORIAL_CAROUSEL",
            "ONBOARDING_CAROUSEL", "ONBOARDING_QUIZ", "INTEREST_SELECTION",
            "PROFILE_COMPLETION", "TOOLTIP_OVERLAY", "OVERLAY/POPUP",
            "NOTIFICATION_PROMPT", "PERMISSION_DIALOG",
        }

        return (
            screen_type in transitional_types
            or any(marker in context for marker in completion_markers)
        )

    def _find_onboarding_exit_cta(self, xml_str, strategy=None,
                                  screen_type="", screen_desc=""):
        strategy = strategy or {}
        contextual = self._completion_context_present(
            screen_type, screen_desc, xml_str
        )

        target = str(strategy.get("target_desc", "") or "").strip()
        target_coords = strategy.get("target_coords")
        action = str(strategy.get("action", "") or "").upper()

        # XML-first: when the hierarchy is available, use the real clickable
        # geometry instead of a VLM pixel estimate.
        for el in UIHierarchy.find_clickable_elements(xml_str or ""):
            label = " ".join(
                p for p in [
                    str(el.get("text", "") or "").strip(),
                    str(el.get("desc", "") or "").strip(),
                ] if p
            ).strip()
            if label and self._looks_like_onboarding_exit_cta(
                label, contextual=contextual
            ):
                return {
                    "label": label,
                    "coords": el.get("center"),
                    "source": "xml",
                }

        # If XML timed out, preserve the model's semantic CTA label but do not
        # trust raw model pixel coordinates. the old retry clicker used to reacquire
        # normalized visual coordinates from the current screenshot.
        if target and self._looks_like_onboarding_exit_cta(
            target, contextual=contextual
        ):
            return {
                "label": target,
                "coords": (
                    tuple(target_coords)
                    if (target_coords and xml_str) else None
                ),
                "source": "strategy",
            }

        if contextual and action == "CLICK" and target:
            return {
                "label": target,
                "coords": (
                    tuple(target_coords)
                    if (target_coords and xml_str) else None
                ),
                "source": "strategy_context",
            }

        return None


    async def validate_settled_state(self, img, xml_str, xml_fingerprint,
                                     screen_type="", screen_desc="",
                                     action="", target=""):
        """
        Validate the ordinary RETURNING-USER home state, not merely the final
        onboarding confirmation page.
        """
        all_text = UIHierarchy.extract_visible_text(xml_str)
        xml_summary = UIHierarchy.parse_xml_to_string(xml_str)
        clickable = UIHierarchy.find_clickable_elements(xml_str)

        context_strategy = {
            "action": action,
            "target_desc": target,
        }
        exit_cta = self._find_onboarding_exit_cta(
            xml_str,
            context_strategy,
            screen_type,
            screen_desc,
        )

        if exit_cta or self._completion_context_present(
            screen_type, screen_desc, xml_str
        ):
            return {
                "is_settled": False,
                "confidence": 1.0,
                "evidence": (
                    "Transitional onboarding/welcome state remains"
                    + (
                        f"; outstanding CTA='{exit_cta['label']}'"
                        if exit_cta else ""
                    )
                ),
                "has_onboarding_elements": True,
                "has_exit_cta": bool(exit_cta),
            }

        has_bottom_nav = any(
            el.get('widget_type') in ('bottom_nav', 'tab_bar') or
            any(
                kw in (el.get('resource_id', '') or '').lower()
                for kw in ['bottom_nav', 'tab_bar', 'navigation_bar', 'bnv_']
            )
            for el in clickable
        )

        res = await self._ai_call(f"""
        TRUE SETTLED-HOME VALIDATION.

        Decide whether this is the ordinary main screen a RETURNING USER would
        see after onboarding, NOT merely the final onboarding confirmation page.

        App: {APP_NAME}
        Category: {self.app_category.get_category()}
        Current classifier type: {screen_type}
        Current description: {screen_desc}

        TRUE HOME REQUIREMENTS:
        - real primary product content: feed, swipe deck, dashboard, inbox, jobs, etc.
        - ordinary product navigation / returning-user controls
        - NO BLOCKING onboarding/welcome/setup/tutorial/permission gate
        - NO final CTA that still must be clicked before the primary product is usable
        - Optional profile-enrichment cards INSIDE an already usable home are allowed.
          Examples: "Add your resume", "Add job preferences", "Complete profile",
          "Let employers find you", profile strength/recommendation cards.

        EXPLICITLY NOT SETTLED:
        - "You're all set", "Your profile is ready", "Setup complete" while
          "Start swiping", "Continue", "Get Started", "Let's go", or another
          enter-the-app CTA remains
        - standalone welcome/tutorial/interests/profile-completion screens that
          still gate entry to the primary product
        - confirmation overlays, tooltips, permission prompts
        - IMPORTANT: a real home/feed with persistent navigation and usable
          product content is still settled even if it contains OPTIONAL profile
          completion suggestions/cards.

        VISIBLE TEXT:
        {all_text[:1500]}

        INTERACTIVE ELEMENTS:
        {xml_summary[:1000]}

        Detected bottom navigation: {has_bottom_nav}

        For "has_onboarding_elements", report TRUE only for onboarding/setup
        elements that BLOCK ordinary use of the primary product. Optional
        profile-enrichment cards embedded in an already usable dashboard are
        not blocking onboarding elements.

        OUTPUT JSON:
        {{
            "is_truly_settled": true/false,
            "confidence": 0.0-1.0,
            "evidence": "why this is or is not the returning-user home",
            "has_main_content": true/false,
            "has_navigation": true/false,
            "has_onboarding_elements": true/false,
            "has_exit_cta": true/false,
            "returning_user_equivalent": true/false,
            "screen_description": "description of the real main product screen"
        }}
        """, images=[img])

        if not res:
            return {
                "is_settled": False,
                "confidence": 0.3,
                "evidence": "AI settled-state check failed",
            }

        confidence = float(res.get("confidence", 0.5) or 0.5)
        has_main_content = bool(res.get("has_main_content", False))
        has_onboarding = bool(res.get("has_onboarding_elements", False))
        has_exit_cta = bool(res.get("has_exit_cta", False))
        returning_user_equivalent = bool(
            res.get("returning_user_equivalent", False)
        )

        accepted = (
            bool(res.get("is_truly_settled", False))
            and confidence >= 0.80
            and has_main_content
            and returning_user_equivalent
            and not has_onboarding
            and not has_exit_cta
        )

        if accepted:
            self.post_auth_handler.add_settled_evidence(
                res.get("evidence", "AI confirmed returning-user home")
            )
            if xml_fingerprint:
                self.post_auth_handler.record_home_fingerprint(xml_fingerprint)
            return {
                "is_settled": True,
                "confidence": confidence,
                "evidence": res.get("evidence", ""),
                "screen_description": res.get("screen_description", ""),
            }

        return {
            "is_settled": False,
            "confidence": confidence,
            "evidence": res.get("evidence", ""),
            "has_main_content": has_main_content,
            "has_navigation": bool(res.get("has_navigation", False)),
            "has_onboarding_elements": has_onboarding,
            "has_exit_cta": has_exit_cta,
            "returning_user_equivalent": returning_user_equivalent,
        }

    async def _determine_post_verification_phase(self, img, xml_str):
        if not img:
            return "POST_AUTH"

        all_text = UIHierarchy.extract_visible_text(xml_str)
        xml_summary = UIHierarchy.parse_xml_to_string(xml_str)
        input_fields = UIHierarchy.find_input_fields(xml_str)
        empty_fields = [f for f in input_fields if f.get("is_empty", False) and f.get("enabled", True)]

        empty_fields_info = json.dumps(
            [{"hint": f.get("hint", ""), "resource_id": f.get("resource_id", "")} for f in empty_fields[:5]],
            indent=2
        ) if empty_fields else "None"

        res = await self._ai_call(f"""
        POST-VERIFICATION PHASE DETECTION.

        Email/phone verification just completed successfully. Now I need to determine
        what phase to enter next.

        QUESTION: Is the current screen:
        A) A FORM that requires filling (has empty required fields like name, address,
           profile info) — meaning the account creation is NOT yet complete
        B) A post-auth screen (welcome, home feed, onboarding tutorial, interest selection)
           — meaning the account is fully created and we're in the app

        Key indicators for FORM (return to FORM_FILL):
        - Empty input fields (name, phone, address, city, etc.)
        - "Complete your profile", "Finish setup", "Account setup"
        - Submit/Save/Continue buttons that finalize registration
        - Required fields marked with * that are empty

        Key indicators for POST_AUTH:
        - Welcome messages, "You're in!", "Account created"
        - Home feed, dashboard, content recommendations
        - Tutorial carousels, interest selection
        - No empty required input fields

        VISIBLE TEXT:
        {all_text[:1500]}

        INTERACTIVE ELEMENTS:
        {xml_summary[:1000]}

        EMPTY INPUT FIELDS DETECTED: {len(empty_fields)}
        {empty_fields_info}

        OUTPUT JSON:
        {{
            "phase": "FORM_FILL or POST_AUTH",
            "confidence": 0.85,
            "reasoning": "I see empty required fields for First Name, Last Name, City — account setup is not complete",
            "empty_required_fields_visible": true,
            "screen_description": "Profile completion form with empty fields"
        }}
        """, images=[img])

        if not res:
            if len(empty_fields) >= 2:
                print(f"      📝 AI check failed but {len(empty_fields)} empty fields detected -> FORM_FILL")
                return "FORM_FILL"
            return "POST_AUTH"

        phase = res.get("phase", "POST_AUTH")
        confidence = res.get("confidence", 0.5)
        reasoning = res.get("reasoning", "")

        print(f"      🔍 Post-verification phase detection: {phase} (conf={confidence:.2f})")
        print(f"         Reason: {reasoning[:120]}")

        if phase == "POST_AUTH" and len(empty_fields) >= 2 and confidence < 0.9:
            print(f"      ⚠️ AI said POST_AUTH but {len(empty_fields)} empty fields detected. Overriding to FORM_FILL.")
            return "FORM_FILL"

        return phase


    async def detect_and_dismiss_dialog(self, img, xml_str):
        all_text = UIHierarchy.extract_visible_text(xml_str).lower()
        clickable = UIHierarchy.find_clickable_elements(xml_str)

        # Never dismiss anything when we are inside an OAuth or social login flow.
        # X buttons and close icons in these flows are part of the legitimate auth
        # process — dismissing them kills the login and sends the agent backwards.
        OAUTH_INDICATORS = [
            "facebook", "instagram", "log in to facebook", "log in with facebook",
            "log into facebook", "google account", "sign in with google",
            "authorize", "allow access", "oauth", "id.awin.com",
            "continue as", "connect instagram", "connect with instagram",
        ]
        if any(indicator in all_text for indicator in OAUTH_INDICATORS):
            print(f"      🔐 OAuth/social login flow detected — skipping dialog dismissal entirely.")
            return False

        # Also skip if we are inside a browser/WebView that is not the main app
        focused_pkg = self.device.get_current_focused_package()
        in_external_webview = (
            "chrome" in focused_pkg.lower() or
            "browser" in focused_pkg.lower()
        ) and PACKAGE_NAME not in focused_pkg
        if in_external_webview:
            print(f"      🌐 External WebView active — skipping dialog dismissal.")
            return False

        if self._dialog_dismiss_fail_count >= 2 and self._dialog_dismiss_last_target:
            if self._dialog_dismiss_last_target.lower() in all_text:
                print(f"      ⏭️ Dialog detector stepping aside — failed to dismiss "
                      f"'{self._dialog_dismiss_last_target}' {self._dialog_dismiss_fail_count} times. "
                      f"Letting main analysis handle it.")
                return False

        AUTH_CONTENT_INDICATORS = [
            "create account", "create an account",
            "sign up", "signup", "register",
            "sign in", "sign up to earn", "sign in / sign up",
            "continue with email", "continue with google",
            "continue with facebook", "continue with apple",
            "log in", "login",
            "enter your email", "enter email",
            "email address", "password",
            # Strict OAuth / Consent / Social Integration indicators
            "requesting access", "is requesting access", "view profile and access media",
            "to your information", "privacy policy and terms", "authorization",
            "consent", "oauth", "facebook.com", "instagram.com"
        ]
        if any(indicator in all_text for indicator in AUTH_CONTENT_INDICATORS):
            return False

        PICKER_INDICATORS = [
            "select date", "choose date", "set date",
            "select your birthday", "s m t w t f s",
            "time picker", "date picker"
        ]
        if any(indicator in all_text for indicator in PICKER_INDICATORS):
            return False

        GOOGLE_PLAY_SHEET_INDICATORS = [
            "add payment method to your google",
            "add a payment method to your google",
        ]
        if any(indicator in all_text for indicator in GOOGLE_PLAY_SHEET_INDICATORS):
            print(f"      💰 Google Play payment sheet detected in dialog check — pressing BACK")
            self.device.press_back()
            time.sleep(2)
            self.memory.add_thought("Dismissed Google Play payment sheet with BACK")
            self.memory.dismissed_dialogs.append("google_play_payment_sheet")
            return True

        CREDENTIAL_MANAGER_INDICATORS = [
            "save password", "save your password", "google password manager",
            "save to google", "use your password", "credential manager",
        ]
        if any(indicator in all_text for indicator in CREDENTIAL_MANAGER_INDICATORS):
            clickable = UIHierarchy.find_clickable_elements(xml_str)
            dismiss_keywords = ["not now", "never", "no thanks", "cancel", "no, thanks"]
            for el in clickable:
                el_text = f"{el['text']} {el['desc']}".lower().strip()
                for kw in dismiss_keywords:
                    if kw in el_text:
                        label = el['text'] or el['desc']
                        print(f"      🔐 Credential Manager dialog -> dismissing with '{label}'")
                        self.memory.dismissed_dialogs.append("credential_manager")
                        await self._execute_atomic_visual_click(
                            img,
                            xml_str,
                            label,
                            target_coords=el['center'],
                            screen_desc="Credential Manager system dialog",
                        )
                        return True
            print(f"      🔐 Credential Manager dialog -> pressing back to dismiss")
            self.device.press_back()
            time.sleep(1.5)
            return True

        # In-app sheets/dialogs are normal observable screens. Do not let this
        # pre-processor override the model's current action.
        if self.device.is_package_in_foreground(PACKAGE_NAME):
            return False

        dialog_patterns = [
            (["allow", "while using"], "allow"),
            (["deny", "don't allow"], "deny"),
            (["accept", "cookie", "consent"], "accept"),
            (["ok", "got it", "understand"], "ok"),
            (["not now", "later", "skip"], "dismiss"),
            (["update", "later"], "later"),
        ]

        for keywords, action_type in dialog_patterns:
            if all(kw in all_text for kw in keywords[:1]):
                res = await self._ai_call(f"""
                DIALOG CHECK: Is this a system dialog, permission prompt, or popup overlay?

                Text: {all_text[:500]}
                Elements: {UIHierarchy.parse_xml_to_string(xml_str)[:1000]}

                Which button should I tap to DISMISS it?

                OUTPUT JSON:
                {{
                    "is_dialog": true/false,
                    "dialog_type": "permission|promo|cookie|info|update",
                    "dismiss_target": "Allow",
                    "dismiss_coords": [540, 1200]
                }}
                """, images=[img])

                if res and res.get("is_dialog"):
                    target = str(res.get("dismiss_target", "") or "").strip()
                    coords = res.get("dismiss_coords")
                    target_norm = re.sub(r"[^a-z0-9]+", " ", target.casefold()).strip()

                    safe_dismiss_labels = {
                        "allow", "don t allow", "deny", "not now", "later",
                        "skip", "close", "cancel", "dismiss", "got it",
                        "ok", "okay", "accept", "no thanks", "no thank you",
                        "not now thanks",
                    }
                    dangerous_account_actions = (
                        "sign out", "log out", "logout", "delete account",
                        "remove account", "start over",
                    )

                    if (
                        not target_norm
                        or any(x in target_norm for x in dangerous_account_actions)
                        or target_norm not in safe_dismiss_labels
                    ):
                        print(
                            f"      🛡️ Dialog detector refusing unsafe/non-dismiss "
                            f"target '{target}'. Main observe→act loop will handle it."
                        )
                        return False

                    print(f"      🔔 System/external dialog: {res.get('dialog_type', '?')} -> '{target}'")
                    self.memory.dismissed_dialogs.append(res.get("dialog_type", "unknown"))

                    success = await self._execute_atomic_visual_click(
                        img,
                        xml_str,
                        target,
                        target_coords=tuple(coords) if coords else None,
                        screen_desc=f"{res.get('dialog_type', 'system')} dialog",
                    )

                    dialog_key = target or res.get("dialog_type", "unknown")
                    if success:
                        self._dialog_dismiss_fail_count = 0
                        self._dialog_dismiss_last_target = None
                    else:
                        if dialog_key == self._dialog_dismiss_last_target:
                            self._dialog_dismiss_fail_count += 1
                        else:
                            self._dialog_dismiss_fail_count = 1
                            self._dialog_dismiss_last_target = dialog_key
                        print(f"      ⚠️ Dialog dismiss failed ({self._dialog_dismiss_fail_count} consecutive)")

                    return True

        return False









    def _infer_field_semantic(self, target_desc, value_type):
        text = f"{target_desc or ''} {value_type or ''}".lower()
        semantic_groups = [
            ("email", ["email", "e-mail", "mail"]),
            ("password", ["password", "passcode", "pwd"]),
            ("phone", ["phone", "mobile", "telephone", "tel"]),
            ("university", ["university", "college", "school", "institution"]),
            ("zip", ["zip", "postal", "postcode", "post code"]),
            ("country", ["country", "nation"]),
            ("state", ["state", "province", "region"]),
            ("city", ["city", "town"]),
            ("address", ["street", "address", "address line"]),
            ("first_name", ["first name", "given name", "fname"]),
            ("last_name", ["last name", "surname", "family name", "lname"]),
            ("username", ["username", "user name", "handle", "nickname"]),
            ("name", ["full name", "name"]),
        ]
        for semantic, keywords in semantic_groups:
            if any(kw in text for kw in keywords):
                return semantic
        return None

    @staticmethod
    def _semantic_keywords(semantic):
        return {
            "email": ["email", "mail", "@"],
            "password": ["password", "pass", "pwd"],
            "phone": ["phone", "mobile", "telephone", "tel"],
            "university": ["university", "college", "school", "institution"],
            "zip": ["zip", "postal", "postcode"],
            "country": ["country", "nation"],
            "state": ["state", "province", "region"],
            "city": ["city", "town"],
            "address": ["street", "address"],
            "first_name": ["first", "given", "fname"],
            "last_name": ["last", "surname", "family", "lname"],
            "username": ["username", "user", "handle", "nickname"],
            "name": ["name"],
        }.get(semantic, [])

    def _field_matches_semantic(self, field, target_desc, value_type):
        """Return False when XML clearly identifies a different semantic field."""
        semantic = self._infer_field_semantic(target_desc, value_type)
        if not semantic:
            return True

        combined = " ".join([
            str(field.get('hint', '') or ''),
            str(field.get('resource_id', '') or ''),
            str(field.get('text', '') or ''),
        ]).lower()

        if semantic == "password" and field.get('is_password', False):
            return True

        keywords = self._semantic_keywords(semantic)
        if any(kw in combined for kw in keywords):
            return True

        other_semantics = [
            "email", "password", "phone", "university", "zip", "country", "state",
            "city", "address", "first_name", "last_name", "username",
        ]
        for other in other_semantics:
            if other == semantic:
                continue
            if any(kw in combined for kw in self._semantic_keywords(other)):
                return False

        # If XML does not identify this as a different known field, stay permissive.
        # Many apps expose placeholders such as "John Doe" or "123 Main St" with no
        # semantic hint/resource-id, and those are still valid target fields.
        return True






    async def _visual_ground_click_target(self, img, xml_str, target_desc,
                                          screen_desc=""):
        """
        Visually re-ground a choice/result click on the CURRENT screen.

        Search/autocomplete screens are especially dangerous for XML because the
        query EditText often has better metadata than the result rows. The old
        behavior could therefore click the search box again instead of a visible
        suggestion. The vision model chooses the visible result; runtime only converts
        normalized coordinates and verifies the click afterward.
        """
        if not img:
            return None

        res = await self._ai_call(f"""
        VISUAL CLICK GROUNDING — CURRENT SCREEN ONLY.

        Intended action:
        "{target_desc}"

        Screen context:
        "{screen_desc}"

        Look at the CURRENT PHONE screenshot and identify the exact visible
        element that should be tapped NOW.

        IMPORTANT:
        - If the intent is to select a search/autocomplete suggestion, tap the
          visible SUGGESTION ROW, not the search input itself.
        - Use the visible labels and layout. Do not reuse coordinates from an
          earlier screen.
        - If the target names exact visible text (for example "2025", "Bachelors",
          "Continue"), locate THAT exact visible text/row, not the general control.
        - If the requested element is not actually visible, found=false.
        - Coordinates must be normalized to the PHONE display.

        OUTPUT JSON:
        {{
          "found": true,
          "element_text": "exact visible text/label",
          "x_pct": 0.50,
          "y_pct": 0.45,
          "confidence": 0.95,
          "reasoning": "why this is the intended visible element"
        }}
        """, images=[img])

        if not res or not res.get("found"):
            return None
        if float(res.get("confidence", 0) or 0) < 0.70:
            return None

        try:
            x = int(float(res["x_pct"]) * self.device.screen_size[0])
            y = int(float(res["y_pct"]) * self.device.screen_size[1])
        except (KeyError, TypeError, ValueError):
            return None

        if not (
            0 <= x < self.device.screen_size[0]
            and 0 <= y < self.device.screen_size[1]
        ):
            return None

        print(
            f"      👁️ Visual grounding: '{target_desc}' -> "
            f"'{res.get('element_text', '')}' at ({x}, {y})"
        )
        return (x, y)

    @staticmethod
    def _normalize_click_label(value):
        return re.sub(
            r"[^a-z0-9]+",
            " ",
            str(value or "").casefold(),
        ).strip()

    def _current_xml_click_candidates(self, xml_str):
        """
        Extract visible CURRENT-screen text/description nodes with real Android
        bounds. These coordinates are authoritative when the model has already
        chosen a semantic target such as "2025", "Bachelors", or "Continue".

        The model decides WHAT to click.
        The runtime grounds that choice to the current UI tree.
        """
        if not xml_str:
            return []
        try:
            root = ET.fromstring(xml_str)
        except Exception:
            return []

        candidates = []
        seen = set()

        for node in root.iter():
            if node.attrib.get("visible-to-user", "true") == "false":
                continue
            if node.attrib.get("enabled", "true") == "false":
                continue

            text_value = (node.attrib.get("text", "") or "").strip()
            desc_value = (node.attrib.get("content-desc", "") or "").strip()

            label = text_value or desc_value
            if not label:
                continue

            bounds = node.attrib.get("bounds", "")
            m = re.findall(
                r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',
                bounds,
            )
            if not m:
                continue

            x1, y1, x2, y2 = map(int, m[0])
            if x2 <= x1 or y2 <= y1:
                continue

            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2
            if not (
                0 <= cx < self.device.screen_size[0]
                and 0 <= cy < self.device.screen_size[1]
            ):
                continue

            norm = self._normalize_click_label(label)
            if not norm:
                continue

            key = (norm, cx, cy)
            if key in seen:
                continue
            seen.add(key)

            candidates.append({
                "label": re.sub(r"\s+", " ", label).strip(),
                "norm": norm,
                "center": (cx, cy),
                "area": (x2 - x1) * (y2 - y1),
                "clickable": node.attrib.get("clickable", "false") == "true",
                "resource_id": node.attrib.get("resource-id", ""),
            })

        return candidates

    def _ground_target_from_current_xml(self, xml_str, target_desc):
        """
        Ground the model's semantic target to exact CURRENT Android bounds.

        This deliberately handles labels embedded in natural-language model
        targets:
          "Select the year 2025 as the expected graduation year" -> "2025"
          "Bachelors option in the education dropdown" -> "Bachelors"
          "Continue button" -> "Continue"

        It avoids asking a vision model to estimate pixel coordinates when the
        current UI tree already exposes the exact visible label.
        """
        candidates = self._current_xml_click_candidates(xml_str)
        if not candidates:
            return None

        target_norm = self._normalize_click_label(target_desc)
        target_tokens = set(target_norm.split())

        # Strong literal hints: quoted strings and 4-digit years.
        literal_hints = []
        literal_hints.extend(
            re.findall(r"""['"]([^'"]{1,80})['"]""", str(target_desc or ""))
        )
        literal_hints.extend(
            re.findall(r"\b(?:19|20)\d{2}\b", str(target_desc or ""))
        )

        # Strip common action-language wrappers, leaving likely visible label.
        simplified = re.sub(
            r"\b(select|choose|click|tap|open|the|a|an|as|expected|"
            r"graduation|date|dropdown|selector|button|control|option|"
            r"result|row|field|for|in|from|of|to)\b",
            " ",
            str(target_desc or ""),
            flags=re.I,
        )
        simplified = re.sub(r"\s+", " ", simplified).strip()
        if simplified:
            literal_hints.append(simplified)

        hint_norms = [
            self._normalize_click_label(h)
            for h in literal_hints
            if self._normalize_click_label(h)
        ]

        scored = []
        for c in candidates:
            label_norm = c["norm"]
            label_tokens = set(label_norm.split())
            score = 0

            # Exact visible label named explicitly.
            if label_norm == target_norm:
                score += 1000

            # Strong literal/year hint exact match.
            for hint in hint_norms:
                if label_norm == hint:
                    score += 900
                elif hint and (
                    label_norm in hint
                    or hint in label_norm
                ):
                    score += 500

            # Model target contains the entire visible label.
            if label_norm and label_norm in target_norm:
                score += 700

            # Token coverage: useful for "Harvard University result row".
            if label_tokens:
                overlap = len(label_tokens & target_tokens)
                coverage = overlap / len(label_tokens)
                if coverage == 1.0:
                    score += 450
                elif coverage >= 0.67:
                    score += 250

            # Exact year mentioned anywhere gets maximum practical preference.
            if (
                re.fullmatch(r"(?:19|20)\d{2}", label_norm)
                and label_norm in target_tokens
            ):
                score += 1200

            # Prefer compact text/row nodes and actual clickable nodes.
            if c["clickable"]:
                score += 25
            score -= min(c["area"] / 1_000_000.0, 20)

            if score > 0:
                scored.append((score, c))

        if not scored:
            return None

        scored.sort(
            key=lambda item: (
                item[0],
                -item[1]["area"],
            ),
            reverse=True,
        )
        best_score, best = scored[0]

        # Require meaningful semantic evidence; don't turn weak fuzzy overlap
        # into a wrong tap.
        if best_score < 400:
            return None

        print(
            f"      🎯 Structured grounding: '{target_desc}' -> "
            f"'{best['label']}' at {best['center']} "
            f"[score={best_score:.0f}]"
        )
        return best["center"]

    async def _execute_atomic_visual_click(self, img, xml_str, target_desc,
                                           target_coords=None,
                                           screen_desc=""):
        """
        Execute exactly ONE click against the CURRENT screen.

        Core invariant:
            OBSERVE -> CLICK ONCE -> return to main loop -> OBSERVE AGAIN.

        No internal retry, no automatic Back, no return-to-app, no second action.
        """
        if not target_desc:
            print("      ⚠️ Atomic CLICK has no target")
            return False

        # Model decides WHAT. Current Android structure grounds WHERE.
        coords = self._ground_target_from_current_xml(
            xml_str,
            target_desc,
        )

        # Vision is a fallback only when the current UI tree cannot ground the
        # semantic target. This avoids raw coordinate hallucinations for obvious
        # visible choices such as 2025/Bachelors/Continue.
        if not coords:
            coords = await self._visual_ground_click_target(
                img,
                xml_str,
                target_desc,
                screen_desc=screen_desc,
            )

        if not coords:
            simple_target = re.sub(
                r"\b(button|control|dropdown|selector|option|result|row|field)\b",
                "",
                str(target_desc),
                flags=re.I,
            )
            simple_target = re.sub(r"\s+", " ", simple_target).strip()
            labels = [target_desc]
            if simple_target and simple_target != target_desc:
                labels.append(simple_target)

            coords = self._xml_text_center(xml_str, labels)

        if not coords and target_coords:
            try:
                x, y = int(target_coords[0]), int(target_coords[1])
                if (
                    0 <= x < self.device.screen_size[0]
                    and 0 <= y < self.device.screen_size[1]
                ):
                    coords = (x, y)
            except (TypeError, ValueError, IndexError):
                coords = None

        if not coords:
            print(
                f"      ❌ Atomic CLICK could not locate CURRENT visible target "
                f"'{target_desc}'"
            )
            return False

        print(
            f"      👆 Atomic CLICK '{target_desc}' at "
            f"({coords[0]}, {coords[1]})"
        )
        self.device.tap(int(coords[0]), int(coords[1]))
        time.sleep(1.0)
        return True



    async def _focus_field_direct(self, target_desc, value_type,
                                  img, xml_str, field_coords=None,
                                  max_attempts=3):
        """
        SIMPLE FIELD FOCUS LOOP.

        1. Tap the exact candidate coordinates.
        2. Look at the CURRENT screenshot.
        3. Ask one question: is the requested labeled field active?
        4. If no, use the verifier's corrected coordinates and try again.

        IMPORTANT: this intentionally uses direct field focus so XML matching
        cannot silently replace a visually grounded Last-name/Email coordinate
        with the First-name EditText just because that XML node is easier to match.
        """
        current_img = img
        current_xml = xml_str
        coords = tuple(field_coords) if field_coords else None

        for attempt in range(1, max_attempts + 1):
            if not coords:
                coords = await self._ai_locate_field(
                    current_img,
                    current_xml,
                    target_desc,
                    value_type,
                )
            if not coords:
                print(
                    f"         ❌ Could not visually locate '{target_desc}' "
                    f"for focus attempt {attempt}/{max_attempts}"
                )
                return False, None, current_img, current_xml

            x, y = int(coords[0]), int(coords[1])
            print(
                f"         👆 Focus attempt {attempt}/{max_attempts}: "
                f"tap '{target_desc}' directly at ({x}, {y})"
            )
            self.device.tap(x, y)
            time.sleep(0.75)

            current_img = self._capture_active_screen()
            current_xml = self.device.get_ui_xml()
            fields = UIHierarchy.find_input_fields(current_xml)

            # Never infer semantic identity from "only one EditText exposed".
            # Compose/accessibility frequently exposes only the focused field.
            # We must visually confirm the requested LABEL before typing.
            focused_fields = [f for f in fields if f.get("focused", False)]

            if not current_img:
                print(
                    "         ⚠️ No current screenshot available to verify focus; "
                    "retrying"
                )
                coords = None
                continue

            visible_text = UIHierarchy.extract_visible_text(current_xml)
            result = await self._ai_call(f"""
            FIELD ACTIVE? — SIMPLE VISUAL CHECK.

            Requested field:
              label="{target_desc}"
              semantic_type="{value_type}"

            I just tapped coordinates ({x}, {y}).

            Look ONLY at the CURRENT phone screenshot.

            QUESTION:
            Is the input with the VISIBLE LABEL corresponding to "{target_desc}"
            currently ACTIVE/FOCUSED?

            Indicators include:
            - highlighted/colored outline
            - blinking cursor
            - selection handle
            - active Material floating label

            Do NOT say yes merely because SOME input is active.
            The Android hierarchy may expose only one EditText even though several
            fields are visibly present. That is NOT evidence that it is the target.

            Example:
            - target="Last Name"
            - visible "First Name" field has the cursor/highlight
            => active=false, even if XML reports that as the only EditText.

            If active=false but the requested field is visible, return the
            normalized CENTER of the requested field so I can tap it next.

            XML TEXT (supporting evidence only):
            {visible_text[:1400]}

            OUTPUT JSON:
            {{
              "active": true,
              "confidence": 0.95,
              "active_field_label": "Last name",
              "target_visible": true,
              "target_x_pct": 0.50,
              "target_y_pct": 0.45,
              "reasoning": "brief visual evidence"
            }}
            """, images=[current_img])

            if result:
                confidence = float(result.get("confidence", 0) or 0)
                if result.get("active") and confidence >= 0.75:
                    # Keep the VISUALLY grounded coordinate. Do not replace it
                    # with an arbitrary focused XML node on multi-field forms.
                    print(
                        f"         ✅ '{target_desc}' is active visually "
                        f"(conf={confidence:.2f})"
                    )
                    return True, coords, current_img, current_xml

                print(
                    f"         ❌ '{target_desc}' is NOT active "
                    f"(conf={confidence:.2f}); "
                    f"active='{result.get('active_field_label', 'unknown')}'"
                )
                if result.get("reasoning"):
                    print(
                        f"            {str(result.get('reasoning'))[:160]}"
                    )

                if result.get("target_visible"):
                    try:
                        nx = int(
                            float(result["target_x_pct"])
                            * self.device.screen_size[0]
                        )
                        ny = int(
                            float(result["target_y_pct"])
                            * self.device.screen_size[1]
                        )
                        if (
                            0 <= nx < self.device.screen_size[0]
                            and 0 <= ny < self.device.screen_size[1]
                        ):
                            coords = (nx, ny)
                            print(
                                f"         🎯 Next focus attempt will tap "
                                f"'{target_desc}' at {coords}"
                            )
                            continue
                    except (KeyError, TypeError, ValueError):
                        pass

            # Fresh visual reacquisition if the verifier could not supply a point.
            coords = await self._ai_locate_field(
                current_img,
                current_xml,
                target_desc,
                value_type,
            )

        return False, coords, current_img, current_xml


    def _profile_field_key(self, value_type, target_desc):
        semantic = self._infer_field_semantic(target_desc, value_type)
        td = str(target_desc or "").casefold()
        vt = str(value_type or "").casefold()
        joined = f"{td} {vt}"

        semantic_map = {
            "email": "email",
            "password": "password",
            "phone": "phone",
            "first_name": "first_name",
            "last_name": "last_name",
            "username": "username",
            "zip": "zip_code",
            "country": "country",
            "state": "state",
            "city": "city",
            "address": "address",
            "university": "university",
            "name": "full_name",
        }
        if semantic in semantic_map:
            return semantic_map[semantic]

        if any(k in joined for k in ("company", "employer", "organization")):
            return "current_company"
        if any(k in joined for k in (
            "job description", "role description", "responsibilities",
            "duties", "work description",
        )):
            return "job_description"
        if any(k in joined for k in (
            "job title", "occupation", "current job", "most recent job",
            "recent job", "position title",
        )):
            return "job_title"
        if any(k in joined for k in ("major", "field of study", "field_of_study")):
            return "major"
        if any(k in joined for k in ("degree", "education level", "qualification")):
            return "education_level"
        if "language" in joined:
            return "languages"
        if "skill" in joined:
            return "skills"
        if any(k in joined for k in (
            "job preference", "desired role", "looking for", "preferred role",
        )):
            return "desired_roles"
        if "salary" in joined or "compensation" in joined:
            return "salary_expectation"
        return None

    def _profile_value_for_field(self, value_type, target_desc):
        key = self._profile_field_key(value_type, target_desc)
        if not key:
            return None, None

        # Core persona attributes may be supplied by CLI or profile.
        if hasattr(self.persona, key):
            value = getattr(self.persona, key)
        else:
            value = self._profile_value(key)
            if value in (None, "", [], {}):
                value = self.persona.extra_values.get(key)

        if isinstance(value, (list, tuple)):
            # Filling a text search/filter may use the first explicit preference,
            # but the planner should still click a matching visible result later.
            value = value[0] if value else None

        if value in (None, "", [], {}):
            return key, None
        return key, str(value)

    def _profile_screen_requirement(self, screen_desc, visible_text):
        text = f"{screen_desc or ''} {visible_text or ''}".casefold()

        patterns = [
            ("desired_roles", (
                "what job are you looking for", "job preferences",
                "job preference", "preferred job", "preferred role",
            )),
            ("salary_expectation", (
                "expected salary", "salary expectation", "desired salary",
            )),
            ("languages", (
                "what language do you speak", "languages spoken",
                "select up to 5 languages", "language do you speak",
            )),
            ("skills", (
                "select up to 5 skills", "skills selection", "skills 0/5",
                "skills 1/5", "skills 2/5", "skills 3/5", "skills 4/5",
            )),
            ("current_company", (
                "company name", "current or former company", "employer name",
            )),
            ("job_description", (
                "job description", "describe your job", "work description",
            )),
            ("job_title", (
                "most recent job", "current job title", "occupation",
                "recent job",
            )),
            ("education_level", (
                "highest education level", "education level",
            )),
            ("university", (
                "institute name", "institution name", "university name",
                "college name", "school name",
            )),
            ("major", (
                "your major", "major field", "field of study",
            )),
        ]

        for key, phrases in patterns:
            if any(p in text for p in phrases):
                return key

        # Dates are handled separately because "From"/"To" appears on many forms.
        if any(p in text for p in (
            "employment dates", "work start", "work end",
            "employment duration",
        )):
            return ("employment_start", "employment_end")

        if any(p in text for p in (
            "attendance period", "education attendance", "education timeline",
            "attendance dates",
        )):
            return ("education_start", "education_end")

        return None

    def _is_profile_navigation_target(self, target, requirement=None):
        """
        True when a CLICK opens/edits a profile section rather than asserting
        the profile fact itself.

        Examples:
          "Add job preferences"   -> navigation into desired-role editor
          "Add your resume"       -> navigation into resume flow
          "Edit education"        -> navigation into education editor
          "Let employers find you"-> profile visibility setting

        The integrity guard must evaluate actual answers/options on the NEXT
        observed screen, not block the doorway into that screen.
        """
        norm = self._normalized_action_label(target)
        if not norm:
            return False

        direct_navigation = (
            "add your resume",
            "add resume",
            "upload resume",
            "add cv",
            "upload cv",
            "add job preferences",
            "job preferences",
            "let employers find you",
            "complete your profile",
            "complete profile",
            "maximize your profile",
            "profile settings",
            "edit profile",
        )
        if any(
            norm == phrase
            or norm.startswith(phrase + " ")
            or phrase in norm
            for phrase in direct_navigation
        ):
            return True

        leading_verbs = (
            "add ", "edit ", "update ", "manage ", "change ", "set ",
            "view ", "open ", "complete ", "finish ", "upload ",
        )
        if norm.startswith(leading_verbs):
            return True

        # Generic section-entry labels. These are safe only when they name the
        # section itself rather than one of the actual profile values.
        section_words = (
            "preferences", "profile", "resume", "cv", "education",
            "employment history", "work history", "skills", "languages",
        )
        if any(word in norm for word in section_words):
            allowed = []
            if requirement and not isinstance(requirement, tuple):
                allowed = [
                    self._normalized_action_label(x)
                    for x in self._profile_allowed_labels(requirement)
                ]
            if not any(
                a and (a == norm or a in norm or norm in a)
                for a in allowed
            ):
                return True

        return False

    def _profile_choice_guard(self, screen_desc, visible_text, action, target):
        """
        Runtime integrity guard for CLICK decisions that assert profile facts.

        This is not a second planner. It only checks that the chosen visible
        option is supported by the user's cross-app profile.
        """
        requirement = self._profile_screen_requirement(screen_desc, visible_text)
        if not requirement:
            return True, None

        target_norm = self._normalized_action_label(target)

        # A page can mention "job preferences", "education", etc. because it
        # contains a CTA that opens that editor. Clicking the CTA is navigation,
        # not a claim that the CTA label itself is the user's desired role/degree.
        if (
            str(action or "").upper() == "CLICK"
            and self._is_profile_navigation_target(target, requirement)
        ):
            return True, None

        skipish = any(
            phrase in target_norm
            for phrase in (
                "skip", "not now", "maybe later", "back", "none",
                "prefer not", "rather not",
            )
        )
        if skipish:
            return True, None

        keys = requirement if isinstance(requirement, tuple) else (requirement,)
        missing = [k for k in keys if not self._profile_has(k)]
        if missing:
            return False, (
                "missing_profile:" + ",".join(missing)
            )

        if str(action or "").upper() != "CLICK":
            return True, None

        # Navigation buttons are allowed once the relevant profile requirement
        # actually exists; earlier atomic choices/fields may already have applied it.
        if target_norm in {
            "next", "next button", "continue", "confirm", "done", "save",
            "finish", "submit",
        }:
            return True, None

        # For scalar/list choice screens, require the visible choice to match
        # either the canonical profile value or an explicitly authorized
        # semantic alias. This preserves identity while allowing app-specific
        # wording differences.
        if len(keys) == 1:
            key = keys[0]
            allowed = self._profile_allowed_labels(key)
            allowed_norm = [
                self._normalized_action_label(v)
                for v in allowed
                if str(v or "").strip()
            ]
            if allowed_norm and not any(
                v == target_norm
                or v in target_norm
                or target_norm in v
                for v in allowed_norm
            ):
                return False, (
                    f"profile_mismatch:{key}="
                    + "|".join(str(v) for v in allowed)
                )

        return True, None

    async def handle_field_input(self, img, xml_str, target_desc, value_type, target_coords=None, override_value=None):
        print(f"      📝 Fill '{target_desc}' (type={value_type})")

        profile_key, authoritative_value = self._profile_value_for_field(
            value_type, target_desc
        )

        semantic = self._infer_field_semantic(target_desc, value_type)
        target_lower = str(target_desc or "").casefold()

        def display_value(candidate):
            value_text = str(candidate)
            if (semantic == "password" or "pass" in target_lower
                    or (self.persona.password and value_text == self.persona.password)):
                return "[redacted]"
            return value_text

        if (
            semantic == "email"
            and any(
                k in target_lower
                for k in ("school", "university", "college", "institution")
            )
            and not self.persona.extra_values.get("school_email")
        ):
            print(
                f"         🚫 '{target_desc}' requires a school/institution "
                "email resource, but none is configured. Refusing to invent one."
            )
            return False

        if (
            semantic == "email"
            and any(
                k in target_lower
                for k in ("work", "company", "corporate", "business")
            )
            and not self.persona.extra_values.get("work_email")
        ):
            print(
                f"         🚫 '{target_desc}' requires a work/company email "
                "resource, but none is configured. Refusing to invent one."
            )
            return False

        if authoritative_value not in (None, ""):
            value = str(authoritative_value)
            if (
                override_value not in (None, "", "null", "None", "none")
                and str(override_value) != value
            ):
                print(
                    f"         🛡️ Ignoring invented identity override "
                    f"'{display_value(override_value)}' for '{target_desc}'; "
                    f"using authoritative persona value '{display_value(value)}'"
                )
            else:
                print(
                    f"         👤 Using authoritative persona value for "
                    f"'{target_desc}': '{display_value(value)}'"
                )
        elif profile_key:
            self._missing_profile_requirement = profile_key
            print(
                f"         🚫 Missing authoritative profile value "
                f"'{profile_key}' for '{target_desc}'. Refusing to invent it."
            )
            if override_value not in (None, "", "null", "None", "none"):
                print(
                    f"         🛡️ Rejected planner override '{override_value}' "
                    "because this is a profile/factual field."
                )
            return False
        elif override_value:
            # Non-profile app-local text (for example a search query) may use
            # the planner's value, but it is NOT promoted into persistent identity.
            value = str(override_value)
            print(f"         🔎 Using non-profile planner text: '{display_value(value)}'")
        else:
            confirmed_value = self._resolve_confirm_field(target_desc, value_type)
            if confirmed_value:
                value = confirmed_value
                print(f"         🔁 Confirm field detected — using previously entered value: '{display_value(value)}'")
            else:
                value = self.persona.get_value(
                    value_type, target_desc=target_desc
                )

                if value in (None, ""):
                    print(
                        f"         ❌ Primary planner did not provide a value for "
                        f"app-specific field '{target_desc}'. Re-observing; no "
                        "secondary field-value planner will run."
                    )
                    return False

                if (
                    "pass" in str(value_type).lower()
                    or "pass" in str(target_desc).lower()
                ):
                    print(
                        "         🔑 Using current persona password; "
                        "will adapt only if validation requires it"
                    )

        input_fields = UIHierarchy.find_input_fields(xml_str)
        target_field = self._find_best_field_match(
            input_fields, target_desc, value_type, target_coords=target_coords
        )

        # IMPORTANT:
        # Android/Compose can expose only the CURRENTLY focused EditText in the
        # accessibility tree even when multiple text fields are visibly present.
        # Therefore len(input_fields)==1 does NOT mean "single-field screen".
        #
        # Ground the semantic target from the CURRENT visible label first.
        structured_field_coords = self._ground_target_from_current_xml(
            xml_str,
            target_desc,
        )
        visual_coords = None

        if structured_field_coords:
            field_coords = structured_field_coords
            print(
                f"         🎯 Structured field grounding for "
                f"'{target_desc}': {field_coords}"
            )
        else:
            # If structure cannot prove the target label, ask vision to locate
            # that exact visible labeled field. This happens before any typing.
            visual_coords = await self._ai_locate_field(
                img, xml_str, target_desc, value_type
            )
            if visual_coords:
                field_coords = visual_coords
                print(
                    f"         👁️ Visual field grounding for "
                    f"'{target_desc}': {field_coords}"
                )
            elif target_field:
                field_coords = target_field['center']
            else:
                field_coords = target_coords

        is_password = (
            target_field.get('is_password', False)
            if target_field else "pass" in value_type.lower()
        )

        pre_fill_snapshot = self._snapshot_field_values(input_fields)

        # Field entry deliberately uses a small closed loop:
        # tap -> is requested field active? -> retry if not -> type.
        #
        # Do NOT send this through any retry/replanning clicker: that generic clicker is
        # allowed to re-resolve targets through XML, which is useful for buttons
        # but harmful for anonymous multi-field forms.
        focus_ok, focused_coords, focus_img, focus_xml = await self._focus_field_direct(
            target_desc,
            value_type,
            img,
            xml_str,
            field_coords=field_coords,
            max_attempts=3,
        )

        if not focus_ok:
            print(
                f"         ❌ Could not activate '{target_desc}'. "
                "Not typing into a different field."
            )
            return False

        field_coords = focused_coords or field_coords
        if focus_img:
            img = focus_img
        if focus_xml:
            xml_str = focus_xml

        print(f"         ⌨️ Typing: '{display_value(value)}'")
        self.device.select_all_and_delete()
        time.sleep(0.3)
        self.device.clear_field()
        time.sleep(0.3)
        self.device.input_text_safe(value)
        human_delay(PACE_FIELD_DELAY)
        self.device.dismiss_keyboard()
        time.sleep(0.8)

        field_verified = False
        for verify_attempt in range(1, MAX_FIELD_RETRIES + 1):
            verify_xml = self.device.get_ui_xml()
            verify_img = self._capture_active_screen()
            verify_fields = UIHierarchy.find_input_fields(verify_xml)

            # XML is mechanical evidence only. It cannot prove that the value is
            # inside the requested VISIBLE LABEL when Compose exposes only one
            # focused EditText. Always perform the labeled visual check.
            verification = await self._verify_field_content(
                target_desc,
                value,
                value_type,
                is_password,
                field_coords,
                verify_img,
            )
            status = verification.get("status", "UNKNOWN")

            if status == "VERIFIED":
                print(
                    f"         ✅ Labeled-field verification: "
                    f"'{target_desc}' contains the intended value"
                )
                field_verified = True
                break

            if status == "WRONG_CONTENT":
                print(
                    f"         ❌ Value landed in the wrong visible field for "
                    f"'{target_desc}'. Re-grounding before retry."
                )
            else:
                print(
                    f"         ❌ '{target_desc}' visual content check: {status}"
                )

            if verify_attempt >= MAX_FIELD_RETRIES:
                print(
                    f"         ❌ '{target_desc}' still not verified after "
                    f"{verify_attempt} attempt(s)."
                )
                return False

            # Reacquire from CURRENT screen rather than reuse the old field point.
            structured_retry = self._ground_target_from_current_xml(
                verify_xml,
                target_desc,
            )
            if structured_retry:
                field_coords = structured_retry
                print(
                    f"         🎯 Re-grounded '{target_desc}' structurally at "
                    f"{field_coords}"
                )
            else:
                visual_retry = await self._ai_locate_field(
                    verify_img or img,
                    verify_xml,
                    target_desc,
                    value_type,
                )
                if visual_retry:
                    field_coords = visual_retry
                    print(
                        f"         👁️ Re-grounded '{target_desc}' visually at "
                        f"{field_coords}"
                    )

            focus_ok, focused_coords, _, _ = await self._focus_field_direct(
                target_desc,
                value_type,
                verify_img or img,
                verify_xml,
                field_coords=field_coords,
                max_attempts=2,
            )
            if not focus_ok:
                return False

            field_coords = focused_coords or field_coords
            self.device.select_all_and_delete()
            time.sleep(0.2)
            self.device.clear_field()
            time.sleep(0.2)
            self.device.input_text_safe(value)
            human_delay(PACE_FIELD_DELAY)
            self.device.dismiss_keyboard()
            time.sleep(0.6)

        if not field_verified:
            print(
                f"         ❌ Exhausted field verification retries for "
                f"'{target_desc}'"
            )
            return False

        # Atomic-action invariant:
        # typing is complete once the intended labeled field contains the intended text.
        # Do NOT secretly handle suggestions/results here. The next main-loop
        # observation will see whatever appeared and the model will choose CLICK/FILL_FIELD.
        self.memory.mark_field_filled(
            target_desc,
            value,
        )
        self.flow_tracker.mark_field_filled(target_desc)

        try:
            field_img = self._capture_active_screen()
            if field_img:
                safe_field = re.sub(r'[^\w]', '_', target_desc.lower())[:30]
                field_shot_path = self._save_canonical_screenshot(
                    field_img,
                    f"field_filled_{safe_field}_{uuid.uuid4().hex[:6]}",
                )
                self.timeline.append({
                    "step": 0,
                    "state": "FIELD_FILLED",
                    "action": "FILL_FIELD",
                    "target": target_desc,
                    "screen_desc": f"Filled '{target_desc}' with {value_type}",
                    "value_type": value_type,
                    "phase": self.phase,
                    "screenshot": field_shot_path,
                    "timestamp": time.time(),
                    "pathway": self.current_pathway,
                })
        except IOError:
            pass

        # Refresh after successful verification so the corruption detector compares
        # current structure and knows the real XML coordinates of the target field.
        verify_xml = self.device.get_ui_xml()
        verify_fields = UIHierarchy.find_input_fields(verify_xml)
        post_target = self._find_best_field_match(
            verify_fields, target_desc, value_type, target_coords=field_coords
        )
        actual_target_coords = post_target['center'] if post_target else field_coords
        post_fill_snapshot = self._snapshot_field_values(verify_fields)

        corrupted = self._detect_field_corruption(
            pre_fill_snapshot, post_fill_snapshot, target_desc,
            target_coords=actual_target_coords, expected_target_value=value
        )

        if corrupted:
            print(
                f"         🚨 Other trusted field(s) changed while filling "
                f"'{target_desc}': {[c['field_name'] for c in corrupted]}"
            )
            print(
                "         🧭 Not repairing other fields inside this action. "
                "The next OBSERVE step will let the primary planner decide "
                "which visible field to correct."
            )
            return False

        return True

    def _authoritative_persona_value(self, value_type, target_desc):
        """Backward-compatible wrapper around the cross-app profile resolver."""
        _key, value = self._profile_value_for_field(value_type, target_desc)
        return value


    def _sync_override_to_persona(self, value_type, value, target_desc):
        vt_lower = value_type.lower() if value_type else ""
        td_lower = target_desc.lower() if target_desc else ""

        confirm_indicators = ["confirm", "re-enter", "re_enter", "retype", "re-type", "repeat", "verify"]
        if any(ci in td_lower for ci in confirm_indicators):
            return

        protected_value = self._authoritative_persona_value(
            value_type, target_desc
        )
        if protected_value not in (None, ""):
            if str(value) != str(protected_value):
                print(
                    f"         🛡️ Persona identity is immutable: refusing to "
                    f"replace '{target_desc}' with '{value}'"
                )
            return

        if "pass" in vt_lower or "pass" in td_lower:
            if self.persona.password != value:
                self.persona.password = value
                print(f"         🔑 Persona password synced to: '{value}'")
        elif "email" in vt_lower or "email" in td_lower:
            if self.persona.email != value:
                self.persona.email = value
                print(f"         📧 Persona email synced to: '{value}'")
        elif any(k in vt_lower for k in ("user", "nick", "handle", "display")):
            if self.persona.username != value:
                self.persona.username = value
                print(f"         👤 Persona username synced to: '{value}'")
        elif any(k in vt_lower for k in ("phone", "mobile", "tel")):
            if self.persona.phone != value:
                self.persona.phone = value
                print(f"         📱 Persona phone synced to: '{value}'")
        elif any(k in vt_lower for k in ("first", "fname", "given")):
            if self.persona.first_name != value:
                self.persona.first_name = value
                self.persona.full_name = f"{value} {self.persona.last_name}"
                print(f"         📛 Persona first name synced to: '{value}'")
        elif any(k in vt_lower for k in ("last", "lname", "surname", "family")):
            if self.persona.last_name != value:
                self.persona.last_name = value
                self.persona.full_name = f"{self.persona.first_name} {value}"
                print(f"         📛 Persona last name synced to: '{value}'")
        elif any(k in vt_lower for k in ("zip", "postal")):
            if self.persona.zip_code != value:
                self.persona.zip_code = value
                print(f"         📮 Persona zip synced to: '{value}'")

    def _resolve_confirm_field(self, target_desc, value_type):
        td_lower = (target_desc or "").lower()
        vt_lower = (value_type or "").lower()

        confirm_indicators = ["confirm", "re-enter", "re_enter", "retype", "re-type",
                              "repeat", "verify", "re enter"]
        is_confirm = any(ci in td_lower for ci in confirm_indicators)

        if not is_confirm:
            return None

        if "pass" in td_lower or "pass" in vt_lower:
            return self.persona.password
        elif "email" in td_lower or "email" in vt_lower:
            return self.persona.email
        elif "phone" in td_lower or "phone" in vt_lower:
            return self.persona.phone

        base_name = td_lower
        for ci in confirm_indicators:
            base_name = base_name.replace(ci, "").strip()
        base_name = base_name.strip("* ").strip()

        if base_name:
            for field_key, field_val in self.memory.filled_fields.items():
                fk_lower = field_key.lower()
                if base_name in fk_lower and not any(ci in fk_lower for ci in confirm_indicators):
                    print(f"         🔁 Matched '{target_desc}' to filled '{field_key}' = '{field_val}'")
                    return field_val

        return None

    def _find_best_field_match(self, input_fields, target_desc, value_type, target_coords=None):
        if not input_fields:
            return None

        enabled_fields = [f for f in input_fields if f.get('enabled', True)]
        if not enabled_fields:
            return None

        td_lower = (target_desc or "").lower()
        vt_lower = (value_type or "").lower()

        # A single enabled field is only unambiguous if its semantics do not
        # contradict the requested target.
        if len(enabled_fields) == 1:
            only = enabled_fields[0]
            if self._field_matches_semantic(only, target_desc, value_type):
                return only
        target_words = [w for w in re.split(r'[^a-z0-9]+', td_lower) if len(w) > 2]

        type_keywords = {
            "email": ["email", "mail", "@"],
            "password": ["password", "pass", "pwd"],
            "first_name": ["first", "fname", "given"],
            "last_name": ["last", "lname", "surname", "family"],
            "zip_code": ["zip", "postal", "postcode"],
            "phone": ["phone", "mobile", "tel"],
            "city": ["city", "town"],
            "address": ["street", "address"],
            "country": ["country", "nation"],
            "state": ["state", "province", "region"],
            "province": ["state", "province", "region"],
            "username": ["username", "user", "nick", "handle", "display"],
        }
        keywords = type_keywords.get(vt_lower, [w for w in vt_lower.split("_") if w])

        scored = []
        for f in enabled_fields:
            hint = (f.get('hint', '') or '').lower()
            rid = (f.get('resource_id', '') or '').lower()
            text = (f.get('text', '') or '').lower()
            combined = f"{hint} {rid} {text}"
            score = 0

            for word in target_words:
                if word in hint or word in rid:
                    score += 8
                elif word in text:
                    score += 3

            for kw in keywords:
                if kw and (kw in hint or kw in rid):
                    score += 10
                elif kw and kw in text:
                    score += 5

            if vt_lower == "email" and "@" in text:
                score += 8
            if vt_lower == "password" and f.get('is_password', False):
                score += 12
            if f.get('focused', False):
                score += 2

            # Visual coordinates are only a weak tie-breaker. Never let a bad VLM
            # coordinate overpower strong XML semantics.
            dist = float('inf')
            if target_coords and f.get('center'):
                try:
                    dist = ((f['center'][0] - target_coords[0]) ** 2 +
                            (f['center'][1] - target_coords[1]) ** 2) ** 0.5
                except (TypeError, IndexError):
                    pass

            scored.append((score, -dist, f))

        scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
        if scored and scored[0][0] > 0:
            candidate = scored[0][2]
            if self._field_matches_semantic(candidate, target_desc, value_type):
                return candidate

        empty_fields = [
            f for f in enabled_fields
            if f.get('is_empty', False) and self._field_matches_semantic(f, target_desc, value_type)
        ]
        if len(empty_fields) == 1:
            return empty_fields[0]

        if target_coords and empty_fields:
            return min(
                empty_fields,
                key=lambda f: ((f['center'][0] - target_coords[0]) ** 2 +
                               (f['center'][1] - target_coords[1]) ** 2)
            )

        return None


    def _trusted_field_values(self):
        """Values that are safe for the corruption guard to preserve/restore.

        The guard must never treat UI placeholders/example text as user data. Only
        values entered by this agent or values belonging to the active persona are
        trusted.
        """
        trusted = set()

        for value in self.memory.filled_fields.values():
            if value is not None and str(value).strip():
                trusted.add(str(value).strip())

        for attr in (
            "email", "password", "first_name", "last_name", "full_name",
            "username", "phone", "dob_year", "dob_month", "dob_day",
            "dob_full", "dob_iso", "gender", "country", "zip_code",
            "city", "state", "address", "age", "university",
        ):
            value = getattr(self.persona, attr, None)
            if value is not None and str(value).strip():
                trusted.add(str(value).strip())

        return trusted

    def _snapshot_field_values(self, input_fields):
        trusted_values = self._trusted_field_values()
        snapshot = {}

        for f in input_fields:
            text = (f.get('text', '') or '').strip()
            hint = (f.get('hint', '') or '').strip()
            rid = (f.get('resource_id', '') or '').strip()
            coords = f.get('center', (0, 0))

            field_key = rid or hint or f"{coords[0]}_{coords[1]}"
            has_value = bool(text and text != hint)

            # Keep every field in the structural snapshot so a previously-filled
            # field becoming blank can still be detected. But only pre-existing
            # values that we actually trust are eligible for restoration.
            snapshot[field_key] = {
                "value": text if has_value else "",
                "coords": coords,
                "rect": f.get('rect'),
                "hint": hint,
                "resource_id": rid,
                "is_password": f.get('is_password', False),
                "trusted": bool(has_value and text in trusted_values),
            }

        return snapshot

    @staticmethod
    def _coords_near(a, b, x_tol=100, y_tol=140):
        if not a or not b:
            return False
        return abs(a[0] - b[0]) <= x_tol and abs(a[1] - b[1]) <= y_tol

    def _detect_field_corruption(self, pre_snapshot, post_snapshot, target_field_desc,
                                 target_coords=None, expected_target_value=None):
        corrupted = []
        target_lower = (target_field_desc or "").lower()
        expected_lower = (str(expected_target_value).strip().lower()
                          if expected_target_value is not None else None)

        for field_key, pre_info in pre_snapshot.items():
            # CRITICAL: only preserve data known to come from this agent/persona.
            # Example/placeholder text such as 'you@example.com' is not trusted and
            # must never be 'restored'.
            if not pre_info.get("trusted", False):
                continue

            if pre_info.get("is_password"):
                # Password text is commonly masked/redacted in XML and is not safe to
                # compare as ordinary visible text.
                continue

            field_key_lower = field_key.lower()
            if any(word in field_key_lower for word in target_lower.split() if len(word) > 2):
                continue

            if target_coords and self._coords_near(pre_info.get("coords"), target_coords):
                continue

            # Match the same field by stable key first, then by nearby geometry.
            post_info = post_snapshot.get(field_key)
            if post_info is None:
                nearest = None
                nearest_dist = float('inf')
                for candidate in post_snapshot.values():
                    if not candidate.get("coords") or not pre_info.get("coords"):
                        continue
                    dx = candidate["coords"][0] - pre_info["coords"][0]
                    dy = candidate["coords"][1] - pre_info["coords"][1]
                    dist = (dx * dx + dy * dy) ** 0.5
                    if dist < nearest_dist and abs(dx) <= 100 and abs(dy) <= 140:
                        nearest = candidate
                        nearest_dist = dist
                post_info = nearest

            # If the field disappeared completely (navigation/reflow), do not blindly
            # restore into stale coordinates. Corruption restoration is only safe when
            # we can still identify the same field on the current screen.
            if post_info is None:
                continue

            pre_value = str(pre_info.get("value", ""))
            post_value = str(post_info.get("value", ""))

            # Defense in depth: the field containing the value we intentionally just
            # entered can never be classified as collateral corruption.
            if expected_lower and post_value.strip().lower() == expected_lower:
                if target_coords and self._coords_near(post_info.get("coords"), target_coords):
                    continue

            if post_value != pre_value:
                corrupted.append({
                    "field_key": field_key,
                    "field_name": pre_info.get("hint") or pre_info.get("resource_id") or field_key,
                    "original_value": pre_value,
                    "current_value": post_value,
                    "coords": post_info.get("coords") or pre_info.get("coords"),
                })

        return corrupted


    async def _ai_locate_field(self, img, xml_str, target_desc, value_type):
        res = await self._ai_call(f"""
        LOCATE INPUT FIELD.

        I need to find and tap the input field for: "{target_desc}" (type: {value_type})

        The field might be:
        - Partially off-screen (need to scroll)
        - Hidden behind a keyboard
        - At different coordinates than expected

        DEVICE SCREEN: {self.device.screen_size[0]} x {self.device.screen_size[1]} pixels

        INTERACTIVE ELEMENTS:
        {UIHierarchy.parse_xml_to_string(xml_str)[:1500]}

        OUTPUT JSON:
        {{
            "field_found": true/false,
            "field_x_pct": 0.50,
            "field_y_pct": 0.45,
            "needs_scroll": false,
            "scroll_direction": "down",
            "reasoning": "..."
        }}

        IMPORTANT: field_x_pct and field_y_pct are normalized to the PHONE SCREEN
        from 0.0 to 1.0, not to the desktop window.
        """, images=[img])

        if res and res.get("field_found"):
            coords = None
            if res.get("field_x_pct") is not None and res.get("field_y_pct") is not None:
                try:
                    coords = (
                        int(float(res["field_x_pct"]) * self.device.screen_size[0]),
                        int(float(res["field_y_pct"]) * self.device.screen_size[1]),
                    )
                except (TypeError, ValueError):
                    coords = None
            elif res.get("field_coords"):
                # Backward-compatible fallback for older model output.
                coords = tuple(res["field_coords"])

            if res.get("needs_scroll"):
                direction = res.get("scroll_direction", "down")
                if direction == "down":
                    self.device.swipe_up("small")
                else:
                    self.device.swipe_down("small")
                time.sleep(1.5)
                new_img = self._capture_active_screen()
                new_xml = self.device.get_ui_xml()
                return await self._ai_locate_field(new_img, new_xml, target_desc, value_type)
            return tuple(coords) if coords else None
        return None

    async def _verify_field_content(self, target_desc, expected_value, value_type, is_password, field_coords, img):
        x_pct = None
        y_pct = None
        if field_coords:
            try:
                x_pct = field_coords[0] / self.device.screen_size[0]
                y_pct = field_coords[1] / self.device.screen_size[1]
            except Exception:
                pass

        if is_password:
            res = await self._ai_call(f"""
            FIELD CONTENT VERIFICATION.

            Target field label: "{target_desc}"
            Expected type: password
            Approx target center: x_pct={x_pct}, y_pct={y_pct}

            Look at the CURRENT screenshot. Verify that the input with the
            VISIBLE LABEL corresponding to "{target_desc}" contains password
            dots/bullets. Do not count content in a different field.

            OUTPUT JSON:
            {{
                "has_content": true/false,
                "field_looks_correct": true/false,
                "correct_labeled_field": true/false,
                "reasoning": "..."
            }}
            """, images=[img])
            if (res and res.get("has_content") and
                    res.get("field_looks_correct", True) and
                    res.get("correct_labeled_field", True)):
                return {"status": "VERIFIED", "found_value": "[password]"}
            return {"status": "EMPTY"}

        res = await self._ai_call(f"""
        FIELD CONTENT VERIFICATION — VERIFY THE LABELED FIELD.

        Target field label: "{target_desc}"
        Expected value: "{expected_value}"
        Approx target center: x_pct={x_pct}, y_pct={y_pct}

        Look carefully at the CURRENT screenshot. The value
        "{expected_value}" must be inside the input whose VISIBLE LABEL
        corresponds to "{target_desc}".

        Example: if target is "Email address" but the email is inside the
        "First name" box, that is WRONG_CONTENT, not success.

        OUTPUT JSON:
        {{
            "has_content": true/false,
            "shows_expected": true/false,
            "correct_labeled_field": true/false,
            "actual_content": "...",
            "reasoning": "..."
        }}
        """, images=[img])

        if res:
            if (res.get("has_content") and res.get("shows_expected") and
                    res.get("correct_labeled_field", True)):
                return {"status": "VERIFIED", "found_value": res.get("actual_content")}
            if res.get("has_content"):
                return {"status": "WRONG_CONTENT", "found_value": res.get("actual_content")}
            return {"status": "EMPTY"}
        return {"status": "UNKNOWN"}

    def _ground_checkbox_control(self, xml_str, target_desc="",
                                     target_coords=None):
        """
        Ground consent/checkbox intent to the actual CURRENT control.

        Priority:
          1. Real Android checkable node.
          2. Small UI node immediately to the LEFT of the matching consent label.
          3. Geometric checkbox position immediately left of the label.

        Every candidate must be inside the real device screen bounds.
        """
        if not xml_str:
            return None

        try:
            root = ET.fromstring(xml_str)
        except Exception:
            return None

        screen_w, screen_h = self.device.screen_size

        def rect_for(node):
            bounds = node.attrib.get("bounds", "")
            m = re.findall(
                r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',
                bounds,
            )
            if not m:
                return None
            x1, y1, x2, y2 = map(int, m[0])
            if x2 <= x1 or y2 <= y1:
                return None
            if (
                x1 < 0 or y1 < 0
                or x2 > screen_w or y2 > screen_h
            ):
                return None
            return (x1, y1, x2, y2)

        target_norm = re.sub(
            r"[^a-z0-9]+",
            " ",
            str(target_desc or "").casefold(),
        ).strip()
        target_tokens = set(target_norm.split())

        checkables = []
        labeled_nodes = []
        small_nodes = []

        for node in root.iter():
            if node.attrib.get("visible-to-user", "true") == "false":
                continue
            if node.attrib.get("enabled", "true") == "false":
                continue

            rect = rect_for(node)
            if not rect:
                continue

            x1, y1, x2, y2 = rect
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            width, height = x2 - x1, y2 - y1

            label = " ".join([
                node.attrib.get("text", "") or "",
                node.attrib.get("content-desc", "") or "",
                node.attrib.get("resource-id", "") or "",
            ])
            label = re.sub(r"\s+", " ", label).strip()
            label_norm = re.sub(
                r"[^a-z0-9]+",
                " ",
                label.casefold(),
            ).strip()

            entry = {
                "center": (cx, cy),
                "rect": rect,
                "label": label,
                "label_norm": label_norm,
                "area": width * height,
                "clickable": node.attrib.get("clickable", "false") == "true",
            }

            if node.attrib.get("checkable", "false") == "true":
                entry["checked"] = (
                    node.attrib.get("checked", "false") == "true"
                )
                checkables.append(entry)

            if label_norm:
                labeled_nodes.append(entry)

            # Custom-drawn checkbox/radio controls often appear as a small
            # unlabeled View/ImageView rather than checkable=true.
            if (
                12 <= width <= 140
                and 12 <= height <= 140
                and entry["area"] <= 18000
            ):
                small_nodes.append(entry)

        # Real checkable node wins.
        if checkables:
            if len(checkables) == 1:
                return checkables[0]["center"]

            tx = ty = None
            if target_coords:
                try:
                    tx, ty = int(target_coords[0]), int(target_coords[1])
                    if not (
                        0 <= tx < screen_w and 0 <= ty < screen_h
                    ):
                        tx = ty = None
                except Exception:
                    tx = ty = None

            scored = []
            for cb in checkables:
                score = 0.0
                cx, cy = cb["center"]

                if tx is not None:
                    dist = ((cx - tx) ** 2 + (cy - ty) ** 2) ** 0.5
                    score += max(0.0, 500.0 - dist)

                for lab in labeled_nodes:
                    lx, ly = lab["center"]
                    if abs(ly - cy) > 180:
                        continue
                    lab_tokens = set(lab["label_norm"].split())
                    score += len(target_tokens & lab_tokens) * 80

                scored.append((score, cb))

            scored.sort(key=lambda item: item[0], reverse=True)
            return scored[0][1]["center"]

        # Find the visible consent/terms label corresponding to this checkbox.
        consent_words = {
            "agree", "terms", "privacy", "consent", "bound",
            "service", "policy", "read", "understood",
        }

        label_candidates = []
        for lab in labeled_nodes:
            lab_tokens = set(lab["label_norm"].split())
            overlap = len(target_tokens & lab_tokens)
            consent_overlap = len(consent_words & lab_tokens)

            if overlap >= 2 or consent_overlap >= 2:
                score = overlap * 100 + consent_overlap * 40
                label_candidates.append((score, lab))

        if not label_candidates:
            return None

        label_candidates.sort(key=lambda item: item[0], reverse=True)
        label = label_candidates[0][1]
        lx1, ly1, lx2, ly2 = label["rect"]
        lcy = (ly1 + ly2) // 2

        # Prefer an actual small UI node just to the left of the label.
        nearby_small = []
        for node in small_nodes:
            nx, ny = node["center"]
            nx1, ny1, nx2, ny2 = node["rect"]

            horizontal_gap = lx1 - nx2
            if not (-20 <= horizontal_gap <= 180):
                continue
            if abs(ny - lcy) > 120:
                continue

            dist = abs(horizontal_gap) + abs(ny - lcy)
            nearby_small.append((dist, node))

        if nearby_small:
            nearby_small.sort(key=lambda item: item[0])
            return nearby_small[0][1]["center"]

        # Last structural fallback: checkbox is normally immediately left of its
        # consent label. Use a conservative point inside the screen.
        estimated_x = max(16, lx1 - 30)
        estimated_y = min(max(lcy, 16), screen_h - 16)

        if 0 <= estimated_x < screen_w and 0 <= estimated_y < screen_h:
            print(
                f"      🎯 Checkbox estimated from consent-label geometry: "
                f"({estimated_x}, {estimated_y})"
            )
            return (estimated_x, estimated_y)

        return None

    def _coerce_model_screen_point(self, raw_x, raw_y):
        """
        Convert common model coordinate conventions safely.

        Supported:
          fractions: 0.08, 0.90
          percentages: 8, 90
          permille-like outputs: 88, 898  -> 0.088, 0.898
          already-pixel coordinates inside the current screen

        Any impossible result is rejected.
        """
        try:
            x = float(raw_x)
            y = float(raw_y)
        except (TypeError, ValueError):
            return None

        w, h = self.device.screen_size

        # Correctly normalized fractions.
        if 0 <= x <= 1.2 and 0 <= y <= 1.2:
            px, py = int(x * w), int(y * h)

        # If either coordinate is >100 but both are <=1000, the model emitted
        # thousandths/permille rather than fractions. This matches outputs such
        # as x=88, y=898 for a bottom-left checkbox.
        elif 0 <= x <= 1000 and 0 <= y <= 1000 and (x > 100 or y > 100):
            px, py = int((x / 1000.0) * w), int((y / 1000.0) * h)

        # Percent convention.
        elif 0 <= x <= 100 and 0 <= y <= 100:
            px, py = int((x / 100.0) * w), int((y / 100.0) * h)

        # Already-current-screen pixels.
        elif 0 <= x < w and 0 <= y < h:
            px, py = int(x), int(y)

        else:
            return None

        if not (0 <= px < w and 0 <= py < h):
            return None

        return (px, py)

    async def _execute_atomic_checkbox_click(self, img, xml_str, target_desc,
                                              target_coords=None):
        coords = self._ground_checkbox_control(
            xml_str,
            target_desc=target_desc,
            target_coords=target_coords,
        )

        if not coords and img:
            res = await self._ai_call(f"""
            CHECKBOX CONTROL GROUNDING.

            Target checkbox meaning:
            "{target_desc}"

            Look at the CURRENT screenshot and locate the SMALL CHECKBOX / RADIO /
            TOGGLE CONTROL itself.

            Do NOT tap:
            - Terms of Service text
            - Privacy Policy text
            - any hyperlink embedded in the label

            Return the center of the actual checkbox/radio/toggle control in
            normalized PHONE coordinates.

            OUTPUT JSON:
            {{
              "found": true,
              "x_frac": 0.08,
              "y_frac": 0.90,
              "confidence": 0.95,
              "reasoning": "brief"
            }}

            x_frac and y_frac SHOULD be 0.0-1.0 fractions. If uncertain,
            found=false rather than guessing.
            """, images=[img])

            if (
                res
                and res.get("found")
                and float(res.get("confidence", 0) or 0) >= 0.70
            ):
                raw_x = res.get("x_frac", res.get("x_pct"))
                raw_y = res.get("y_frac", res.get("y_pct"))
                coords = self._coerce_model_screen_point(
                    raw_x,
                    raw_y,
                )
                if coords is None:
                    print(
                        f"      🛡️ Rejecting malformed checkbox coordinates "
                        f"from model: ({raw_x}, {raw_y})"
                    )

        if not coords:
            print(
                f"      ❌ Could not ground checkbox CONTROL for "
                f"'{target_desc}'"
            )
            return False

        w, h = self.device.screen_size
        if not (
            isinstance(coords, (tuple, list))
            and len(coords) >= 2
            and 0 <= int(coords[0]) < w
            and 0 <= int(coords[1]) < h
        ):
            print(
                f"      🛡️ Refusing malformed checkbox target: {coords}"
            )
            return False

        print(
            f"      ☑️ Atomic checkbox CLICK '{target_desc[:60]}' "
            f"at {coords}"
        )
        return bool(self.device.tap(coords[0], coords[1]))









    def _capture_active_screen(self):
        adb_img = self.device.get_screenshot_bytes()
        if adb_img and not self._is_black_screen(adb_img):
            return adb_img

        host_img = self.device.get_host_screenshot_bytes()
        if host_img and self.crop_box:
            try:
                pil = Image.open(io.BytesIO(host_img))
                x1, y1, x2, y2 = self.crop_box
                cropped = pil.crop((x1, y1, x2, y2))
                buf = io.BytesIO()
                cropped.save(buf, format="PNG")
                return buf.getvalue()
            except:
                pass
        return host_img



    async def _recover_phase_from_live_screen(self, img, xml_str, strategy):
        """
        Infer lifecycle phase from the CURRENT visible screen.

        This is used only when --continue-current has no trustworthy phase state.
        The old behavior unconditionally assumed POST_AUTH, which is wrong for a
        mid-signup/mid-form continuation.

        Returns one of:
            EXPLORE, SIGNUP, FORM_FILL, VERIFICATION, POST_AUTH
        """
        screen_type = str(strategy.get("screen_type", "UNKNOWN") or "UNKNOWN")
        screen_desc = str(strategy.get("screen_description", "") or "")
        visible = UIHierarchy.extract_visible_text(xml_str or "")
        low = visible.casefold()

        # Strong deterministic cases first.
        if (
            strategy.get("is_verification_screen")
            or screen_type == "VERIFICATION"
        ):
            return "VERIFICATION", "live screen is a verification challenge"

        if screen_type in ("AUTH_CHOICE", "SIGNUP_METHOD", "LOGIN"):
            return "SIGNUP", f"live screen type is {screen_type}"

        authenticated_shell = any(
            marker in low
            for marker in ("sign out", "log out", "logout")
        )

        if screen_type in ("HOME", "HOME_FEED", "FEED", "DASHBOARD"):
            return "POST_AUTH", f"live screen is returning-user {screen_type}"

        if authenticated_shell:
            return "POST_AUTH", "visible authenticated shell control (sign out/log out)"

        if screen_type in ("FORM", "DATE_PICKER"):
            return "FORM_FILL", f"live screen type is {screen_type}"

        # Ambiguous welcome/profile/tutorial screens can occur both before and
        # after account creation. Let the model classify the CURRENT screenshot,
        # explicitly without assuming authentication from --continue-current.
        res = await self._ai_call(f"""
        LIVE SESSION PHASE RECOVERY.

        We are continuing an Android app exactly where the emulator was left.
        The disk resume state is missing or untrustworthy.

        IMPORTANT:
        --continue-current does NOT mean the user is authenticated.
        Infer the lifecycle phase ONLY from the CURRENT visible screen.

        App: {APP_NAME}
        Current screen type from normal analysis: {screen_type}
        Current description: {screen_desc}

        VISIBLE TEXT:
        {visible[:1800]}

        Choose exactly one phase:

        EXPLORE:
          initial/unknown app state before a signup path is established.

        SIGNUP:
          login/signup/auth-choice/method selection before profile/account forms.

        FORM_FILL:
          account creation or onboarding form still being completed; identity,
          school, profile, address, education, etc. fields are being entered.

        VERIFICATION:
          OTP/email/phone/link verification is currently required.

        POST_AUTH:
          only when the visible UI proves the account is already authenticated
          (normal home/feed/dashboard, sign-out shell, or clearly post-account
          onboarding/tutorial/profile setup).

        Do NOT choose POST_AUTH merely because this is a resumed run.

        OUTPUT JSON:
        {{
          "phase": "EXPLORE|SIGNUP|FORM_FILL|VERIFICATION|POST_AUTH",
          "confidence": 0.95,
          "reasoning": "visible evidence"
        }}
        """, images=[img] if img else None)

        if res:
            phase = str(res.get("phase", "") or "").upper()
            confidence = float(res.get("confidence", 0) or 0)
            if phase in {
                "EXPLORE", "SIGNUP", "FORM_FILL",
                "VERIFICATION", "POST_AUTH",
            } and confidence >= 0.70:
                return phase, str(res.get("reasoning", "") or "")

        # Conservative fallback: do not invent authentication.
        return "EXPLORE", "phase recovery uncertain; conservative EXPLORE fallback"

    def _verification_has_local_action_first(self, strategy):
        """
        True when the CURRENT verification-related screen still has a local
        action to execute before any external email/SMS/OAuth handoff.
        """
        action = str(strategy.get("action", "") or "").upper()
        target = str(strategy.get("target_desc", "") or "").strip().casefold()
        screen_desc = str(strategy.get("screen_description", "") or "").casefold()
        # Once a code has been sent, resend/back/code entry are not a reason to
        # bypass the inbox resource. The handler must first try the configured
        # accessible inbox; it may request a fresh code if that fails.
        if any(word in target for word in ("resend", "back", "verification code", "otp", "one-time code")):
            return False
        if "code" in screen_desc and any(phrase in screen_desc for phrase in (
            "code was sent", "code has been sent", "sent by email",
            "enter the code", "enter verification code", "code required",
        )):
            return False
        return bool(
            action in {"CLICK", "FILL_FIELD", "PRESS_BACK"}
            and target
        )

    async def _verification_atomic_click(self, img, xml_str, target_desc,
                                        prefer_coords=None, **kwargs):
        """
        Adapter used by the external verification resource handler.

        Verification may need Gmail/browser/system UI, but clicks are still
        atomic: one grounded tap, then that handler observes again.
        """
        return await self._execute_atomic_visual_click(
            img,
            xml_str,
            target_desc,
            target_coords=prefer_coords,
            screen_desc="External verification context",
        )

    def _normalize_core_strategy(self, strategy, xml_str):
        """
        Enforce the single atomic action vocabulary.

        There are no legacy action modes. An unsupported action is not translated
        into another hidden workflow; the engine simply re-observes.
        """
        result = dict(strategy or {})
        action = str(result.get("action", "WAIT") or "WAIT").upper()

        allowed = {
            "CLICK", "FILL_FIELD", "SCROLL_DOWN", "SCROLL_UP", "SWIPE_LEFT",
            "PRESS_BACK", "WAIT", "UPLOAD_RESUME", "SETTLED_HOME", "STOP",
        }
        if action in allowed:
            result["action"] = action
            return result

        print(
            f"      🧹 Unsupported planner action '{action}'. "
            "No compatibility handler will run; re-observing."
        )
        result.update({
            "action": "WAIT",
            "target_desc": "",
            "target_coords": None,
        })
        return result

    def _update_core_phase_metadata(self, screen_type, strategy):
        """
        Phase is metadata, not a planner.

        It never changes the chosen action. Only strong lifecycle evidence can
        move the phase forward.
        """
        if self.phase == "DONE":
            return

        st = str(screen_type or "UNKNOWN").upper()

        if st in ("AUTH_CHOICE", "SIGNUP_METHOD", "LOGIN"):
            if self.local_video_guest_path:
                self.phase = "ONBOARDING"
                return
            if not self.flow_tracker.account_creation_detected:
                self.phase = "SIGNUP"
            return

        if st == "VERIFICATION" or strategy.get("is_verification_screen"):
            if not self._verification_has_local_action_first(strategy):
                self.phase = "VERIFICATION"
            return

        if (
            self.flow_tracker.account_creation_detected
            or self.verification_handler.verification_successful
        ):
            if self.phase != "VERIFICATION":
                self.phase = "POST_AUTH"
            return

        if st in ("FORM", "DATE_PICKER", "ROLE_SELECTION", "PROFILE_COMPLETION"):
            self.phase = "FORM_FILL"
            return

        if st in (
            "ONBOARDING_CAROUSEL", "ONBOARDING_QUIZ", "WELCOME_SCREEN",
            "INTEREST_SELECTION",
        ):
            self.phase = "ONBOARDING"
            return

        if self.phase not in ("EXPLORE", "SIGNUP", "FORM_FILL", "ONBOARDING"):
            self.phase = "EXPLORE"

    def _core_checkbox_intent(self, target):
        t = str(target or "").casefold()
        return any(
            kw in t
            for kw in (
                "checkbox", "check box", "i have read", "i agree",
                "agree to be bound", "consent box", "age checkbox",
                "over 18", "18 years old",
            )
        )

    def _panorama_script_path(self):
        """Resolve the dedicated long-screenshot stitcher beside this script."""
        here = os.path.dirname(os.path.abspath(__file__))
        return os.path.join(here, "reliable_long_screenshot.py")

    def _should_capture_passive_panorama(self, screen_sig, screen_type, xml_str):
        """
        Decide whether to record a panorama of the CURRENT target-app screen.

        This is capture policy only. It has zero authority over planner action,
        phase, target, or terminal state.
        """
        if not self.passive_panoramas_enabled:
            return False
        if not screen_sig or screen_sig in self._panorama_attempted_signatures:
            return False
        if not os.path.isfile(self._panorama_script_path()):
            return False
        if not self.device.is_package_in_foreground(PACKAGE_NAME):
            return False
        if self.device.is_keyboard_shown():
            return False

        # A focused text field often means an autocomplete/suggestion list is
        # transiently open. Panoraming that temporary state can change results
        # and makes exact viewport restoration unnecessarily fragile.
        input_fields = UIHierarchy.find_input_fields(xml_str)
        if any(bool(f.get("focused")) for f in input_fields):
            return False

        if not UIHierarchy.has_scrollable(xml_str):
            return False

        st = str(screen_type or "UNKNOWN").upper()
        if st in (
            "VERIFICATION", "CAPTCHA", "PAYMENT", "PLAN_SELECTION",
            "PERMISSION_DIALOG", "LOADING", "ERROR",
        ):
            return False

        return True

    def _passive_panorama_profiles(self):
        """
        Ordered capture profiles for one passive panorama attempt.

        The second profile is the one proven on OfferToday's changing sticky-tab
        job-preference screen: smaller vertical movement and much larger overlap.
        It is a fallback, not a weaker quality threshold.
        """
        return [
            {
                "name": "primary",
                "scrolls": int(self.panorama_scrolls),
                "swipe_start_ratio": "0.68",
                "swipe_end_ratio": "0.48",
                "swipe_duration_ms": "340",
                "settle_after_scroll": "1.2",
                "pair_delay": "0.20",
                "min_overlap_px": "760",
                "max_scroll_ratio": "0.58",
            },
            {
                "name": "high_overlap",
                "scrolls": int(max(
                    self.panorama_scrolls,
                    self.panorama_rescue_scrolls,
                )),
                "swipe_start_ratio": "0.64",
                "swipe_end_ratio": "0.52",
                "swipe_duration_ms": "380",
                "settle_after_scroll": "1.2",
                "pair_delay": "0.20",
                "min_overlap_px": "900",
                "max_scroll_ratio": "0.48",
            },
        ]

    def _panorama_viewport_state(self, expected_view_fp, expected_sig):
        """
        Check the exact pre-panorama viewport.

        Exact viewport fingerprint wins. Screen signature is only a fallback
        when the UI tree cannot provide an exact viewport fingerprint.
        """
        xml = self.device.get_ui_xml()
        view_fp = UIHierarchy.get_viewport_fingerprint(xml)
        sig = UIHierarchy.get_screen_signature(xml)

        if expected_view_fp:
            matched = bool(view_fp and view_fp == expected_view_fp)
        else:
            matched = bool(expected_sig and sig == expected_sig)

        return {
            "matched": matched,
            "xml": xml,
            "viewport_fp": view_fp,
            "screen_sig": sig,
        }


    def _mechanically_restore_panorama_viewport(
        self,
        expected_view_fp,
        expected_sig,
        profile,
        report_data=None,
    ):
        """
        Mechanical integrity recovery after a panorama subprocess.

        The stitcher is responsible for returning to its first captured viewport.
        This guard verifies that with the *live UI tree*. If the stitcher stopped
        too early, replay additional inverse capture gestures until the original
        viewport is observed again.

        This is not a planner and makes no semantic navigation decision.
        It only scrolls toward the pre-panorama viewport.
        """
        state = self._panorama_viewport_state(expected_view_fp, expected_sig)
        if state["matched"]:
            return {
                **state,
                "attempted": False,
                "swipes": 0,
                "reason": "already at pre-panorama viewport",
            }

        auto_bottom = {}
        if isinstance(report_data, dict):
            auto_bottom = report_data.get("auto_bottom_stop") or {}

        captured_steps = auto_bottom.get("captured_scroll_steps")
        try:
            captured_steps = int(captured_steps)
        except (TypeError, ValueError):
            captured_steps = int(profile.get("scrolls", 0) or 0)

        max_swipes = min(
            40,
            max(
                4,
                captured_steps + 4,
                int(profile.get("scrolls", 0) or 0) + 2,
            ),
        )

        w, h = self.device.screen_size
        x = w // 2

        # Exact inverse of the capture profile.
        y_start = int(h * float(profile["swipe_end_ratio"]))
        y_end = int(h * float(profile["swipe_start_ratio"]))
        duration = int(profile["swipe_duration_ms"])

        print(
            "         🧭 UI guard: stitcher did not restore the "
            "pre-panorama viewport; continuing inverse scroll replay..."
        )

        last_identity = None
        unchanged_streak = 0

        for i in range(max_swipes):
            self.device.adb(
                f"input swipe {x} {y_start} {x} {y_end} {duration}"
            )
            time.sleep(0.45)

            state = self._panorama_viewport_state(
                expected_view_fp,
                expected_sig,
            )

            if state["matched"]:
                print(
                    f"         ✅ UI guard restored pre-panorama viewport "
                    f"after {i + 1} additional reverse swipe(s)."
                )
                return {
                    **state,
                    "attempted": True,
                    "swipes": i + 1,
                    "reason": "matched pre-panorama UI after mechanical recovery",
                }

            identity = state.get("screen_sig") or state.get("xml_fp")
            if identity and identity == last_identity:
                unchanged_streak += 1
            else:
                unchanged_streak = 0
            last_identity = identity

            # Two unchanged reverse swipes means we have reached the page's top
            # (or another hard scroll boundary) without reproducing the exact
            # original viewport. Stop rather than blindly hammering the UI.
            if unchanged_streak >= 2:
                print(
                    "         ⚠️ UI guard reached a scroll boundary before "
                    "the exact pre-panorama viewport matched."
                )
                return {
                    **state,
                    "attempted": True,
                    "swipes": i + 1,
                    "reason": (
                        "scroll boundary reached before exact pre-panorama "
                        "viewport matched"
                    ),
                }

        print(
            "         ⚠️ UI guard exhausted reverse-swipes without exact "
            "pre-panorama viewport match."
        )
        return {
            **state,
            "attempted": True,
            "swipes": max_swipes,
            "reason": "mechanical restore budget exhausted",
        }

    async def _capture_passive_panorama(self, step, screen_type, screen_desc,
                                         screen_sig, viewport_fp):
        """
        Run reliable_long_screenshot.py as a PASSIVE adaptive recorder.

        Contract:
        - does not call analyze_screen()
        - does not change action/target/phase
        - does not make navigation decisions
        - stitch rejection is non-fatal
        - one rejected capture may retry with HIGHER OVERLAP, not looser quality
        - each stitcher's return-to-top restores the first viewport
        """
        key = str(screen_sig or "")
        if key:
            # One logical panorama job per structural screen. Internal rescue
            # attempts happen inside this method.
            self._panorama_attempted_signatures.add(key)

        script_path = self._panorama_script_path()
        if not os.path.isfile(script_path):
            return {
                "attempted": False,
                "succeeded": False,
                "path": None,
                "attempts": [],
            }

        safe_type = re.sub(
            r"[^A-Za-z0-9._-]+",
            "_",
            str(screen_type or "SCREEN"),
        )
        job_token = uuid.uuid4().hex[:6]
        attempts = []

        print(
            f"      🏞️ Passive panorama capture: step {step} "
            f"[{screen_type}]"
        )

        for profile_index, profile in enumerate(
            self._passive_panorama_profiles(),
            start=1,
        ):
            profile_name = profile["name"]
            token = f"{job_token}_{profile_name}"
            temp_out_dir = os.path.join(
                self.data_dir,
                f".panorama_tmp_{step:03d}_{token}",
            )

            cmd = [
                sys.executable,
                script_path,
                "--out", temp_out_dir,
                "--scrolls", str(profile["scrolls"]),
                "--swipe-start-ratio", profile["swipe_start_ratio"],
                "--swipe-end-ratio", profile["swipe_end_ratio"],
                "--swipe-duration-ms", profile["swipe_duration_ms"],
                "--settle-after-scroll", profile["settle_after_scroll"],
                "--pair-delay", profile["pair_delay"],
                "--min-overlap-px", profile["min_overlap_px"],
                "--max-scroll-ratio", profile["max_scroll_ratio"],
                "--return-to-top",
            ]

            print(
                f"         📸 Panorama profile {profile_index}/"
                f"{len(self._passive_panorama_profiles())}: "
                f"{profile_name} "
                f"(scrolls={profile['scrolls']}, "
                f"overlap>={profile['min_overlap_px']}px)"
            )

            try:
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=300,
                )

                report_source = os.path.join(
                    temp_out_dir,
                    "stitch_report.json",
                )
                report_dest = os.path.join(
                    self.panorama_report_dir,
                    f"step_{step:03d}_{safe_type}_{profile_name}_{job_token}.json",
                )

                report_data = None
                if os.path.isfile(report_source):
                    try:
                        shutil.copy2(report_source, report_dest)
                        with open(report_source, "r", encoding="utf-8") as f:
                            report_data = json.load(f)
                    except Exception as exc:
                        print(
                            f"         ⚠️ Could not preserve "
                            f"{profile_name} panorama report: {exc}"
                        )
                        report_dest = None
                else:
                    report_dest = None

                return_report = (
                    (report_data or {}).get("return_to_top")
                    if isinstance(report_data, dict)
                    else None
                ) or {}

                ui_restore = self._mechanically_restore_panorama_viewport(
                    viewport_fp,
                    screen_sig,
                    profile,
                    report_data=report_data,
                )

                attempt_info = {
                    "profile": profile_name,
                    "returncode": int(result.returncode),
                    "report": report_dest,
                    "report_data": report_data,
                    "stitcher_return_report": return_report,
                    "ui_restore": {
                        "matched": bool(ui_restore.get("matched")),
                        "attempted": bool(ui_restore.get("attempted")),
                        "swipes": int(ui_restore.get("swipes", 0) or 0),
                        "reason": ui_restore.get("reason"),
                    },
                }
                attempts.append(attempt_info)

                if not ui_restore.get("matched"):
                    print(
                        "         ⚠️ Panorama attempt did not restore the "
                        "pre-capture viewport. Aborting panorama retries so "
                        "the next onboarding loop starts from a known state."
                    )
                    return {
                        "attempted": True,
                        "succeeded": False,
                        "path": None,
                        "restore_failed": True,
                        "attempts": attempts,
                    }

                if result.returncode != 0:
                    tail_source = result.stderr or result.stdout or ""
                    tail = tail_source.strip()[-700:]

                    print(
                        f"         ⚠️ Panorama profile '{profile_name}' "
                        f"rejected (exit={result.returncode})."
                    )
                    if tail:
                        print(f"         ⚠️ Stitcher: {tail}")

                    has_next = (
                        profile_index
                        < len(self._passive_panorama_profiles())
                    )
                    if has_next:
                        print(
                            "         🔁 Retrying the SAME screen with the "
                            "high-overlap rescue profile; quality thresholds "
                            "remain strict."
                        )
                        # The stitcher returns to its first viewport before
                        # offline alignment. Give the UI a beat before recapture.
                        time.sleep(0.8)
                        continue

                    print(
                        "         ⚠️ All panorama profiles rejected. "
                        "Normal screenshot retained."
                    )
                    return {
                        "attempted": True,
                        "succeeded": False,
                        "path": None,
                        "attempts": attempts,
                    }

                final_files = sorted(
                    glob.glob(
                        os.path.join(
                            temp_out_dir,
                            "final_long_screenshot_*.png",
                        )
                    )
                )
                if not final_files:
                    print(
                        f"         ⚠️ Panorama profile '{profile_name}' "
                        "returned success but produced no final image."
                    )
                    if (
                        profile_index
                        < len(self._passive_panorama_profiles())
                    ):
                        time.sleep(0.8)
                        continue
                    return {
                        "attempted": True,
                        "succeeded": False,
                        "path": None,
                        "attempts": attempts,
                    }

                source_file = final_files[0]
                suffix = (
                    "withnav"
                    if "withnav" in os.path.basename(source_file)
                    else "nonav"
                )
                with open(source_file, "rb") as f:
                    pano_bytes = f.read()

                pano_path = self._save_canonical_screenshot(
                    pano_bytes,
                    (
                        f"pano_step_{step:03d}_{safe_type}_"
                        f"{profile_name}_{suffix}_{job_token}"
                    ),
                )

                if pano_path:
                    self._panorama_capture_count += 1
                    self.timeline.append({
                        "step": step,
                        "state": f"{screen_type}_PANORAMA",
                        "action": "PASSIVE_PANORAMA",
                        "target": key,
                        "panorama_key": key,
                        "screen_desc": screen_desc,
                        "value_type": None,
                        "phase": self.phase,
                        "screenshot": pano_path,
                        "panorama_report": report_dest,
                        "panorama_profile": profile_name,
                        "panorama_attempts": [
                            {
                                "profile": a.get("profile"),
                                "returncode": a.get("returncode"),
                                "report": a.get("report"),
                            }
                            for a in attempts
                        ],
                        "passive_capture": True,
                        "timestamp": time.time(),
                        "pathway": self.current_pathway,
                    })
                    self._write_screenshot_index()
                    print(
                        f"         ✅ Passive panorama saved using "
                        f"'{profile_name}': "
                        f"{os.path.basename(pano_path)}"
                    )

                return {
                    "attempted": True,
                    "succeeded": bool(pano_path),
                    "path": pano_path,
                    "report": report_dest,
                    "report_data": report_data,
                    "profile": profile_name,
                    "attempts": attempts,
                }

            except subprocess.TimeoutExpired:
                attempts.append({
                    "profile": profile_name,
                    "returncode": "timeout",
                    "report": None,
                })
                print(
                    f"         ⚠️ Panorama profile '{profile_name}' "
                    "timed out."
                )
                if (
                    profile_index
                    < len(self._passive_panorama_profiles())
                ):
                    time.sleep(0.8)
                    continue
                return {
                    "attempted": True,
                    "succeeded": False,
                    "path": None,
                    "attempts": attempts,
                }

            except Exception as exc:
                attempts.append({
                    "profile": profile_name,
                    "returncode": "exception",
                    "report": None,
                })
                print(
                    f"         ⚠️ Passive panorama '{profile_name}' "
                    f"exception: {exc}"
                )
                if (
                    profile_index
                    < len(self._passive_panorama_profiles())
                ):
                    time.sleep(0.8)
                    continue
                return {
                    "attempted": True,
                    "succeeded": False,
                    "path": None,
                    "attempts": attempts,
                }

            finally:
                shutil.rmtree(temp_out_dir, ignore_errors=True)

        return {
            "attempted": True,
            "succeeded": False,
            "path": None,
            "attempts": attempts,
        }

    def _refresh_after_passive_panorama(self, previous_view_fp, previous_sig):
        """
        Freshly observe after passive capture and prove exact viewport restoration.
        """
        fresh_img = self._capture_active_screen()
        fresh_xml = self.device.get_ui_xml()
        fresh_text = UIHierarchy.extract_visible_text(fresh_xml)
        fresh_hash = compute_screen_hash(fresh_img) if fresh_img else ""
        fresh_fp = UIHierarchy.get_xml_fingerprint(fresh_xml)
        fresh_sig = UIHierarchy.get_screen_signature(fresh_xml)
        fresh_view_fp = UIHierarchy.get_viewport_fingerprint(fresh_xml)

        if previous_view_fp:
            same_viewport = bool(
                fresh_img and fresh_view_fp and fresh_view_fp == previous_view_fp
            )
        else:
            same_viewport = bool(
                fresh_img and previous_sig and fresh_sig == previous_sig
            )

        return {
            "img": fresh_img,
            "xml": fresh_xml,
            "text": fresh_text,
            "screen_hash": fresh_hash,
            "xml_fp": fresh_fp,
            "screen_sig": fresh_sig,
            "viewport_fp": fresh_view_fp,
            "same_logical_screen": same_viewport,
        }


    async def run(self):
        """
        Clean core engine.

        One loop owns onboarding decisions:
            OBSERVE -> ONE PLANNER DECISION -> GROUND -> EXECUTE ONE ACTION -> OBSERVE

        Specialized handlers are capabilities/resources only (verification,
        resume file access, CAPTCHA classification). They do not compete with
        the main planner for ordinary screen decisions.
        """
        if self.local_video_recorder is not None:
            self.local_video_recorder.enabled = True  # Opening the app is the first beat.
        # ---------- Startup / resume ----------
        if self.resume_path:
            if self._auto_reused_session:
                print(f"   🧵 Continuing latest lifecycle session context: {self.resume_path}")
            else:
                print("   📂 Resuming previous run session context...")
            resume_loaded = self.load_resume_state(self.resume_path)
            if self.continue_current and not resume_loaded:
                self.phase = "EXPLORE"
                self._needs_live_phase_recovery = True
                self._phase_recovery_reason = "missing session_resume_state.json"
                print(
                    "   🧭 No resume-state JSON; current live UI will determine "
                    "the lifecycle phase."
                )
            self.device.bring_to_front(PACKAGE_NAME)
            time.sleep(1.0)

        elif self.continue_current:
            print(f"\n   ▶️ Continuing current {APP_NAME} state WITHOUT wiping app data...")
            self.device.bring_to_front(PACKAGE_NAME)
            time.sleep(1.5)

        else:
            print("\n   🧹 Wiping app data...")
            self.device.clear_data()
            time.sleep(1.0)
            print(f"   🚀 Launching {APP_NAME}...")
            self.device.launch_app()
            time.sleep(1.0)

        step = 0
        last_screen_hash = None
        same_screen_steps = 0

        while step < MAX_STEPS and self.status == "INITIALIZING":
            if self.local_video_recorder is not None:
                self.local_video_recorder.enabled = False
            step += 1
            print(f"\n{'=' * 60}")
            print(f"   📍 STEP {step}/{MAX_STEPS} | Phase: {self.phase}")
            print(f"{'=' * 60}")

            # ---------- OBSERVE ----------
            adb_img = self.device.get_screenshot_bytes()
            active_img = adb_img
            img_source = "ADB"

            if self._is_black_screen(adb_img):
                host_img = self.device.get_host_screenshot_bytes()
                if host_img:
                    active_img = host_img
                    img_source = "HOST"

            if not active_img:
                self.blank_screenshot_streak += 1
                if self.blank_screenshot_streak > 3:
                    self.device.bring_to_front(PACKAGE_NAME)
                    self.blank_screenshot_streak = 0
                time.sleep(1.0)
                continue

            self.blank_screenshot_streak = 0

            if img_source == "HOST":
                cropped = await self._get_and_refine_crop_box(active_img)
                if cropped:
                    active_img = cropped

            xml = self.device.get_ui_xml()
            all_screen_text = UIHierarchy.extract_visible_text(xml)
            screen_hash = compute_screen_hash(active_img)
            xml_fp = UIHierarchy.get_xml_fingerprint(xml)
            screen_sig = UIHierarchy.get_screen_signature(xml)
            viewport_fp = UIHierarchy.get_viewport_fingerprint(xml)

            self.memory.record_screen(screen_hash, screen_sig, self.phase)
            self.app_category.refine_from_screen_text(all_screen_text)
            self._finalize_pending_transition(
                screen_sig,
                all_screen_text,
                self.phase,
            )

            if screen_hash == last_screen_hash:
                same_screen_steps += 1
            else:
                same_screen_steps = 0
                self.scroll_attempts_this_screen = 0
                self.swipe_attempts_this_screen = 0
            self._stuck_action_count = same_screen_steps
            last_screen_hash = screen_hash

            # No hidden recovery action. Transition memory is fed back to the
            # planner. We only terminate after extreme no-progress to avoid an
            # infinite benchmark run.
            if same_screen_steps >= 12:
                self.status = "STUCK_NO_PROGRESS"
                self.memory.add_thought(
                    f"Step {step}: same visual state persisted for {same_screen_steps} steps"
                )
                break

            focused_pkg = self.device.get_current_focused_package()

            # External/system dialogs are a mechanical exception. In-app
            # overlays remain ordinary screens for the main planner.
            if PACKAGE_NAME not in focused_pkg:
                google_system_packages = (
                    "com.google.android.gms",
                    "com.android.systemui",
                    "com.android.permissioncontroller",
                    "com.google.android.packageinstaller",
                )
                if any(pkg in focused_pkg for pkg in google_system_packages):
                    if await self.detect_and_dismiss_dialog(active_img, xml):
                        self.memory.add_thought(
                            f"Step {step}: handled external/system dialog"
                        )
                        continue

            # CAPTCHA is a resource constraint, not an alternate onboarding planner.
            challenge_type, challenge_details = await self.bot_handler.classify_challenge(
                active_img, xml
            )
            if challenge_type != BotChallengeHandler.NOT_A_CHALLENGE:
                print(f"      🤖 Bot challenge detected: {challenge_type}")
                solved = await self.bot_handler.attempt_challenge(
                    challenge_type,
                    challenge_details,
                    active_img,
                    xml,
                )
                if solved:
                    self.memory.add_thought(
                        f"Step {step}: solved bot challenge {challenge_type}"
                    )
                    continue
                self.status = "BLOCKED_BY_CAPTCHA"
                break

            # ---------- ONE PLANNER ----------
            strategy = await self.analyze_screen(active_img, xml)
            strategy = self._normalize_core_strategy(strategy, xml)

            screen_type = str(strategy.get("screen_type", "UNKNOWN") or "UNKNOWN")
            screen_desc = str(strategy.get("screen_description", "") or "")
            action = str(strategy.get("action", "WAIT") or "WAIT").upper()
            target = str(strategy.get("target_desc", "") or "")
            target_coords = strategy.get("target_coords")
            value_type = str(strategy.get("value_type", "text") or "text")
            reasoning = str(strategy.get("reasoning", "") or "")

            # Resume phase recovery is classification only. It cannot replace action.
            if self.continue_current and self._needs_live_phase_recovery:
                recovered_phase, evidence = await self._recover_phase_from_live_screen(
                    active_img,
                    xml,
                    strategy,
                )
                old_phase = self.phase
                self.phase = recovered_phase
                self._needs_live_phase_recovery = False
                print(
                    f"      🧭 LIVE PHASE RECOVERY: {old_phase} -> {recovered_phase}"
                )
                if evidence:
                    print(f"         Evidence: {evidence[:180]}")

            self._update_core_phase_metadata(screen_type, strategy)

            # ---------- LOG CURRENT DECISION ----------
            form_fields = strategy.get("all_form_fields", [])
            self.flow_tracker.record_step(
                screen_type=screen_type,
                screen_desc=screen_desc,
                form_fields=form_fields if form_fields else None,
                has_terms=("terms" in all_screen_text.casefold()),
                has_payment=(screen_type in ("PAYMENT", "PLAN_SELECTION")),
                has_plan=(screen_type == "PLAN_SELECTION"),
                has_verification=bool(
                    strategy.get("is_verification_screen")
                    or screen_type == "VERIFICATION"
                ),
                has_profile_setup=(screen_type == "PROFILE_COMPLETION"),
                has_permissions=(screen_type == "PERMISSION_DIALOG"),
                has_quiz=(screen_type == "ONBOARDING_QUIZ"),
            )

            print(f"      👀 Screen: {screen_desc}")
            print(f"      🏷️ Type: {screen_type}")
            print(f"      👉 Action: {action} -> '{target}'")
            if reasoning:
                print(f"      💭 Reason: {reasoning}")

            repeat_count = self._no_change_repeat_count(
                screen_sig,
                action,
                target,
            )
            if (
                action not in ("WAIT", "SCROLL_DOWN", "SCROLL_UP")
                and repeat_count >= 2
            ):
                print(
                    f"      🔁 NO-CHANGE GUARD: {action} '{target}' already "
                    f"produced no change {repeat_count} times on this viewport. "
                    "Not executing it again; next observation must choose a "
                    "different visible action or satisfy the missing requirement."
                )
                self.memory.add_thought(
                    f"Step {step}: blocked repeated no-change action "
                    f"{action} '{target}'"
                )
                continue

            profile_ok, profile_reason = self._profile_choice_guard(
                screen_desc,
                all_screen_text,
                action,
                target,
            )
            if not profile_ok:
                self._missing_profile_requirement = profile_reason
                print(
                    f"      🛡️ PROFILE INTEGRITY BLOCK: {profile_reason}. "
                    "The planner may use a visible Skip/Back path, or STOP as "
                    "PROFILE_DATA_REQUIRED; it may not invent a value."
                )
                self.memory.add_thought(
                    f"Step {step}: profile integrity blocked {action} "
                    f"'{target}' ({profile_reason})"
                )
                continue

            raw_label = str(strategy.get("screenshot_label", "") or "")
            slug = re.sub(r"[^\w]+", "_", raw_label.casefold()).strip("_")[:40]
            safe_type = re.sub(r"[^\w]+", "_", screen_type)
            screenshot_stem = (
                f"step_{step:02d}_{safe_type}_{slug}_{uuid.uuid4().hex[:6]}"
                if slug
                else f"step_{step:02d}_{safe_type}_{uuid.uuid4().hex[:6]}"
            )
            screenshot_path = self._save_canonical_screenshot(
                active_img,
                screenshot_stem,
            )

            self.timeline.append({
                "step": step,
                "state": screen_type,
                "action": action,
                "target": target,
                "screen_desc": screen_desc,
                "value_type": value_type if action == "FILL_FIELD" else None,
                "phase": self.phase,
                "screenshot": screenshot_path,
                "timestamp": time.time(),
                "pathway": self.current_pathway,
            })
            self._write_screenshot_index()

            if self.phase == "POST_AUTH":
                self.post_auth_handler.record_screen(screen_type)

            # ---------- PASSIVE PANORAMA RECORDER ----------
            # Capture is deliberately outside the planner. We already have ONE
            # semantic decision; the recorder only documents the scrollable UI.
            if self._should_capture_passive_panorama(
                screen_sig,
                screen_type,
                xml,
            ):
                pre_pano_sig = screen_sig
                pre_pano_view_fp = viewport_fp

                pano_result = await self._capture_passive_panorama(
                    step,
                    screen_type,
                    screen_desc,
                    pre_pano_sig,
                    pre_pano_view_fp,
                )

                # A restore failure invalidates the pre-panorama decision even
                # if the new viewport happens to have the same general structure.
                if pano_result.get("restore_failed"):
                    print(
                        "      🧭 Panorama restore failed. Discarding the "
                        "pre-panorama planner action unconditionally and "
                        "re-observing before any UI action."
                    )
                    self.memory.add_thought(
                        f"Step {step}: panorama restore_failed=True; stale "
                        "planner action discarded"
                    )
                    continue

                refreshed = self._refresh_after_passive_panorama(
                    pre_pano_view_fp,
                    pre_pano_sig,
                )

                if not refreshed.get("same_logical_screen"):
                    fallback_profile = self._passive_panorama_profiles()[-1]
                    final_restore = self._mechanically_restore_panorama_viewport(
                        pre_pano_view_fp,
                        pre_pano_sig,
                        fallback_profile,
                        report_data=None,
                    )

                    if final_restore.get("matched"):
                        refreshed = self._refresh_after_passive_panorama(
                            pre_pano_view_fp,
                            pre_pano_sig,
                        )

                if refreshed.get("img"):
                    active_img = refreshed["img"]
                    xml = refreshed["xml"]
                    all_screen_text = refreshed["text"]
                    screen_hash = refreshed["screen_hash"]
                    xml_fp = refreshed["xml_fp"]
                    screen_sig = refreshed["screen_sig"]
                    viewport_fp = refreshed.get("viewport_fp", "")

                if not refreshed.get("same_logical_screen"):
                    print(
                        "      🧭 Panorama could not prove restoration of the "
                        "exact pre-capture viewport. Discarding the stale action "
                        "and re-observing."
                    )
                    self.memory.add_thought(
                        f"Step {step}: exact panorama viewport restoration "
                        "not proven; discarded stale action"
                    )
                    continue

                if pano_result.get("attempted"):
                    print(
                        "      🧭 Panorama complete; exact viewport restored. "
                        "Executing the unchanged planner action against fresh UI."
                    )

            # ---------- EXTERNAL VERIFICATION RESOURCE ----------
            verification_challenge = bool(
                strategy.get("is_verification_screen")
                or screen_type == "VERIFICATION"
            )

            if (
                verification_challenge
                and not self._verification_has_local_action_first(strategy)
                and not self.verification_recovery_context
            ):
                self.phase = "VERIFICATION"
                print("      🔐 External verification challenge -> verification resource")

                v_result = await self.verification_handler.handle_verification(
                    active_img,
                    xml,
                )
                print(f"      🔐 Verification result: {v_result.get('status')}")

                self.timeline.append({
                    "step": step,
                    "state": "VERIFICATION_RESULT",
                    "action": v_result.get("status", "unknown"),
                    "target": v_result.get("detail", ""),
                    "screen_desc": (
                        f"Verification {v_result.get('status', 'unknown')}: "
                        f"{str(v_result.get('detail', ''))[:100]}"
                    ),
                    "value_type": None,
                    "phase": "VERIFICATION",
                    "screenshot": None,
                    "timestamp": time.time(),
                    "pathway": self.current_pathway,
                })

                status = v_result.get("status", "unknown")

                if status == "email_target_mismatch":
                    target_email = v_result.get("target_email", "")
                    accessible = v_result.get("accessible_emails", [])
                    self.verification_recovery_context = (
                        f"Verification was sent to inaccessible email "
                        f"'{target_email}'. Accessible resources: "
                        f"{accessible or [self.persona.email]}. Use visible "
                        "navigation to backtrack and choose a viable path."
                    )
                    self.device.return_to_app()
                    time.sleep(1.0)
                    self.phase = "SIGNUP"
                    continue

                if v_result.get("handled"):
                    self.verification_recovery_context = None
                    post_img = self._capture_active_screen()
                    post_xml = self.device.get_ui_xml()
                    self.phase = await self._determine_post_verification_phase(
                        post_img,
                        post_xml,
                    )
                    self.flow_tracker.seen_verification = True
                    self.flow_tracker.mark_account_created("signup")
                    self.account_detector.creation_detected = True
                    continue

                if status in ("sms_required", "captcha_blocked"):
                    self.status = f"BLOCKED_{status.upper()}"
                    break

                if status == "max_attempts":
                    self.status = "VERIFICATION_FAILED"
                    break

                # Unresolved verification remains verification. No POST_AUTH hop.
                self.phase = "VERIFICATION"
                time.sleep(1.0)
                continue

            # ---------- HARD RESOURCE BLOCKS ----------
            if screen_type == "PAYMENT":
                payment_check = self.payment_detector.check_for_payment_wall(xml)
                if (
                    payment_check.get("is_hard_wall")
                    and self.payment_detector.is_card_entry_form(xml)
                ):
                    self.status = "BLOCKED_PAYMENT_WALL"
                    self.phase = "DONE"
                    break

            # ---------- EXECUTE EXACTLY ONE ACTION ----------
            if self.local_video_recorder is not None:
                self.local_video_recorder.enabled = action in {
                    "CLICK", "FILL_FIELD", "SCROLL_DOWN", "SCROLL_UP",
                    "SWIPE_LEFT", "PRESS_BACK", "UPLOAD_RESUME",
                }
            self._arm_action_transition(
                screen_sig,
                screen_desc,
                action,
                target,
                step,
                reasoning=reasoning,
            )

            action_result = "unknown"

            if action == "WAIT":
                time.sleep(1.5)
                action_result = "waited"

            elif action == "CLICK":
                pre_tap_img = active_img
                pre_tap_xml = xml

                if self._core_checkbox_intent(target):
                    clicked = await self._execute_atomic_checkbox_click(
                        active_img,
                        xml,
                        target,
                        target_coords=(
                            tuple(target_coords)
                            if isinstance(target_coords, (list, tuple))
                            and len(target_coords) >= 2
                            else None
                        ),
                    )
                else:
                    clicked = await self._execute_atomic_visual_click(
                        active_img,
                        xml,
                        target,
                        target_coords=(
                            tuple(target_coords)
                            if isinstance(target_coords, (list, tuple))
                            and len(target_coords) >= 2
                            else None
                        ),
                        screen_desc=screen_desc,
                    )

                action_result = "clicked" if clicked else "click_not_grounded"

                if clicked and self.account_detector.should_check(
                    target,
                    self.phase,
                    len(self.memory.filled_fields),
                ):
                    time.sleep(1.0)
                    post_img = self._capture_active_screen()
                    post_xml = self.device.get_ui_xml()
                    if post_img:
                        creation = await self.account_detector.check_post_tap(
                            pre_tap_img,
                            post_img,
                            pre_tap_xml,
                            post_xml,
                            target,
                            self.memory.filled_fields,
                        )
                        print(
                            f"      🔍 Account creation check: "
                            f"{creation.get('account_created')} "
                            f"(confidence: {float(creation.get('confidence', 0)):.2f})"
                        )
                        if creation.get("account_created"):
                            self.flow_tracker.mark_account_created("signup")
                            self.account_detector.creation_detected = True
                            if creation.get("requires_verification"):
                                self.phase = "VERIFICATION"
                            else:
                                self.phase = "POST_AUTH"

            elif action == "FILL_FIELD":
                override_val = strategy.get("override_value")
                if override_val in ("", "null", "None", "none"):
                    override_val = None
                ok = await self.handle_field_input(
                    active_img,
                    xml,
                    target,
                    value_type,
                    target_coords=(
                        tuple(target_coords)
                        if isinstance(target_coords, (list, tuple))
                        and len(target_coords) >= 2
                        else None
                    ),
                    override_value=override_val,
                )
                action_result = "field_filled" if ok else "field_not_completed"

            elif action == "SCROLL_DOWN":
                self.device.swipe_up("half")
                self.scroll_attempts_this_screen += 1
                human_delay(PACE_SCROLL_DELAY)
                action_result = "scrolled_down"

            elif action == "SCROLL_UP":
                self.device.swipe_down("half")
                human_delay(PACE_SCROLL_DELAY)
                action_result = "scrolled_up"

            elif action == "SWIPE_LEFT":
                self.device.swipe_left()
                self.swipe_attempts_this_screen += 1
                human_delay(PACE_SCROLL_DELAY)
                action_result = "swiped_left"

            elif action == "PRESS_BACK":
                self.device.press_back()
                action_result = "back"

            elif action == "UPLOAD_RESUME":
                if not self._is_resume_upload_screen(all_screen_text, xml):
                    # Planner intent can be one semantic level early: a home
                    # dashboard may expose "Add your resume" as a doorway, while
                    # the actual file picker/upload control appears only after
                    # clicking it. Normalize that specific visible doorway into
                    # ONE atomic CLICK; do not launch the upload capability yet.
                    target_norm = self._normalized_action_label(target)
                    resume_entry = (
                        any(k in target_norm for k in ("resume", " cv", "cv "))
                        and self._is_profile_navigation_target(target)
                    )
                    if resume_entry:
                        print(
                            "      🧭 Resume entry CTA detected. Normalizing "
                            "UPLOAD_RESUME -> one CLICK, then re-observe."
                        )
                        clicked = await self._execute_atomic_visual_click(
                            active_img,
                            xml,
                            target,
                            target_coords=(
                                tuple(target_coords)
                                if isinstance(target_coords, (list, tuple))
                                and len(target_coords) >= 2
                                else None
                            ),
                            screen_desc=screen_desc,
                        )
                        action_result = (
                            "resume_entry_clicked"
                            if clicked else "resume_entry_not_grounded"
                        )
                    else:
                        print(
                            "      🛡️ Refusing UPLOAD_RESUME: current UI has no "
                            "actionable resume/CV upload control."
                        )
                        action_result = "resume_action_not_present"
                elif not os.path.isfile(self.resume_pdf_path):
                    self.status = "BLOCKED_RESUME_RESOURCE_MISSING"
                    self.phase = "DONE"
                    break
                else:
                    ok = await self.handle_resume_upload(
                        active_img,
                        xml,
                        target or "Upload resume",
                        target_coords=target_coords,
                    )
                    action_result = "resume_uploaded" if ok else "resume_upload_failed"
                    if not ok and self.resume_upload_failures >= 3:
                        self.status = "BLOCKED_RESUME_UPLOAD"
                        self.phase = "DONE"
                        break

            elif action == "SETTLED_HOME":
                if (not self.local_video_guest_path
                        and not self.flow_tracker.account_creation_detected):
                    self.settled_count += 1
                    action_result = "guest_home_not_account_completion"
                    self.memory.add_thought(
                        "Guest home is usable, but this account-onboarding run "
                        "has not created an account. Inspect More/profile/account "
                        "navigation for Log in or Create an account."
                    )
                    print("      ⚠️ Guest home cannot complete account onboarding")
                    if self.settled_count >= MAX_SETTLED_CHECKS:
                        self.status = "BLOCKED_ACCOUNT_NOT_CREATED"
                        self.phase = "DONE"
                        self.save_resume_state()
                        break
                    continue
                settled = await self.validate_settled_state(
                    active_img,
                    xml,
                    xml_fp,
                    screen_type=screen_type,
                    screen_desc=screen_desc,
                    action=action,
                    target=target,
                )
                if settled.get("is_settled"):
                    self.settled_count += 1
                    print(
                        f"      🏠 TRUE home confirmation: "
                        f"{self.settled_count}/{MAX_SETTLED_CHECKS}"
                    )
                    action_result = "settled_confirmed"
                    if self.settled_count >= MAX_SETTLED_CHECKS:
                        self.status = "COMPLETED_SETTLED"
                        self.phase = "DONE"
                        self.save_resume_state()
                        break
                else:
                    self.settled_count = 0
                    print(
                        f"      ⚠️ Settled-home validation rejected: "
                        f"{str(settled.get('evidence', ''))[:160]}"
                    )
                    action_result = "settled_rejected"

            elif action == "STOP":
                block_text = str(all_screen_text or "").casefold()
                if (
                    screen_type in ("ERROR", "ACCOUNT_SERVICE_BLOCKED")
                    and "blocked" in block_text
                    and any(term in block_text for term in (
                        "ip address", "address range", "proxy", "webhost",
                    ))
                ):
                    self.status = "BLOCKED_ACCOUNT_SERVICE"
                    self.phase = "DONE"
                    self.memory.add_thought(
                        "Provider refused account creation from the current "
                        "network; no local UI action can resolve the block."
                    )
                    break
                if screen_type == "ACCOUNT_UNAVAILABLE":
                    self.status = "BLOCKED_ACCOUNT_UNAVAILABLE"
                    self.phase = "DONE"
                    self.memory.add_thought(
                        "Account path not found after navigation inspection: "
                        f"{target or screen_desc}"
                    )
                    break
                if screen_type == "PROFILE_DATA_REQUIRED":
                    missing = target
                    if not str(missing).startswith("missing_profile:"):
                        missing = self._missing_profile_requirement or "missing_profile:unknown"
                    self.status = "BLOCKED_MISSING_PROFILE_DATA"
                    self.phase = "DONE"
                    self.memory.add_thought(
                        f"Missing authoritative cross-app profile data: {missing}"
                    )
                    break

                if screen_type == "APPLICATION_PENDING":
                    self.status = "COMPLETED_PART_1_PENDING_APPROVAL"
                    self.phase = "DONE"
                    break

                if screen_type == "CAPTCHA":
                    self.status = "BLOCKED_BY_CAPTCHA"
                    self.phase = "DONE"
                    break

                if screen_type == "PAYMENT" and self.payment_detector.is_card_entry_form(xml):
                    self.status = "BLOCKED_PAYMENT_WALL"
                    self.phase = "DONE"
                    break

                print(
                    "      🛡️ STOP rejected: current screen has no mechanically "
                    "confirmed terminal/blocking condition. Re-observing."
                )
                action_result = "stop_rejected"

            else:
                print(
                    f"      🧹 No executor for action '{action}'. Re-observing."
                )
                action_result = "unsupported_action"

            # ---------- REPORTING ONLY ----------
            if self.local_video_recorder is not None:
                self.local_video_recorder.enabled = False
            if self.phase == "POST_AUTH":
                self.post_auth_handler.record_step(
                    step_num=step,
                    screen_type=screen_type,
                    screen_desc=screen_desc,
                    action=action,
                    target=target,
                    reasoning=reasoning,
                    action_result=action_result,
                    screen_hash=screen_hash,
                    xml_fingerprint=xml_fp,
                )

            self.memory.add_thought(
                f"Step {step}: [{self.phase}/{screen_type}] "
                f"{action} '{target}' -> {action_result}"
            )

            if action != "SETTLED_HOME":
                self.settled_count = 0

        # ---------- Finalize ----------
        if step >= MAX_STEPS and self.status == "INITIALIZING":
            self.status = "MAX_STEPS_REACHED"

        # Persist continuation state regardless of how far signup progressed.
        self.save_resume_state()

        final_img = self._capture_active_screen()
        if final_img:
            final_path = self._save_canonical_screenshot(
                final_img,
                f"FINAL_{self.status}_{uuid.uuid4().hex[:6]}",
            )
            if final_path:
                print(f"\n   📸 Final screenshot: {final_path}")

        print(f"\n🏁 FINAL STATUS: {self.status}")
        print(f"   Phase: {self.phase}")
        print(f"   Steps taken: {step}")
        print(f"   App category: {self.app_category.get_category()}")
        print(f"   Account created: {self.flow_tracker.account_creation_detected}")
        print(f"   Flow completion: {self._reported_flow_completion():.0%}")
        print(f"   Field coverage: {self.flow_tracker.get_completion_ratio():.0%}")
        print("\n   Onboarding Flow details complete.")

        await self.validate_run(step)

    def _reported_flow_completion(self):
        """
        Overall lifecycle completion, distinct from form-field coverage.
        """
        if self.status in (
            "COMPLETED_SETTLED",
            "COMPLETED_CONFIRMATION",
            "COMPLETED_WITH_DEFERRED_VERIFICATION",
            "COMPLETED_SETTLED_NO_VERIFICATION_LINK",
        ):
            return 1.0

        field_ratio = self.flow_tracker.get_completion_ratio()
        if self.flow_tracker.account_creation_detected:
            try:
                post = self.post_auth_handler.estimate_post_auth_progress()
                post_ratio = float(post.get("progress", 0.0) or 0.0)
            except Exception:
                post_ratio = 0.0
            return max(field_ratio, min(0.99, 0.50 + 0.50 * post_ratio))

        return field_ratio

    async def validate_run(self, total_steps):
        await self.perform_post_run_analysis()

        print(f"\n   🔍 Running post-run validation...")
        checks = []
        score = 0

        successful = ["COMPLETED_SETTLED", "COMPLETED_CONFIRMATION",
                       "COMPLETED_MAX_POST_AUTH", "COMPLETED_VERIFICATION",
                       "COMPLETED_WITH_DEFERRED_VERIFICATION", "COMPLETED_SETTLED_NO_VERIFICATION_LINK",
                       "COMPLETED_PART_1_PENDING_APPROVAL"]
        blocked = ["BLOCKED_PAYMENT_WALL", "BLOCKED_SMS_REQUIRED",
                    "BLOCKED_CAPTCHA_BLOCKED", "BLOCKED_BY_CAPTCHA"]

        if any(self.status.startswith(s) for s in successful):
            checks.append({"name": "Terminal State", "passed": True, "detail": self.status})
            score += 20
        elif any(self.status.startswith(s) for s in blocked):
            checks.append({"name": "Terminal State", "passed": True,
                           "detail": f"{self.status} (blocked but handled gracefully)"})
            score += 10
        else:
            checks.append({"name": "Terminal State", "passed": False, "detail": self.status})

        if self.signup_found:
            checks.append({"name": "Signup Discovery", "passed": True})
            score += 10
        else:
            checks.append({"name": "Signup Discovery", "passed": False})

        if self.flow_tracker.account_creation_detected:
            checks.append({"name": "Account Created", "passed": True,
                           "detail": f"Method: {self.flow_tracker.account_creation_method}"})
            score += 20
        else:
            checks.append({"name": "Account Created", "passed": False})

        filled = self.memory.filled_fields
        if filled:
            checks.append({"name": "Fields Filled", "passed": True,
                           "detail": f"{len(filled)} fields: {', '.join(filled.keys())}"})
            score += 15
        else:
            checks.append({"name": "Fields Filled", "passed": False})

        post_auth_screens = self.post_auth_handler.total_post_auth_steps
        if post_auth_screens > 0:
            progress = self.post_auth_handler.estimate_post_auth_progress()
            failed_count = len(self.post_auth_handler.failed_actions)
            checks.append({"name": "Post-Auth Onboarding", "passed": True,
                           "detail": (f"Handled {post_auth_screens} screens, "
                                      f"progress={progress['progress']:.0%}, "
                                      f"failures={failed_count}")})
            score += 15
        else:
            checks.append({"name": "Post-Auth Onboarding", "passed": False,
                           "detail": "No post-auth screens"})

        if self.status in ("COMPLETED_SETTLED", "COMPLETED_WITH_DEFERRED_VERIFICATION", "COMPLETED_SETTLED_NO_VERIFICATION_LINK"):
            checks.append({"name": "Settled Home", "passed": True})
            score += 20
        else:
            checks.append({"name": "Settled Home", "passed": False,
                           "detail": f"Final status: {self.status}"})

        print(f"{'=' * 60}")
        print(f"   📊 Overall Score: {score}/100")
        for c in checks:
            icon = "✅" if c["passed"] else "❌"
            print(f"   {icon} {c['name']}: {c.get('detail', '')}")
        print(f"{'=' * 60}")

        self._write_screenshot_index()
        self.save_onboarding_manifest(total_steps, score, checks)
        self.save_agent_memory()
        self.tracker.save_report()

        screenshot_count = len([f for f in os.listdir(self.screenshot_dir) if f.endswith(".png")])

        print(f"\n{'=' * 60}")
        print(f"   📁 OUTPUT: {self.data_dir}/")
        print(f"   ├── onboarding_manifest.json")
        print(f"   ├── agent_memory.json")
        print(f"   ├── observability_log.json")
        print(f"   ├── timeline_journal.jsonl")
        print(f"   ├── screenshot_index.json")
        if self.passive_panoramas_enabled:
            print(f"   ├── panorama_reports/ ({self._panorama_capture_count} accepted panoramas)")
        print(f"   └── screenshots/ ({screenshot_count} images)")
        print(f"{'=' * 60}")

        return {"score": score, "checks": checks}

    def _build_decoupled_pathways(self):
        """
        Organizes the timeline list into isolated, sequential pathway timelines.
        Combines common startup steps with the branch-specific and post-auth steps.
        """
        from collections import defaultdict
        decoupled = defaultdict(list)

        # 1. Isolate the global start steps common to all funnels
        common_steps = [t for t in self.timeline if t.get("pathway") == "Common"]

        # 2. Extract distinct branches explored
        distinct_paths = set(
            t.get("pathway") for t in self.timeline
            if t.get("pathway") and t.get("pathway") != "Common"
        )

        if not distinct_paths:
            # Fallback if the app only had a standard single pathway
            decoupled["Default Onboarding Flow"] = self.timeline
        else:
            for path in distinct_paths:
                # Merge startup steps with branch specific steps
                path_steps = common_steps + [t for t in self.timeline if t.get("pathway") == path]
                # Chronologically sort the steps to preserve sequence
                path_steps.sort(key=lambda x: x.get("timestamp", 0))
                decoupled[path] = path_steps

        return decoupled

    def save_onboarding_manifest(self, total_steps, score, checks):
        manifest = {
            "metadata": {
                "timestamp": datetime.now().isoformat(),
                "app": APP_NAME,
                "package": PACKAGE_NAME,
                "screen_size": self.device.screen_size,
                "agent_version": "13.3.2",
                "app_category": self.app_category.get_category(),
                "identity_email": self.persona.email,
                "identity_profile": self.persona_json_path or None,
                "ai_provider": "openai",
                "ai_model": MODEL_ROSTER[0],
                "reasoning_effort": OPENAI_REASONING_EFFORT,
                "image_detail": OPENAI_IMAGE_DETAIL,
                "response_storage": False,
                "local_video_guest_path": bool(self.local_video_guest_path),
            },
            "result": {
                "status": self.status,
                "phase": self.phase,
                "score": score,
                "total_steps": total_steps,
                "signup_found": self.signup_found,
                "account_created": self.flow_tracker.account_creation_detected,
                "account_creation_method": self.flow_tracker.account_creation_method,
                "account_creation_step": self.flow_tracker.account_creation_step,
                "settled_home_reached": "COMPLETED_SETTLED" in self.status,
                "blocked_by": (self.status if "BLOCKED" in self.status else None),
                "flow_completion": self._reported_flow_completion(),
                "field_completion": self.flow_tracker.get_completion_ratio(),
            },
            "persona": {
                "email": self.persona.email,
                "username": self.persona.username,
                "password": "[REDACTED]",
                "full_name": self.persona.full_name,
                "dob": self.persona.dob_full,
            },
            "signup_flow": {
                "steps": self.flow_tracker.steps,
                "expected_fields": self.flow_tracker.expected_fields,
                "filled_fields": list(self.flow_tracker.filled_fields),
                "milestones": {
                    "terms": self.flow_tracker.seen_terms_screen,
                    "payment": self.flow_tracker.seen_payment_screen,
                    "plan_selection": self.flow_tracker.seen_plan_selection,
                    "verification": self.flow_tracker.seen_verification,
                    "profile_setup": self.flow_tracker.seen_profile_setup,
                    "quiz": self.flow_tracker.seen_onboarding_quiz,
                },
                "friction_counters": self.flow_tracker.friction_counters,
            },
            "verification": {
                "type": self.verification_handler.verification_type,
                "attempts": self.verification_handler.verification_attempts,
                "code_extracted": self.verification_handler.code_extracted,
                "successful": self.verification_handler.verification_successful,
                "steps_taken": self.verification_handler.steps_taken,
            },
            "post_auth": self.post_auth_handler.get_summary(),
            "post_auth_flow_summary": self.post_auth_handler.get_flow_summary(),
            "account_creation_detection": {
                "detected": self.account_detector.creation_detected,
                "evidence": self.account_detector.creation_evidence,
                "history": [
                    {
                        "created": d["account_created"],
                        "confidence": d["confidence"],
                        "evidence": d["evidence"][:100],
                        "verification_type": d.get("verification_type"),
                    }
                    for d in self.account_detector.detection_history
                ],
            },
            "fields_filled": dict(self.memory.filled_fields),
            "form_errors": [e["error"] for e in self.memory.form_errors],
            "timeline": list(self.timeline),
            "timeline_journal": f"{self.data_dir}/timeline_journal.jsonl",
            "ordered_screenshots": self._write_screenshot_index(),
            "decoupled_pathways": self._build_decoupled_pathways(),  # isolated runs
            "validation_checks": checks,
            "post_run_insights": getattr(self, 'post_run_insights', {}),
            "passive_panoramas": {
                "enabled": bool(self.passive_panoramas_enabled),
                "capture_count": int(self._panorama_capture_count),
                "report_dir": self.panorama_report_dir,
                "stitcher": self._panorama_script_path(),
            },
            "screenshots_dir": self.screenshot_dir,
        }
        path = f"{self.data_dir}/onboarding_manifest.json"
        try:
            with open(path, "w") as f:
                json.dump(manifest, f, indent=2)
            print(f"   📋 Manifest saved: {path}")
        except IOError as e:
            print(f"      ⚠️ Could not save manifest: {e}")

    def save_agent_memory(self):
        memory_data = {
            "timestamp": datetime.now().isoformat(),
            "app": APP_NAME,
            "package": PACKAGE_NAME,
            "status": self.status,
            "phase": self.phase,
            "app_category": self.app_category.get_category(),
            "account_created": self.flow_tracker.account_creation_detected,
            "persona": {
                "email": self.persona.email,
                "username": self.persona.username,
            },
            "filled_fields": dict(self.memory.filled_fields),
            "decision_log": self.memory.history[-50:],
            "failed_actions": self.memory.failed_actions[-20:],
            "dismissed_dialogs": self.memory.dismissed_dialogs,
            "form_errors": [e["error"] for e in self.memory.form_errors],
            "back_stack": self.memory.back_stack,
            "screen_hash_history": self.memory.screen_hash_history[-30:],
        }
        path = f"{self.data_dir}/agent_memory.json"
        try:
            with open(path, "w") as f:
                json.dump(memory_data, f, indent=2)
            print(f"   🧠 Agent memory saved: {path}")
        except IOError as e:
            print(f"      ⚠️ Could not save memory: {e}")


if __name__ == "__main__":
    agent = OnboardingSpy()
    try:
        asyncio.run(agent.run())
    except OnboardingAIUnavailable as e:
        print(f"\n   ⏸️ Onboarding paused: AI provider unavailable: {e}")
        try:
            agent.status = "PAUSED_AI_PROVIDER"
            agent.save_resume_state()
            agent.save_agent_memory()
            agent._write_screenshot_index()
            print(f"   💾 Continuation state preserved in: {agent.data_dir}")
        except Exception as save_error:
            print(f"   ⚠️ Could not persist provider-pause state: {save_error}")
    except KeyboardInterrupt:
        print("\n   ⏸️ Interrupted by user — preserving live onboarding state...")
        try:
            if agent.flow_tracker.account_creation_detected and agent.phase != "DONE":
                agent.phase = "POST_AUTH"
            agent.status = "INTERRUPTED"
            agent.save_resume_state()
            agent.save_agent_memory()
            agent._write_screenshot_index()
            print(f"   💾 Continuation state preserved in: {agent.data_dir}")
        except Exception as e:
            print(f"   ⚠️ Could not persist interrupt state: {e}")
    finally:
        if agent.local_video_recorder is not None:
            agent.local_video_recorder.close()
            if agent.status == "COMPLETED_SETTLED":
                try:
                    from local_onboarding_video import automatic_edit
                    film = automatic_edit(agent.data_dir)
                    print(f"   🎞️ Automatic local onboarding film: {film}")
                except Exception as exc:
                    print(f"   ⚠️ Automatic local video edit did not pass: {exc}")
