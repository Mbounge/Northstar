import unittest

from aiohttp import web
from aiohttp.test_utils import make_mocked_request

from pool_broker import catalog_preflight, checked_origin


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


if __name__ == "__main__":
    unittest.main()
