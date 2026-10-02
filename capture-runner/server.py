"""Northstar's host-side MobileSpy control service.

Runs on the Android host, not in Next.js. Only the authenticated admin API
should call it. The host owns ADB, MobileSpy credentials and capture files.
"""

from __future__ import annotations

import json
import hashlib
import os
import re
import signal
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from capture_progress import build_progress


ROOT = Path(os.environ.get("CAPTURE_DATA_ROOT", "./capture-data")).expanduser().resolve()
SCRIPT = Path(os.environ.get("MOBILESPY_SCRIPT", "./spy_mobile2.5.py")).expanduser().resolve()
SUPERVISOR = Path(__file__).with_name("supervisor.py")
ONBOARDING_SCRIPT = Path(os.environ.get("ONBOARDING_SCRIPT", "./onboarding_mobile2.py")).expanduser().resolve()
ONBOARDING_SUPERVISOR = Path(__file__).with_name("onboarding_supervisor.py")
ONBOARDING_PROFILE = Path(os.environ.get("ONBOARDING_IDENTITY_PROFILE", "./onboarding_identity_profile.json")).expanduser().resolve()
PYTHON = os.environ.get("MOBILESPY_PYTHON", "python3")
ONBOARDING_PYTHON = os.environ.get("ONBOARDING_PYTHON", PYTHON)
PROCESSING_PIPELINE = Path(__file__).with_name("processing_pipeline.py")
APP_STORE_RESEARCH = Path(__file__).with_name("app_store_research.py")
PLAY_STORE_RESEARCH = Path(__file__).with_name("play_store_research.py")
APP_STORE_AGENT = Path(__file__).with_name("app_store_agent_worker.py")
PROCESSING_PYTHON = os.environ.get("CAPTURE_PROCESSING_PYTHON", PYTHON)
APP_STORE_AGENT_PYTHON = os.environ.get("NORTHSTAR_APP_STORE_PYTHON", PROCESSING_PYTHON)
MAX_PASSES = int(os.environ.get("CAPTURE_MAX_PASSES", "12"))
ADB = os.environ.get("CAPTURE_ADB", "adb")
TOKEN = os.environ.get("NORTHSTAR_CAPTURE_RUNNER_TOKEN", "")
HOST = os.environ.get("CAPTURE_BIND", "127.0.0.1")
PORT = int(os.environ.get("CAPTURE_PORT", "8787"))
DEVICES = json.loads(os.environ.get("CAPTURE_DEVICES_JSON", "{}"))
EMULATOR_UNITS = json.loads(os.environ.get("CAPTURE_EMULATOR_UNITS_JSON", "{}"))
LOCK = threading.RLock()
PROCESSES: dict[str, subprocess.Popen] = {}
ID_RE = re.compile(r"^[a-f0-9-]{36}$")
PACKAGE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$")


def _restart_emulator(device_id: str) -> None:
    """Terminate a verified emulator owned by this service user; systemd restarts it."""
    serial = DEVICES.get(device_id, "")
    unit = EMULATOR_UNITS.get(device_id, "")
    if not re.fullmatch(r"emulator-\d{4}", serial) or not re.fullmatch(
        r"northstar-emulator(?:-[2-9][0-9]*)?\.service", unit
    ):
        raise ValueError("Device reboot is not configured")
    pid_text = subprocess.check_output(
        ["systemctl", "show", "--property=MainPID", "--value", unit],
        text=True, timeout=5,
    ).strip()
    if not pid_text.isdigit() or int(pid_text) <= 0:
        raise ValueError("Emulator service is not running")
    pid = int(pid_text)
    process = Path(f"/proc/{pid}")
    command = (process / "cmdline").read_bytes().split(b"\x00")
    expected_port = serial.removeprefix("emulator-").encode()
    executable = command[0] if command else b""
    if (os.stat(process).st_uid != os.geteuid()
            or not (executable == b"/opt/android-sdk/emulator/emulator"
                    or executable == b"/opt/android-sdk/emulator/qemu/linux-x86_64/qemu-system-x86_64-headless")
            or not any(command[i:i + 2] == [b"-port", expected_port]
                       for i in range(len(command) - 1))):
        raise ValueError("Emulator process identity could not be verified")
    os.kill(pid, signal.SIGTERM)


def _registry_path() -> Path:
    return ROOT / "runs.json"


def _read_runs() -> dict:
    try:
        data = json.loads(_registry_path().read_text())
        return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _write_json(path: Path, value: dict) -> None:
    temp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    with temp.open("w") as file:
        json.dump(value, file, indent=2)
        file.write("\n")
        file.flush()
        os.fsync(file.fileno())
    os.replace(temp, path)


def _write_runs(runs: dict) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    temp = ROOT / f".runs-{uuid.uuid4().hex}.tmp"
    with temp.open("w") as file:
        file.write(json.dumps(runs, indent=2) + "\n")
        file.flush()
        os.fsync(file.fileno())
    os.replace(temp, _registry_path())


def _run_dir(run_id: str) -> Path:
    if not ID_RE.fullmatch(run_id):
        raise ValueError("Invalid run ID")
    return ROOT / run_id


def _pipeline_worker_alive(run_id: str, pid: object) -> bool:
    try:
        command = Path(f"/proc/{int(pid)}/cmdline").read_bytes().replace(b"\x00", b" ")
        return (b"processing_pipeline.py" in command and run_id.encode() in command)
    except (OSError, TypeError, ValueError):
        return False


