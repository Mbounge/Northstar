"""Local-only, single-viewer bridge for one isolated Android preview device."""

import argparse
import asyncio
import hmac
import json
import logging
import math
import os
import time
from pathlib import Path

from aiohttp import WSMsgType, web
import grpc
from input_text import send_adb_text
from session_manager import SessionBusy, SessionInvalid, SessionManager
from videobridge_gateway import gateway_server as upstream


ALLOWED_KEYS = {"GoBack", "GoHome", "Enter", "Backspace", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"}
ADB = "/opt/android-sdk/platform-tools/adb"
DEVICE = os.environ.get("PREVIEW_DEVICE", "emulator-5560")
APP_NAME = os.environ.get("PREVIEW_APP_NAME", "Wikipedia")
DEFAULT_PACKAGE = os.environ.get("PREVIEW_PACKAGE", "org.wikipedia")
ALLOWED_PACKAGES = set(os.environ.get("PREVIEW_ALLOWED_PACKAGES", DEFAULT_PACKAGE).split(","))
APP_CATALOG = Path(os.environ.get("PREVIEW_APP_CATALOG", "/opt/northstar/preview-lab/apps.json"))
BROKER_SECRET_FILE = os.environ.get("PREVIEW_BROKER_SECRET_FILE")
PORT = int(os.environ.get("PREVIEW_PORT", "18080"))
RESET_REQUEST = Path(os.environ.get("PREVIEW_RESET_REQUEST", "/var/lib/northstar-preview/reset-request"))
LAST_PACKAGE = Path(os.environ.get("PREVIEW_STATE_DIR", "/var/lib/northstar-preview")) / "last-package"
ALLOWED_ORIGINS = {origin.strip() for origin in os.environ.get("PREVIEW_ALLOWED_ORIGINS", "http://127.0.0.1:5173").split(",") if origin.strip()}
FRAME_WIDTH = 540
FRAME_HEIGHT = 1200
ADB_KEYS = {
    "GoBack": "KEYCODE_BACK",
    "Escape": "KEYCODE_BACK",
    "GoHome": "KEYCODE_HOME",
    "Enter": "KEYCODE_ENTER",
    "Backspace": "KEYCODE_DEL",
    "ArrowUp": "KEYCODE_DPAD_UP",
    "ArrowDown": "KEYCODE_DPAD_DOWN",
    "ArrowLeft": "KEYCODE_DPAD_LEFT",
    "ArrowRight": "KEYCODE_DPAD_RIGHT",
}


async def adb_input(command, value):
    process = await asyncio.create_subprocess_exec(
        ADB, "-s", DEVICE, "shell", "input", command, value,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await process.wait()
    if process.returncode:
        raise RuntimeError("Preview device input failed")


async def run_checked(*command, timeout=90):
    process = await asyncio.create_subprocess_exec(
        *command, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        await asyncio.wait_for(process.wait(), timeout=timeout)
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        raise RuntimeError("App provisioning timed out")
    if process.returncode:
        raise RuntimeError("App provisioning failed")


async def foreground_window():
    process = await asyncio.create_subprocess_exec(
        ADB, "-s", DEVICE, "shell", "dumpsys", "window",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        output, _ = await asyncio.wait_for(process.communicate(), timeout=8)
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        return ""
    if process.returncode:
        return ""
    return next((line.decode("utf-8", "replace").strip() for line in output.splitlines()
                 if b"mCurrentFocus=" in line), "")


async def launch_app(package):
    # A clean boot can finish with the launcher in front even after monkey
    # reports success. Never hand that Android Home screen to a visitor.
    for attempt in range(2):
        await run_checked(ADB, "-s", DEVICE, "shell", "monkey", "-p", package,
                          "-c", "android.intent.category.LAUNCHER", "1", timeout=30)
        for _ in range(5):
            await asyncio.sleep(2)
            focus = await foreground_window()
            if focus and "mCurrentFocus=null" not in focus and "nexuslauncher/" not in focus and "launcher3/" not in focus:
                return
        logging.warning("Preview app returned to Android Home after launch attempt %d: %s", attempt + 1, package)
    raise RuntimeError("App did not remain open on the preview device")


async def provision_app(app, package):
    if not package_allowed(app, package):
        raise ValueError("This app is not permitted on this preview worker")
    async with app["provision_lock"]:
        active = app["runtime"]["active_package"]
        if active is not None:
            if active != package:
                raise SessionInvalid("This device is already serving another app")
            return
        # The default app was installed on this wiped device before the
        # gateway started. A different app replaces it before any visitor can
        # attach, so Home cannot expose another app's preview icon or data.
        if package != DEFAULT_PACKAGE:
            await run_checked(ADB, "-s", DEVICE, "uninstall", DEFAULT_PACKAGE, timeout=30)
            await run_checked("python3", "/opt/northstar/preview-lab/app_catalog.py", "install", package, "--serial", DEVICE, timeout=90)
        await launch_app(package)
        app["runtime"]["active_package"] = package


async def reset_device(app):
    for viewer in tuple(app["stream_state"]["viewers"]):
        await viewer.close(code=1001, message=b"Session ended")
    package = app["runtime"]["active_package"]
    if package_allowed(app, package):
        try:
            temporary = LAST_PACKAGE.with_suffix(".tmp")
            temporary.write_text(package + "\n", encoding="ascii")
            temporary.replace(LAST_PACKAGE)
        except OSError:
            # A warm-app hint must never prevent the clean device reset.
            logging.warning("Could not retain preview package for next clean boot")
    # The emulator console kill command can succeed without stopping this AVD.
    # A root-owned path unit observes only this request file and restarts only
    # the dedicated preview emulator service, which boots with -wipe-data.
    RESET_REQUEST.touch()


async def sweep_sessions(app):
    ticks = 0
    while True:
        await asyncio.sleep(5)
        ticks += 1
        try:
            await app["sessions"].expire_idle()
        except RuntimeError:
            logging.exception("Preview reset failed; device remains unavailable")
        if ticks % 3 == 0:
            await dismiss_bluetooth_crash()


async def dismiss_bluetooth_crash():
    """Remove only a known AVD system overlay, never an app error dialog."""
    process = None
    try:
        process = await asyncio.create_subprocess_exec(
            ADB, "-s", DEVICE, "shell", "dumpsys", "window", stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(process.communicate(), timeout=4)
        if bluetooth_crash_focused(stdout):
            await adb_input("keyevent", "4")
            logging.warning("Dismissed known Bluetooth crash overlay on preview AVD")
    except (OSError, RuntimeError, asyncio.TimeoutError):
        if process is not None and process.returncode is None:
            process.kill()
            await process.wait()
        logging.warning("Could not inspect preview AVD system overlay")


def bluetooth_crash_focused(window_dump: bytes) -> bool:
    focus = next((line for line in window_dump.splitlines() if b"mCurrentFocus=" in line), b"")
    return b"Application Error: com.google.android.bluetooth" in focus


async def health(request):
    manager = request.app["sessions"]
    return web.json_response({
        "ready": True,
        "available": manager.token is None and not manager.resetting,
        "state": "resetting" if manager.resetting else "leased" if manager.token else "ready",
        "app": request.app["catalog"].get(request.app["runtime"]["active_package"] or DEFAULT_PACKAGE, {"name": APP_NAME})["name"],
        "mode": "tenant" if request.app["broker_secret"] is not None else "private_lab",
    })


def package_allowed(app, package):
    return package in app["catalog"] and ("*" in ALLOWED_PACKAGES or package in ALLOWED_PACKAGES)


def refresh_catalog(app):
    # Atomic publication means a request sees either the prior complete list or
    # the next one. The provisioner verifies each APK before adding its entry.
    catalog = json.loads(APP_CATALOG.read_text(encoding="utf-8"))
    if not isinstance(catalog, list):
        raise ValueError("Preview catalog is invalid")
    validated = {}
    for entry in catalog:
        if (not isinstance(entry, dict) or not {"package", "name", "icon"} <= set(entry)
                or set(entry) - {"package", "name", "icon", "launch_gate"}
                or not all(isinstance(entry[key], str) and entry[key] for key in ("package", "name", "icon"))
                or ("launch_gate" in entry and entry["launch_gate"] != "google_play")
                or entry["package"] in validated):
            raise ValueError("Preview catalog has invalid entries")
        validated[entry["package"]] = entry
    app["catalog"] = validated


def check_origin(request):
    # Browsers always send Origin for cross-origin POSTs and WebSockets. Local
    # command-line health/benchmark clients may omit it.
    origin = request.headers.get("Origin")
    if origin is not None and origin not in ALLOWED_ORIGINS:
        raise web.HTTPForbidden(text="Preview origin not allowed")


def check_broker(request):
    secret = request.app["broker_secret"]
    if secret is None:
        return
    supplied = request.headers.get("Authorization", "")
    if not supplied.startswith("Bearer ") or not supplied[7:].isascii() or not hmac.compare_digest(supplied[7:].encode("ascii"), secret):
        raise web.HTTPForbidden(text="Preview broker authorization required")


def browser_json(data, status=200):
    return web.json_response(data, status=status, headers={
        "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
        "Vary": "Origin",
        "Cache-Control": "no-store",
    })


async def create_session(request):
    check_origin(request)
    check_broker(request)
    try:
        refresh_catalog(request.app)
    except (OSError, ValueError):
        return browser_json({"error": "Preview app catalog is being updated."}, status=503)
    try:
        payload = await request.json()
    except (ValueError, TypeError):
        payload = {}
    resume_token = payload.get("token") if isinstance(payload, dict) else None
    package = payload.get("package", DEFAULT_PACKAGE) if isinstance(payload, dict) else DEFAULT_PACKAGE
    if resume_token is not None and (not isinstance(resume_token, str) or len(resume_token) > 100):
        raise web.HTTPBadRequest(text="Invalid session token")
    if not isinstance(package, str) or not package_allowed(request.app, package):
        return browser_json({"error": "This app is not staged for this worker."}, status=400)
    try:
        token = await request.app["sessions"].acquire(resume_token)
        await provision_app(request.app, package)
    except (SessionBusy, SessionInvalid) as exc:
        return browser_json({"error": str(exc), "retry": True}, status=409)
    except (RuntimeError, OSError) as exc:
        logging.warning("Preview provisioning failed: %s", type(exc).__name__)
        await request.app["sessions"].release(token)
        return browser_json({"error": "This app could not be prepared on the test device."}, status=503)
    return browser_json({"token": token, "app": request.app["catalog"][package]["name"], "idleSeconds": 120})


async def end_session(request):
    check_origin(request)
    check_broker(request)
    try:
        payload = await request.json()
    except (ValueError, TypeError):
        raise web.HTTPBadRequest(text="Invalid session request")
    token = payload.get("token") if isinstance(payload, dict) else None
    if not isinstance(token, str) or len(token) > 100:
        raise web.HTTPBadRequest(text="Invalid session token")
    manager = request.app["sessions"]
    if token != manager.token:
        raise web.HTTPForbidden(text="Unknown session")
    # The reset closes the active stream and kills this emulator; the service
    # starts it again with -wipe-data. The browser need not wait for boot.
    asyncio.create_task(manager.release(token))
    return browser_json({"ending": True})


async def broadcast_frames(app):
    """Poll the emulator at 20 fps and keep only the newest frame per viewer."""
    stub = app["stub"]
    metadata = app["metadata"]
    state = app["stream_state"]
    encoder = None
    try:
        # Raw emulator frames arrive faster than its PNG encoder can produce
        # them. One persistent ffmpeg process turns them into small JPEGs.
        encoder = await asyncio.create_subprocess_exec(
            "/usr/bin/ffmpeg", "-hide_banner", "-loglevel", "error",
            "-f", "rawvideo", "-pixel_format", "rgb24",
            "-video_size", f"{FRAME_WIDTH}x{FRAME_HEIGHT}",
            "-framerate", "30", "-i", "pipe:0", "-threads", "1",
            "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "4",
            "-flush_packets", "1", "pipe:1",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            limit=2 * 1024 * 1024,
        )
        request_format = upstream.ec.ImageFormat(
            format=upstream.ec.ImageFormat.RGB888,
            width=FRAME_WIDTH,
            height=FRAME_HEIGHT,
        )
        next_frame_at = time.monotonic()
        while True:
            frame = await asyncio.wait_for(
                stub.getScreenshot(request_format, metadata=metadata), timeout=2,
            )
            if not frame.image:
                continue
            if len(frame.image) != FRAME_WIDTH * FRAME_HEIGHT * 3:
                continue
            encoder.stdin.write(frame.image)
            _, jpeg = await asyncio.gather(
                encoder.stdin.drain(),
                encoder.stdout.readuntil(b"\xff\xd9"),
            )
            if not jpeg.startswith(b"\xff\xd8"):
                raise RuntimeError("Preview encoder returned an invalid JPEG")
            state["latest_frame"] = jpeg
            state["last_frame_at"] = time.monotonic()
            for viewer in tuple(state["viewers"].values()):
                queue = viewer["queue"]
                if queue.full():
                    queue.get_nowait()
                queue.put_nowait(jpeg)
            next_frame_at += 1 / 20
            if next_frame_at < time.monotonic() - 1:
                next_frame_at = time.monotonic()
            await asyncio.sleep(max(0, next_frame_at - time.monotonic()))
    except asyncio.CancelledError:
        raise
    except grpc.aio.AioRpcError as exc:
        logging.warning("Preview screen stream ended: %s", exc.code().name)
        state["latest_frame"] = None
        for viewer in tuple(state["viewers"]):
            await viewer.close(code=1011, message=b"Device stream stopped")
    except asyncio.TimeoutError:
        logging.warning("Preview screenshot read timed out; reconnecting viewers")
        state["latest_frame"] = None
        for viewer in tuple(state["viewers"]):
            await viewer.close(code=1011, message=b"Device stream stalled")
    except (OSError, RuntimeError, asyncio.IncompleteReadError, asyncio.LimitOverrunError) as exc:
        logging.warning("Preview image encoder stopped: %s", type(exc).__name__)
        state["latest_frame"] = None
        for viewer in tuple(state["viewers"]):
            await viewer.close(code=1011, message=b"Image encoder stopped")
    finally:
        if encoder is not None and encoder.returncode is None:
            try:
                encoder.kill()
            except ProcessLookupError:
                pass
            await encoder.wait()


async def stream(request):
    app = request.app
    check_origin(request)
    protocols = [value.strip() for value in request.headers.get("Sec-WebSocket-Protocol", "").split(",")]
    protocol_tokens = [value[8:] for value in protocols if value.startswith("session.")]
    requested_token = (protocol_tokens[0] if len(protocol_tokens) == 1 else None) if app["broker_secret"] is not None else request.query.get("session") or None
    requested_package = request.query.get("package") or DEFAULT_PACKAGE
    ws = web.WebSocketResponse(heartbeat=20, max_msg_size=16384, compress=False, protocols=("northstar-preview",))
    if app["broker_secret"] is not None and requested_token is None:
        await ws.prepare(request)
        await ws.send_json({"type": "error", "message": "Request this preview through Northstar."})
        await ws.close(code=1008, message=b"Preview grant required")
        return ws
    if requested_token is None and (requested_package not in ALLOWED_PACKAGES or requested_package not in app["catalog"]):
        await ws.prepare(request)
        await ws.send_json({"type": "error", "message": "This app is not staged for this test device."})
        await ws.close(code=1008, message=b"Preview app unavailable")
        return ws
    try:
        token = await app["sessions"].acquire(requested_token)
        await provision_app(app, requested_package if requested_token is None else app["runtime"]["active_package"] or DEFAULT_PACKAGE)
        await app["sessions"].attach(token)
    except SessionBusy as exc:
        await ws.prepare(request)
        await ws.send_json({"type": "error", "message": str(exc)})
        await ws.close(code=1013, message=b"Preview device occupied")
        return ws
    except SessionInvalid:
        await ws.prepare(request)
        await ws.send_json({"type": "error", "message": "This preview session expired. Requesting a clean device…"})
        await ws.close(code=1008, message=b"Preview session expired")
        return ws
    except (RuntimeError, OSError, ValueError):
        await app["sessions"].release(token)
        await ws.prepare(request)
        await ws.send_json({"type": "error", "message": "This app could not be prepared on the test device."})
        await ws.close(code=1011, message=b"Preview app preparation failed")
        return ws
    # JPEG is already compressed; WebSocket deflate adds latency and CPU work.
    try:
        await ws.prepare(request)
    except Exception:
        await app["sessions"].detach(token)
        raise
    state = app["stream_state"]
    if state["viewers"]:
        await ws.send_json({"type": "error", "message": "This test device is already in use. The preview will connect when it becomes free."})
        await ws.close(code=1013, message=b"Preview device occupied")
        await app["sessions"].detach(token)
        return ws
    queue = asyncio.Queue(maxsize=1)
    # A small window covers network round-trip time without allowing an
    # unbounded backlog of stale frames in the SSH tunnel or browser.
    slots = asyncio.Semaphore(4)
    viewer = {"queue": queue, "slots": slots, "in_flight": 0}
    state["viewers"][ws] = viewer
    await ws.send_json({"type": "session", "token": token, "app": app["catalog"][app["runtime"]["active_package"]]["name"]})
    if state["latest_frame"] is not None and time.monotonic() - state["last_frame_at"] < 2:
        queue.put_nowait(state["latest_frame"])
    if state["frame_task"] is None or state["frame_task"].done():
        state["frame_task"] = asyncio.create_task(broadcast_frames(app))
    stub = app["stub"]
    metadata = app["metadata"]
    active_contact = None

    async def send_frames():
        try:
            while not ws.closed:
                await slots.acquire()
                jpeg = await queue.get()
                viewer["in_flight"] += 1
                await ws.send_bytes(jpeg)
        except asyncio.CancelledError:
            raise
        except (ConnectionResetError, RuntimeError):
            pass

    frame_task = asyncio.create_task(send_frames())

    async def touch(action, x, y):
        nonlocal active_contact
        if action not in {"down", "move", "up"}:
            return
        if action == "up":
            active_contact = None
        else:
            active_contact = (x, y)
        contact = upstream.ec.Touch(
            x=max(0, min(1079, x)),
            y=max(0, min(2399, y)),
            identifier=0,
            pressure=0 if action == "up" else 100,
        )
        await stub.sendTouch(upstream.ec.TouchEvent(touches=[contact]), metadata=metadata)

    async def scroll(x, y, delta_y):
        """Turn a wheel/trackpad gesture into a short Android finger swipe."""
        direction = 1 if delta_y > 0 else -1
        distance = min(850, max(180, int(abs(delta_y) * 2.2)))
        start_y = max(480, min(1920, y))
        end_y = max(180, min(2220, start_y - direction * distance))
        await touch("down", x, start_y)
        try:
            for step in range(1, 7):
                await asyncio.sleep(0.007)
                position = round(start_y + (end_y - start_y) * step / 6)
                await touch("move", x, position)
        finally:
            await touch("up", x, end_y)

    try:
        async for message in ws:
            if message.type != WSMsgType.TEXT:
                continue
            try:
                payload = json.loads(message.data)
                kind = payload.get("type")
                if kind == "frame_ready":
                    if viewer["in_flight"] > 0:
                        viewer["in_flight"] -= 1
                        slots.release()
                    await app["sessions"].seen(token)
                elif kind == "touch":
                    x, y = payload.get("x"), payload.get("y")
                    if type(x) is int and type(y) is int:
                        await touch(payload.get("action"), x, y)
                        if payload.get("action") == "up" and type(payload.get("id")) is int:
                            await ws.send_json({"type": "input_applied", "id": payload["id"]})
                elif kind == "scroll":
                    x, y, delta_y = payload.get("x"), payload.get("y"), payload.get("deltaY")
                    if type(x) is int and type(y) is int and type(delta_y) in (int, float) and math.isfinite(delta_y) and delta_y:
                        try:
                            await scroll(max(0, min(1079, x)), max(0, min(2399, y)), max(-650, min(650, delta_y)))
                        finally:
                            await ws.send_str('{"type":"scroll_done"}')
                        if type(payload.get("id")) is int:
                            await ws.send_json({"type": "input_applied", "id": payload["id"]})
                elif kind == "key":
                    key = payload.get("key")
                    if isinstance(key, str) and key in ALLOWED_KEYS:
                        await adb_input("keyevent", ADB_KEYS[key])
                        if type(payload.get("id")) is int:
                            await ws.send_json({"type": "input_applied", "id": payload["id"]})
                elif kind == "text":
                    value = payload.get("value", "")
                    if isinstance(value, str) and 0 < len(value) <= 200 and value.isascii() and value.isprintable():
                        await send_adb_text(value, adb=ADB, device=DEVICE, run_checked=run_checked)
                        if type(payload.get("id")) is int:
                            await ws.send_json({"type": "input_applied", "id": payload["id"]})
                elif kind == "end_session":
                    await ws.send_json({"type": "session_ending"})
                    # Complete the WebSocket close handshake before reset
                    # restarts this process, so the viewer receives the end
                    # acknowledgement instead of treating it as a disconnect.
                    await ws.close()
                    asyncio.create_task(app["sessions"].release(token))
                    break
            except (ValueError, TypeError, RuntimeError, grpc.aio.AioRpcError) as exc:
                logging.warning("Preview input rejected: %s", type(exc).__name__)
    finally:
        # Closing a tab halfway through a drag must not leave a finger held
        # down in Android for the next interaction.
        if active_contact is not None:
            try:
                await asyncio.wait_for(touch("up", *active_contact), timeout=1)
            except (asyncio.TimeoutError, grpc.aio.AioRpcError):
                logging.warning("Could not release preview touch on disconnect")
        frame_task.cancel()
        try:
            await frame_task
        except asyncio.CancelledError:
            pass
        state["viewers"].pop(ws, None)
        await app["sessions"].detach(token)
        if not state["viewers"] and state["frame_task"] is not None:
            state["frame_task"].cancel()
            try:
                await state["frame_task"]
            except asyncio.CancelledError:
                pass
            state["frame_task"] = None
    return ws


async def init_connection(app):
    refresh_catalog(app)
    app["broker_secret"] = Path(BROKER_SECRET_FILE).read_bytes().strip() if BROKER_SECRET_FILE else None
    if app["broker_secret"] is not None and len(app["broker_secret"]) < 32:
        raise RuntimeError("Preview broker secret must be at least 32 bytes")
    if DEFAULT_PACKAGE not in app["catalog"] or ("*" not in ALLOWED_PACKAGES and not ALLOWED_PACKAGES <= app["catalog"].keys()):
        raise RuntimeError("Preview worker app catalog is incomplete")
    app["runtime"] = {"active_package": None}
    app["provision_lock"] = asyncio.Lock()
    props = upstream.parse_discovery_file(app["discovery_file"])
    token = props.get("grpc.token")
    port = props.get("grpc.port")
    if not token or not port:
        raise RuntimeError("Preview emulator discovery file lacks local gRPC credentials")
    channel = grpc.aio.insecure_channel(f"127.0.0.1:{port}")
    app["channel"] = channel
    app["stub"] = upstream.ec_grpc.EmulatorControllerStub(channel)
    app["metadata"] = [("authorization", f"Bearer {token}")]
    app["sessions"] = SessionManager(lambda: reset_device(app))
    sweeper = asyncio.create_task(sweep_sessions(app))
    yield
    sweeper.cancel()
    try:
        await sweeper
    except asyncio.CancelledError:
        pass
    task = app["stream_state"]["frame_task"]
    if task is not None:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    await channel.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--discovery-file", required=True)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    app = web.Application()
    app["discovery_file"] = args.discovery_file
    app["stream_state"] = {"viewers": {}, "frame_task": None, "latest_frame": None, "last_frame_at": 0.0}
    app.cleanup_ctx.append(init_connection)
    app.router.add_get("/health", health)
    app.router.add_post("/sessions", create_session)
    app.router.add_post("/sessions/end", end_session)
    app.router.add_get("/stream", stream)
    web.run_app(app, host="127.0.0.1", port=PORT, access_log=None, shutdown_timeout=5)


if __name__ == "__main__":
    main()
