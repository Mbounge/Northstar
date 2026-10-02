#!/usr/bin/env python3
"""Disable Gboard's physical-keyboard overlay and automatic text changes.

Uses the visible Gboard settings UI, rather than writing private app data.
Run only while the listed emulators are idle; the script temporarily opens
Gboard settings and returns to the previous app.
"""

import argparse
import re
import subprocess
import time
import xml.etree.ElementTree as ET


SETTINGS_ACTIVITY = (
    "com.google.android.inputmethod.latin/"
    "com.google.android.apps.inputmethod.latin.preference.SettingsActivity"
)
BOUNDS = re.compile(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]")


def adb(serial, *args):
    result = subprocess.run(
        ["/opt/android-sdk/platform-tools/adb", "-s", serial, *args],
        check=True,
        capture_output=True,
        text=True,
        timeout=20,
    )
    return result.stdout.strip()


def bounds(node):
    match = BOUNDS.fullmatch(node.attrib["bounds"])
    return tuple(map(int, match.groups()))


def center(node):
    left, top, right, bottom = bounds(node)
    return (left + right) // 2, (top + bottom) // 2


def tap(serial, node):
    x, y = center(node)
    adb(serial, "shell", "input", "tap", str(x), str(y))


def nodes(serial):
    for _ in range(4):
        try:
            adb(serial, "shell", "uiautomator", "dump", "/sdcard/northstar-gboard.xml")
            data = adb(serial, "shell", "cat", "/sdcard/northstar-gboard.xml")
            return list(ET.fromstring(data).iter("node"))
        except (subprocess.CalledProcessError, ET.ParseError):
            time.sleep(0.4)
    raise RuntimeError(f"{serial}: could not read current Gboard settings")


def find_text(items, label):
    return next((node for node in items if node.attrib.get("text") == label), None)


def on_screen(node):
    _, top, _, bottom = bounds(node)
    return top >= 0 and bottom <= 2300


def reveal(serial, label):
    for _ in range(7):
        items = nodes(serial)
        found = find_text(items, label)
        if found is not None and on_screen(found):
            return items, found
        adb(serial, "shell", "input", "swipe", "840", "1980", "840", "750", "210")
        time.sleep(0.15)
    for _ in range(7):
        items = nodes(serial)
        found = find_text(items, label)
        if found is not None and on_screen(found):
            return items, found
        adb(serial, "shell", "input", "swipe", "840", "750", "840", "1980", "210")
        time.sleep(0.15)
    raise RuntimeError(f"{serial}: could not find Gboard setting {label!r}")


def open_page(serial, label):
    _, row = reveal(serial, label)
    tap(serial, row)
    time.sleep(0.2)


def set_off(serial, label):
    for _ in range(4):
        items, row = reveal(serial, label)
        _, row_y = center(row)
        switches = [
            node for node in items
            if node.attrib.get("checkable") == "true"
            and bounds(node)[0] > 750
            and abs(center(node)[1] - row_y) < 95
        ]
        if switches:
            break
        adb(serial, "shell", "input", "swipe", "840", "1980", "840", "1100", "210")
        time.sleep(0.15)
    if not switches:
        raise RuntimeError(f"{serial}: no switch found beside {label!r}")
    switch = min(switches, key=lambda node: abs(center(node)[1] - row_y))
    if switch.attrib.get("checked") == "true":
        if switch.attrib.get("enabled") == "false":
            print(f"{serial}: {label}: inactive (parent setting off)", flush=True)
            return
        tap(serial, switch)
        time.sleep(0.12)
        refreshed, row = reveal(serial, label)
        _, row_y = center(row)
        matching = [
            node for node in refreshed
            if node.attrib.get("checkable") == "true"
            and bounds(node)[0] > 750
            and abs(center(node)[1] - row_y) < 95
        ]
        if matching and min(matching, key=lambda node: abs(center(node)[1] - row_y)).attrib.get("checked") == "true":
            raise RuntimeError(f"{serial}: {label!r} remained on")
    print(f"{serial}: {label}: off", flush=True)


def open_main(serial):
    adb(serial, "shell", "am", "start", "-n", SETTINGS_ACTIVITY)
    for _ in range(5):
        items = nodes(serial)
        if find_text(items, "Physical keyboard") is not None and find_text(items, "Corrections & suggestions") is not None:
            return
        adb(serial, "shell", "input", "keyevent", "KEYCODE_BACK")
        if find_text(nodes(serial), "Physical keyboard") is None:
            adb(serial, "shell", "am", "start", "-n", SETTINGS_ACTIVITY)
    raise RuntimeError(f"{serial}: could not reach Gboard settings")


def exit_settings(serial):
    for _ in range(5):
        focus = adb(serial, "shell", "dumpsys", "window")
        current = next((line for line in focus.splitlines() if "mCurrentFocus=" in line), "")
        if "com.google.android.inputmethod.latin/" not in current:
            return
        adb(serial, "shell", "input", "keyevent", "KEYCODE_BACK")
        time.sleep(0.15)


def configure(serial):
    print(f"{serial}: configuring", flush=True)
    adb(serial, "shell", "settings", "put", "secure", "show_ime_with_hard_keyboard", "0")
    try:
        open_main(serial)
        open_page(serial, "Physical keyboard")
        for label in ("Auto-capitalization", "Auto-correction", "Word suggestion", "Show toolbar"):
            set_off(serial, label)
        adb(serial, "shell", "input", "keyevent", "KEYCODE_BACK")
        open_page(serial, "Corrections & suggestions")
        for label in (
            "Auto-correction",
            "Auto-capitalization",
            "Spell check",
            "Grammar check",
            "Smart compose",
            "Suggestion strip",
        ):
            set_off(serial, label)
    finally:
        exit_settings(serial)
    print(f"{serial}: settings applied", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("serials", nargs="+", help="ADB serials, for example emulator-5554")
    args = parser.parse_args()
    for device in args.serials:
        configure(device)
