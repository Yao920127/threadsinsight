"""測試用的登入憑證：本機產生 EC 金鑰簽 token，取代 Supabase 的 JWKS，不需要網路。"""

import time
from types import SimpleNamespace
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric import ec

from threadsinsightapi.auth import expected_issuer

USER_A = "11111111-1111-1111-1111-111111111111"
USER_B = "22222222-2222-2222-2222-222222222222"
TEST_KID = "test-key"

_private_key = ec.generate_private_key(ec.SECP256R1())
_other_key = ec.generate_private_key(ec.SECP256R1())


class StaticResolver:
    """模擬 PyJWKClient：只認得測試金鑰的 kid。"""

    def get_signing_key_from_jwt(self, token: str) -> SimpleNamespace:
        kid = jwt.get_unverified_header(token).get("kid")
        if kid != TEST_KID:
            raise jwt.PyJWKClientError(f"Unable to find a signing key that matches: {kid}")
        return SimpleNamespace(key=_private_key.public_key())


def make_token(
    sub: str = USER_A,
    *,
    signed_by_other_key: bool = False,
    algorithm: str = "ES256",
    **overrides: Any,
) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {
        "sub": sub,
        "aud": "authenticated",
        "iss": expected_issuer(),
        "role": "authenticated",
        "email": "user_a@example.com",
        "iat": now,
        "exp": now + 3600,
        **overrides,
    }
    claims = {k: v for k, v in claims.items() if v is not None}
    key: Any = _other_key if signed_by_other_key else _private_key
    if algorithm == "HS256":
        key = "super-secret-jwt-token-with-at-least-32-characters-long"
    return jwt.encode(claims, key, algorithm=algorithm, headers={"kid": TEST_KID})


def auth_headers(sub: str = USER_A) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub)}"}
