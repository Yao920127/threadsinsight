"""任務端點（PRD F2、AC-1、例外情境 7、8）。資料庫以記憶體假實作取代，不連任何資料庫。"""

from datetime import UTC, datetime, timedelta

import pytest
from auth_support import USER_B, auth_headers
from fake_repository import Store
from fastapi.testclient import TestClient
from tests_support import fake_success_client

from threadsinsightapi import app as app_module
from threadsinsightapi import tasks_api
from threadsinsightapi.throttle import RateLimiter

client = TestClient(app_module.app, headers=auth_headers())
USER_KEY = "sk-ant-api03-" + "a" * 40


def create(username: str = "demo_user", count: int = 5, force: bool = False, **kwargs):
    return client.post(
        "/api/tasks", json={"username": username, "count": count, "force": force}, **kwargs
    )


def teardown_function() -> None:
    app_module.app.dependency_overrides.clear()


class TestCreate:
    def test_creates_completed_task_with_report(self, store: Store) -> None:
        response = create("@Demo_User", 5)

        assert response.status_code == 201
        assert response.headers["cache-control"] == "no-store"
        data = response.json()["data"]
        assert data["cached"] is False
        task = data["task"]
        assert task["status"] == "completed"
        assert task["target_username"] == "demo_user"
        assert task["post_count"] == 5
        assert task["data_source"] == "mock_dataset"
        assert "user_id" not in task
        assert len(data["report"]["posts"]) == 5
        assert all(p["is_synthetic"] for p in data["report"]["posts"])

    def test_report_matches_stateless_endpoint(self) -> None:
        created = create("demo_user", 12).json()["data"]["report"]
        stateless = client.get("/api/mock-posts", params={"username": "demo_user", "count": 12})
        assert created == stateless.json()["data"]

    def test_walks_through_status_flow(self, store: Store) -> None:
        create()
        # pending（建立）→ generating → analyzing → completed（save_results）
        task = next(iter(store.tasks.values()))
        assert task["status"] == "completed"
        assert task["completed_at"] is not None

    def test_second_request_within_24h_returns_cache(self, store: Store) -> None:
        first = create().json()["data"]
        second = create()

        assert second.status_code == 200
        data = second.json()["data"]
        assert data["cached"] is True
        assert data["task"]["id"] == first["task"]["id"]
        assert data["report"] == first["report"]  # 從資料庫讀回的報告與當場分析相同
        assert len(store.tasks) == 1

    def test_cache_is_per_count(self, store: Store) -> None:
        create(count=5)
        create(count=6)
        assert len(store.tasks) == 2

    def test_force_bypasses_cache(self, store: Store) -> None:
        create()
        forced = create(force=True)
        assert forced.status_code == 201
        assert forced.json()["data"]["cached"] is False
        assert len(store.tasks) == 2

    def test_cache_expires_after_24_hours(self, store: Store) -> None:
        store.now = datetime.now(UTC) - timedelta(hours=25)
        create()
        store.now = None
        assert create().json()["data"]["cached"] is False

    def test_cache_is_not_shared_between_users(self, store: Store) -> None:
        create()
        other = create(headers=auth_headers(USER_B))
        assert other.json()["data"]["cached"] is False
        assert len(store.tasks) == 2

    @pytest.mark.parametrize(
        "body",
        [
            {"username": "bad name", "count": 5},
            {"username": "demo_user", "count": 0},
            {"username": "demo_user", "count": 51},
            {"username": "", "count": 5},
            {"count": 5},
        ],
    )
    def test_invalid_input_returns_400_without_creating(self, store: Store, body: dict) -> None:
        response = client.post("/api/tasks", json=body)
        assert response.status_code == 400
        assert response.json()["success"] is False
        assert store.tasks == {}

    def test_pipeline_failure_marks_task_failed(
        self, store: Store, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def boom(_dataset):
            raise RuntimeError("boom")

        monkeypatch.setattr("threadsinsightapi.task_service.analyze_dataset", boom)
        response = create()

        assert response.status_code == 500
        body = response.json()
        assert body["error"] == "Analysis failed"
        assert body["data"]["task"]["status"] == "failed"
        assert "boom" not in response.text

    def test_rate_limited_per_user(self) -> None:
        tasks_api.task_limiter = RateLimiter(1, 60)
        assert create().status_code == 201
        assert create().status_code == 429
        assert create(headers=auth_headers(USER_B)).status_code == 201

    def test_requires_login(self, store: Store) -> None:
        anonymous = TestClient(app_module.app)
        assert anonymous.post("/api/tasks", json={"username": "demo_user"}).status_code == 401
        assert anonymous.get("/api/tasks").status_code == 401
        assert store.tasks == {}


class TestListAndGet:
    def test_lists_own_tasks_newest_first(self, store: Store) -> None:
        store.now = datetime.now(UTC) - timedelta(minutes=10)
        old = create("demo_user").json()["data"]["task"]
        store.now = None
        new = create("demo_user_2").json()["data"]["task"]
        create(headers=auth_headers(USER_B))

        tasks = client.get("/api/tasks").json()["data"]["tasks"]

        assert [t["id"] for t in tasks] == [new["id"], old["id"]]

    def test_get_returns_report_from_database(self) -> None:
        created = create().json()["data"]
        response = client.get(f"/api/tasks/{created['task']['id']}")

        data = response.json()["data"]
        assert data["task"] == created["task"]
        assert data["report"] == created["report"]
        published = data["report"]["posts"][0]["published_at"]
        assert published.endswith("+08:00")

    def test_other_users_task_is_404(self) -> None:
        task_id = create().json()["data"]["task"]["id"]
        response = client.get(f"/api/tasks/{task_id}", headers=auth_headers(USER_B))
        assert response.status_code == 404
        assert response.json()["error"] == "Task not found"

    def test_invalid_id_is_400(self) -> None:
        assert client.get("/api/tasks/not-a-uuid").status_code == 400

    def test_stuck_task_is_marked_failed_after_3_minutes(self, store: Store) -> None:
        store.now = datetime.now(UTC) - timedelta(minutes=4)
        repo_task = _insert_in_progress(store, "generating")
        fresh = _insert_in_progress(store, "analyzing", started=datetime.now(UTC))
        store.now = None

        tasks = {t["id"]: t for t in client.get("/api/tasks").json()["data"]["tasks"]}

        assert tasks[repo_task]["status"] == "failed"
        assert tasks[repo_task]["error_message"] == "Timed out after 3 minutes"
        assert tasks[fresh]["status"] == "analyzing"  # 未滿 3 分鐘不動

    def test_unfinished_task_has_no_report(self, store: Store) -> None:
        task_id = _insert_in_progress(store, "analyzing", started=datetime.now(UTC))
        data = client.get(f"/api/tasks/{task_id}").json()["data"]
        assert data["report"] is None


def _insert_in_progress(store: Store, status: str, started: datetime | None = None) -> str:
    from auth_support import USER_A
    from fake_repository import FakeTaskRepository

    from threadsinsightapi.task_repository import Row

    repo = FakeTaskRepository(store, USER_A)
    task: Row = repo.create(USER_A, "demo_user", "demo_user", 5)
    if started is not None:
        store.tasks[task["id"]]["started_at"] = started.isoformat()
    store.tasks[task["id"]]["status"] = status
    return task["id"]


class TestRerunAndDelete:
    def test_rerun_keeps_id_and_replaces_results(self, store: Store) -> None:
        created = create().json()["data"]
        task_id = created["task"]["id"]
        store.posts[task_id] = store.posts[task_id][:1]  # 模擬舊資料不同

        response = client.post(f"/api/tasks/{task_id}/rerun")

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["task"]["id"] == task_id
        assert data["task"]["status"] == "completed"
        assert data["report"] == created["report"]  # 確定性：重跑結果一致
        assert len(store.posts[task_id]) == 5
        assert len(store.tasks) == 1

    def test_rerun_failed_task(self, store: Store) -> None:
        task_id = _insert_in_progress(store, "failed")
        response = client.post(f"/api/tasks/{task_id}/rerun")
        assert response.json()["data"]["task"]["status"] == "completed"

    def test_cannot_rerun_other_users_task(self) -> None:
        task_id = create().json()["data"]["task"]["id"]
        response = client.post(f"/api/tasks/{task_id}/rerun", headers=auth_headers(USER_B))
        assert response.status_code == 404

    def test_delete_removes_task_and_results(self, store: Store) -> None:
        task_id = create().json()["data"]["task"]["id"]

        response = client.delete(f"/api/tasks/{task_id}")

        assert response.status_code == 200
        assert response.json()["data"] == {"id": task_id}
        assert store.tasks == {} and store.posts == {} and store.summaries == {}
        assert client.get(f"/api/tasks/{task_id}").status_code == 404

    def test_cannot_delete_other_users_task(self, store: Store) -> None:
        task_id = create().json()["data"]["task"]["id"]
        response = client.delete(f"/api/tasks/{task_id}", headers=auth_headers(USER_B))
        assert response.status_code == 404
        assert task_id in store.tasks


class TestAiStrategy:
    """以 dependency_overrides 注入假的 Anthropic client；不呼叫真正的 API。"""

    def _ai(self, server: object | None, factory=None) -> None:
        overrides = app_module.app.dependency_overrides
        overrides[app_module.get_ai_client] = lambda: server
        if factory is not None:
            overrides[app_module.get_client_factory] = lambda: factory

    def _task_id(self) -> str:
        return create().json()["data"]["task"]["id"]

    def test_without_ai_returns_rule_engine_with_notice(self) -> None:
        self._ai(None)
        response = client.post(f"/api/tasks/{self._task_id()}/ai-strategy")

        data = response.json()["data"]
        assert data["source"] == "rule_engine"
        assert "AI 建議設定" in data["notice"]

    def test_success_is_saved_to_task(self, store: Store) -> None:
        fake = fake_success_client()
        self._ai(fake)
        task_id = self._task_id()

        first = client.post(f"/api/tasks/{task_id}/ai-strategy").json()["data"]
        second = client.post(f"/api/tasks/{task_id}/ai-strategy").json()["data"]
        reopened = client.get(f"/api/tasks/{task_id}").json()["data"]["report"]["strategy"]

        assert first["source"] == "llm"
        assert first["model"] == "claude-haiku-5-5"
        assert second == first
        assert reopened == first  # 重新開啟任務直接看到 AI 建議
        assert len(fake.messages.calls) == 1

    def test_refresh_calls_again(self) -> None:
        fake = fake_success_client()
        self._ai(fake)
        task_id = self._task_id()
        client.post(f"/api/tasks/{task_id}/ai-strategy")
        client.post(f"/api/tasks/{task_id}/ai-strategy", params={"refresh": "true"})
        assert len(fake.messages.calls) == 2

    def test_failure_is_not_saved(self, store: Store) -> None:
        self._ai(None)
        task_id = self._task_id()
        client.post(f"/api/tasks/{task_id}/ai-strategy")
        assert store.summaries[task_id]["strategy_insights"]["source"] == "rule_engine"

    def test_user_key_is_used_and_never_echoed(self) -> None:
        received: list[str] = []
        fake = fake_success_client()

        def factory(api_key: str) -> object:
            received.append(api_key)
            return fake

        self._ai(None, factory)
        response = client.post(
            f"/api/tasks/{self._task_id()}/ai-strategy",
            headers={"X-User-Anthropic-Key": f"  {USER_KEY}  "},
        )

        assert received == [USER_KEY]
        assert response.json()["data"]["source"] == "llm"
        assert response.headers["cache-control"] == "no-store"
        assert USER_KEY not in response.text

    @pytest.mark.parametrize(
        "bad", ["", "sk-ant-short", "sk-proj-" + "a" * 40, "sk-ant-" + "a" * 30 + "!"]
    )
    def test_malformed_user_key_is_rejected(self, bad: str) -> None:
        self._ai(None)
        response = client.post(
            f"/api/tasks/{self._task_id()}/ai-strategy", headers={"X-User-Anthropic-Key": bad}
        )
        assert response.status_code == 400
        assert response.json()["error"] == "Invalid Anthropic API key format"

    def test_ai_off_ignores_user_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("THREADSINSIGHT_AI", "off")
        calls: list[str] = []
        self._ai(None, calls.append)
        response = client.post(
            f"/api/tasks/{self._task_id()}/ai-strategy", headers={"X-User-Anthropic-Key": USER_KEY}
        )
        assert calls == []
        assert response.json()["data"]["source"] == "rule_engine"

    def test_rate_limit_is_per_user(self) -> None:
        self._ai(fake_success_client())
        tasks_api.ai_limiter = RateLimiter(1, 60)
        task_id = self._task_id()

        assert client.post(f"/api/tasks/{task_id}/ai-strategy").status_code == 200
        refreshed = client.post(f"/api/tasks/{task_id}/ai-strategy", params={"refresh": "true"})
        assert refreshed.status_code == 429

        other = create(headers=auth_headers(USER_B)).json()["data"]["task"]["id"]
        response = client.post(f"/api/tasks/{other}/ai-strategy", headers=auth_headers(USER_B))
        assert response.status_code == 200

    def test_unfinished_task_is_409(self, store: Store) -> None:
        self._ai(None)
        task_id = _insert_in_progress(store, "analyzing", started=datetime.now(UTC))
        response = client.post(f"/api/tasks/{task_id}/ai-strategy")
        assert response.status_code == 409

    def test_other_users_task_is_404(self) -> None:
        self._ai(None)
        task_id = self._task_id()
        response = client.post(f"/api/tasks/{task_id}/ai-strategy", headers=auth_headers(USER_B))
        assert response.status_code == 404
