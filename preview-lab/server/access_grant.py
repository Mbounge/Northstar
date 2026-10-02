"""Verify short-lived Northstar tenant grants before allocating a preview.

The signed grant is issued by Northstar's authenticated server route. The
browser cannot choose its own tenant or add packages to the grant.
"""

import base64
import binascii
import hashlib
import hmac
import json
import time


class GrantInvalid(Exception):
    pass


def _decode(part: str) -> bytes:
    try:
        return base64.b64decode(part + "=" * (-len(part) % 4), altchars=b"-_", validate=True)
    except (ValueError, binascii.Error) as exc:
        raise GrantInvalid("Invalid preview grant") from exc


def verify_grant(token: str, secret: bytes, known_packages: set[str], now: int | None = None) -> dict:
    if not isinstance(token, str) or len(token) > 4096 or len(secret) < 32:
        raise GrantInvalid("Invalid preview grant")
    parts = token.split(".")
    if len(parts) != 2:
        raise GrantInvalid("Invalid preview grant")
    payload_bytes, supplied_mac = _decode(parts[0]), _decode(parts[1])
    expected_mac = hmac.new(secret, parts[0].encode("ascii"), hashlib.sha256).digest()
    if len(supplied_mac) != 32 or not hmac.compare_digest(supplied_mac, expected_mac):
        raise GrantInvalid("Invalid preview grant")
    try:
        payload = json.loads(payload_bytes)
    except (ValueError, UnicodeDecodeError) as exc:
        raise GrantInvalid("Invalid preview grant") from exc
    if not isinstance(payload, dict) or set(payload) != {"v", "aud", "tenant", "user", "packages", "exp"}:
        raise GrantInvalid("Invalid preview grant")
    if type(payload["v"]) is not int or payload["v"] != 1 or payload["aud"] != "northstar-preview":
        raise GrantInvalid("Invalid preview grant")
    if any(not isinstance(payload[field], str) or not payload[field] or len(payload[field]) > 128 for field in ("tenant", "user")):
        raise GrantInvalid("Invalid preview grant")
    packages = payload["packages"]
    if not isinstance(packages, list) or len(packages) > 100 or any(not isinstance(package, str) or package not in known_packages for package in packages):
        raise GrantInvalid("Invalid preview grant")
    if len(packages) != len(set(packages)):
        raise GrantInvalid("Invalid preview grant")
    current = int(time.time()) if now is None else now
    if type(payload["exp"]) is not int or not current < payload["exp"] <= current + 900:
        raise GrantInvalid("Preview grant expired")
    return payload
