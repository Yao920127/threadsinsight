from typing import Annotated

import pytest
from fake_accounts import FakeAccountStore
from fake_repository import FakeTaskRepository, Store
from fastapi import Depends

from threadsinsightapi import app as app_module
from threadsinsightapi import auth_api, tasks_api
from threadsinsightapi.auth import AuthUser
from threadsinsightapi.dependencies import require_user
from threadsinsightapi.throttle import RateLimiter


@pytest.fixture
def accounts() -> FakeAccountStore:
    return FakeAccountStore()


@pytest.fixture(autouse=True)
def store(accounts: FakeAccountStore, monkeypatch: pytest.MonkeyPatch) -> Store:
    """每個測試使用全新的假資料庫與假帳號，不連任何資料庫。

    每個測試前重設，因為有些測試會清空 overrides。測試走 http，所以 cookie 不加 Secure。
    """
    fresh = Store()

    def fake_repository(user: Annotated[AuthUser, Depends(require_user)]) -> FakeTaskRepository:
        return FakeTaskRepository(fresh, user.id)

    overrides = app_module.app.dependency_overrides
    overrides[app_module.get_account_store] = lambda: accounts
    overrides[app_module.get_task_repository] = fake_repository
    tasks_api.ai_limiter = RateLimiter(100, 60)
    tasks_api.task_limiter = RateLimiter(100, 60)
    auth_api.auth_limiter = RateLimiter(100, 60)
    monkeypatch.setenv("COOKIE_SECURE", "false")
    return fresh
