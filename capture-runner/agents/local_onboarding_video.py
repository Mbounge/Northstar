#!/usr/bin/env python3
"""Opt-in, Mac-local onboarding motion proof. Never publishes video to Northstar.

The onboarding agent calls OnboardingBurstRecorder around device input. A reviewer
then selects real, chronological clips in an edit plan before rendering an MP4.
No synthetic screen transitions or inferred interactions are generated here.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run(argv: list[str], *, timeout: float = 15) -> subprocess.CompletedProcess:
    return subprocess.run(argv, capture_output=True, text=True, timeout=timeout)


class OnboardingBurstRecorder:
    """Record short real-device bursts without changing the agent's decisions.

    Android's screenrecord is started just before an input and stopped after a
    quiet post-roll. Closely spaced inputs remain in one clip. Text entry and
    external verification interrupt recording. Raw clips stay local and require
    human review; the edit-plan generator does not publish them automatically.
    """

    def __init__(self, session_dir: str | Path, package: str, *, context=None,
                 post_roll: float = 2.5, adb: str | None = None):
        self.session = Path(session_dir).expanduser().resolve()
        self.burst_dir = self.session / "local_video_bursts"
        self.burst_dir.mkdir(parents=True, exist_ok=True)
        self.journal = self.session / "local_video_bursts.jsonl"
        self.package = package
        self.context = context or (lambda: {})
        self.post_roll = max(0.5, float(post_roll))
        self.adb = adb or shutil.which("adb") or "adb"
        self.serial = os.environ.get("ANDROID_SERIAL", "").strip()
        self._lock = threading.RLock()
        self._timer: threading.Timer | None = None
        self._process: subprocess.Popen | None = None
        self._pid: str | None = None
        self._remote: str | None = None
        self._started_at: float | None = None
        self._actions: list[dict] = []
        self._closed = False
        self.enabled = False
        self._next_number = self._read_next_number()

    def _adb(self, *args: str) -> list[str]:
        return [self.adb, *(["-s", self.serial] if self.serial else []), *args]

    def _read_next_number(self) -> int:
        numbers = [int(match.group(1)) for path in self.burst_dir.glob("burst_*.mp4")
                   if (match := re.match(r"burst_(\d+)\.mp4$", path.name))]
        if self.journal.exists():
            for line in self.journal.read_text(encoding="utf-8").splitlines():
                try:
                    numbers.append(int(json.loads(line).get("number", 0)))
                except (ValueError, TypeError, json.JSONDecodeError):
                    continue
        return max(numbers, default=0) + 1

    def _focused_on_app(self) -> bool:
        try:
            result = _run(self._adb("shell", "dumpsys", "window"), timeout=8)
            focused = next((line for line in result.stdout.splitlines()
                            if "mCurrentFocus=" in line), "")
            return result.returncode == 0 and self.package in focused
        except (OSError, subprocess.TimeoutExpired):
            return False

    def _screenrecord_pids(self) -> set[str]:
        try:
            result = _run(self._adb("shell", "pidof", "screenrecord"), timeout=5)
            return set(re.findall(r"\b\d+\b", result.stdout)) if result.returncode == 0 else set()
        except (OSError, subprocess.TimeoutExpired):
            return set()

    @staticmethod
    def _kind(cmd: str) -> str | None:
        if re.fullmatch(r"monkey -p [A-Za-z0-9._]+ -c android\.intent\.category\.LAUNCHER 1", cmd):
            return "launch"
        if re.fullmatch(r"input tap \d+ \d+", cmd):
            return "tap"
        if re.fullmatch(r"input swipe \d+ \d+ \d+ \d+ \d+", cmd):
            return "swipe"
        if cmd == "input keyevent 4":
            return "back"
        return None

    def before_command(self, cmd: str) -> None:
        """Called before every agent ADB command; failures never block input."""
        try:
            with self._lock:
                if self._closed:
                    return
                if cmd.startswith("input text "):
                    # Do not record the agent typing account values.
                    self._finish_locked("text_entry")
                    return
                if cmd.startswith("monkey -p ") and not cmd.startswith(f"monkey -p {self.package} "):
                    self._finish_locked("external_launch")
                    return
                details = self.context() or {}
                if details.get("phase") == "VERIFICATION":
                    self._finish_locked("verification")
                    return
                if not self.enabled:
                    if cmd.startswith("input "):
                        self._finish_locked("outside_planned_action")
                    return
                kind = self._kind(cmd)
                if kind is None:
                    return
                if kind != "launch" and not self._focused_on_app():
                    self._finish_locked("external_app")
                    return
                if self._process is not None and self._process.poll() is not None:
                    self._finish_locked("screenrecord_ended")
                if self._process is None and not self._start_locked():
                    return
                self._actions.append({
                    "at": time.time(),
                    "kind": kind,
                    "phase": details.get("phase"),
                    "timeline_sequence": details.get("timeline_sequence"),
                })
                if self._timer is not None:
                    self._timer.cancel()
                    self._timer = None
        except Exception as exc:
            print(f"      ⚠️ Local video recorder skipped input: {exc}")

    def after_command(self, cmd: str) -> None:
        if not self.enabled or self._kind(cmd) is None:
            return
        try:
            with self._lock:
                if self._process is None or self._closed:
                    return
                if self._timer is not None:
                    self._timer.cancel()
                self._timer = threading.Timer(self.post_roll, self._finish_after_idle)
                self._timer.daemon = True
                self._timer.start()
        except Exception as exc:
            print(f"      ⚠️ Local video recorder could not schedule post-roll: {exc}")

    def _start_locked(self) -> bool:
        # Do not interfere with another screen recorder on the same emulator.
        if self._screenrecord_pids():
            print("      ⚠️ Local video skipped: another Android screenrecord is active")
            return False
        remote = f"/sdcard/northstar_local_{uuid.uuid4().hex}.mp4"
        command = self._adb("shell", "screenrecord", "--bit-rate", "4000000",
                            "--time-limit", "30", remote)
        process = None
        try:
            process = subprocess.Popen(command, stdout=subprocess.DEVNULL,
                                       stderr=subprocess.DEVNULL)
            pid = None
            for _ in range(24):
                if process.poll() is not None:
                    break
                pids = self._screenrecord_pids()
                if len(pids) == 1:
                    pid = next(iter(pids))
                    break
                time.sleep(0.05)
            if pid is None:
                process.terminate()
                process.wait(timeout=3)
                print("      ⚠️ Local video skipped: Android screenrecord did not start")
                return False
            time.sleep(0.18)  # Give the encoder a pre-action frame.
            self._process = process
            self._pid = pid
            self._remote = remote
            self._started_at = time.time()
            self._actions = []
            return True
        except (OSError, subprocess.TimeoutExpired) as exc:
            if process is not None and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
            print(f"      ⚠️ Local video skipped: {exc}")
            return False

    def _finish_after_idle(self) -> None:
        with self._lock:
            self._finish_locked("idle")

    def _finish_locked(self, reason: str) -> None:
        if self._timer is not None:
            self._timer.cancel()
            self._timer = None
        process = self._process
        if process is None:
            return
        pid, remote, started_at = self._pid, self._remote, self._started_at
        actions = list(self._actions)
        self._process = None
        self._pid = self._remote = self._started_at = None
        self._actions = []
        number = self._next_number
        self._next_number += 1
        output = self.burst_dir / f"burst_{number:04d}.mp4"
        error = None
        try:
            if process.poll() is None and pid:
                _run(self._adb("shell", "kill", "-2", pid), timeout=5)
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.terminate()
                process.wait(timeout=3)
                raise RuntimeError("screenrecord did not finalize after SIGINT")
            pulled = _run(self._adb("pull", remote, str(output)), timeout=30)
            if pulled.returncode != 0 or not output.is_file() or output.stat().st_size < 1024:
                raise RuntimeError("ADB could not pull a valid video burst")
        except (OSError, subprocess.TimeoutExpired, RuntimeError) as exc:
            error = str(exc)
            output.unlink(missing_ok=True)
        finally:
            if remote:
                try:
                    _run(self._adb("shell", "rm", "-f", remote), timeout=5)
                except (OSError, subprocess.TimeoutExpired):
                    pass
        in_app_at_end = self._focused_on_app()
        # A clip that reached Gmail, a browser, or another app is ineligible.
        if not in_app_at_end:
            output.unlink(missing_ok=True)
        entry = {
            "number": number,
            "recorded_at": _utc_now(),
            "started_at": started_at,
            "ended_at": time.time(),
            "file": str(output.relative_to(self.session)) if output.exists() else None,
            "actions": actions,
            "eligible": bool(output.exists() and actions and in_app_at_end),
            "stop_reason": reason,
            "error": error or ("external_app_at_end" if not in_app_at_end else None),
        }
        with self.journal.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry) + "\n")
        if entry["eligible"]:
            print(f"      🎬 Local onboarding burst {number}: {output.name}")
        elif error:
            print(f"      ⚠️ Local video burst {number} discarded: {error}")

    def close(self) -> None:
        with self._lock:
            self._closed = True
            self._finish_locked("agent_exit")


def _read_bursts(session: Path) -> list[dict]:
    journal = session / "local_video_bursts.jsonl"
    if not journal.is_file():
        raise ValueError(f"No video burst journal found at {journal}")
    bursts = []
    for line in journal.read_text(encoding="utf-8").splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(item, dict):
            bursts.append(item)
    return sorted(bursts, key=lambda item: int(item.get("number", 0)))


def create_plan(session: Path, *, force: bool = False) -> Path:
    session = session.expanduser().resolve()
    target = session / "local_video_edit_plan.json"
    if target.exists() and not force:
        raise ValueError(f"Edit plan already exists: {target} (pass --force to replace it)")
    timeline = {}
    timeline_path = session / "timeline_journal.jsonl"
    if timeline_path.is_file():
        for line in timeline_path.read_text(encoding="utf-8").splitlines():
            try:
                entry = json.loads(line)
                timeline[int(entry["timeline_sequence"])] = entry
            except (ValueError, TypeError, KeyError, json.JSONDecodeError):
                continue
    clips = []
    for item in _read_bursts(session):
        if not item.get("eligible") or not item.get("file"):
            continue
        clip = (session / item["file"]).resolve()
        if not clip.is_relative_to(session) or not clip.is_file():
            continue
        first_action = (item.get("actions") or [{}])[0]
        screen = timeline.get(first_action.get("timeline_sequence"), {})
        clips.append({
            "number": int(item["number"]),
            "file": item["file"],
            "include": False,  # Selection requires review of actual pixels.
            "trim_in": 0.0,
            "trim_out": None,
            "label": "",
            "screen_state": screen.get("state", ""),
            "screen_screenshot": screen.get("screenshot"),
            "actions": item.get("actions", []),
        })
    plan = {"version": 1, "purpose": "local onboarding video proof",
            "reviewed": False, "clips": clips}
    target.write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
    return target


def _duration(path: Path) -> float:
    probe = _run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                  "-of", "default=noprint_wrappers=1:nokey=1", str(path)], timeout=20)
    if probe.returncode != 0:
        raise ValueError(f"ffprobe could not read {path}: {probe.stderr.strip()}")
    return float(probe.stdout.strip())


def render(session: Path, *, output: Path | None = None) -> Path:
    session = session.expanduser().resolve()
    plan_path = session / "local_video_edit_plan.json"
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    if plan.get("reviewed") is not True:
        raise ValueError("Set reviewed=true only after checking the selected clips for sequence and private content")
    selected = [clip for clip in plan.get("clips", []) if clip.get("include") is True]
    if not selected:
        raise ValueError("Select at least one reviewed clip in local_video_edit_plan.json")
    numbers = [int(clip["number"]) for clip in selected]
    if numbers != sorted(set(numbers)):
        raise ValueError("Selected clips must be unique and in original capture order")
    burst_by_number = {int(item["number"]): item for item in _read_bursts(session)}
    output = (output or session / "onboarding_local_proof.mp4").expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise ValueError("ffmpeg and ffprobe are required to render the local proof")
    import tempfile
    with tempfile.TemporaryDirectory(prefix="northstar_onboarding_edit_") as temp:
        temp_dir = Path(temp)
        segments = []
        provenance = []
        for index, clip in enumerate(selected, 1):
            number = int(clip["number"])
            source = burst_by_number.get(number)
            if not source or not source.get("eligible") or source.get("file") != clip.get("file"):
                raise ValueError(f"Clip {number} is not an eligible recorded burst")
            path = (session / clip["file"]).resolve()
            if not path.is_relative_to(session) or not path.is_file():
                raise ValueError(f"Clip {number} is missing or outside the session")
            duration = _duration(path)
            start = float(clip.get("trim_in") or 0)
            end = float(duration if clip.get("trim_out") is None else clip["trim_out"])
            if not (0 <= start < end <= duration + 0.05):
                raise ValueError(f"Clip {number} has an invalid trim range")
            segment = temp_dir / f"segment_{index:04d}.mp4"
            command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                       "-ss", str(start), "-i", str(path), "-t", str(end - start),
                       "-vf", "fps=30,scale=720:1280:force_original_aspect_ratio=decrease,"
                              "pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=0x10111f,format=yuv420p",
                       "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                       "-movflags", "+faststart", str(segment)]
            result = _run(command, timeout=120)
            if result.returncode != 0:
                raise ValueError(f"ffmpeg failed on clip {number}: {result.stderr.strip()}")
            segments.append(segment)
            provenance.append({"number": number, "source": str(path),
                               "trim_in": start, "trim_out": end,
                               "label": clip.get("label", "")})
        concat = temp_dir / "concat.txt"
        concat.write_text("".join(f"file '{segment}'\n" for segment in segments), encoding="utf-8")
        result = _run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                       "-f", "concat", "-safe", "0", "-i", str(concat),
                       "-c", "copy", "-movflags", "+faststart", str(output)], timeout=120)
        if result.returncode != 0:
            raise ValueError(f"ffmpeg could not join selected clips: {result.stderr.strip()}")
    (session / "onboarding_local_proof_sources.json").write_text(
        json.dumps({"rendered_at": _utc_now(), "output": str(output),
                    "clips": provenance}, indent=2) + "\n", encoding="utf-8")
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    plan_parser = commands.add_parser("plan", help="Create an unselected review plan from recorded bursts")
    plan_parser.add_argument("session", type=Path)
    plan_parser.add_argument("--force", action="store_true")
    render_parser = commands.add_parser("render", help="Render reviewed clips into one local MP4")
    render_parser.add_argument("session", type=Path)
    render_parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        path = create_plan(args.session, force=args.force) if args.command == "plan" else render(
            args.session, output=args.output)
        print(path)
        return 0
    except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print(f"Local onboarding video: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
