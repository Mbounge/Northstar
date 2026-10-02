"""Periodically stage installed captured apps without touching their app data."""

import json
import os
from pathlib import Path
import subprocess

from app_catalog import ADB, PACKAGE_RE
from provision_catalog import REGISTRY, provision


def main() -> None:
    root = Path(os.environ.get("CAPTURE_DATA_ROOT", "/var/lib/northstar/captures"))
    devices = json.loads(os.environ.get("CAPTURE_DEVICES_JSON", "{}"))
    runs = json.loads((root / "runs.json").read_text(encoding="utf-8"))
    if not isinstance(devices, dict) or not isinstance(runs, dict):
        raise ValueError("Capture registry is invalid")
    staged = {entry["package"]: entry for entry in json.loads(REGISTRY.read_text(encoding="utf-8"))}
    seen = set()
    for run in sorted(runs.values(), key=lambda item: item.get("created_at", 0), reverse=True):
        if not isinstance(run, dict):
            continue
        package = run.get("package_name")
        serial = devices.get(run.get("device_id"))
        name = run.get("app")
        if (not isinstance(package, str) or not PACKAGE_RE.fullmatch(package)
                or not isinstance(serial, str) or not serial.startswith("emulator-")
                or not isinstance(name, str)):
            continue
        if package in seen:
            continue
        icon = root / run["id"] / "app_store/icons/app_icon_512x512.png"
        if package in staged and (staged[package].get("icon") != "app-placeholder.svg" or not icon.is_file()):
            continue
        try:
            result = subprocess.run([ADB, "-s", serial, "shell", "pm", "path", package],
                                    capture_output=True, text=True, timeout=10, check=False)
        except (OSError, subprocess.TimeoutExpired):
            continue
        if result.returncode != 0 or "package:/data/app/" not in result.stdout:
            continue
        seen.add(package)
        try:
            provision(package, name, serial, icon if icon.is_file() else None)
            print(f"Preview staged from capture {run['id']}: {package}")
        except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
            print(f"Preview staging deferred for {package}: {type(error).__name__}: {error}")
        # One large APK transfer per timer tick keeps ADB responsive to capture.
        return


if __name__ == "__main__":
    main()