def _pipeline_status(run: dict) -> dict:
    session = _run_dir(run["id"])
    result = _json_file(session / "processing_pipeline.json")
    result.setdefault("stage", "not_started")
    if result["stage"] == "queued" and time.time() - float(result.get("queued_at") or 0) > 60:
        result.update(stage="failed", error="Processing worker did not start")
    if result["stage"] in ("preparing", "preprocessing", "flow_generation") and not _pipeline_worker_alive(
            run["id"], result.get("worker_pid")):
        result.update(stage="failed", error="Processing worker stopped before its final checkpoint")
    result["capture_status"] = _status(run)["status"]
    result["can_prepare"] = (run.get("scope") == "browsing"
                             and result["capture_status"] in ("complete", "finished_early"))
    result["audit_status"] = result.get("audit_status") or _json_file(
        session / "unattended_audit.json").get("status") or "unknown"
    result["saved_checkpoints"] = len(list((session / "enriched").glob("step_*_enriched.json")))
    store = _app_store_status(session, run["id"])
    result["app_store"] = store or {"stage": "not_started"}
    taxonomy = _json_file(session / "flows/flows.json")
    def leaves(nodes):
        for node in nodes:
            children = node.get("children") or []
            if children:
                yield from leaves(children)
            elif node.get("spine") or node.get("branches"):
                yield node
    result["lanes"] = [{"name": lane.get("label") or lane.get("subview") or "Flow",
                        "root": root.get("label") or "App",
                        "screens": lane.get("screen_count") or 0,
                        "main_screens": len(lane.get("spine") or []),
                        "branches": len(lane.get("branches") or []),
                        "first_screen": next((Path(item).name for item in
                            (lane.get("spine") or []) + [screen
                                for branch in lane.get("branches") or []
                                if isinstance(branch, dict)
                                for screen in branch.get("screenshots") or []]
                            if isinstance(item, str) and re.fullmatch(r"[A-Za-z0-9_.-]+\.png", Path(item).name)), None)}
                       for root in taxonomy.get("taxonomy") or [] if isinstance(root, dict)
                       for lane in leaves(root.get("children") or []) if isinstance(lane, dict)]
    return result


def _app_store_worker_alive(session: Path, run_id: str, store: dict) -> bool:
    """The PID is separate so a fast worker cannot have its result overwritten."""
    try:
        pid_file = session / "app_store_worker.pid"
        pid = int(pid_file.read_text() if pid_file.is_file() else store.get("worker_pid"))
        command = Path(f"/proc/{pid}/cmdline").read_bytes()
        return ((b"app_store_research.py" in command or b"play_store_research.py" in command
                 or b"app_store_agent_worker.py" in command)
                and run_id.encode() in command)
    except (OSError, TypeError, ValueError):
        return False


def _app_store_status(session: Path, run_id: str) -> dict:
    path = session / "app_store_research.json"
    store = _json_file(path)
    if (store.get("stage") == "researching"
            and time.time() - float(store.get("started_unix") or 0) > 15
            and not _app_store_worker_alive(session, run_id, store)):
        store.update(stage="failed", error="App Store research worker stopped before completion")
        _write_json(path, store)
    return store


def _spawn_pipeline_worker(run_id: str, action: str) -> None:
    session = _run_dir(run_id)
    command = [PROCESSING_PYTHON, "-u", str(PROCESSING_PIPELINE),
               "--session", str(session), "--" + action]
    with (session / "processing_pipeline.log").open("ab") as log:
        subprocess.Popen(command, cwd=PROCESSING_PIPELINE.parent,
                         env=os.environ.copy(), stdout=log,
                         stderr=subprocess.STDOUT, start_new_session=True,
                         stdin=subprocess.DEVNULL)


def _recover_processing_once() -> None:
    """Resume checkpointed processing after a host restart or killed worker."""
    with LOCK:
        for run_id, run in _read_runs().items():
            if run.get("scope") != "browsing" or run.get("status") not in ("complete", "finished_early"):
                continue
            session = _run_dir(run_id)
            status_path = session / "processing_pipeline.json"
            state = _json_file(status_path)
            stage = state.get("stage")
            if stage not in ("queued", "preparing", "preprocessing", "flow_generation"):
                continue
            if _pipeline_worker_alive(run_id, state.get("worker_pid")):
                continue
            if stage == "queued" and time.time() - float(state.get("queued_at") or 0) < 60:
                continue
            retries = int(state.get("automatic_restarts") or 0)
            if retries >= 3:
                _write_json(status_path, {**state, "stage": "failed", "worker_pid": None,
                                          "error": "Processing worker stopped after three automatic restarts"})
                continue
            action = "prepare" if stage == "preparing" else "run"
            resumed = {**state, "stage": "queued", "worker_pid": None,
                       "queued_at": time.time(), "automatic_restarts": retries + 1,
                       "error": None}
            _write_json(status_path, resumed)
            try:
                _spawn_pipeline_worker(run_id, action)
            except (OSError, subprocess.SubprocessError) as exc:
                _write_json(status_path, {**resumed, "stage": "failed",
                                          "error": f"Could not restart processing worker: {exc}"})


def _processing_watchdog() -> None:
    while True:
        try:
            _recover_processing_once()
        except (OSError, ValueError, TypeError) as exc:
            print(f"Processing recovery check failed: {exc}", file=sys.stderr)
        time.sleep(30)


