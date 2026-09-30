#!/usr/bin/env python3
"""Mac-hosted real-iPhone runner for Northstar Admin capture jobs.

It accepts only server-to-server bearer-authenticated requests. The public
browser talks to the existing admin proxy, never to Appium or this process.
"""

from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(os.environ.get("IOS_CAPTURE_DATA_ROOT", "./ios-capture-data")).expanduser().resolve()
DEVICES = json.loads(os.environ.get("IOS_CAPTURE_DEVICES_JSON", "{}"))
TOKEN = os.environ.get("NORTHSTAR_IOS_RUNNER_TOKEN", "")
HOST = os.environ.get("IOS_CAPTURE_BIND", "127.0.0.1")
PORT = int(os.environ.get("IOS_CAPTURE_PORT", "8788"))
APPIUM = os.environ.get("IOS_APPIUM_URL", "http://127.0.0.1:4723")
WORKER = Path(__file__).with_name("ios_agent.py")
MAX_ACTIONS = int(os.environ.get("IOS_CAPTURE_MAX_ACTIONS", "120"))
LOCK = threading.RLock()
PROCESSES: dict[str, subprocess.Popen] = {}
RUN_ID = re.compile(r"^[a-f0-9-]{36}$")
BUNDLE_ID = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$")
SCREEN_NAME = re.compile(r"^ios_s[0-9]{4,}\.png$")


def _registry() -> Path:
    return ROOT / "runs.json"


