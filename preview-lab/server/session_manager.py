"""One-device preview lease with an explicit clean-reset boundary.

This is intentionally independent of HTTP and Android so allocation races and
disconnect/reconnect behavior can be tested without starting an emulator.
"""

import asyncio
import secrets
import time
from collections.abc import Awaitable, Callable


class SessionBusy(Exception):
    pass


class SessionInvalid(Exception):
    pass


class SessionManager:
    def __init__(self, reset: Callable[[], Awaitable[None]], idle_seconds=120, clock=time.monotonic):
        self.reset = reset
        self.idle_seconds = idle_seconds
        self.clock = clock
        self.lock = asyncio.Lock()
        self.token: str | None = None
        self.viewer_attached = False
        self.last_seen = 0.0
        self.resetting = False

    async def acquire(self, resume_token: str | None = None) -> str:
        async with self.lock:
            if self.resetting:
                raise SessionBusy("The test device is preparing a clean session.")
            if self.token is not None:
                if resume_token != self.token:
                    raise SessionBusy("The test device is already in use.")
                self.last_seen = self.clock()
                return self.token
            if resume_token is not None:
                raise SessionInvalid("Preview session expired")
            self.token = secrets.token_urlsafe(32)
            self.last_seen = self.clock()
            return self.token

    async def attach(self, token: str) -> None:
        async with self.lock:
            if self.resetting or token != self.token:
                raise SessionInvalid("Preview session expired")
            if self.viewer_attached:
                raise SessionBusy("This session already has an active viewer.")
            self.viewer_attached = True
            self.last_seen = self.clock()

    async def seen(self, token: str) -> None:
        async with self.lock:
            if token == self.token and not self.resetting:
                self.last_seen = self.clock()

    async def detach(self, token: str) -> None:
        async with self.lock:
            if token == self.token:
                self.viewer_attached = False
                self.last_seen = self.clock()

    async def release(self, token: str) -> bool:
        async with self.lock:
            if token != self.token or self.resetting:
                return False
            self.token = None
            self.viewer_attached = False
            self.resetting = True
        # Fail closed: if reset fails, this process must never lease the dirty
        # device to someone else. An operator has to repair/restart it.
        await self.reset()
        return True

    async def expire_idle(self) -> bool:
        async with self.lock:
            token = self.token
            expired = bool(token and not self.viewer_attached and self.clock() - self.last_seen >= self.idle_seconds)
        return await self.release(token) if expired and token else False
