"""PostgreSQL 存取層：以假的連線池記錄 SQL，不連資料庫。

實際 SQL 的正確性（RLS、約束、交易）在部署後由線上 E2E 驗證；這裡確認的是
每個交易都先切換到受限角色並帶上使用者 ID、輸入一律走參數、錯誤正確分類。
"""

from contextlib import contextmanager
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import psycopg
import pytest
from psycopg_pool import PoolTimeout

from threadsinsightapi import db
from threadsinsightapi.accounts import PostgresAccountStore
from threadsinsightapi.auth import EmailTakenError, token_hash
from threadsinsightapi.task_repository import PostgresTaskRepository, TaskNotFoundError

USER = "11111111-1111-1111-1111-111111111111"
TASK = {"id": UUID("aaaaaaaa-0000-0000-0000-000000000001"), "status": "completed"}


class FakeCursor:
    def __init__(self, pool: "FakePool") -> None:
        self.pool = pool

    def execute(self, query: Any, params: Any = None) -> None:
        text = query if isinstance(query, str) else query.as_string(None)
        self.pool.executed.append((text, params))
        if self.pool.raise_on and self.pool.raise_on in text:
            raise self.pool.error

    def fetchone(self) -> Any:
        return self.pool.results.pop(0) if self.pool.results else None

    def fetchall(self) -> Any:
        return self.pool.results.pop(0) if self.pool.results else []


class FakeConnection:
    def __init__(self, pool: "FakePool") -> None:
        self.pool = pool

    @contextmanager
    def transaction(self):
        yield

    @contextmanager
    def cursor(self):
        yield FakeCursor(self.pool)


class FakePool:
    def __init__(self, results: list[Any] | None = None) -> None:
        self.results = list(results or [])
        self.executed: list[tuple[str, Any]] = []
        self.raise_on: str | None = None
        self.error: Exception = RuntimeError()
        self.unavailable = False

    @contextmanager
    def connection(self):
        if self.unavailable:
            raise PoolTimeout("no connection")
        yield FakeConnection(self)

    def sql(self) -> list[str]:
        return [text for text, _ in self.executed]


def repo(pool: FakePool) -> PostgresTaskRepository:
    return PostgresTaskRepository(pool, USER)  # type: ignore[arg-type]


