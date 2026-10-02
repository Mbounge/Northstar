"""Local-only allocator for prewarmed Android preview workers.

Each worker remains the authority for its own lease. The broker merely tries
matching workers and returns the first one that atomically grants a session.
"""

import argparse
import asyncio
import json
import os
from pathlib import Path

from aiohttp import ClientError, ClientSession, ClientTimeout, WSMsgType, web
from access_grant import GrantInvalid, verify_grant


ALLOWED_ORIGINS = {origin.strip() for origin in os.environ.get("PREVIEW_ALLOWED_ORIGINS", "http://127.0.0.1:5173").split(",") if origin.strip()}


def checked_origin(request):
    origin = request.headers.get("Origin")
    if origin is not None and origin not in ALLOWED_ORIGINS:
        raise web.HTTPForbidden(text="Preview origin not allowed")
    return origin


def permitted_packages(app, grant: str | None) -> set[str]:
    secret = app["grant_secret"]
    if secret is None:
        # Private, loopback-only lab mode. Never use this when exposing the
        # broker to Northstar visitors.
        return set(app["apps"])
    payload = verify_grant(grant or "", secret, set(app["apps"]))
    return set(payload["packages"])


def load_workers(path: Path) -> list[dict]:
    workers = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(workers, list) or not workers:
        raise ValueError("Preview pool must contain at least one worker")
    ids = set()
    ports = set()
    for worker in workers:
        if not isinstance(worker, dict) or set(worker) != {"id", "packages", "port"}:
            raise ValueError("Invalid preview worker configuration")
        if not isinstance(worker["id"], str) or not worker["id"]:
            raise ValueError("Invalid preview worker id")
        if not isinstance(worker["packages"], list) or not worker["packages"] or any(not isinstance(package, str) or not package for package in worker["packages"]):
            raise ValueError("Invalid preview package list")
        if len(set(worker["packages"])) != len(worker["packages"]):
            raise ValueError("Duplicate preview package on worker")
        if type(worker["port"]) is not int or not 1024 <= worker["port"] <= 65535:
            raise ValueError("Invalid preview worker port")
        if worker["id"] in ids or worker["port"] in ports:
            raise ValueError("Duplicate preview worker")
        ids.add(worker["id"])
        ports.add(worker["port"])
    return workers


def load_apps(path: Path) -> dict[str, dict]:
    apps = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(apps, list) or not apps:
        raise ValueError("Preview app catalog is empty")
    result = {}
    for app in apps:
        if not isinstance(app, dict) or set(app) != {"package", "name", "icon"}:
            raise ValueError("Invalid preview app metadata")
        if not all(isinstance(value, str) and value for value in app.values()) or app["package"] in result:
            raise ValueError("Invalid or duplicate preview app")
        result[app["package"]] = app
    return result


async def allocate(request):
    checked_origin(request)
    ws = web.WebSocketResponse(max_msg_size=4096, heartbeat=20, compress=False)
    await ws.prepare(request)
    try:
        message = await asyncio.wait_for(ws.receive(), timeout=5)
        if message.type != WSMsgType.TEXT:
            return ws
        try:
            payload = json.loads(message.data)
        except ValueError:
            payload = {}
        package = payload.get("package") if isinstance(payload, dict) else None
        if not isinstance(package, str) or package not in request.app["apps"]:
            await ws.send_json({"type": "error", "message": "This app is not in the preview pool."})
            return ws
        try:
            permitted = permitted_packages(request.app, payload.get("grant"))
        except GrantInvalid:
            await ws.send_json({"type": "error", "message": "Your preview access has expired. Refresh Northstar and try again."})
            return ws
        if package not in permitted:
            await ws.send_json({"type": "error", "message": "This app is not available to your workspace."})
            return ws
        matching = [worker for worker in request.app["workers"] if package in worker["packages"]]
        if not matching:
            await ws.send_json({"type": "unavailable", "message": "No test device is configured for this app."})
            return ws
        await ws.send_json({"type": "preparing", "app": request.app["apps"][package]["name"]})
        async with ClientSession(timeout=ClientTimeout(total=90)) as client:
            for worker in matching:
                try:
                    headers = {"Authorization": "Bearer " + request.app["worker_secret"].decode("ascii")} if request.app["worker_secret"] else {}
                    async with client.post(f"http://127.0.0.1:{worker['port']}/sessions", json={"package": package}, headers=headers) as response:
                        if response.status != 200:
                            continue
                        result = await response.json()
                        await ws.send_json({
                            "type": "allocated",
                            "worker": worker["id"],
                            "port": worker["port"],
                            "package": package,
                            "app": result["app"],
                            "icon": request.app["apps"][package]["icon"],
                            "token": result["token"],
                        })
                        return ws
                except (ClientError, OSError, asyncio.TimeoutError):
                    continue
        await ws.send_json({"type": "unavailable", "message": "All devices for this app are occupied or preparing."})
    except asyncio.TimeoutError:
        await ws.send_json({"type": "error", "message": "Preview request timed out."})
    finally:
        await ws.close()
    return ws


