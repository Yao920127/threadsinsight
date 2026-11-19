from typing import Annotated

import pytest
from auth_support import StaticResolver
from fake_repository import FakeTaskRepository, Store
from fastapi import Depends

from threadsinsightapi import app as app_module
from threadsinsightapi import tasks_api
from threadsinsightapi.auth import AuthUser
from threadsinsightapi.dependencies import require_user
from threadsinsightapi.throttle import RateLimiter


@pytest.fixture(autouse=True)
def store() -> Store:
    """每個測試使用全新的假資料庫與本機金鑰，不連 Supabase。

    每個測試前重設，因為有些測試會清空 overrides。
    """
    fresh = Store()

    def fake_repository(user: Annotated[AuthUser, Depends(require_user)]) -> FakeTaskRepository:
        return FakeTaskRepository(fresh, user.id)

    overrides = app_module.app.dependency_overrides
    overrides[app_module.get_key_resolver] = StaticResolver
    overrides[app_module.get_task_repository] = fake_repository
    tasks_api.ai_limiter = RateLimiter(100, 60)
    tasks_api.task_limiter = RateLimiter(100, 60)
    return fresh
