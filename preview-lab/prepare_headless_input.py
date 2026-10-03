#!/usr/bin/env python3
"""Prepare Northstar Android emulators for ADB-only text input.

Run while the selected devices are idle. Android may restore a system IME
during boot, so --reboot applies the configuration again after boot settles.
"""

import argparse
import subprocess
import time


ADB = "/opt/android-sdk/platform-tools/adb"
PACKAGES = (
    "com.google.android.inputmethod.latin",
    "com.google.android.googlequicksearchbox",
    "com.google.android.tts",
)
SECURE_KEYS = (
    "enabled_input_methods",
    "default_input_method",
    "assistant",
    "voice_interaction_service",
    "voice_recognition_service",
    "autofill_service",
)


def adb(serial, *arguments, timeout=25):
    result = subprocess.run(
        [ADB, "-s", serial, *arguments],
        check=True,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return result.stdout.strip()


def apply(serial, dismiss_overlay=True):
    for package in PACKAGES:
        adb(serial, "shell", "pm", "disable-user", "--user", "0", package)
    for key in SECURE_KEYS:
        adb(serial, "shell", "settings", "put", "secure", key, "null")
    for package in PACKAGES[1:]:
        adb(serial, "shell", "am", "force-stop", package)
    if dismiss_overlay:
        adb(serial, "shell", "input", "keyevent", "4")


def wait_for_boot(serial):
    adb(serial, "wait-for-device", timeout=120)
    for _ in range(90):
        try:
            if adb(serial, "shell", "getprop", "sys.boot_completed") == "1":
                time.sleep(10)  # Let PackageManager and input services settle.
                return
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            pass
        time.sleep(2)
    raise RuntimeError(f"{serial}: Android did not finish booting")


def verify(serial):
    for package in PACKAGES:
        state = adb(serial, "shell", "dumpsys", "package", package)
        user = next((line for line in state.splitlines() if "User 0:" in line), "")
        if "enabled=3" not in user:
            raise RuntimeError(f"{serial}: {package} is not disabled for user 0")
    if adb(serial, "shell", "settings", "get", "secure", "autofill_service") != "null":
        raise RuntimeError(f"{serial}: Android Autofill remains enabled")
    adb(serial, "shell", "pm", "path", "com.android.vending")


def ensure(serial):
    try:
        if adb(serial, "get-state") != "device":
            print(f"{serial}: offline; skipped", flush=True)
            return
        if adb(serial, "shell", "getprop", "sys.boot_completed") != "1":
            print(f"{serial}: still booting; skipped", flush=True)
            return
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        print(f"{serial}: unavailable; skipped", flush=True)
        return
    # A wiped AVD can re-enable its IME during late boot, even after
    # sys.boot_completed and PackageManager report ready. Reapply in place
    # while those system services settle rather than forcing another wipe.
    for attempt in range(10):
        try:
            verify(serial)
            print(f"{serial}: verified", flush=True)
            return
        except RuntimeError:
            if attempt == 9:
                raise
            if attempt == 0:
                print(f"{serial}: headless input drift detected; repairing", flush=True)
            apply(serial, dismiss_overlay=False)
            time.sleep(3)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("serials", nargs="+", help="for example emulator-5554")
    parser.add_argument("--reboot", action="store_true", help="reboot each emulator, then reapply after boot")
    parser.add_argument("--check", action="store_true", help="verify current state without changing the emulator")
    parser.add_argument("--ensure", action="store_true", help="repair online devices if their settings drift")
    args = parser.parse_args()
    if sum((args.reboot, args.check, args.ensure)) > 1:
        parser.error("--reboot, --check, and --ensure cannot be combined")
    for serial in args.serials:
        if args.ensure:
            ensure(serial)
            continue
        if not args.check:
            print(f"{serial}: applying headless input settings", flush=True)
            apply(serial)
            if args.reboot:
                adb(serial, "reboot")
                wait_for_boot(serial)
                apply(serial)
        verify(serial)
        print(f"{serial}: verified; Google Play package remains installed", flush=True)


if __name__ == "__main__":
    main()
