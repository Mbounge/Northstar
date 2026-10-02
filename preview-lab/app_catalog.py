"""Stage installed Android APK splits and reinstall them on a clean preview AVD.

Only package binaries are copied. App data and Android accounts are never read.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile


ADB = "/opt/android-sdk/platform-tools/adb"
CATALOG = Path("/opt/northstar/preview-lab/apks")
PACKAGE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$")


def run_adb(serial: str, *args: str) -> str:
    result = subprocess.run(
        [ADB, "-s", serial, *args], check=True, capture_output=True, text=True,
    )
    return result.stdout.strip()


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stage(package: str, serial: str) -> None:
    output = run_adb(serial, "shell", "pm", "path", package)
    paths = [line.removeprefix("package:") for line in output.splitlines() if line.startswith("package:")]
    if not paths or any(not path.startswith("/data/app/") or not path.endswith(".apk") for path in paths):
        raise RuntimeError("Package has no installable APK splits on this device")
    target = CATALOG / package
    if target.exists():
        raise RuntimeError("Package is already staged; archive or remove its existing catalog entry first")
    CATALOG.mkdir(mode=0o700, parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f".{package}-", dir=CATALOG) as temporary:
        temporary_path = Path(temporary)
        splits = []
        for remote_path in paths:
            filename = Path(remote_path).name
            if not re.fullmatch(r"[A-Za-z0-9_.-]+\.apk", filename):
                raise RuntimeError("Unexpected APK filename")
            local_path = temporary_path / filename
            run_adb(serial, "pull", remote_path, str(local_path))
            splits.append({"file": filename, "sha256": checksum(local_path)})
        (temporary_path / "manifest.json").write_text(
            json.dumps({"package": package, "splits": splits}, indent=2) + "\n",
            encoding="utf-8",
        )
        os.chmod(temporary_path, 0o700)
        # Operators may provision as root, while the isolated preview gateway
        # runs as the catalog owner. Keep each package private but readable by
        # that gateway after the atomic rename.
        if os.geteuid() == 0:
            catalog_owner = CATALOG.stat()
            os.chown(temporary_path, catalog_owner.st_uid, catalog_owner.st_gid)
        temporary_path.rename(target)
    print(f"Staged {package}: {len(splits)} APK file(s)")


def install(package: str, serial: str) -> None:
    target = CATALOG / package
    manifest = json.loads((target / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("package") != package or not manifest.get("splits"):
        raise RuntimeError("APK manifest does not match requested package")
    files = []
    for split in manifest["splits"]:
        filename = split["file"]
        if not re.fullmatch(r"[A-Za-z0-9_.-]+\.apk", filename):
            raise RuntimeError("APK manifest contains an invalid filename")
        path = target / filename
        if checksum(path) != split["sha256"]:
            raise RuntimeError("APK checksum mismatch")
        files.append(str(path))
    run_adb(serial, "install-multiple", "-r", *files)
    if not run_adb(serial, "shell", "pm", "path", package).startswith("package:"):
        raise RuntimeError("Package installation was not verified")
    print(f"Installed {package} on {serial} from the staged APKs")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("stage", "install"))
    parser.add_argument("package")
    parser.add_argument("--serial", required=True)
    args = parser.parse_args()
    if not PACKAGE_RE.fullmatch(args.package):
        parser.error("Invalid Android package name")
    if args.action == "stage":
        stage(args.package, args.serial)
    else:
        install(args.package, args.serial)


if __name__ == "__main__":
    main()
