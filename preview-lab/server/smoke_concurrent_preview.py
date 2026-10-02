"""Prove distinct signed visitors queue and receive separate wiped devices.

Run on the preview host while tenant worker 2 is idle. No credentials, grant,
lease token, frame contents, or account names are printed.
"""

import asyncio
import base64
import hashlib
import hmac
import json
from pathlib import Path
import subprocess
import time

from aiohttp import ClientSession, WSMsgType


SECRET = Path("/etc/northstar-preview/grant-secret").read_bytes().strip()
ORIGIN = "https://capture.49-12-126-233.sslip.io"
BROKER = "http://127.0.0.1:18083"
WORKER = "http://127.0.0.1:18081"


def signed_grant(user: str) -> str:
    payload = {"v": 1, "aud": "northstar-preview", "tenant": "concurrency-test", "user": user,
               "packages": ["org.wikipedia"], "exp": int(time.time()) + 300}
    encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    mac = base64.urlsafe_b64encode(hmac.new(SECRET, encoded.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return encoded + "." + mac


async def message(ws):
    item = await ws.receive()
    if item.type != WSMsgType.TEXT:
        raise AssertionError(f"Unexpected broker response {item.type}")
    return json.loads(item.data)


async def main() -> None:
    a = b = None
    async with ClientSession(headers={"Origin": ORIGIN}) as client:
        async def release(lease):
            if lease:
                async with client.post(BROKER + "/release", json={"worker": lease["worker"], "token": lease["token"]}) as response:
                    if response.status not in (200, 409, 503):
                        raise AssertionError(f"Could not end test preview: {response.status}")

        try:
            async with client.ws_connect(BROKER + "/allocate") as first:
                await first.send_json({"package": "org.wikipedia", "grant": signed_grant("visitor-a")})
                assert (await message(first))["type"] == "preparing"
                assert (await message(first))["type"] == "queued"
                a = await asyncio.wait_for(message(first), 40)
                assert a["type"] == "allocated", a.get("type")
                first_token = a["token"]
            async with client.ws_connect(BROKER + "/allocate") as second:
                await second.send_json({"package": "org.wikipedia", "grant": signed_grant("visitor-b")})
                assert (await message(second))["type"] == "preparing"
                queued = await message(second)
                assert queued["type"] == "queued" and queued["position"] == 1, queued
                try:
                    unexpected = await asyncio.wait_for(message(second), 2)
                    raise AssertionError(f"Second visitor received unexpected response: {unexpected.get('type')}")
                except asyncio.TimeoutError:
                    pass
                await release(a)
                a = None
                b = await asyncio.wait_for(message(second), 230)
                assert b["type"] == "allocated" and b["token"] != first_token, b.get("type")
            adb = subprocess.run(["/opt/android-sdk/platform-tools/adb", "-s", "emulator-5562", "shell", "dumpsys", "account"],
                                 capture_output=True, text=True, timeout=20, check=True)
            assert "Account {" not in adb.stdout
            async with client.ws_connect(WORKER + "/stream", protocols=["northstar-preview", "session." + b["token"]]) as stream:
                assert (await message(stream))["type"] == "session"
                frame = await asyncio.wait_for(stream.receive(), 40)
                assert frame.type == WSMsgType.BINARY and frame.data.startswith(b"\xff\xd8")
            await release(b)
            b = None
        finally:
            await release(a)
            await release(b)
    print("PASS: two signed visitors queued; B received a new wiped worker only after A released it; no Android accounts remained")


if __name__ == "__main__":
    asyncio.run(main())