def _publication_files(run: dict) -> dict:
    """Expose only reviewed derived evidence, never arbitrary run files."""
    session = _run_dir(run["id"]).resolve()
    pipeline = _json_file(session / "processing_pipeline.json")
    if pipeline.get("stage") != "ready_for_review":
        raise ValueError("Finish and verify screen processing before delivery")
    manifest = _json_file(session / "enriched/enriched_manifest.json")
    entries = manifest.get("enriched_screenshots") or []
    if not entries or len(entries) != pipeline.get("canonical_screens"):
        raise ValueError("Processed screenshots do not match the canonical count")
    files = {"browsing/enriched/enriched_manifest.json",
             "browsing/enriched/session_intelligence.json",
             "browsing/enriched/flows.json",
             "browsing/flows/flows.json"}
    for item in entries:
        if not isinstance(item, dict):
            raise ValueError("Invalid enriched screenshot entry")
        screenshot = Path(str(item.get("screenshot") or "")).name
        enriched = str(item.get("enriched_file") or "")
        if not re.fullmatch(r"[\w.-]+\.png", screenshot) or not re.fullmatch(
                r"[\w.-]+\.json", enriched):
            raise ValueError("Unsafe screenshot or analysis path")
        files.add("browsing/screenshots/" + screenshot)
        files.add("browsing/enriched/" + enriched)
    store = _json_file(session / "app_store_research.json")
    if store.get("stage") == "ready_for_review":
        listing = _json_file(session / "app_store/app_store_manifest.json")
        if not listing or not (listing.get("track_id") or listing.get("package_id")):
            raise ValueError("Official listing manifest is missing its identity")
        files.add("app_store/app_store_manifest.json")
        source_file = ("agent_manifest.json" if (session / "app_store/agent_manifest.json").is_file()
                       else "itunes_lookup.json" if listing.get("track_id") else "play_listing.json")
        files.add("app_store/" + source_file)
        asset_paths = [listing.get("icons", {}).get("app_icon")]
        asset_paths.extend(listing.get("screenshots", {}).get("carousel") or [])
        asset_paths.extend(item.get("icon_path") for item in listing.get("raw_data", {}).get("competitors") or []
                           if isinstance(item, dict) and item.get("icon_path"))
        for relative in asset_paths:
            if not isinstance(relative, str) or not re.fullmatch(r"(?:icons|screenshots)/[A-Za-z0-9_.-]+\.(?:png|jpg|jpeg)", relative):
                raise ValueError("Official listing contains an unsafe asset path")
            files.add("app_store/" + relative)
    elif store.get("stage") not in ("not_started", None):
        raise ValueError("App Store research is not ready")
    file_list = []
    for relative in sorted(files):
        path = (session / relative.removeprefix("browsing/")).resolve() if relative.startswith("browsing/") else (session / relative).resolve()
        if not path.is_file() or not path.is_relative_to(session):
            raise ValueError(f"Missing publication artifact: {relative}")
        stat = path.stat()
        file_list.append({"path": relative, "bytes": stat.st_size, "mtime_ns": stat.st_mtime_ns})
    cache_path = session / "publication_artifacts.json"
    cached = _json_file(cache_path)
    if cached.get("file_stats") == file_list and isinstance(cached.get("artifacts"), dict):
        return cached["artifacts"]
    hashes = []
    for item in file_list:
        relative = item["path"]
        path = session / relative.removeprefix("browsing/") if relative.startswith("browsing/") else session / relative
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        hashes.append({"path": relative, "bytes": item["bytes"], "sha256": digest.hexdigest()})
    manifest_hash = hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest()
    result = {"files": hashes, "fingerprint": manifest_hash,
            "canonical_screens": len(entries), "audit_status": pipeline.get("audit_status"),
            "app_store": store if store.get("stage") == "ready_for_review" else {"stage": "not_started"}}
    _write_json(cache_path, {"file_stats": file_list, "artifacts": result})
    return result


def _generated_flow_summary(run: dict) -> dict:
    session = _run_dir(run["id"])
    if _json_file(session / "processing_pipeline.json").get("stage") != "ready_for_review":
        raise ValueError("Generated flows are not ready for review")
    flows = _json_file(session / "enriched/flows.json")
    catalog = flows.get("screen_catalog") or []
    roots = flows.get("taxonomy") or []
    if not isinstance(catalog, list) or not catalog or not isinstance(roots, list) or not roots:
        raise ValueError("Generated flow map is missing")

    def screen_name(indices: list) -> str | None:
        for index in indices:
            if isinstance(index, int) and 1 <= index <= len(catalog) and isinstance(catalog[index - 1], dict):
                name = Path(str(catalog[index - 1].get("screenshot_file") or "")).name
                if re.fullmatch(r"[A-Za-z0-9_.-]+\.png", name):
                    return name
        return None

    def summarize(node: dict) -> dict:
        children = [summarize(child) for child in node.get("children") or [] if isinstance(child, dict)]
        indices = node.get("screens") if isinstance(node.get("screens"), list) else []
        first = screen_name(indices) or next((child["first_screen"] for child in children if child["first_screen"]), None)
        return {"label": str(node.get("label") or "Flow")[:120],
                "description": str(node.get("description") or "")[:600],
                "screens": len(indices), "first_screen": first, "children": children,
                "is_nav_tab": bool(node.get("is_nav_tab"))}

    return {"summary": flows.get("summary") or {},
            "roots": [summarize(root) for root in roots if isinstance(root, dict)]}


def _json_file(path: Path) -> dict:
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def _sanitized_log(path: Path) -> str:
    try:
        text = path.read_text(errors="replace")
    except FileNotFoundError:
        return ""
    text = re.sub(r"sk-[A-Za-z0-9_-]{16,}", "[redacted key]", text)
    text = re.sub(r"AIza[A-Za-z0-9_-]{20,}", "[redacted key]", text)
    for name in ("ONBOARDING_PASSWORD", "OPENAI_API_KEY", "NORTHSTAR_CAPTURE_RUNNER_TOKEN",
                 "NORTHSTAR_APP_STORE_GEMINI_API_KEY"):
        secret = os.environ.get(name, "")
        if len(secret) >= 8:
            text = text.replace(secret, f"[redacted {name.lower()}]")
    return text


def _onboarding_identity_ready() -> bool:
    profile = _json_file(ONBOARDING_PROFILE)
    identity = profile.get("identity")
    email = identity.get("email") if isinstance(identity, dict) else None
    return (ONBOARDING_SCRIPT.is_file() and ONBOARDING_SUPERVISOR.is_file()
            and isinstance(email, str) and "@" in email
            and bool(os.environ.get("ONBOARDING_PASSWORD")))


def _pid_alive(pid: int | None, run_id: str) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        proc = Path(f"/proc/{pid}/environ")
        if proc.is_file():
            environ = proc.read_bytes()
            marker = f"NORTHSTAR_CAPTURE_RUN_ID={run_id}".encode()
            return marker in environ.split(b"\x00")
        # Local macOS development has no /proc. Verify both the script and
        # run ID so an unrelated process cannot inherit a stale PID.
        command = subprocess.check_output(["ps", "-p", str(pid), "-o", "command="], text=True, timeout=3)
        return "supervisor.py" in command and f"--run-id {run_id}" in command
    except (OSError, ProcessLookupError):
        return False


