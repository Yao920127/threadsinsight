"""Supabase Auth 登入憑證驗證（ADR-001）。

前端以 `Authorization: Bearer <access token>` 呼叫 API。這裡用 Supabase 公開的 JWKS 驗證簽章，
只接受非對稱演算法（ES256／RS256），並檢查 issuer、audience、到期時間與 role。
驗證通過後保留原始 token，之後以「使用者身分」存取資料庫時交給 PostgREST，讓 RLS 生效。
"""

import os
import uuid
from dataclasses import dataclass
from functools import cache
from typing import Any, Protocol

import jwt

DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321"
ALLOWED_ALGORITHMS = ("ES256", "RS256")  # 不接受 HS256：共用密鑰一旦外洩即可偽造任何人
AUDIENCE = "authenticated"
CLOCK_LEEWAY_SECONDS = 10
JWKS_CACHE_SECONDS = 300


class AuthError(Exception):
    """未登入或憑證無效（回 401）。訊息給開發者看，不含 token 內容。"""


class AuthUnavailableError(Exception):
    """無法取得驗證公鑰（Supabase 未啟動或網路問題，回 503）。"""


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str | None
    access_token: str  # 之後以使用者身分查詢資料庫時使用；不得記錄或回傳


class SigningKeyResolver(Protocol):
    def get_signing_key_from_jwt(self, token: str) -> Any: ...


def supabase_url() -> str:
    return os.environ.get("SUPABASE_URL", DEFAULT_SUPABASE_URL).rstrip("/")


def expected_issuer() -> str:
    """token 的 iss。容器內以 host.docker.internal 連 Supabase，但 token 由瀏覽器端的網址簽發，
    兩者不同時以 SUPABASE_JWT_ISSUER 指定。"""
    return os.environ.get("SUPABASE_JWT_ISSUER") or f"{supabase_url()}/auth/v1"


def jwks_url() -> str:
    return f"{supabase_url()}/auth/v1/.well-known/jwks.json"


@cache
def default_key_resolver() -> SigningKeyResolver:
    return jwt.PyJWKClient(
        jwks_url(),
        cache_keys=True,
        lifespan=JWKS_CACHE_SECONDS,
        timeout=5,
    )


def parse_bearer(authorization: str | None) -> str:
    if not authorization:
        raise AuthError("Missing bearer token")
    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise AuthError("Malformed authorization header")
    return token


def verify_access_token(token: str, resolver: SigningKeyResolver, issuer: str) -> AuthUser:
    """驗證 Supabase access token；任何不符都丟 AuthError，不透露細節給呼叫端。"""
    try:
        signing_key = resolver.get_signing_key_from_jwt(token)
    except jwt.PyJWKClientConnectionError as error:
        raise AuthUnavailableError("Cannot fetch JWKS") from error
    except jwt.PyJWTError as error:
        raise AuthError("Unknown signing key") from error

    try:
        claims = jwt.decode(
            token,
            key=signing_key.key,
            algorithms=list(ALLOWED_ALGORITHMS),
            audience=AUDIENCE,
            issuer=issuer,
            leeway=CLOCK_LEEWAY_SECONDS,
            options={"require": ["exp", "sub", "aud", "iss"]},
        )
    except jwt.PyJWTError as error:
        raise AuthError("Invalid token") from error

    if claims.get("role") != "authenticated":
        raise AuthError("Token is not for a signed-in user")
    try:
        user_id = str(uuid.UUID(str(claims["sub"])))
    except ValueError as error:
        raise AuthError("Invalid subject") from error
    email = claims.get("email")
    return AuthUser(id=user_id, email=email if isinstance(email, str) else None, access_token=token)
