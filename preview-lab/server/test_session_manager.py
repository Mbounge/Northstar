import asyncio
import unittest

from session_manager import SessionBusy, SessionInvalid, SessionManager


class SessionManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_only_one_visitor_can_lease_and_attach(self):
        resets = []
        async def reset():
            resets.append(True)

        manager = SessionManager(reset)
        token = await manager.acquire()
        with self.assertRaises(SessionBusy):
            await manager.acquire()
        await manager.attach(token)
        with self.assertRaises(SessionBusy):
            await manager.attach(token)
        with self.assertRaises(SessionInvalid):
            await manager.attach("another-visitor")
        await manager.detach(token)
        self.assertEqual(await manager.acquire(token), token)
        self.assertEqual(resets, [])

    async def test_stale_token_cannot_claim_a_clean_device(self):
        async def reset():
            pass

        manager = SessionManager(reset)
        with self.assertRaises(SessionInvalid):
            await manager.acquire("expired-visitor-token")
        self.assertIsNone(manager.token)

    async def test_release_blocks_new_visitors_until_clean_restart(self):
        started = asyncio.Event()
        finish = asyncio.Event()
        async def reset():
            started.set()
            await finish.wait()

        manager = SessionManager(reset)
        token = await manager.acquire()
        pending = asyncio.create_task(manager.release(token))
        await started.wait()
        with self.assertRaises(SessionBusy):
            await manager.acquire()
        with self.assertRaises(SessionInvalid):
            await manager.attach(token)
        finish.set()
        self.assertTrue(await pending)
        self.assertTrue(manager.resetting)

    async def test_detached_session_expires_and_triggers_reset(self):
        now = 0.0
        resets = []
        async def reset():
            resets.append(True)

        manager = SessionManager(reset, idle_seconds=120, clock=lambda: now)
        token = await manager.acquire()
        await manager.attach(token)
        now = 500
        self.assertFalse(await manager.expire_idle())
        await manager.detach(token)
        now = 619
        self.assertFalse(await manager.expire_idle())
        now = 620
        self.assertTrue(await manager.expire_idle())
        self.assertEqual(resets, [True])


if __name__ == "__main__":
    unittest.main()