def _status(run: dict) -> dict:
    result = dict(run)
    run_id = result["id"]
    directory = _run_dir(run_id)
    process = PROCESSES.get(run_id)
    alive = process.poll() is None if process else _pid_alive(result.get("pid"), run_id)
    if (result["status"] == "finishing" and alive
            and time.time() - float(result.get("finish_requested_at") or 0) >= 120):
        # The requested checkpoint is best effort. A stuck agent must not
        # leave an operator-approved finish pending forever. This supervisor
        # started a new process group, which also owns its MobileSpy child.
        pid = result.get("pid")
        if _pid_alive(pid, run_id):
            try:
                if os.getpgid(pid) == pid:
                    os.killpg(pid, signal.SIGKILL)
            except (OSError, ProcessLookupError):
                pass
    if process and not alive:
        PROCESSES.pop(run_id, None)
    supervisor = _json_file(directory / "capture_supervisor_status.json")
    coverage = supervisor.get("coverage") if isinstance(supervisor.get("coverage"), dict) else {}
    if result["status"] == "finishing" and not alive:
        result["status"] = "finished_early" if result.get("scope") == "browsing" and any(
            (directory / "screenshots").glob("*.png")
        ) else "needs_review"
        result["pid"] = None
        result["updated_at"] = time.time()
    if result["status"] in ("running", "stopping") and not alive:
        if result.get("scope") == "onboarding":
            manifest = _json_file(directory / "onboarding_manifest.json")
            outcome = manifest.get("result") if isinstance(manifest.get("result"), dict) else {}
            complete = (supervisor.get("state") == "complete"
                        and str(outcome.get("status", "")).startswith("COMPLETED_")
                        and bool(outcome.get("settled_home_reached"))
                        and outcome.get("account_created") is True
                        and any((directory / "screenshots").glob("*.png")))
        else:
            complete = (supervisor.get("state") == "complete"
                        and coverage.get("capture_status") == "finished"
                        and coverage.get("audit_status") == "complete"
                        and isinstance(coverage.get("screenshots"), int)
                        and coverage["screenshots"] > 0
                        and all(coverage.get(key) == 0 for key in (
                            "pending_obligations", "unverified_destinations",
                            "incomplete_topbars", "partial_captures")))
        result["status"] = "complete" if complete else (
            "paused" if supervisor.get("state") == "paused" else "needs_review")
        result["pid"] = None
        result["updated_at"] = time.time()
    screens = directory / "screenshots"
    result["screens"] = len(list(screens.glob("*.png"))) if screens.is_dir() else 0
    result["manifest_available"] = (directory / ("onboarding_manifest.json" if result.get("scope") == "onboarding" else "session_manifest.json")).is_file()
    if result.get("scope") == "onboarding":
        manifest = _json_file(directory / "onboarding_manifest.json")
        outcome = manifest.get("result") if isinstance(manifest.get("result"), dict) else None
        if result["status"] == "complete" and outcome and outcome.get("account_created") is not True:
            result["status"] = "needs_review"
        result["onboarding_result"] = ({
            "score": outcome.get("score"),
            "signup_found": outcome.get("signup_found") is True,
            "account_created": outcome.get("account_created") is True,
            "settled_home_reached": outcome.get("settled_home_reached") is True,
        } if outcome else None)
    result["icon_available"] = ((directory / "app_store/icons/app_icon_512x512.png").is_file()
                                or (directory / "extracted_icons" / "ic_launcher_mipmap-xxxhdpi.png").is_file())
    result["app_store"] = _app_store_status(directory, run["id"])
    result["audit_status"] = _json_file(directory / "unattended_audit.json").get("status")
    result["coverage"] = coverage
    result["reason"] = supervisor.get("reason") or ("Capture process exited without a final checkpoint" if result["status"] == "needs_review" else None)
    if result["status"] == "reconnecting":
        result["reason"] = result.get("recovery_reason") or "Waiting for the assigned device before resuming the saved capture"
    elif result["status"] == "needs_review" and result.get("recovery_reason"):
        result["reason"] = result["recovery_reason"]
    if result["status"] == "finished_early":
        result["reason"] = "Finished by an admin with the saved evidence; remaining coverage is still shown for review"
    if result.get("scope") == "onboarding" and result["status"] == "needs_review" and supervisor.get("state") == "complete" and result.get("onboarding_result") and not result["onboarding_result"]["account_created"] and result["onboarding_result"]["settled_home_reached"]:
        result["reason"] = "Guest home reached, but no account was created; inspect the app's account entry"
    result["phase"] = supervisor.get("phase")
    result["pass"] = supervisor.get("pass")
    result["max_passes"] = supervisor.get("max_passes")
    result["last_activity_at"] = supervisor.get("updated_at")
    result["live"] = bool(alive)
    return result


def _launch_run(run: dict) -> None:
    """Start a saved run without clearing app data or changing its run ID."""
    run_id = run["id"]
    serial = DEVICES[run["device_id"]]
    env = os.environ.copy()
    env.update({
        "MOBILESPY_APP_NAME": run["app"],
        "MOBILESPY_PACKAGE_NAME": run["package_name"],
        "MOBILESPY_DEVICE_SERIAL": serial,
        "MOBILESPY_RESUME_SESSION_DIR": str(_run_dir(run_id)),
        "NORTHSTAR_CAPTURE_RUN_ID": run_id,
    })
    env["PATH"] = f"{Path(ADB).parent}:{env.get('PATH', '')}"
    if run["scope"] == "onboarding":
        env.update({
            "ONBOARDING_SCRIPT": str(ONBOARDING_SCRIPT),
            "ONBOARDING_IDENTITY_PROFILE": str(ONBOARDING_PROFILE),
            "ONBOARDING_PYTHON": ONBOARDING_PYTHON,
        })
        command = [PYTHON, "-u", str(ONBOARDING_SUPERVISOR),
                   "--app", run["app"], "--package", run["package_name"],
                   "--serial", serial, "--session", str(_run_dir(run_id)),
                   "--run-id", run_id]
    else:
        if ONBOARDING_PROFILE.is_file():
            env["MOBILESPY_IDENTITY_PROFILE"] = str(ONBOARDING_PROFILE)
        command = [PYTHON, "-u", str(SUPERVISOR), "--app", run["app"],
                   "--session", str(_run_dir(run_id)), "--run-id", run_id,
                   "--max-passes", str(MAX_PASSES)]
    with (_run_dir(run_id) / "launch.log").open("ab") as log:
        process = subprocess.Popen(
            command, cwd=(ONBOARDING_SCRIPT if run["scope"] == "onboarding" else SCRIPT).parent,
            env=env, stdout=log, stderr=subprocess.STDOUT,
            start_new_session=True, stdin=subprocess.DEVNULL,
        )
    PROCESSES[run_id] = process
    run.update(status="running", pid=process.pid, updated_at=time.time())
    run.pop("recovery_reason", None)


