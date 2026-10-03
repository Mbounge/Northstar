"""Operator-run smoke test for the private tenant preview bridge.

Reads the staged signing secret on the host. Never prints a grant or lease.
Requires an idle secure preview worker and ends its test session afterward.
"""

import asyncio
import argparse
import base64
import hashlib
import hmac
import json
import re
import subprocess
import time
from pathlib import Path

from aiohttp import ClientSession, WSMsgType


BASE = "https://capture.49-12-126-233.sslip.io/preview"
ORIGIN = "https://capture.49-12-126-233.sslip.io"
SECRET = Path("/etc/northstar-preview/grant-secret").read_bytes().strip()


def grant(packages):
    payload = {"v": 1, "aud": "northstar-preview", "tenant": "smoke-tenant", "user": "smoke-user", "packages": packages, "exp": int(time.time()) + 300}
    encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    mac = base64.urlsafe_b64encode(hmac.new(SECRET, encoded.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return f"{encoded}.{mac}"


async def one_message(ws, timeout=20):
    message = await asyncio.wait_for(ws.receive(), timeout)
    if message.type == WSMsgType.TEXT:
        return json.loads(message.data)
    raise AssertionError(f"Unexpected WebSocket message type: {message.type}")


async def main(package, evidence_dir, settle_seconds):
    async with ClientSession(headers={"Origin": ORIGIN}) as client:
        async with client.get(f"{BASE}/api/catalog") as response:
            assert response.status == 401, response.status
        token = grant([package])
        async with client.get(f"{BASE}/api/catalog", headers={"Authorization": f"Bearer {token}"}) as response:
            assert response.status == 200, response.status
            catalog = await response.json()
            assert [app["package"] for app in catalog["apps"]] == [package], catalog
            assert catalog["apps"][0]["status"] == "available", catalog
        async with client.ws_connect(f"{BASE}/api/allocate") as ws:
            denied_package = "de.danoeh.antennapod" if package == "org.wikipedia" else "org.wikipedia"
            await ws.send_json({"package": denied_package, "grant": token})
            denied = await one_message(ws)
            assert denied["type"] == "error", denied
        async with client.ws_connect(f"{BASE}/api/allocate") as ws:
            await ws.send_json({"package": package, "grant": token})
            assert (await one_message(ws))["type"] == "preparing"
            while True:
                allocated = await one_message(ws, 260)
                if allocated["type"] not in ("queued", "preparing"):
                    break
            assert allocated["type"] == "allocated" and allocated["worker"] == "preview-2", allocated
        lease = allocated["token"]
        async with client.ws_connect(f"{BASE}/worker/2/stream", protocols=["northstar-preview", f"session.{lease}"]) as ws:
            assert ws.protocol == "northstar-preview", ws.protocol
            assert (await one_message(ws))["type"] == "session"
            try:
                image = await asyncio.wait_for(ws.receive(), 30)
                assert image.type == WSMsgType.BINARY and image.data.startswith(b"\xff\xd8")
                await ws.send_json({"type": "frame_ready"})
                # A launch splash is not enough evidence of a usable preview.
                # Inspect a later frame and record Android's foreground window.
                deadline = time.monotonic() + settle_seconds
                while time.monotonic() < deadline:
                    frame = await asyncio.wait_for(ws.receive(), 10)
                    if frame.type == WSMsgType.BINARY and frame.data.startswith(b"\xff\xd8"):
                        image = frame
                        await ws.send_json({"type": "frame_ready"})
                focus = subprocess.run(
                    ["/opt/android-sdk/platform-tools/adb", "-s", "emulator-5562", "shell", "dumpsys", "window"],
                    capture_output=True, text=True, timeout=15, check=True,
                ).stdout
                match = re.search(r"mCurrentFocus=Window\{[^}]+\s([^}\s]+)\}", focus)
                foreground = match.group(1) if match else "unknown"
                if evidence_dir is not None:
                    evidence_dir.mkdir(parents=True, exist_ok=True)
                    (evidence_dir / f"{package}.jpg").write_bytes(image.data)
                if evidence_dir is not None and ("launcher/" in foreground or foreground.startswith("com.android.vending/")):
                    crashes = subprocess.run(
                        ["/opt/android-sdk/platform-tools/adb", "-s", "emulator-5562", "logcat", "-d", "-b", "crash", "-t", "300"],
                        capture_output=True, text=True, timeout=15, check=False,
                    )
                    (evidence_dir / f"{package}.crash.log").write_text(crashes.stdout[:40_000], encoding="utf-8")
                if "nexuslauncher/" in foreground or "launcher3/" in foreground:
                    raise AssertionError(f"App left the visitor on Android Home: {foreground}")
                if foreground.startswith("com.android.vending/"):
                    raise AssertionError("App redirected the visitor to Google Play instead of an app screen")
                if "pairip.licensecheck/" in foreground:
                    raise AssertionError("App stopped at its Google Play license-check screen")
            finally:
                await ws.send_json({"type": "end_session"})
                # Frames already in flight can arrive ahead of the release ack.
                while True:
                    ending = await asyncio.wait_for(ws.receive(), 20)
                    if ending.type == WSMsgType.BINARY:
                        continue
                    assert ending.type == WSMsgType.TEXT and json.loads(ending.data)["type"] == "session_ending", ending
                    break
    print(f"PASS: {package} tenant catalog isolated, unauthorized package denied, signed WSS video, foreground={foreground}, clean end")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", default="org.wikipedia")
    parser.add_argument("--evidence-dir", type=Path)
    parser.add_argument("--settle-seconds", type=int, default=40)
    args = parser.parse_args()
    if not 1 <= args.settle_seconds <= 120:
        parser.error("settle-seconds must be between 1 and 120")
    asyncio.run(main(args.package, args.evidence_dir, args.settle_seconds))
