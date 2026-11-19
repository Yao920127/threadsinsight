"""FastAPI 相依項目：登入使用者、資料存取、Anthropic client。測試以 dependency_overrides 替換。"""

from collections.abc import Callable
from functools import cache
from typing import Annotated

from fastapi import Cookie, Depends

from threadsinsightapi.accounts import AccountStore, PostgresAccountStore
from threadsinsightapi.ai_strategy import MessagesClient, ai_enabled, create_client
from threadsinsightapi.auth import SESSION_COOKIE, AuthError, AuthUser
from threadsinsightapi.db import shared_pool
from threadsinsightapi.task_repository import PostgresTaskRepository, TaskRepository


def get_account_store() -> AccountStore:
    return PostgresAccountStore(shared_pool())


Accounts = Annotated[AccountStore, Depends(get_account_store)]


def require_user(
    accounts: Accounts,
    session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> AuthUser:
    """所有業務端點都需要登入（PRD AC-1）：沒有或無效的登入狀態一律 401。"""
    if not session:
        raise AuthError("Missing session cookie")
    user = accounts.user_for_session(session)
    if user is None:
        raise AuthError("Unknown or expired session")
    return user


CurrentUser = Annotated[AuthUser, Depends(require_user)]


def get_task_repository(user: CurrentUser) -> TaskRepository:
    """以目前使用者的身分存取資料庫，RLS 決定看得到哪些資料（ADR-002）。"""
    return PostgresTaskRepository(shared_pool(), user.id)


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
