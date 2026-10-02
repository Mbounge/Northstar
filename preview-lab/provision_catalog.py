"""Publish a captured app's installable APKs to the isolated preview catalog.

Only APK splits and an optional researched icon leave the capture device.
The catalog entry appears after every split has been checksummed and staged.
"""

import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import tempfile

from app_catalog import CATALOG, PACKAGE_RE, checksum, stage


ROOT = Path("/opt/northstar/preview-lab")
REGISTRY = ROOT / "apps.json"
PUBLIC_ICONS = Path("/srv/northstar-preview/icons")
NAME_RE = re.compile(r"^[^\x00-\x1f\x7f]{1,100}$")


def verify_staged(package: str) -> None:
    folder = CATALOG / package
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    splits = manifest.get("splits")
    if manifest.get("package") != package or not isinstance(splits, list) or not splits:
        raise ValueError("Staged APK manifest is invalid")
    names = set()
    for split in splits:
        name, expected = split.get("file"), split.get("sha256")
        if (not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_.-]+\.apk", name)
                or name in names or not isinstance(expected, str) or not re.fullmatch(r"[a-f0-9]{64}", expected)
                or checksum(folder / name) != expected):
            raise ValueError("Staged APK failed integrity verification")
        names.add(name)


def publish_json(path: Path, data: list[dict]) -> None:
    with tempfile.NamedTemporaryFile("w", prefix=".apps-", suffix=".json", dir=path.parent,
                                     encoding="utf-8", delete=False) as output:
        try:
            json.dump(data, output, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
            temporary = Path(output.name)
        except Exception:
            Path(output.name).unlink(missing_ok=True)
            raise
    os.chmod(temporary, 0o644)
    if os.geteuid() == 0:
        owner = path.parent.stat()
        os.chown(temporary, owner.st_uid, owner.st_gid)
    temporary.replace(path)


def provision(package: str, name: str, serial: str, icon_source: Path | None = None) -> str:
    if not PACKAGE_RE.fullmatch(package) or not NAME_RE.fullmatch(name) or name != name.strip():
        raise ValueError("Invalid preview package or app name")
    ROOT.mkdir(parents=True, exist_ok=True)
    lock_path = ROOT / "catalog.lock"
    lock_path.touch(exist_ok=True)
    if os.geteuid() == 0:
        owner = ROOT.stat()
        os.chown(lock_path, owner.st_uid, owner.st_gid)
    with lock_path.open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if not (CATALOG / package).exists():
            stage(package, serial)
        verify_staged(package)
        apps = json.loads(REGISTRY.read_text(encoding="utf-8")) if REGISTRY.exists() else []
        if not isinstance(apps, list) or any(not isinstance(entry, dict) for entry in apps):
            raise ValueError("Preview app registry is invalid")
        prior = next((entry for entry in apps if entry.get("package") == package), None)
        icon = prior.get("icon", "app-placeholder.svg") if prior else "app-placeholder.svg"
        if icon_source is not None and icon_source.is_file():
            with icon_source.open("rb") as source:
                header = source.read(8)
            if header != b"\x89PNG\r\n\x1a\n" or icon_source.stat().st_size > 2_000_000:
                raise ValueError("Researched app icon is not a bounded PNG")
            PUBLIC_ICONS.mkdir(mode=0o755, parents=True, exist_ok=True)
            target = PUBLIC_ICONS / f"{package}.png"
            with tempfile.NamedTemporaryFile(prefix=".icon-", suffix=".png", dir=PUBLIC_ICONS,
                                             delete=False) as output:
                temporary = Path(output.name)
                with icon_source.open("rb") as source:
                    shutil.copyfileobj(source, output)
                output.flush()
                os.fsync(output.fileno())
            os.chmod(temporary, 0o644)
            temporary.replace(target)
            icon = f"icons/{package}.png"
        entry = {"package": package, "name": name, "icon": icon}
        next_apps = [entry if item.get("package") == package else item for item in apps]
        if prior is None:
            next_apps.append(entry)
        if next_apps != apps:
            publish_json(REGISTRY, next_apps)
        return "ready"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--icon-source", type=Path)
    args = parser.parse_args()
    print(f"Preview {provision(args.package, args.name, args.serial, args.icon_source)}: {args.package}")


if __name__ == "__main__":
    main()
