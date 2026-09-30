"""Northstar's host-side MobileSpy control service.

Runs on the Android host, not in Next.js. Only the authenticated admin API
should call it. The host owns ADB, MobileSpy credentials and capture files.
"""

from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(os.environ.get("CAPTURE_DATA_ROOT", "./capture-data")).expanduser().resolve()
SCRIPT = Path(os.environ.get("MOBILESPY_SCRIPT", "./spy_mobile2.5.py")).expanduser().resolve()
SUPERVISOR = Path(__file__).with_name("supervisor.py")
ONBOARDING_SCRIPT = Path(os.environ.get("ONBOARDING_SCRIPT", "./onboarding_mobile2.py")).expanduser().resolve()
ONBOARDING_SUPERVISOR = Path(__file__).with_name("onboarding_supervisor.py")
ONBOARDING_PROFILE = Path(os.environ.get("ONBOARDING_IDENTITY_PROFILE", "./onboarding_identity_profile.json")).expanduser().resolve()
PYTHON = os.environ.get("MOBILESPY_PYTHON", "python3")
ONBOARDING_PYTHON = os.environ.get("ONBOARDING_PYTHON", PYTHON)
MAX_PASSES = int(os.environ.get("CAPTURE_MAX_PASSES", "12"))
ADB = os.environ.get("CAPTURE_ADB", "adb")
TOKEN = os.environ.get("NORTHSTAR_CAPTURE_RUNNER_TOKEN", "")
HOST = os.environ.get("CAPTURE_BIND", "127.0.0.1")
PORT = int(os.environ.get("CAPTURE_PORT", "8787"))
DEVICES = json.loads(os.environ.get("CAPTURE_DEVICES_JSON", "{}"))
LOCK = threading.RLock()
PROCESSES: dict[str, subprocess.Popen] = {}
ID_RE = re.compile(r"^[a-f0-9-]{36}$")
PACKAGE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$")


def _registry_path() -> Path:
    return ROOT / "runs.json"


def _read_runs() -> dict:
    try:
        data = json.loads(_registry_path().read_text())
        return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


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
    for name in ("ONBOARDING_PASSWORD", "OPENAI_API_KEY", "NORTHSTAR_CAPTURE_RUNNER_TOKEN"):
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
    if process and not alive:
        PROCESSES.pop(run_id, None)
    supervisor = _json_file(directory / "capture_supervisor_status.json")
    coverage = supervisor.get("coverage") if isinstance(supervisor.get("coverage"), dict) else {}
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
    result["icon_available"] = (directory / "extracted_icons" / "ic_launcher_mipmap-xxxhdpi.png").is_file()
    result["audit_status"] = _json_file(directory / "unattended_audit.json").get("status")
    result["coverage"] = coverage
    result["reason"] = supervisor.get("reason") or ("Capture process exited without a final checkpoint" if result["status"] == "needs_review" else None)
    if result.get("scope") == "onboarding" and result["status"] == "needs_review" and supervisor.get("state") == "complete" and result.get("onboarding_result") and not result["onboarding_result"]["account_created"] and result["onboarding_result"]["settled_home_reached"]:
        result["reason"] = "Guest home reached, but no account was created; inspect the app's account entry"
    result["phase"] = supervisor.get("phase")
    result["pass"] = supervisor.get("pass")
    result["max_passes"] = supervisor.get("max_passes")
    result["last_activity_at"] = supervisor.get("updated_at")
    result["live"] = bool(alive)
    return result


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
                {"id": key, "serial": value, "online": self._device_online(value)}
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
            if len(parts) == 4 and parts[3] == "preflight":
                serial = DEVICES.get(run["device_id"])
                return self._send(200, {"preflight": _preflight(run, bool(serial and self._device_online(serial)))})
            if len(parts) == 4 and parts[3] == "icon":
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
            if (len(parts) == 4 and parts[:2] == ["v1", "runs"]
                    and ID_RE.fullmatch(parts[2]) and parts[3] in ("start", "stop")):
                return self._change(parts[2], parts[3])
            return self._send(404, {"error": "Not found"})
        except (ValueError, KeyError) as exc:
            return self._send(400, {"error": str(exc)})

    def _create(self, body: dict) -> None:
        name = str(body.get("app", "")).strip()
        package = str(body.get("package_name", "")).strip()
        organization_id = str(body.get("organization_id", "")).strip()
        device_id = str(body.get("device_id", "")).strip()
        scope = str(body.get("scope", "browsing")).lower()
        if (not name or len(name) > 100 or not PACKAGE_RE.fullmatch(package)
                or device_id not in DEVICES
                or scope not in ("onboarding", "browsing")):
            raise ValueError("Invalid app, package, organization, device or scope")
        run_id = str(uuid.uuid4())
        run = {"id": run_id, "app": name, "package_name": package,
               "organization_id": organization_id, "device_id": device_id,
               "scope": scope, "status": "queued", "pid": None,
               "created_at": time.time(), "updated_at": time.time()}
        with LOCK:
            runs = _read_runs()
            runs[run_id] = run
            _run_dir(run_id).mkdir(parents=True, exist_ok=False)
            _write_runs(runs)
        self._send(201, {"run": _status(run)})

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
                if state["status"] == "complete":
                    return self._send(409, {"error": "Completed runs cannot be restarted"})
                preflight = _preflight(run, bool(serial and self._device_online(serial)))
                if not preflight["ready"]:
                    return self._send(409, {"error": preflight["reason"], "preflight": preflight})
                for other in runs.values():
                    if other["id"] != run_id and other["device_id"] == run["device_id"] and _status(other)["live"]:
                        return self._send(409, {"error": "Device is occupied by another run"})
                env = os.environ.copy()
                env.update({
                    "MOBILESPY_APP_NAME": run["app"],
                    "MOBILESPY_PACKAGE_NAME": run["package_name"],
                    "MOBILESPY_DEVICE_SERIAL": serial,
                    "MOBILESPY_RESUME_SESSION_DIR": str(_run_dir(run_id)),
                    "NORTHSTAR_CAPTURE_RUN_ID": run_id,
                })
                # Both agents invoke `adb` directly. The service's restricted
                # PATH need not contain the Android SDK on its own.
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
                        command, cwd=(ONBOARDING_SCRIPT if run["scope"] == "onboarding" else SCRIPT).parent, env=env,
                        stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
                        stdin=subprocess.DEVNULL,
                    )
                PROCESSES[run_id] = process
                run.update(status="running", pid=process.pid, updated_at=time.time())
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
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
