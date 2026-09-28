#!/usr/bin/env python3
"""Supervise one resumable MobileSpy capture without claiming partial work is done.

The launcher starts one supervisor per emulator. Credentials remain inherited
from the operator's terminal; this process never stores or prints them.
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from play_install import InstallBlocked, ensure_installed

SPY_SCRIPT = Path(os.environ.get("MOBILESPY_SCRIPT", "./spy_mobile2.5.py")).expanduser().resolve()
SPY_ROOT = SPY_SCRIPT.parent
SPY_PYTHON = os.environ.get("MOBILESPY_PYTHON", sys.executable)
STOP_REQUESTED = False
CHILD: subprocess.Popen | None = None


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    os.replace(temp, path)


def _manifest(session: Path) -> dict:
    try:
        value = json.loads((session / "session_manifest.json").read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def _snapshot(session: Path) -> dict:
    manifest = _manifest(session)
    summary = manifest.get("stabilization_summary") or {}
    audit = manifest.get("unattended_audit") or {}
    try:
        detailed_audit = json.loads((session / "unattended_audit.json").read_text())
    except (OSError, ValueError):
        detailed_audit = {}
    pending = detailed_audit.get("pending_obligations") or []
    graph = detailed_audit.get("graph_summary") or {}
    manifest_audit_status = audit.get("status")
    detailed_audit_status = detailed_audit.get("status")
    audit_status = ("partial" if manifest_audit_status and detailed_audit_status
                    and manifest_audit_status != detailed_audit_status else
                    manifest_audit_status or detailed_audit_status or "unknown")
    deferred = summary.get("unverified_destinations") or []
    topbars = summary.get("incomplete_topbars") or []
    partial = summary.get("partial_captures") or []
    pngs = len(list((session / "screenshots").glob("*.png")))
    return {
        "capture_status": summary.get("status", "unknown"),
        "audit_status": audit_status,
        "pending_obligations": max(len(pending), int(audit.get("pending", 0) or 0)),
        "terminal_obligations": int(graph.get("complete_or_terminal", 0) or 0),
        "unverified_destinations": len(deferred),
        "incomplete_topbars": len(topbars),
        "partial_captures": len(partial),
        "screenshots": pngs,
        "device_failures": len(manifest.get("device_failures") or []),
    }


def _structural_progress(before: dict, after: dict) -> bool:
    if after["capture_status"] == "finished" and after["audit_status"] == "complete":
        return True
    return (after["terminal_obligations"] > before["terminal_obligations"]
            or after["pending_obligations"] < before["pending_obligations"]
            or after["partial_captures"] < before["partial_captures"]
            or after["unverified_destinations"] < before["unverified_destinations"]
            or after["incomplete_topbars"] < before["incomplete_topbars"])


def _progress(before: dict, after: dict) -> bool:
    # Allow a newly captured screen to earn one further pass, but require
    # structural coverage to improve before continuing indefinitely.
    return _structural_progress(before, after) or after["screenshots"] > before["screenshots"]


def _signal_child(_signum, _frame) -> None:
    global STOP_REQUESTED
    STOP_REQUESTED = True
    if CHILD is not None and CHILD.poll() is None:
        CHILD.send_signal(signal.SIGINT)


def supervise(app: str, session: Path, max_passes: int) -> int:
    global CHILD
    status_file = session / "capture_supervisor_status.json"
    log_file = session / "launch.log"
    serial = os.environ.get("MOBILESPY_DEVICE_SERIAL", "")
    package = os.environ.get("MOBILESPY_PACKAGE_NAME", "")
    adb = os.environ.get("CAPTURE_ADB", "adb")
    if not serial or not package:
        _atomic_json(status_file, {"app": app, "state": "needs_review",
                                   "reason": "Device serial or package name is missing",
                                   "updated_at": _utc_now(), "coverage": _snapshot(session)})
        return 2

    def install_report(phase: str, message: str) -> None:
        _atomic_json(status_file, {"app": app, "state": "provisioning",
                                   "phase": phase, "reason": message,
                                   "updated_at": _utc_now(), "coverage": _snapshot(session)})
        print(f"📦 {app}: {message}", flush=True)

    try:
        ensure_installed(adb, serial, package, app, install_report,
                         lambda: STOP_REQUESTED)
    except InstallBlocked as exc:
        state = "paused" if exc.state == "paused" else "needs_review"
        _atomic_json(status_file, {"app": app, "state": state, "phase": exc.state,
                                   "reason": exc.reason, "updated_at": _utc_now(),
                                   "coverage": _snapshot(session)})
        print(f"📦 {app}: {exc.reason}", flush=True)
        return 0 if state == "paused" else 2

    prior_crash = None
    screenshot_only_passes = 0
    history = []
    for number in range(1, max_passes + 1):
        if STOP_REQUESTED:
            break
        before = _snapshot(session)
        log_offset = log_file.stat().st_size if log_file.exists() else 0
        state = {"app": app, "state": "running", "pass": number,
                 "max_passes": max_passes, "updated_at": _utc_now(),
                 "coverage": before, "history": history}
        _atomic_json(status_file, state)
        print(f"\n🧭 SUPERVISOR {app}: pass {number}/{max_passes}; "
              f"{before['screenshots']} saved screens; {before['pending_obligations']} pending", flush=True)
        CHILD = subprocess.Popen(
            [SPY_PYTHON, "-u", str(SPY_SCRIPT)], cwd=SPY_ROOT,
            stdin=subprocess.DEVNULL,
        )
        returncode = CHILD.wait()
        CHILD = None
        after = _snapshot(session)
        try:
            with log_file.open("rb") as handle:
                handle.seek(log_offset)
                new_log = handle.read().decode("utf-8", "replace")
        except FileNotFoundError:
            new_log = ""
        crash = next((line.strip() for line in new_log.splitlines()
                      if "SCRIPT CRASHED:" in line), None)
        paused = ("MOBILESPY PAUSED:" in new_log
                  or after["device_failures"] > before["device_failures"])
        changed = _progress(before, after)
        structural = _structural_progress(before, after)
        screenshot_only_passes = (0 if structural else screenshot_only_passes + 1)
        history.append({"pass": number, "exit_code": returncode,
                        "started_with": before, "ended_with": after,
                        "progress": changed, "structural_progress": structural,
                        "crash": crash, "finished_at": _utc_now()})
        if STOP_REQUESTED:
            state_name, reason = "paused", "operator requested stop"
        elif (after["screenshots"] > 0 and after["capture_status"] == "finished"
              and after["audit_status"] == "complete"
              and not any(after[key] for key in ("pending_obligations", "unverified_destinations",
                                                   "incomplete_topbars", "partial_captures"))):
            state_name, reason = "complete", "evidence-backed coverage audit complete"
        elif paused:
            state_name, reason = "needs_review", "provider or Android device paused the worker"
        elif crash and crash == prior_crash:
            state_name, reason = "needs_review", "same script exception repeated after resume"
        elif not changed:
            state_name, reason = "needs_review", "no new evidence or reduced coverage debt"
        elif screenshot_only_passes >= 2:
            state_name, reason = "needs_review", "screens grew twice without structural coverage improving"
        elif number == max_passes:
            state_name, reason = "needs_review", "supervised pass budget reached with coverage still partial"
        else:
            state_name, reason = "resuming", "pass added evidence; continuing saved session"
        state.update(state=state_name, reason=reason, updated_at=_utc_now(),
                     coverage=after, history=history)
        _atomic_json(status_file, state)
        print(f"🧭 SUPERVISOR {app}: {state_name} — {reason}; "
              f"{after['screenshots']} saved screens; "
              f"{after['pending_obligations']} pending", flush=True)
        if state_name != "resuming":
            return 0 if state_name in ("complete", "paused") else 2
        prior_crash = crash
        time.sleep(3)
    state = {"app": app, "state": "paused", "reason": "operator requested stop",
             "updated_at": _utc_now(), "coverage": _snapshot(session), "history": history}
    _atomic_json(status_file, state)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", required=True)
    parser.add_argument("--session", type=Path, required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--max-passes", type=int, default=12)
    args = parser.parse_args()
    if args.max_passes < 1:
        parser.error("--max-passes must be positive")
    if os.environ.get("NORTHSTAR_CAPTURE_RUN_ID") != args.run_id:
        parser.error("Run ID does not match the runner environment")
    signal.signal(signal.SIGINT, _signal_child)
    signal.signal(signal.SIGTERM, _signal_child)
    return supervise(args.app, args.session, args.max_passes)


if __name__ == "__main__":
    raise SystemExit(main())
