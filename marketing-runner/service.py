"""Single-worker social capture service. Browser state and credentials stay on this host."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen
from zoneinfo import ZoneInfo

from publisher import publish_snapshot, validate_feed

ROOT = Path(os.environ.get("NORTHSTAR_MARKETING_DATA_ROOT", "/var/lib/northstar/marketing"))
AGENTS = Path(__file__).resolve().parent / "agents"
TOKEN = os.environ.get("NORTHSTAR_MARKETING_RUNNER_TOKEN", "")
LOCK = threading.RLock()
ACTIVE = threading.Event()
TARGETS = ROOT / "targets.json"
RUNS = ROOT / "runs.json"
MAX_LOG_BYTES = 300_000
SOCIAL_HOSTS = {"linkedin": {"linkedin.com"}, "twitter": {"x.com", "twitter.com"}, "instagram": {"instagram.com"}}
CDP_URL = os.environ.get("NORTHSTAR_MARKETING_CDP_URL", "http://127.0.0.1:9222").rstrip("/")


def linkedin_browser_connected() -> bool:
    try:
        with urlopen(f"{CDP_URL}/json/version", timeout=1) as response:
            return response.status == 200
    except Exception:
        return False


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False))
    temporary.replace(path)


def safe_id(value: str) -> bool:
    return bool(re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", value or "", re.I))


def validate_target(body: dict) -> dict:
    name = str(body.get("app_name", "")).strip()
    tenant = str(body.get("tenant_id", "")).strip()
    if not re.fullmatch(r"[\w][\w .&+()-]{0,79}", name, re.UNICODE) or not safe_id(tenant):
        raise ValueError("Choose an app and organization")
    socials = body.get("socials", {})
    if not isinstance(socials, dict):
        raise ValueError("Invalid social profiles")
    normalized = {}
    for platform, value in socials.items():
        if platform not in SOCIAL_HOSTS or not value:
            continue
        parsed = urlparse(str(value).strip())
        hostname = (parsed.hostname or "").lower()
        if parsed.scheme != "https" or parsed.username or parsed.password or not any(hostname == host or hostname.endswith("." + host) for host in SOCIAL_HOSTS[platform]):
            raise ValueError(f"Use a valid {platform} profile URL")
        normalized[platform] = parsed._replace(query="", fragment="").geturl()
    if not normalized:
        raise ValueError("Add at least one verified social profile")
    cadence = body.get("cadence", "off")
    if cadence not in {"off", "daily", "weekly", "monthly"}:
        raise ValueError("Invalid schedule")
    hour = int(body.get("hour", 9))
    minute = int(body.get("minute", 0))
    weekday = int(body.get("weekday", 0))
    monthday = int(body.get("monthday", 1))
    if not 0 <= hour <= 23 or not 0 <= minute <= 59 or not 0 <= weekday <= 6 or not 1 <= monthday <= 28:
        raise ValueError("Invalid schedule time")
    zone = str(body.get("timezone", "UTC"))
    try:
        ZoneInfo(zone)
    except Exception as error:
        raise ValueError("Invalid timezone") from error
    return {"id": f"{tenant}:{name.casefold()}", "tenant_id": tenant, "app_name": name,
            "socials": normalized, "cadence": cadence, "hour": hour, "minute": minute,
            "weekday": weekday, "monthday": monthday, "timezone": zone,
            "updated_at": now()}


def public_target(target: dict) -> dict:
    return dict(target)


def public_run(run: dict) -> dict:
    return {key: value for key, value in run.items() if key != "work_dir"}


def next_due(target: dict, after: datetime) -> datetime | None:
    if target["cadence"] == "off":
        return None
    zone = ZoneInfo(target["timezone"])
    local = after.astimezone(zone)
    for day_offset in range(0, 370):
        day = local.date() + timedelta(days=day_offset)
        if target["cadence"] == "weekly" and day.weekday() != target["weekday"]:
            continue
        if target["cadence"] == "monthly" and day.day != target["monthday"]:
            continue
        candidate = datetime(day.year, day.month, day.day, target["hour"], target["minute"], tzinfo=zone)
        if candidate.astimezone(timezone.utc) > after:
            return candidate.astimezone(timezone.utc)
    return None


def queue_run(target_id: str, kind: str, trigger: str) -> dict:
    with LOCK:
        targets = read_json(TARGETS, {})
        if target_id not in targets:
            raise ValueError("Unknown marketing target")
        if kind not in {"research", "snapshot"}:
            raise ValueError("Unknown run type")
        runs = read_json(RUNS, {})
        if any(run["target_id"] == target_id and run["status"] in {"queued", "running"} for run in runs.values()):
            raise ValueError("This app already has an active social run")
        run_id = str(uuid.uuid4())
        run = {"id": run_id, "target_id": target_id, "kind": kind, "trigger": trigger,
               "status": "queued", "created_at": now(), "started_at": None, "finished_at": None,
               "coverage": {}, "post_count": 0, "snapshot_id": None, "error": None,
               "work_dir": str(ROOT / "runs" / run_id)}
        runs[run_id] = run
        write_json(RUNS, runs)
        return public_run(run)


def record(run_id: str, **fields):
    with LOCK:
        runs = read_json(RUNS, {})
        runs[run_id].update(fields)
        write_json(RUNS, runs)


def sanitized_line(line: str) -> str:
    for secret in (TOKEN, os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""), os.environ.get("NORTHSTAR_MARKETING_GEMINI_KEYS", "")):
        if secret:
            line = line.replace(secret, "[redacted]")
    return re.sub(r"(?i)(api[_-]?key|authorization|cookie|password|token)([=: ]+)[^\s]+", r"\1\2[redacted]", line)


def run_script(script: str, env: dict, log_path: Path, timeout: int):
    with log_path.open("a") as output:
        process = subprocess.Popen([sys.executable, "-u", str(AGENTS / script)], cwd=ROOT, env=env,
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        expired = threading.Event()
        def stop_on_timeout():
            expired.set()
            process.kill()
        timer = threading.Timer(timeout, stop_on_timeout)
        timer.start()
        try:
            for line in process.stdout:
                output.write(sanitized_line(line))
                output.flush()
                if output.tell() > MAX_LOG_BYTES:
                    process.kill()
                    raise RuntimeError("Run log exceeded safety limit")
            if expired.is_set():
                raise TimeoutError(f"{script} exceeded its time budget")
            if process.wait(timeout=5) != 0:
                raise RuntimeError(f"{script} failed; inspect run log")
        finally:
            timer.cancel()
            if process.poll() is None:
                process.kill()


def perform(run: dict):
    target = read_json(TARGETS, {}).get(run["target_id"])
    if not target:
        raise RuntimeError("Target was removed")
    work = Path(run["work_dir"])
    work.mkdir(parents=True, exist_ok=True)
    log = work / "run.log"
    roster = ROOT / "rosters" / target["tenant_id"] / f"{target['app_name'].casefold()}.json"
    roster.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.update({"NORTHSTAR_MARKETING_COMPANY": target["app_name"],
                "NORTHSTAR_MARKETING_SOCIALS_JSON": json.dumps(target["socials"]),
                "NORTHSTAR_MARKETING_ROSTER_FILE": str(roster),
                "NORTHSTAR_MARKETING_RESEARCH_DIR": str(work / "research"),
                "NORTHSTAR_MARKETING_OUTPUT_DIR": str(work / "capture"),
                "NORTHSTAR_MARKETING_BROWSER_DIR": str(ROOT / "browser" / "shared-social"),
                "PYTHONUNBUFFERED": "1"})
    with log.open("a") as output:
        output.write(f"[{now()}] {run['kind']} started for {target['app_name']}\n")
    if run["kind"] == "research" or not roster.exists():
        run_script("social_researcher.py", env, log, 420)
        if not roster.exists():
            raise RuntimeError("Researcher did not produce a roster")
    if run["kind"] == "research":
        people = read_json(roster, [])
        count = max(0, len(people) - 1)
        blocked = bool(target["socials"].get("linkedin")) and count == 0
        record(run["id"], status="needs_review" if blocked else "completed", finished_at=now(), roster_count=count,
               error="LinkedIn people could not be verified; only the official brand profiles were saved." if blocked else None)
        return
    run_script("social_monitor.py", env, log, 420)
    feed_path = work / "capture" / "master_feed.json"
    records = read_json(feed_path, [])
    validated, coverage = validate_feed(records, work / "capture", target["socials"])
    record(run["id"], coverage=coverage, post_count=len(validated))
    if not validated:
        record(run["id"], status="needs_review", finished_at=now(),
               error="No valid screenshot-backed posts were captured. Nothing was published.")
        return
    snapshot_id = publish_snapshot(target, run["id"], validated, work / "capture")
    record(run["id"], status="completed", finished_at=now(), snapshot_id=snapshot_id)


def scheduler():
    ROOT.mkdir(parents=True, exist_ok=True)
    while True:
        try:
            with LOCK:
                targets = read_json(TARGETS, {})
                runs = read_json(RUNS, {})
                current = datetime.now(timezone.utc)
                schedule_changed = False
                for target in targets.values():
                    due = target.get("next_due_at")
                    if target["cadence"] != "off" and due and datetime.fromisoformat(due) <= current:
                        if not any(r["target_id"] == target["id"] and r["status"] in {"queued", "running"} for r in runs.values()):
                            queue_run(target["id"], "snapshot", "schedule")
                            runs = read_json(RUNS, {})
                        target["next_due_at"] = next_due(target, current).isoformat()
                        schedule_changed = True
                if schedule_changed:
                    write_json(TARGETS, targets)
                queued = sorted((r for r in runs.values() if r["status"] == "queued"), key=lambda r: r["created_at"])
            if queued and not ACTIVE.is_set():
                ACTIVE.set()
                run = queued[0]
                try:
                    record(run["id"], status="running", started_at=now())
                    perform(run)
                except Exception as error:
                    record(run["id"], status="failed", finished_at=now(), error=str(error)[:300])
                finally:
                    ACTIVE.clear()
        except Exception as error:
            print(f"scheduler error: {str(error)[:200]}", flush=True)
        time.sleep(3)


class Handler(BaseHTTPRequestHandler):
    def reply(self, status: int, payload):
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self) -> bool:
        import hmac
        return bool(TOKEN) and hmac.compare_digest(self.headers.get("Authorization", ""), f"Bearer {TOKEN}")

    def do_GET(self):
        if not self.authorized():
            return self.reply(401, {"error": "Unauthorized"})
        path = self.path.split("?", 1)[0].strip("/").split("/")
        if path == ["v1", "status"]:
            return self.reply(200, {"status": "online", "active": ACTIVE.is_set(),
                                    "linkedin_browser_connected": linkedin_browser_connected(),
                                    "platform_signin_verified": False})
        if path == ["v1", "targets"]:
            return self.reply(200, {"targets": [public_target(t) for t in read_json(TARGETS, {}).values()]})
        if path == ["v1", "runs"]:
            runs = sorted(read_json(RUNS, {}).values(), key=lambda r: r["created_at"], reverse=True)
            return self.reply(200, {"runs": [public_run(r) for r in runs[:100]]})
        if len(path) == 4 and path[:2] == ["v1", "runs"] and path[3] == "logs" and safe_id(path[2]):
            run = read_json(RUNS, {}).get(path[2])
            if not run:
                return self.reply(404, {"error": "Run not found"})
            log = Path(run["work_dir"]) / "run.log"
            return self.reply(200, {"log": log.read_text()[-MAX_LOG_BYTES:] if log.exists() else ""})
        return self.reply(404, {"error": "Not found"})

    def do_POST(self):
        if not self.authorized():
            return self.reply(401, {"error": "Unauthorized"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size > 20_000:
                raise ValueError("Request too large")
            body = json.loads(self.rfile.read(size) or b"{}")
            path = self.path.strip("/").split("/")
            if path == ["v1", "targets"]:
                target = validate_target(body)
                with LOCK:
                    targets = read_json(TARGETS, {})
                    previous = targets.get(target["id"])
                    target["next_due_at"] = next_due(target, datetime.now(timezone.utc)).isoformat() if target["cadence"] != "off" else None
                    targets[target["id"]] = target
                    write_json(TARGETS, targets)
                if previous and previous["socials"] != target["socials"]:
                    roster = ROOT / "rosters" / target["tenant_id"] / f"{target['app_name'].casefold()}.json"
                    roster.unlink(missing_ok=True)
                return self.reply(200, {"target": public_target(target)})
            if path == ["v1", "runs"]:
                return self.reply(201, {"run": queue_run(str(body.get("target_id", "")), str(body.get("kind", "snapshot")), "manual")})
            raise ValueError("Unknown action")
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            return self.reply(400, {"error": str(error)})


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("NORTHSTAR_MARKETING_RUNNER_TOKEN is required")
    ROOT.mkdir(parents=True, exist_ok=True)
    # Interrupted work is inspectable and may be retried explicitly; never imply it completed.
    runs = read_json(RUNS, {})
    for run in runs.values():
        if run["status"] == "running":
            run.update(status="interrupted", finished_at=now(), error="Service restarted during capture")
    write_json(RUNS, runs)
    threading.Thread(target=scheduler, daemon=True).start()
    ThreadingHTTPServer((os.environ.get("NORTHSTAR_MARKETING_BIND", "127.0.0.1"),
                         int(os.environ.get("NORTHSTAR_MARKETING_PORT", "8790"))), Handler).serve_forever()
