"""FastAPI 相依項目：登入使用者、資料存取、Anthropic client。測試以 dependency_overrides 替換。"""

from collections.abc import Callable
from functools import cache
from typing import Annotated

from fastapi import Depends, Header

from threadsinsightapi.ai_strategy import MessagesClient, ai_enabled, create_client
from threadsinsightapi.auth import (
    AuthUser,
    SigningKeyResolver,
    default_key_resolver,
    expected_issuer,
    parse_bearer,
    verify_access_token,
)
from threadsinsightapi.task_repository import (
    PostgrestTaskRepository,
    TaskRepository,
    publishable_key,
    shared_http_client,
)


def get_key_resolver() -> SigningKeyResolver:
    """Supabase JWKS 公鑰來源；測試換成本機產生的金鑰。"""
    return default_key_resolver()


def require_user(
    resolver: Annotated[SigningKeyResolver, Depends(get_key_resolver)],
    authorization: Annotated[str | None, Header()] = None,
) -> AuthUser:
    """所有業務端點都需要登入（PRD AC-1）：沒有或無效的 token 一律 401。"""
    return verify_access_token(parse_bearer(authorization), resolver, expected_issuer())


CurrentUser = Annotated[AuthUser, Depends(require_user)]


def get_task_repository(user: CurrentUser) -> TaskRepository:
    """以使用者自己的 token 存取資料庫，RLS 決定看得到哪些資料（ADR-001 原則 1）。"""
    return PostgrestTaskRepository(shared_http_client(), publishable_key(), user.access_token)


Repository = Annotated[TaskRepository, Depends(get_task_repository)]


@cache
def _default_client() -> MessagesClient:
    return create_client()


def get_ai_client() -> MessagesClient | None:
    """未啟用 AI（沒有金鑰或 THREADSINSIGHT_AI=off）時為 None。"""
    return _default_client() if ai_enabled() else None


def get_client_factory() -> Callable[[str], MessagesClient]:
    """以使用者金鑰建立 client 的工廠。"""
    return create_client