def _runs() -> dict:
    try:
        value = json.loads(_registry().read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def _save_runs(runs: dict) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    path = ROOT / f".runs-{uuid.uuid4().hex}.tmp"
    with path.open("w") as stream:
        json.dump(runs, stream, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(path, _registry())


def _directory(run_id: str) -> Path:
    if not RUN_ID.fullmatch(run_id):
        raise ValueError("Invalid run ID")
    return ROOT / run_id


def _json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def _pid_alive(pid: int | None, run_id: str) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        command = subprocess.check_output(["ps", "-p", str(pid), "-o", "command="],
                                          timeout=3, text=True)
        return "ios_agent.py" in command and f"--run-id {run_id}" in command
    except (OSError, subprocess.SubprocessError):
        return False


def _status(run: dict) -> dict:
    result = dict(run)
    run_id = run["id"]
    process = PROCESSES.get(run_id)
    live = process.poll() is None if process else _pid_alive(run.get("pid"), run_id)
    if process and not live:
        PROCESSES.pop(run_id, None)
    report = _json(_directory(run_id) / "ios_status.json")
    if not live and run["status"] in ("running", "stopping"):
        result["status"] = "paused" if report.get("state") == "paused" else "needs_review"
        result["pid"] = None
        result["updated_at"] = time.time()
    screens = _directory(run_id) / "screenshots"
    result.update(platform="ios", live=live,
                  screens=len(list(screens.glob("ios_s*.png"))) if screens.is_dir() else 0,
                  audit_status=(report.get("coverage") or {}).get("audit_status", "pending"),
                  coverage=report.get("coverage") or {},
                  reason=report.get("reason") or ("Worker exited without a checkpoint" if result["status"] == "needs_review" else None),
                  phase=report.get("phase"), last_activity_at=report.get("updated_at"))
    return result


def _device_udid(device_id: str) -> str:
    value = DEVICES.get(device_id)
    return str(value.get("udid", "")) if isinstance(value, dict) else str(value or "")


def _device_name(device_id: str) -> str:
    value = DEVICES.get(device_id)
    return str(value.get("name", device_id)) if isinstance(value, dict) else device_id


def _devicectl(command: list[str]) -> dict:
    with tempfile.TemporaryDirectory() as directory:
        output = Path(directory) / "result.json"
        try:
            subprocess.check_output(["xcrun", "devicectl", *command, "--json-output", str(output)],
                                    timeout=20, stderr=subprocess.STDOUT)
            return _json(output)
        except (OSError, subprocess.SubprocessError):
            return {}


def _records(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _records(child)
    elif isinstance(value, list):
        for child in value:
            yield from _records(child)


def _online(udid: str) -> bool:
    if not udid:
        return False
    data = _devicectl(["list", "devices"])
    for record in _records(data):
        if udid not in (record.get("identifier"), record.get("udid"), record.get("uniqueIdentifier"),
                        (record.get("hardwareProperties") or {}).get("udid")):
            continue
        if (record.get("hardwareProperties") or {}).get("reality") != "physical":
            return False
        # A paired device can still be offline. CoreDevice's per-device query
        # must succeed before Admin offers it as a capture target.
        return bool(_devicectl(["device", "info", "apps", "--device", udid]))
    return False


def _appium_ready() -> bool:
    if not APPIUM.startswith(("http://127.0.0.1:", "http://localhost:")):
        return False
    try:
        with urllib.request.urlopen(APPIUM.rstrip("/") + "/status", timeout=5) as response:
            body = json.load(response)
        return bool((body.get("value") or {}).get("ready"))
    except (OSError, ValueError, urllib.error.URLError):
        return False


def _installed(udid: str, bundle_id: str) -> bool:
    data = _devicectl(["device", "info", "apps", "--device", udid])
    return any(bundle_id in (record.get("bundleIdentifier"), record.get("bundleID"))
               for record in _records(data))


def _preflight(run: dict) -> dict:
    udid = _device_udid(run["device_id"])
    online = _online(udid)
    installed = online and _installed(udid, run["package_name"])
    appium = _appium_ready()
    ready = bool(sys.platform == "darwin" and online and installed and appium and WORKER.is_file())
    reason = ("iOS runner must run on a Mac" if sys.platform != "darwin" else
              "Real iPhone is offline or not trusted" if not online else
              "Install this app from the iPhone App Store first" if not installed else
              "Appium/XCUITest is unavailable" if not appium else
              "iOS worker is missing" if not WORKER.is_file() else None)
    return {"platform": "ios", "online": online, "booted": online, "installed": installed,
            "launchable": installed, "play_store": False, "appium_ready": appium,
            "ready": ready, "model": _device_name(run["device_id"]),
            "api_level": "", "abi": "", "reason": reason}


class Handler(BaseHTTPRequestHandler):
    server_version = "NorthstarIOSCapture/1"

    def _send(self, status: int, value: object) -> None:
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _png(self, image: bytes) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(image)))
        self.end_headers()
        self.wfile.write(image)

    def _authorized(self) -> bool:
        if not TOKEN or self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self._send(401, {"error": "Unauthorized"})
            return False
        return True

    def _parts(self) -> list[str]:
        return [part for part in urlparse(self.path).path.split("/") if part]

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length < 0 or length > 16384:
            raise ValueError("Request body too large")
        value = json.loads(self.rfile.read(length)) if length else {}
        if not isinstance(value, dict):
            raise ValueError("Expected JSON object")
        return value

    def do_GET(self) -> None:
        if not self._authorized():
            return
        parts = self._parts()
        if parts == ["health"]:
            return self._send(200, {"status": "ready" if _appium_ready() else "waiting_for_appium",
                                    "platform": "ios", "devices": len(DEVICES)})
        if parts == ["v1", "devices"]:
            return self._send(200, {"devices": [
                {"id": key, "serial": _device_udid(key), "name": _device_name(key),
                 "platform": "ios", "online": _online(_device_udid(key))}
                for key in DEVICES]})
        if parts == ["v1", "runs"]:
            with LOCK:
                runs = _runs()
                values = [_status(run) for run in runs.values()]
                for run in values:
                    runs[run["id"]].update({key: run[key] for key in ("status", "pid", "updated_at")})
                _save_runs(runs)
            return self._send(200, {"runs": sorted(values, key=lambda run: run["created_at"], reverse=True)})
        if len(parts) < 3 or parts[:2] != ["v1", "runs"] or not RUN_ID.fullmatch(parts[2]):
            return self._send(404, {"error": "Not found"})
        with LOCK:
            run = _runs().get(parts[2])
        if not run:
            return self._send(404, {"error": "Run not found"})
        directory = _directory(parts[2])
        if len(parts) == 3:
            return self._send(200, {"run": _status(run)})
        if len(parts) == 4 and parts[3] == "preflight":
            return self._send(200, {"preflight": _preflight(run)})
        screen_dir = directory / "screenshots"
        names = sorted(path.name for path in screen_dir.glob("ios_s*.png")) if screen_dir.is_dir() else []
        if len(parts) == 4 and parts[3] == "screens":
            return self._send(200, {"screens": names})
        if len(parts) == 5 and parts[3] == "screens" and SCREEN_NAME.fullmatch(parts[4]):
            path = screen_dir / parts[4]
            return self._png(path.read_bytes()) if path.is_file() else self._send(404, {"error": "Screen not found"})
        if len(parts) == 4 and parts[3] == "frame":
            frame = directory / "latest_frame.png"
            if not frame.is_file():
                return self._send(409, {"error": "No device frame captured yet"})
            return self._png(frame.read_bytes())
        if len(parts) == 4 and parts[3] == "logs":
            try:
                with (directory / "launch.log").open("rb") as stream:
                    stream.seek(0, os.SEEK_END)
                    stream.seek(max(0, stream.tell() - 32768))
                    content = stream.read().decode("utf-8", "replace")
            except FileNotFoundError:
                content = ""
            content = re.sub(r"sk-[A-Za-z0-9_-]{16,}", "[redacted key]", content)
            return self._send(200, {"lines": content.splitlines()[-120:]})
        self._send(404, {"error": "Not found"})

    def do_POST(self) -> None:
        if not self._authorized():
            return
        try:
            parts = self._parts()
            body = self._body()
            if parts == ["v1", "runs"]:
                return self._create(body)
            if (len(parts) == 4 and parts[:2] == ["v1", "runs"]
                    and RUN_ID.fullmatch(parts[2]) and parts[3] in ("start", "stop")):
                return self._change(parts[2], parts[3])
            self._send(404, {"error": "Not found"})
        except (ValueError, KeyError) as error:
            self._send(400, {"error": str(error)})

    def _create(self, body: dict) -> None:
        app = str(body.get("app", "")).strip()
        bundle_id = str(body.get("package_name", "")).strip()
        organization = str(body.get("organization_id", "")).strip()
        device_id = str(body.get("device_id", "")).strip()
        scope = str(body.get("scope", "browsing")).lower()
        if (not app or len(app) > 100 or not BUNDLE_ID.fullmatch(bundle_id)
                or not organization or device_id not in DEVICES or scope != "browsing"):
            raise ValueError("Invalid app, bundle ID, organization, device or scope")
        run_id = str(uuid.uuid4())
        run = {"id": run_id, "app": app, "package_name": bundle_id,
               "organization_id": organization, "device_id": device_id,
               "platform": "ios", "scope": scope, "status": "queued", "pid": None,
               "created_at": time.time(), "updated_at": time.time()}
        with LOCK:
            runs = _runs()
            runs[run_id] = run
            _directory(run_id).mkdir(parents=True, exist_ok=False)
            _save_runs(runs)
        self._send(201, {"run": _status(run)})

    def _change(self, run_id: str, action: str) -> None:
        with LOCK:
            runs = _runs()
            run = runs.get(run_id)
            if not run:
                return self._send(404, {"error": "Run not found"})
            state = _status(run)
            if action == "start":
                if state["live"]:
                    return self._send(409, {"error": "Run already active"})
                preflight = _preflight(run)
                if not preflight["ready"]:
                    return self._send(409, {"error": preflight["reason"], "preflight": preflight})
                for other in runs.values():
                    if other["id"] != run_id and other["device_id"] == run["device_id"] and _status(other)["live"]:
                        return self._send(409, {"error": "iPhone is occupied by another run"})
                env = os.environ.copy()
                env["NORTHSTAR_CAPTURE_RUN_ID"] = run_id
                with (_directory(run_id) / "launch.log").open("ab") as log:
                    process = subprocess.Popen(
                        [sys.executable, "-u", str(WORKER), "--session", str(_directory(run_id)),
                         "--udid", _device_udid(run["device_id"]), "--bundle-id", run["package_name"],
                         "--run-id", run_id, "--max-actions", str(MAX_ACTIONS)],
                        cwd=WORKER.parent, env=env, stdout=log, stderr=subprocess.STDOUT,
                        start_new_session=True, stdin=subprocess.DEVNULL,
                    )
                PROCESSES[run_id] = process
                run.update(status="running", pid=process.pid, updated_at=time.time())
            else:
                if not state["live"]:
                    return self._send(409, {"error": "Run is not active"})
                try:
                    os.kill(run["pid"], signal.SIGINT)
                except ProcessLookupError:
                    return self._send(409, {"error": "Worker already exited"})
                run.update(status="stopping", updated_at=time.time())
            _save_runs(runs)
            self._send(200, {"run": _status(run)})


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("NORTHSTAR_IOS_RUNNER_TOKEN is required")
    if sys.platform != "darwin":
        raise SystemExit("Real iOS capture requires a Mac host")
    if not isinstance(DEVICES, dict) or not all(isinstance(key, str) and _device_udid(key) for key in DEVICES):
        raise SystemExit("IOS_CAPTURE_DEVICES_JSON must map names to real iPhone UDIDs")
    ROOT.mkdir(parents=True, exist_ok=True)
    print(f"Northstar iOS runner on {HOST}:{PORT} with {len(DEVICES)} configured device(s)")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