async def health(request):
    return web.json_response({"ready": True, "workers": len(request.app["workers"])})


async def catalog(request):
    origin = checked_origin(request)
    try:
        authorization = request.headers.get("Authorization", "")
        grant = authorization[7:] if authorization.startswith("Bearer ") else None
        permitted = permitted_packages(request.app, grant)
    except GrantInvalid:
        raise web.HTTPUnauthorized(text="Preview access expired") from None
    async with ClientSession(timeout=ClientTimeout(total=2)) as client:
        async def status(worker):
            try:
                async with client.get(f"http://127.0.0.1:{worker['port']}/health") as response:
                    if response.status == 200:
                        health = await response.json()
                        return "available" if health["available"] else health["state"]
            except (ClientError, OSError, asyncio.TimeoutError, ValueError, KeyError):
                pass
            return "offline"

        states = await asyncio.gather(*(status(worker) for worker in request.app["workers"]))
    apps = []
    for package, metadata in request.app["apps"].items():
        if package not in permitted:
            continue
        supported = [state for worker, state in zip(request.app["workers"], states) if package in worker["packages"]]
        if "available" in supported:
            availability = "available"
        elif "leased" in supported:
            availability = "leased"
        elif "resetting" in supported:
            availability = "resetting"
        else:
            availability = "offline"
        apps.append({"package": package, "app": metadata["name"], "icon": metadata["icon"], "status": availability})
    headers = {"Vary": "Origin", "Cache-Control": "no-store"}
    if origin is not None:
        headers["Access-Control-Allow-Origin"] = origin
    return web.json_response({"apps": apps}, headers=headers)


async def catalog_preflight(request):
    origin = checked_origin(request)
    if origin is None:
        raise web.HTTPForbidden(text="Preview origin required")
    return web.Response(status=204, headers={
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Authorization",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
    })


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=Path, required=True)
    parser.add_argument("--apps", type=Path, required=True)
    parser.add_argument("--grant-secret-file", type=Path)
    parser.add_argument("--worker-secret-file", type=Path)
    parser.add_argument("--port", type=int, default=18082)
    args = parser.parse_args()
    app = web.Application()
    app["workers"] = load_workers(args.workers)
    app["apps"] = load_apps(args.apps)
    app["grant_secret"] = args.grant_secret_file.read_bytes().strip() if args.grant_secret_file else None
    app["worker_secret"] = args.worker_secret_file.read_bytes().strip() if args.worker_secret_file else None
    if app["grant_secret"] is not None and len(app["grant_secret"]) < 32:
        raise ValueError("Preview grant secret must be at least 32 bytes")
    if app["grant_secret"] is not None and app["worker_secret"] is None:
        raise ValueError("Tenant mode requires a separate broker-to-worker secret")
    if app["worker_secret"] is not None and (len(app["worker_secret"]) < 32 or not app["worker_secret"].isascii()):
        raise ValueError("Preview worker secret must be at least 32 ASCII bytes")
    if any(package not in app["apps"] for worker in app["workers"] for package in worker["packages"]):
        raise ValueError("Worker refers to an unregistered preview app")
    app.router.add_get("/allocate", allocate)
    app.router.add_get("/health", health)
    app.router.add_get("/catalog", catalog)
    app.router.add_options("/catalog", catalog_preflight)
    web.run_app(app, host="127.0.0.1", port=args.port, access_log=None)


if __name__ == "__main__":
    main()
