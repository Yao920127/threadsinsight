"""PostgREST 實作：檢查送出的請求（使用者 token、篩選條件）與錯誤分類。不連網路。"""

import json
from datetime import UTC, datetime

import httpx
import pytest

from threadsinsightapi.task_repository import (
    PostgrestTaskRepository,
    RepositoryError,
    TaskNotFoundError,
    publishable_key,
)

TASK = {"id": "t1", "status": "completed"}


def make_repo(handler) -> tuple[PostgrestTaskRepository, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def record(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    http = httpx.Client(
        base_url="http://supabase.test/rest/v1", transport=httpx.MockTransport(record)
    )
    return PostgrestTaskRepository(http, "sb_publishable_test", "user.jwt.token"), seen


def ok(body) -> httpx.Response:
    return httpx.Response(200, json=body)


def test_sends_user_token_and_publishable_key() -> None:
    repo, seen = make_repo(lambda _r: ok([TASK]))
    assert repo.get("t1") == TASK
    request = seen[0]
    assert request.headers["authorization"] == "Bearer user.jwt.token"
    assert request.headers["apikey"] == "sb_publishable_test"
    assert request.url.params["id"] == "eq.t1"
    assert "user_id" not in request.url.params["select"]


def test_find_cached_filters_by_username_count_and_time() -> None:
    repo, seen = make_repo(lambda _r: ok([]))
    since = datetime(2026, 11, 19, 0, 0, tzinfo=UTC)
    assert repo.find_cached("demo_user", 30, since) is None
    params = seen[0].url.params
    assert params["target_username"] == "eq.demo_user"
    assert params["requested_count"] == "eq.30"
    assert params["status"] == "eq.completed"
    assert params["completed_at"] == "gte.2026-11-19T00:00:00+00:00"
    assert params["order"] == "completed_at.desc"


def test_create_posts_and_returns_representation() -> None:
    repo, seen = make_repo(lambda _r: httpx.Response(201, json=[TASK]))
    assert repo.create("u1", "demo_user", "@demo_user", 5) == TASK
    request = seen[0]
    assert request.method == "POST"
    assert request.headers["prefer"] == "return=representation"
    assert json.loads(request.content) == {
        "user_id": "u1",
        "target_username": "demo_user",
        "target_url": "@demo_user",
        "requested_count": 5,
    }


def test_save_results_calls_rpc_then_reads_task() -> None:
    responses = iter([ok(TASK), ok([TASK])])
    repo, seen = make_repo(lambda _r: next(responses))
    assert repo.save_results("t1", [{"post_url": "x"}], {"strategy_insights": {}}) == TASK
    assert seen[0].url.path == "/rest/v1/rpc/save_analysis_results"
    assert json.loads(seen[0].content)["p_task_id"] == "t1"


def test_report_rows_reads_posts_and_summary() -> None:
    responses = iter([ok([{"platform_post_id": "1"}]), ok([{"strategy_insights": {}}])])
    repo, seen = make_repo(lambda _r: next(responses))
    rows = repo.report_rows("t1")
    assert rows.posts == [{"platform_post_id": "1"}]
    assert rows.summary == {"strategy_insights": {}}
    assert [r.url.path for r in seen] == ["/rest/v1/posts", "/rest/v1/analysis_summaries"]


def test_report_rows_without_summary() -> None:
    responses = iter([ok([]), ok([])])
    repo, _ = make_repo(lambda _r: next(responses))
    assert repo.report_rows("t1").summary is None


def test_list_recent_orders_newest_first() -> None:
    repo, seen = make_repo(lambda _r: ok([TASK]))
    assert repo.list_recent() == [TASK]
    assert seen[0].url.params["order"] == "created_at.desc"


def test_fail_stale_patches_in_progress_tasks() -> None:
    repo, seen = make_repo(lambda _r: httpx.Response(204))
    repo.fail_stale(datetime(2026, 11, 20, tzinfo=UTC), "Timed out")
    request = seen[0]
    assert request.method == "PATCH"
    assert request.url.params["status"] == "in.(pending,generating,analyzing)"
    assert request.url.params["started_at"] == "lt.2026-11-20T00:00:00+00:00"
    assert json.loads(request.content) == {"status": "failed", "error_message": "Timed out"}


def test_update_strategy_patches_summary() -> None:
    repo, seen = make_repo(lambda _r: httpx.Response(204))
    repo.update_strategy("t1", {"source": "llm"})
    assert seen[0].url.path == "/rest/v1/analysis_summaries"
    assert json.loads(seen[0].content) == {"strategy_insights": {"source": "llm"}}


def test_update_returns_row() -> None:
    repo, _ = make_repo(lambda _r: ok([TASK]))
    assert repo.update("t1", {"status": "generating"}) == TASK


def test_delete_of_invisible_task_is_not_found() -> None:
    repo, _ = make_repo(lambda _r: ok([]))  # RLS：別人的任務刪除 0 筆
    with pytest.raises(TaskNotFoundError):
        repo.delete("t1")


def test_delete_returns_when_row_removed() -> None:
    repo, _ = make_repo(lambda _r: ok([{"id": "t1"}]))
    repo.delete("t1")


def test_missing_task_is_not_found() -> None:
    repo, _ = make_repo(lambda _r: ok([]))
    with pytest.raises(TaskNotFoundError):
        repo.get("t1")


def test_rpc_not_found_code_maps_to_not_found() -> None:
    repo, _ = make_repo(lambda _r: httpx.Response(400, json={"code": "P0002"}))
    with pytest.raises(TaskNotFoundError):
        repo.save_results("t1", [], {})


@pytest.mark.parametrize(
    "response",
    [httpx.Response(500, json={"code": "XX000"}), httpx.Response(502, text="<html>")],
)
def test_server_errors_raise_repository_error(response: httpx.Response) -> None:
    repo, _ = make_repo(lambda _r: response)
    with pytest.raises(RepositoryError) as info:
        repo.list_recent()
    assert "user.jwt.token" not in str(info.value)


def test_network_error_raises_repository_error() -> None:
    def fail(_r: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    repo, _ = make_repo(fail)
    with pytest.raises(RepositoryError):
        repo.list_recent()


def test_publishable_key_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SUPABASE_PUBLISHABLE_KEY", raising=False)
    monkeypatch.setenv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_vite")
    assert publishable_key() == "sb_publishable_vite"
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_backend")
    assert publishable_key() == "sb_publishable_backend"
    monkeypatch.delenv("SUPABASE_PUBLISHABLE_KEY")
    monkeypatch.delenv("VITE_SUPABASE_PUBLISHABLE_KEY")
    with pytest.raises(RepositoryError):
        publishable_key()
