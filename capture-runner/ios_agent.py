#!/usr/bin/env python3
"""Checkpointed, conservative iPhone explorer for a preinstalled App Store app.

The operator controls this process through Northstar Admin. Appium/XCUITest
owns the real device; this worker never installs or modifies the target app.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import signal
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

STOP = False
BLOCKED = re.compile(
    r"\b(?:buy|purchase|pay|subscribe|delete|remove account|sign out|log out|"
    r"post|publish|send|submit|apply now|confirm|allow|deny|report|block|unfollow)\b",
    re.I,
)
ACTION_TYPES = {"XCUIElementTypeButton", "XCUIElementTypeCell", "XCUIElementTypeLink"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    with temp.open("w") as stream:
        json.dump(data, stream, indent=2, ensure_ascii=False)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)


class AppiumError(RuntimeError):
    pass


class Appium:
    def __init__(self, url: str):
        if not url.startswith(("http://127.0.0.1:", "http://localhost:")):
            raise AppiumError("Appium must listen on localhost")
        self.url = url.rstrip("/")
        self.session: str | None = None

    def call(self, method: str, path: str, payload: dict | None = None, timeout: int = 45,
             raw: bool = False):
        data = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(
            self.url + path, data=data, method=method,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            try:
                detail = json.loads(error.read().decode("utf-8", "replace"))
                message = str((detail.get("value") or {}).get("message") or detail.get("error") or error.reason)
            except (ValueError, AttributeError):
                message = str(error.reason)
            raise AppiumError(f"Appium {method} {path} failed: {message[:300]}") from error
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            raise AppiumError(f"Appium {method} {path} failed: {error}") from error
        if not isinstance(result, dict) or (isinstance(result.get("value"), dict) and result["value"].get("error")):
            message = result.get("value", {}).get("message", "Invalid Appium response") if isinstance(result, dict) else "Invalid Appium response"
            raise AppiumError(str(message)[:300])
        return result if raw else result.get("value")

    def open(self, udid: str, bundle_id: str) -> None:
        capabilities = {
            "platformName": "iOS", "appium:automationName": "XCUITest",
            "appium:udid": udid, "appium:bundleId": bundle_id,
            "appium:noReset": True, "appium:autoLaunch": True,
            "appium:newCommandTimeout": 180,
        }
        org_id = os.environ.get("IOS_XCODE_ORG_ID")
        if org_id:
            capabilities["appium:xcodeOrgId"] = org_id
            capabilities["appium:xcodeSigningId"] = "iPhone Developer"
        result = self.call("POST", "/session", {"capabilities": {"alwaysMatch": capabilities}},
                           timeout=240, raw=True)
        # W3C servers put the ID beside `value`; Appium may also include it in value.
        session_id = result.get("sessionId") or (result.get("value") or {}).get("sessionId")
        if session_id:
            self.session = str(session_id)
        else:
            raise AppiumError("Appium did not return a session ID")

    def end(self) -> None:
        if self.session:
            try:
                self.call("DELETE", f"/session/{self.session}", timeout=20)
            except AppiumError:
                pass
            self.session = None

    def execute(self, script: str, args: list | None = None):
        return self.call("POST", f"/session/{self.session}/execute/sync", {"script": script, "args": args or []})

    def screenshot(self) -> bytes:
        value = self.call("GET", f"/session/{self.session}/screenshot")
        try:
            image = base64.b64decode(value, validate=True)
        except (ValueError, TypeError) as error:
            raise AppiumError("Appium returned an invalid screenshot") from error
        if not image.startswith(b"\x89PNG"):
            raise AppiumError("Appium returned a non-PNG screenshot")
        return image

    def source(self) -> str:
        value = self.call("GET", f"/session/{self.session}/source")
        if not isinstance(value, str):
            raise AppiumError("Appium returned invalid accessibility source")
        return value

    def active_bundle(self) -> str:
        value = self.execute("mobile: activeAppInfo")
        return str(value.get("bundleId", "")) if isinstance(value, dict) else ""

    def activate(self, bundle_id: str) -> None:
        self.execute("mobile: activateApp", [{"bundleId": bundle_id}])

    def tap(self, x: int, y: int) -> None:
        actions = [{"type": "pointer", "id": "finger1", "parameters": {"pointerType": "touch"},
                    "actions": [{"type": "pointerMove", "duration": 0, "x": x, "y": y},
                                {"type": "pointerDown", "button": 0},
                                {"type": "pause", "duration": 80},
                                {"type": "pointerUp", "button": 0}]}]
        self.call("POST", f"/session/{self.session}/actions", {"actions": actions})
        self.call("DELETE", f"/session/{self.session}/actions")


def visible_controls(source: str) -> tuple[str, list[dict]]:
    try:
        root = ET.fromstring(source)
    except ET.ParseError as error:
        raise AppiumError("Invalid iOS accessibility tree") from error
    controls = []
    signature = []
    for element in root.iter():
        kind = element.tag
        label = (element.get("label") or element.get("name") or "").strip()
        if label and element.get("visible", "true") != "false":
            signature.append((kind, label[:100]))
        if kind not in ACTION_TYPES or not label or element.get("enabled", "true") == "false" or BLOCKED.search(label):
            continue
        try:
            x, y, width, height = (int(float(element.get(key, "0"))) for key in ("x", "y", "width", "height"))
        except ValueError:
            continue
        if width < 2 or height < 2 or x < 0 or y < 0:
            continue
        controls.append({"label": label[:120], "kind": kind, "x": x + width // 2,
                         "y": y + height // 2, "bounds": [x, y, width, height]})
    digest = hashlib.sha256(json.dumps(signature[:180], ensure_ascii=False).encode()).hexdigest()[:20]
    return digest, controls


def stop_signal(_number, _frame) -> None:
    global STOP
    STOP = True


def run(session: Path, udid: str, bundle_id: str, max_actions: int) -> int:
    session.mkdir(parents=True, exist_ok=True)
    screenshots = session / "screenshots"
    screenshots.mkdir(exist_ok=True)
    state_path = session / "ios_capture_state.json"
    status_path = session / "ios_status.json"
    try:
        state = json.loads(state_path.read_text())
    except (OSError, ValueError):
        state = {"schema": 1, "screens": [], "visited_actions": [], "transitions": [], "actions": 0}
    visited = set(state.get("visited_actions", []))
    seen_screens = {screen["signature"] for screen in state.get("screens", [])}
    client = None
    reason = "Capture paused before iOS coverage could be verified"
    outcome = "needs_review"
    external_recoveries = 0
    root_signature = state.get("root_signature")
    restart_count = 0
    start_actions = state["actions"]
    try:
        atomic_json(status_path, {"state": "running", "phase": "connecting", "updated_at": utc_now()})
        client = Appium(os.environ.get("IOS_APPIUM_URL", "http://127.0.0.1:4723"))
        client.open(udid, bundle_id)
        print(f"iOS session connected to {udid}; bundle {bundle_id}", flush=True)
        while not STOP and state["actions"] - start_actions < max_actions:
            active = client.active_bundle()
            image = client.screenshot()
            frame = session / "latest_frame.png"
            frame_tmp = session / ".latest_frame.png.tmp"
            frame_tmp.write_bytes(image)
            os.replace(frame_tmp, frame)
            source = client.source()
            source_signature, controls = visible_controls(source)
            signature = hashlib.sha256(f"{active}:{source_signature}".encode()).hexdigest()[:20]
            if signature not in seen_screens:
                name = f"ios_s{len(state['screens']) + 1:04d}.png"
                (screenshots / name).write_bytes(image)
                state["screens"].append({"name": name, "signature": signature,
                                         "active_bundle": active, "captured_at": utc_now(),
                                         "labels": [control["label"] for control in controls[:50]]})
                seen_screens.add(signature)
                print(f"Captured {name}: {len(controls)} safe controls", flush=True)
            state["active_bundle"] = active
            if active == bundle_id and not root_signature:
                root_signature = signature
                state["root_signature"] = signature
            atomic_json(state_path, state)
            atomic_json(status_path, {"state": "running", "phase": "exploring", "updated_at": utc_now(),
                                      "coverage": {"screenshots": len(state["screens"]),
                                                   "actions": state["actions"], "capture_status": "partial",
                                                   "audit_status": "pending"}})
            if active != bundle_id:
                external_recoveries += 1
                if external_recoveries > 2:
                    reason = f"Could not return from {active or 'unknown app'} to the target app"
                    break
                print(f"External screen {active or 'unknown'} captured; returning to {bundle_id}", flush=True)
                client.activate(bundle_id)
                time.sleep(1)
                continue
            external_recoveries = 0
            choice = next((control for control in controls if
                           (key := f"{signature}:{control['kind']}:{control['label']}:{control['bounds']}") not in visited), None)
            if not choice:
                if signature != root_signature and restart_count < 3:
                    restart_count += 1
                    print("No safe controls remain; returning to the app entry screen", flush=True)
                    client.execute("mobile: terminateApp", [{"bundleId": bundle_id}])
                    client.activate(bundle_id)
                    time.sleep(1)
                    continue
                reason = "No unvisited safe controls remain on the current screen; coverage needs review"
                break
            key = f"{signature}:{choice['kind']}:{choice['label']}:{choice['bounds']}"
            visited.add(key)
            state["visited_actions"].append(key)
            state["actions"] += 1
            state["transitions"].append({"from": signature, "action": "tap", "target": choice["label"],
                                         "at": utc_now()})
            atomic_json(state_path, state)
            print(f"Action {state['actions']}: tap {choice['label'][:80]}", flush=True)
            client.tap(choice["x"], choice["y"])
            time.sleep(1)
        if STOP:
            outcome, reason = "paused", "Operator requested a checkpointed stop"
        elif state["actions"] - start_actions >= max_actions:
            reason = "Action budget reached; review coverage before resuming"
    except (AppiumError, OSError, ValueError) as error:
        reason = str(error)[:300]
    finally:
        if client:
            client.end()
        atomic_json(state_path, state)
        atomic_json(status_path, {"state": outcome, "reason": reason, "updated_at": utc_now(),
                                  "coverage": {"screenshots": len(state["screens"]),
                                               "actions": state["actions"], "capture_status": "partial",
                                               "audit_status": "pending"}})
        print(f"iOS capture {outcome}: {reason}", flush=True)
    return 0 if outcome == "paused" else 2


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", type=Path, required=True)
    parser.add_argument("--udid", required=True)
    parser.add_argument("--bundle-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--max-actions", type=int, default=120)
    args = parser.parse_args()
    if args.run_id != os.environ.get("NORTHSTAR_CAPTURE_RUN_ID") or args.max_actions < 1:
        parser.error("Invalid run identity or action budget")
    signal.signal(signal.SIGINT, stop_signal)
    signal.signal(signal.SIGTERM, stop_signal)
    return run(args.session, args.udid, args.bundle_id, args.max_actions)


if __name__ == "__main__":
    sys.exit(main())