def _resume_interrupted_run(run_id: str, timeout: int = 180) -> None:
    """Wait for a rebooted device, then resume exactly the interrupted session."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with LOCK:
            runs = _read_runs()
            run = runs.get(run_id)
            if not run or run.get("status") != "reconnecting":
                return
            serial = DEVICES.get(run.get("device_id"))
            if serial and Handler._device_online(serial):
                preflight = _preflight(run, True)
                occupied = any(
                    other["id"] != run_id and other.get("device_id") == run.get("device_id")
                    and _status(other)["live"] for other in runs.values()
                )
                if preflight["ready"] and not occupied:
                    _launch_run(run)
                    _write_runs(runs)
                    return
        time.sleep(5)
    with LOCK:
        runs = _read_runs()
        run = runs.get(run_id)
        if run and run.get("status") == "reconnecting":
            run.update(status="needs_review", pid=None, updated_at=time.time(),
                       recovery_reason="Automatic reconnect timed out; saved capture is ready for manual review")
            _write_runs(runs)


def _recover_interrupted_runs() -> list[str]:
    """Queue only runs interrupted by host/service loss, never operator pauses."""
    with LOCK:
        runs = _read_runs()
        candidates = []
        changed = False
        for run in runs.values():
            if run.get("status") not in ("running", "reconnecting") or _pid_alive(
                    run.get("pid"), run["id"]):
                continue
            supervisor = _json_file(_run_dir(run["id"]) / "capture_supervisor_status.json")
            if supervisor.get("state") in ("paused", "complete", "needs_review"):
                recovered_status = ("paused" if supervisor["state"] == "paused"
                                    else "needs_review" if supervisor["state"] == "needs_review"
                                    else _status({**run, "status": "running"})["status"])
                run.update(status=recovered_status, pid=None, updated_at=time.time())
                changed = True
                continue
            attempts = int(run.get("auto_resume_attempts") or 0)
            if attempts >= 2:
                run.update(status="needs_review", pid=None, updated_at=time.time(),
                           recovery_reason="Automatic resume limit reached; inspect the saved run")
                changed = True
                continue
            run.update(status="reconnecting", pid=None, updated_at=time.time(),
                       auto_resume_attempts=attempts + 1,
                       recovery_reason="Capture host restarted; waiting to resume the saved session")
            candidates.append(run["id"])
            changed = True
        if changed:
            _write_runs(runs)
    return candidates


def _installed(serial: str, package: str) -> bool:
    try:
        output = subprocess.check_output(
            [ADB, "-s", serial, "shell", "pm", "path", package],
            timeout=20, text=True, stderr=subprocess.DEVNULL,
        )
        return output.startswith("package:")
    except (subprocess.SubprocessError, OSError):
        return False


def _device_property(serial: str, name: str) -> str:
    try:
        return subprocess.check_output(
            [ADB, "-s", serial, "shell", "getprop", name],
            timeout=8, text=True, stderr=subprocess.DEVNULL,
        ).strip()
    except (subprocess.SubprocessError, OSError):
        return ""


def _launchable(serial: str, package: str) -> bool:
    try:
        output = subprocess.check_output(
            [ADB, "-s", serial, "shell", "cmd", "package", "resolve-activity",
             "--brief", package], timeout=12, text=True, stderr=subprocess.DEVNULL,
        )
        return package in output and "No activity found" not in output
    except (subprocess.SubprocessError, OSError):
        return False


def _preflight(run: dict, online: bool) -> dict:
    serial = DEVICES.get(run["device_id"])
    installed = bool(online and serial and _installed(serial, run["package_name"]))
    booted = bool(online and serial and _device_property(serial, "sys.boot_completed") == "1")
    launchable = bool(installed and _launchable(serial, run["package_name"]))
    play_store = bool(online and serial and _installed(serial, "com.android.vending"))
    onboarding = run.get("scope") == "onboarding"
    script_ready = _onboarding_identity_ready() if onboarding else (SCRIPT.is_file() and SUPERVISOR.is_file())
    return {
        "online": online, "booted": booted, "installed": installed, "launchable": launchable,
        "play_store": play_store,
        "ready": bool(booted and (launchable if installed else play_store)
                      and script_ready),
        "model": _device_property(serial, "ro.product.model") if online and serial else "",
        "api_level": _device_property(serial, "ro.build.version.sdk") if online and serial else "",
        "abi": _device_property(serial, "ro.product.cpu.abi") if online and serial else "",
        "reason": ("Device offline" if not online else "Device is still booting" if not booted
                   else "Onboarding agent or host-side identity is not configured" if onboarding and not script_ready
                   else "MobileSpy runtime not installed" if not script_ready
                   else "App is installed but has no launchable activity" if installed and not launchable
                   else "Google Play Store is unavailable on this device" if not installed and not play_store else None),
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "NorthstarCapture/1"

    def _send(self, status: int, data: object) -> None:
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _binary(self, body: bytes, mime: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool:
        if not TOKEN or self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self._send(401, {"error": "Unauthorized"})
            return False
        return True

    def _parts(self) -> list[str]:
        return [p for p in urlparse(self.path).path.split("/") if p]

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length < 0 or length > 16384:
            raise ValueError("Request body too large")
        data = json.loads(self.rfile.read(length)) if length else {}
        if not isinstance(data, dict):
            raise ValueError("Expected JSON object")
        return data

    def do_GET(self) -> None:
        if not self._authorized():
            return
        parts = self._parts()
        if parts == ["health"]:
            online = sum(self._device_online(serial) for serial in DEVICES.values())
            configured = SCRIPT.is_file() and SUPERVISOR.is_file() and bool(DEVICES)
            return self._send(200, {
                "status": "ready" if configured and online else "waiting_for_device" if configured else "incomplete",
                "devices": len(DEVICES), "online_devices": online,
                "mobilespy_installed": SCRIPT.is_file(),
                "supervisor_installed": SUPERVISOR.is_file(),
                "onboarding_installed": ONBOARDING_SCRIPT.is_file() and ONBOARDING_SUPERVISOR.is_file(),
                "onboarding_identity_configured": _onboarding_identity_ready(),
            })
        if parts == ["v1", "devices"]:
            return self._send(200, {"devices": [
                {"id": key, "serial": value, "online": self._device_online(value),
                 "reboot_available": key in EMULATOR_UNITS}
                for key, value in DEVICES.items()
            ]})
        if parts == ["v1", "runs"]:
            with LOCK:
                runs = _read_runs()
                values = [_status(run) for run in runs.values()]
                for run in values:
                    runs[run["id"]].update({k: run[k] for k in ("status", "pid", "updated_at")})
                _write_runs(runs)
            return self._send(200, {"runs": sorted(values, key=lambda r: r["created_at"], reverse=True)})
        if len(parts) >= 3 and parts[:2] == ["v1", "runs"] and ID_RE.fullmatch(parts[2]):
            with LOCK:
                run = _read_runs().get(parts[2])
            if not run:
                return self._send(404, {"error": "Run not found"})
            if len(parts) == 3:
                return self._send(200, {"run": _status(run)})
            if len(parts) == 4 and parts[3] == "progress":
                if run.get("scope") != "browsing":
                    return self._send(409, {"error": "Navigation progress is available for browsing captures"})
                return self._send(200, {"progress": build_progress(_run_dir(parts[2]), active=_status(run)["live"])})
            if len(parts) == 4 and parts[3] == "pipeline":
                if run.get("scope") != "browsing":
                    return self._send(409, {"error": "Processing is available for browsing captures"})
                return self._send(200, {"pipeline": _pipeline_status(run)})
            if len(parts) == 5 and parts[3:] == ["pipeline", "logs"]:
                if run.get("scope") != "browsing":
                    return self._send(409, {"error": "Processing is available for browsing captures"})
                return self._send(200, {"lines": _sanitized_log(
                    _run_dir(parts[2]) / "processing_pipeline.log").splitlines()[-120:]})
            if len(parts) == 5 and parts[3:] == ["pipeline", "app-store"]:
                return self._send(200, {"app_store": _json_file(
                    _run_dir(parts[2]) / "app_store_research.json")})
            if len(parts) == 6 and parts[3:] == ["pipeline", "app-store", "logs"]:
                return self._send(200, {"lines": _sanitized_log(
                    _run_dir(parts[2]) / "app_store_research.log").splitlines()[-120:]})
            if len(parts) == 5 and parts[3:] == ["pipeline", "artifacts"]:
                try:
                    return self._send(200, {"artifacts": _publication_files(run)})
                except ValueError as exc:
                    return self._send(409, {"error": str(exc)})
            if len(parts) == 5 and parts[3:] == ["pipeline", "flow-summary"]:
                try:
                    return self._send(200, {"flows": _generated_flow_summary(run)})
                except ValueError as exc:
                    return self._send(409, {"error": str(exc)})
            if (len(parts) >= 6 and parts[3:5] == ["pipeline", "artifact"]):
                try:
                    allowed = {item["path"] for item in _publication_files(run)["files"]}
                    relative = "/".join(unquote(part) for part in parts[5:])
                    if relative not in allowed:
                        return self._send(404, {"error": "Artifact not found"})
                    path = (_run_dir(parts[2]) / relative.removeprefix("browsing/")).resolve() if relative.startswith("browsing/") else (_run_dir(parts[2]) / relative).resolve()
                    mime = "image/png" if path.suffix == ".png" else "image/jpeg" if path.suffix in (".jpg", ".jpeg") else "application/json"
                    return self._binary(path.read_bytes(), mime)
                except ValueError as exc:
                    return self._send(409, {"error": str(exc)})
            if len(parts) == 4 and parts[3] == "preflight":
                serial = DEVICES.get(run["device_id"])
                return self._send(200, {"preflight": _preflight(run, bool(serial and self._device_online(serial)))})
            if len(parts) == 4 and parts[3] == "icon":
                icon = _run_dir(parts[2]) / "app_store/icons/app_icon_512x512.png"
                if not icon.is_file():
                    icon = _run_dir(parts[2]) / "extracted_icons" / "ic_launcher_mipmap-xxxhdpi.png"
                if not icon.is_file():
                    return self._send(404, {"error": "App icon not found"})
                return self._binary(icon.read_bytes(), "image/png")
            if len(parts) == 4 and parts[3] == "screens":
                screen_dir = _run_dir(parts[2]) / "screenshots"
                names = sorted(p.name for p in screen_dir.glob("*.png") if p.is_file()) if screen_dir.is_dir() else []
                return self._send(200, {"screens": names})
            if (len(parts) == 5 and parts[3] == "screens"
                    and re.fullmatch(r"[A-Za-z0-9_.-]+\.png", parts[4])
                    and ".." not in parts[4]):
                screen = _run_dir(parts[2]) / "screenshots" / parts[4]
                if not screen.is_file():
                    return self._send(404, {"error": "Screen not found"})
                return self._binary(screen.read_bytes(), "image/png")
            if len(parts) == 4 and parts[3] == "logs":
                return self._send(200, {"lines": _sanitized_log(_run_dir(parts[2]) / "launch.log").splitlines()[-120:]})
            if len(parts) == 5 and parts[3:] == ["logs", "download"]:
                log = _sanitized_log(_run_dir(parts[2]) / "launch.log")
                return self._binary(log.encode("utf-8"), "text/plain; charset=utf-8")
            if len(parts) == 4 and parts[3] == "frame":
                if not _status(run)["live"]:
                    return self._send(409, {"error": "Run is not active"})
                serial = DEVICES.get(run["device_id"])
                if not serial or not self._device_online(serial):
                    return self._send(503, {"error": "Device offline"})
                try:
                    frame = subprocess.check_output(
                        [ADB, "-s", serial, "exec-out", "screencap", "-p"], timeout=15
                    )
                    if not frame.startswith(b"\x89PNG"):
                        raise ValueError("Invalid screenshot")
                    return self._binary(frame, "image/png")
                except (subprocess.SubprocessError, OSError, ValueError):
                    return self._send(503, {"error": "Frame unavailable"})
        self._send(404, {"error": "Not found"})

    @staticmethod
    def _device_online(serial: str) -> bool:
        try:
            return subprocess.check_output(
                [ADB, "-s", serial, "get-state"], timeout=8,
                text=True, stderr=subprocess.DEVNULL,
            ).strip() == "device"
        except (subprocess.SubprocessError, OSError):
            return False

    def do_POST(self) -> None:
        if not self._authorized():
            return
        try:
            body = self._body()
            parts = self._parts()
            if parts == ["v1", "runs"]:
                return self._create(body)
            if (len(parts) == 4 and parts[:2] == ["v1", "devices"]
                    and parts[3] == "reboot"):
                return self._reboot_device(parts[2])
            if (len(parts) == 4 and parts[:2] == ["v1", "runs"]
                    and ID_RE.fullmatch(parts[2]) and parts[3] in ("start", "stop", "finish")):
                return self._change(parts[2], parts[3])
            if (len(parts) == 5 and parts[:2] == ["v1", "runs"]
                    and ID_RE.fullmatch(parts[2]) and parts[3] == "pipeline"
                    and parts[4] in ("prepare", "run")):
                return self._start_pipeline(parts[2], parts[4])
            if (len(parts) == 5 and parts[:2] == ["v1", "runs"]
                    and ID_RE.fullmatch(parts[2]) and parts[3:] == ["pipeline", "app-store"]):
                return self._start_app_store(parts[2], body)
            return self._send(404, {"error": "Not found"})
        except (ValueError, KeyError) as exc:
            return self._send(400, {"error": str(exc)})

    def _create(self, body: dict) -> None:
        name = str(body.get("app", "")).strip()
        package = str(body.get("package_name", "")).strip()
        organization_id = str(body.get("organization_id", "")).strip()
        device_id = str(body.get("device_id", "")).strip()
        scope = str(body.get("scope", "browsing")).lower()
        track_id = body.get("app_store_track_id")
        if (not name or len(name) > 100 or not PACKAGE_RE.fullmatch(package)
                or device_id not in DEVICES
                or scope not in ("onboarding", "browsing")):
            raise ValueError("Invalid app, package, organization, device or scope")
        if track_id is not None and (type(track_id) is not int or track_id <= 0):
            raise ValueError("Select the official App Store listing before creating a new capture")
        run_id = str(uuid.uuid4())
        run = {"id": run_id, "app": name, "package_name": package,
               "organization_id": organization_id, "device_id": device_id,
               "scope": scope, "status": "queued", "pid": None,
               "app_store_track_id": track_id, "app_store_required": True,
               "created_at": time.time(), "updated_at": time.time()}
        with LOCK:
            runs = _read_runs()
            runs[run_id] = run
            _run_dir(run_id).mkdir(parents=True, exist_ok=False)
            _write_runs(runs)
            try:
                self._launch_app_store(run, track_id)
            except ValueError as exc:
                status_path = _run_dir(run_id) / "app_store_research.json"
                if _json_file(status_path).get("stage") != "failed":
                    _write_json(status_path, {"stage": "failed", "error": str(exc)})
        self._send(201, {"run": _status(run)})

    def _launch_app_store(self, run: dict, track_id: int | None) -> dict:
        script = (APP_STORE_AGENT if run.get("app_store_required")
                  else APP_STORE_RESEARCH if track_id is not None else PLAY_STORE_RESEARCH)
        python = APP_STORE_AGENT_PYTHON if script == APP_STORE_AGENT else PROCESSING_PYTHON
        if not script.is_file() or not Path(python).is_file():
            raise ValueError("App Store research worker is not installed")
        session = _run_dir(run["id"])
        previous = _json_file(session / "app_store_research.json")
        if previous.get("stage") == "researching" and _app_store_worker_alive(session, run["id"], previous):
            raise ValueError("App Store research is already running")
        command = (["/usr/bin/timeout", "--signal=TERM", "--kill-after=10s", "45m"]
                   if script == APP_STORE_AGENT else []) + [python, "-u", str(script),
                   "--session", str(session), "--app", run["app"]]
        if script == APP_STORE_AGENT:
            command += ["--package", run["package_name"]]
        else:
            command += ["--track-id", str(track_id)] if track_id is not None else ["--package", run["package_name"]]
        status = {"stage": "researching", "track_id": track_id,
                  "package_id": run["package_name"] if track_id is None else None,
                  "started_unix": time.time()}
        _write_json(session / "app_store_research.json", status)
        try:
            with (session / "app_store_research.log").open("ab") as log:
                child = subprocess.Popen(command, cwd=APP_STORE_RESEARCH.parent,
                                         env=os.environ.copy(), stdout=log,
                                         stderr=subprocess.STDOUT, start_new_session=True,
                                         stdin=subprocess.DEVNULL)
            (session / "app_store_worker.pid").write_text(str(child.pid))
        except (OSError, subprocess.SubprocessError) as exc:
            _write_json(session / "app_store_research.json", {
                **status, "stage": "failed", "error": f"Could not start listing research: {exc}"})
            raise ValueError("Could not start App Store research worker") from exc
        return status

    def _start_pipeline(self, run_id: str, action: str) -> None:
        with LOCK:
            run = _read_runs().get(run_id)
            if not run:
                return self._send(404, {"error": "Run not found"})
            pipeline = _pipeline_status(run)
            if not pipeline["can_prepare"]:
                return self._send(409, {"error": "Finish the browsing capture before processing"})
            if pipeline["stage"] in ("queued", "preparing", "preprocessing", "flow_generation"):
                return self._send(409, {"error": "This capture is already processing"})
            if not PROCESSING_PIPELINE.is_file() or not Path(PROCESSING_PYTHON).is_file():
                return self._send(503, {"error": "Processing worker is not installed"})
            if action == "run" and pipeline["stage"] not in (
                    "prepared", "failed", "ready_for_review"):
                return self._send(409, {"error": "Prepare and review the canonical flow map first"})
            if action == "prepare" and pipeline["stage"] == "ready_for_review":
                return self._send(409, {"error": "This capture already has processed flows"})
            session = _run_dir(run_id)
            _write_json(session / "processing_pipeline.json", {
                **_json_file(session / "processing_pipeline.json"),
                "stage": "queued", "queued_at": time.time(),
                "automatic_restarts": 0, "error": None,
            })
            _spawn_pipeline_worker(run_id, action)
            return self._send(202, {"pipeline": _pipeline_status(run)})

    def _start_app_store(self, run_id: str, body: dict) -> None:
        track_id = body.get("track_id")
        if track_id is not None and (type(track_id) is not int or track_id <= 0):
            raise ValueError("Select an App Store listing")
        with LOCK:
            run = _read_runs().get(run_id)
            if not run:
                return self._send(404, {"error": "Run not found"})
            if _status(run)["status"] not in ("queued", "complete", "finished_early"):
                return self._send(409, {"error": "Pause or finish the capture before changing its listing"})
            if run.get("app_store_required") and track_id is not None:
                return self._send(409, {"error": "New captures run the original Apple App Store research agent automatically"})
            return self._send(202, {"app_store": self._launch_app_store(run, track_id)})

    def _reboot_device(self, device_id: str) -> None:
        if device_id not in DEVICES:
            return self._send(404, {"error": "Device not found"})
        with LOCK:
            for run in _read_runs().values():
                if run["device_id"] == device_id and _status(run)["live"]:
                    return self._send(409, {"error": "Pause the active run before rebooting its device"})
            try:
                _restart_emulator(device_id)
            except (ValueError, OSError, subprocess.SubprocessError) as exc:
                return self._send(503, {"error": str(exc)})
        self._send(202, {"device_id": device_id, "status": "restarting"})

    def _change(self, run_id: str, action: str) -> None:
        with LOCK:
            runs = _read_runs()
            run = runs.get(run_id)
            if not run:
                return self._send(404, {"error": "Run not found"})
            state = _status(run)
            serial = DEVICES.get(run["device_id"])
            if action == "start":
                if state["live"]:
                    return self._send(409, {"error": "Run already active"})
                if state["status"] in ("complete", "finished_early", "finishing"):
                    return self._send(409, {"error": "Completed runs cannot be restarted"})
                if run.get("app_store_required") and _json_file(_run_dir(run_id) / "app_store_research.json").get("stage") != "ready_for_review":
                    return self._send(409, {"error": "Finish App Store research before starting the capture"})
                preflight = _preflight(run, bool(serial and self._device_online(serial)))
                if not preflight["ready"]:
                    return self._send(409, {"error": preflight["reason"], "preflight": preflight})
                for other in runs.values():
                    if other["id"] != run_id and other["device_id"] == run["device_id"] and _status(other)["live"]:
                        return self._send(409, {"error": "Device is occupied by another run"})
                _launch_run(run)
            elif action == "finish":
                if run.get("scope") != "browsing":
                    return self._send(409, {"error": "Finish with evidence is available for browsing captures"})
                if state["status"] in ("complete", "finished_early", "finishing", "stopping"):
                    return self._send(409, {"error": "Run is already finished"})
                if not any((_run_dir(run_id) / "screenshots").glob("*.png")):
                    return self._send(409, {"error": "Save at least one screen before finishing"})
                if state["live"]:
                    try:
                        os.kill(run["pid"], signal.SIGINT)
                    except ProcessLookupError:
                        return self._send(409, {"error": "Capture process already exited; retry after status refresh"})
                    run.update(status="finishing", finish_requested_at=time.time(), updated_at=time.time())
                else:
                    run.update(status="finished_early", pid=None,
                               finish_requested_at=time.time(), updated_at=time.time())
            else:
                if not state["live"]:
                    return self._send(409, {"error": "Run is not active"})
                # The supervisor forwards SIGINT to MobileSpy and waits for
                # its final checkpoint before recording paused state.
                try:
                    os.kill(run["pid"], signal.SIGINT)
                except ProcessLookupError:
                    return self._send(409, {"error": "Capture process already exited"})
                run.update(status="stopping", updated_at=time.time())
            _write_runs(runs)
            self._send(200, {"run": _status(run)})


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("NORTHSTAR_CAPTURE_RUNNER_TOKEN is required")
    if not isinstance(DEVICES, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in DEVICES.items()
    ):
        raise SystemExit("CAPTURE_DEVICES_JSON must map device names to ADB serials")
    ROOT.mkdir(parents=True, exist_ok=True)
    print(f"Northstar capture runner listening on {HOST}:{PORT} with {len(DEVICES)} device(s)")
    interrupted = _recover_interrupted_runs()
    service = ThreadingHTTPServer((HOST, PORT), Handler)
    for run_id in interrupted:
        threading.Thread(target=_resume_interrupted_run, args=(run_id,), daemon=True).start()
    threading.Thread(target=_processing_watchdog, daemon=True).start()
    service.serve_forever()
