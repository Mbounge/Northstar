import unittest

from aiohttp import web
from aiohttp.test_utils import make_mocked_request

from pool_broker import catalog_preflight, checked_origin, release_preflight, release_session


class OriginTests(unittest.IsolatedAsyncioTestCase):
    async def test_allowed_origin_gets_a_scoped_preflight(self):
        request = make_mocked_request("OPTIONS", "/catalog", headers={"Origin": "http://127.0.0.1:5173"})
        response = await catalog_preflight(request)
        self.assertEqual(response.status, 204)
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], "http://127.0.0.1:5173")
        self.assertEqual(response.headers["Access-Control-Allow-Headers"], "Authorization")

    async def test_unknown_origin_is_refused(self):
        request = make_mocked_request("OPTIONS", "/catalog", headers={"Origin": "https://other.example"})
        with self.assertRaises(web.HTTPForbidden):
            checked_origin(request)

    async def test_release_preflight_allows_only_the_reset_request_headers(self):
        request = make_mocked_request("OPTIONS", "/release", headers={"Origin": "http://127.0.0.1:5173"})
        response = await release_preflight(request)
        self.assertEqual(response.status, 204)
        self.assertEqual(response.headers["Access-Control-Allow-Methods"], "POST")
        self.assertEqual(response.headers["Access-Control-Allow-Headers"], "Content-Type")

    async def test_release_rejects_unrecognised_worker_before_contacting_device(self):
        app = web.Application()
        app["workers"] = [{"id": "preview-2", "port": 18081, "packages": ["org.wikipedia"]}]
        request = make_mocked_request("POST", "/release", app=app, headers={"Origin": "http://127.0.0.1:5173"})
        request.json = lambda: self._release_request()
        with self.assertRaises(web.HTTPNotFound):
            await release_session(request)

    async def _release_request(self):
        return {"worker": "preview-other", "token": "A" * 43}


if __name__ == "__main__":
    unittest.main()
