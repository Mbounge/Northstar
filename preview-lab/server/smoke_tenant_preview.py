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


async def main(package):
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
            image = await asyncio.wait_for(ws.receive(), 30)
            assert image.type == WSMsgType.BINARY and image.data.startswith(b"\xff\xd8")
            await ws.send_json({"type": "frame_ready"})
            await ws.send_json({"type": "end_session"})
            assert (await one_message(ws))["type"] == "session_ending"
    print(f"PASS: {package} tenant catalog isolated, unauthorized package denied, signed WSS video and clean end")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", default="org.wikipedia")
    asyncio.run(main(parser.parse_args().package))