class TestTransactions:
    def test_user_transaction_switches_role_and_sets_user(self) -> None:
        pool = FakePool([TASK])
        repo(pool).get(str(TASK["id"]))
        assert pool.executed[0] == ("set local role threadsinsight_app", None)
        assert pool.executed[1] == ("select set_config('app.user_id', %s, true)", (USER,))

    def test_every_repository_call_runs_as_the_user(self) -> None:
        pool = FakePool([TASK, [TASK], TASK, [], None])
        r = repo(pool)
        r.get("t"), r.list_recent(), r.create(USER, "demo_user", "demo_user", 5)
        r.report_rows("t")
        roles = [text for text in pool.sql() if text.startswith("set local role")]
        assert len(roles) == 4

    def test_owner_transaction_does_not_switch_role(self) -> None:
        pool = FakePool([None])
        PostgresAccountStore(pool).find_credentials("a@example.com")  # type: ignore[arg-type]
        assert not any("set local role" in text for text in pool.sql())

    def test_unavailable_database_is_repository_error(self) -> None:
        pool = FakePool()
        pool.unavailable = True
        with pytest.raises(db.RepositoryError):
            repo(pool).list_recent()

    def test_operational_error_is_repository_error(self) -> None:
        pool = FakePool()
        pool.raise_on, pool.error = "from analysis_tasks", psycopg.OperationalError("down")
        with pytest.raises(db.RepositoryError):
            repo(pool).list_recent()

    def test_missing_database_url(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("DATABASE_URL", raising=False)
        with pytest.raises(db.RepositoryError):
            db.database_url()


class TestTaskRepository:
    def test_rows_become_json_friendly(self) -> None:
        row = {
            "id": UUID(int=1),
            "created_at": datetime(2026, 11, 20, tzinfo=UTC),
            "score": Decimal("82"),
            "rate": Decimal("1.5"),
            "name": "x",
        }
        assert db.jsonable(row) == {
            "id": "00000000-0000-0000-0000-000000000001",
            "created_at": "2026-11-20T00:00:00+00:00",
            "score": 82,
            "rate": 1.5,
            "name": "x",
        }

    def test_get_missing_task_is_not_found(self) -> None:
        with pytest.raises(TaskNotFoundError):
            repo(FakePool([None])).get("t")

    def test_update_only_allows_known_columns(self) -> None:
        pool = FakePool()
        with pytest.raises(ValueError):
            repo(pool).update("t", {"user_id": USER})
        with pytest.raises(ValueError):
            repo(pool).update("t", {})
        assert pool.executed == []

    def test_update_uses_parameters(self) -> None:
        pool = FakePool([TASK])
        repo(pool).update("t", {"status": "failed", "error_message": "x"})
        text, params = pool.executed[-1]
        assert '"status" = %s, "error_message" = %s' in text
        assert params == ("failed", "x", "t")

    def test_find_cached_filters_and_orders(self) -> None:
        pool = FakePool([None])
        since = datetime(2026, 11, 19, tzinfo=UTC)
        assert repo(pool).find_cached("demo_user", 30, since) is None
        text, params = pool.executed[-1]
        assert "status = 'completed'" in text and "order by completed_at desc limit 1" in text
        assert params == ("demo_user", 30, since)

    def test_save_results_maps_missing_task(self) -> None:
        pool = FakePool()
        pool.raise_on, pool.error = "save_analysis_results", psycopg.errors.NoDataFound()
        with pytest.raises(TaskNotFoundError):
            repo(pool).save_results("t", [], {})

    def test_save_results_then_reads_task(self) -> None:
        pool = FakePool([TASK])
        assert repo(pool).save_results("t", [{"post_url": "x"}], {})["status"] == "completed"
        assert any("save_analysis_results" in text for text in pool.sql())

    def test_delete_invisible_task_is_not_found(self) -> None:
        with pytest.raises(TaskNotFoundError):
            repo(FakePool([None])).delete("t")

    def test_report_rows_without_summary(self) -> None:
        rows = repo(FakePool([[], None])).report_rows("t")
        assert rows.posts == [] and rows.summary is None

    def test_fail_stale_and_update_strategy(self) -> None:
        pool = FakePool()
        r = repo(pool)
        r.fail_stale(datetime(2026, 11, 20, tzinfo=UTC), "Timed out")
        r.update_strategy("t", {"source": "llm"})
        assert any("status in ('pending', 'generating', 'analyzing')" in t for t in pool.sql())
        assert any("update analysis_summaries" in t for t in pool.sql())


class TestAccountStore:
    def test_duplicate_email(self) -> None:
        pool = FakePool()
        pool.raise_on, pool.error = "insert into users", psycopg.errors.UniqueViolation()
        with pytest.raises(EmailTakenError):
            PostgresAccountStore(pool).create_user("a@example.com", "hash")  # type: ignore[arg-type]

    def test_create_user_returns_user(self) -> None:
        pool = FakePool([{"id": UUID(int=5), "email": "a@example.com"}])
        user = PostgresAccountStore(pool).create_user("a@example.com", "hash")  # type: ignore[arg-type]
        assert user.email == "a@example.com"

    def test_session_stores_only_the_hash(self) -> None:
        pool = FakePool()
        token = PostgresAccountStore(pool).create_session(USER)  # type: ignore[arg-type]
        _, params = pool.executed[-1]
        assert params[0] == token_hash(token)
        assert token not in str(params)
        assert any("delete from sessions where expires_at < now()" in t for t in pool.sql())

    def test_lookups(self) -> None:
        pool = FakePool([{"id": UUID(int=5), "email": "a@example.com", "password_hash": "h"}, None])
        store = PostgresAccountStore(pool)  # type: ignore[arg-type]
        user, stored = store.find_credentials("a@example.com") or (None, None)
        assert user and user.email == "a@example.com" and stored == "h"
        assert store.user_for_session("missing") is None
        store.delete_session("tok")
        store.delete_user(USER)
        assert pool.executed[-1] == ("delete from users where id = %s", (USER,))
