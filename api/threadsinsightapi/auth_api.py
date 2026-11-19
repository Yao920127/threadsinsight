"""會員端點（PRD F1）：註冊、登入、登出、目前登入的帳號、刪除自己的帳號。

- POST   /api/auth/signup   建立帳號並直接登入（不驗證信箱）
- POST   /api/auth/login    登入；Email 或密碼錯誤一律回同一個訊息，不透露帳號是否存在
- POST   /api/auth/logout   登出；伺服器端作廢登入狀態
- GET    /api/auth/me       目前登入的帳號（未登入回 401）
- DELETE /api/auth/me       刪除自己的帳號與所有分析資料

註冊與登入以來源 IP 限制每分鐘次數，避免暴力猜密碼。
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Cookie, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from threadsinsightapi.auth import (
    MAX_EMAIL_LENGTH,
    SESSION_COOKIE,
    SESSION_TTL,
    InvalidCredentialsError,
    check_password_rules,
    normalize_email,
    secure_cookies,
)
from threadsinsightapi.dependencies import Accounts, CurrentUser
from threadsinsightapi.observability import log_event
from threadsinsightapi.passwords import MAX_PASSWORD_LENGTH, burn_time, hash_password
from threadsinsightapi.passwords import verify_password as check_password
from threadsinsightapi.responses import envelope
from threadsinsightapi.throttle import RateLimiter

logger = logging.getLogger("threadsinsightapi.auth")
router = APIRouter(prefix="/api/auth")

AUTH_RATE_LIMIT = 30  # 每個來源 IP 每分鐘最多 30 次註冊／登入嘗試（密碼雜湊本身也拖慢暴力猜測）
AUTH_RATE_WINDOW_SECONDS = 60.0
auth_limiter = RateLimiter(AUTH_RATE_LIMIT, AUTH_RATE_WINDOW_SECONDS)
TOO_MANY_ATTEMPTS = "Too many attempts; please retry in a minute"


class Credentials(BaseModel):
    email: str = Field(min_length=1, max_length=MAX_EMAIL_LENGTH)
    password: str = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _with_session(response: JSONResponse, token: str) -> JSONResponse:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        secure=secure_cookies(),
        samesite="strict",
        path="/",
    )
    return response


def _clear_session(response: JSONResponse) -> JSONResponse:
    response.delete_cookie(
        SESSION_COOKIE, httponly=True, secure=secure_cookies(), samesite="strict", path="/"
    )
    return response


@router.post("/signup")
def signup(body: Credentials, request: Request, accounts: Accounts) -> JSONResponse:
    if not auth_limiter.allow(_client_ip(request)):
        return envelope(429, error=TOO_MANY_ATTEMPTS)
    email = normalize_email(body.email)  # 不合法丟 InvalidSignupError → 400
    check_password_rules(body.password)
    user = accounts.create_user(email, hash_password(body.password))  # 重複丟 EmailTakenError
    log_event(logger, "auth.signup", user_id=user.id)
    token = accounts.create_session(user.id)
    return _with_session(envelope(201, data={"id": user.id, "email": user.email}), token)


@router.post("/login")
def login(body: Credentials, request: Request, accounts: Accounts) -> JSONResponse:
    if not auth_limiter.allow(_client_ip(request)):
        return envelope(429, error=TOO_MANY_ATTEMPTS)
    try:
        email = normalize_email(body.email)
    except ValueError:
        burn_time(body.password)
        raise InvalidCredentialsError from None
    found = accounts.find_credentials(email)
    if found is None:
        burn_time(body.password)
        raise InvalidCredentialsError
    user, stored_hash = found
    if not check_password(body.password, stored_hash):
        log_event(logger, "auth.login_failed", logging.WARNING, user_id=user.id)
        raise InvalidCredentialsError
    log_event(logger, "auth.login", user_id=user.id)
    token = accounts.create_session(user.id)
    return _with_session(envelope(200, data={"id": user.id, "email": user.email}), token)


@router.post("/logout")
def logout(
    accounts: Accounts, session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None
) -> JSONResponse:
    """沒登入也回 200，讓前端可以放心呼叫。"""
    if session:
        accounts.delete_session(session)
    return _clear_session(envelope(200, data={"signed_out": True}))


@router.get("/me")
def me(user: CurrentUser) -> JSONResponse:
    return envelope(200, data={"id": user.id, "email": user.email})


@router.delete("/me")
def delete_me(user: CurrentUser, accounts: Accounts) -> JSONResponse:
    accounts.delete_user(user.id)
    log_event(logger, "auth.account_deleted", user_id=user.id)
    return _clear_session(envelope(200, data={"deleted": True}))
