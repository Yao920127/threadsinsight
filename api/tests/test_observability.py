"""結構化日誌（PRD 第 7 節）：JSON 格式、request_id、任務階段耗時與種子、不外洩 token。"""

import json
import logging

import pytest
from auth_support import auth_headers, make_token
from fastapi.testclient import TestClient

from threadsinsightapi import app as app_module
from threadsinsightapi.generator import seed_for
from threadsinsightapi.observability import (
    JsonFormatter,
    TextFormatter,
    configure_logging,
    log_event,
    new_request_id,
    request_id_var,
)

logger = logging.getLogger("threadsinsightapi.test")


@pytest.fixture
def logs(caplog: pytest.LogCaptureFixture) -> pytest.LogCaptureFixture:
    caplog.set_level("DEBUG", logger="threadsinsightapi")
    return caplog


def events(records: list[logging.LogRecord], name: str) -> list[dict]:
    return [r.event_fields for r in records if r.getMessage() == name]


def as_json(records: list[logging.LogRecord]) -> str:
    return "\n".join(JsonFormatter().format(r) for r in records)


class TestFormatters:
    def test_json_line_has_event_fields_and_request_id(self, logs) -> None:
        token = request_id_var.set("req-12345678")
        try:
            log_event(logger, "demo.event", count=3, ok=True)
        finally:
            request_id_var.reset(token)

        line = json.loads(JsonFormatter().format(logs.records[-1]))
        assert line["event"] == "demo.event"
        assert line["level"] == "info"
        assert line["logger"] == "threadsinsightapi.test"
        assert line["request_id"] == "req-12345678"
        assert line["count"] == 3 and line["ok"] is True
        assert line["ts"].endswith("+00:00")

    def test_forbidden_and_complex_fields_are_dropped(self, logs) -> None:
        log_event(
            logger,
            "demo.event",
            token="secret",
            Authorization="Bearer x",
            email="a@b.c",
            content="post text",
            nested={"a": 1},
            kept="yes",
        )
        line = json.loads(JsonFormatter().format(logs.records[-1]))
        assert line["kept"] == "yes"
        for key in ("token", "Authorization", "email", "content", "nested"):
            assert key not in line

    def test_exception_records_type_and_stack(self, logs) -> None:
        try:
            raise RuntimeError("boom")
        except RuntimeError:
            logger.exception("demo.failed")
        line = json.loads(JsonFormatter().format(logs.records[-1]))
        assert line["exc_type"] == "RuntimeError"
        assert "Traceback" in line["stack"]

    def test_text_format_is_readable(self, logs) -> None:
        log_event(logger, "demo.event", count=3)
        assert "demo.event count=3" in TextFormatter().format(logs.records[-1])

    @pytest.mark.parametrize(("fmt", "cls"), [("json", JsonFormatter), ("text", TextFormatter)])
    def test_configure_logging(self, monkeypatch: pytest.MonkeyPatch, fmt: str, cls: type) -> None:
        monkeypatch.setenv("LOG_FORMAT", fmt)
        monkeypatch.setenv("LOG_LEVEL", "warning")
        root = logging.getLogger("threadsinsightapi")
        saved = (root.handlers, root.level, root.propagate)
        try:
            configure_logging()
            assert isinstance(root.handlers[0].formatter, cls)
            assert root.level == logging.WARNING
        finally:
            root.handlers, root.level, root.propagate = saved


class TestRequestId:
    @pytest.mark.parametrize(
        ("incoming", "kept"),
        [("abcdef12-3456", True), ("short", False), ("bad id\nINFO fake", False), (None, False)],
    )
    def test_new_request_id(self, incoming: str | None, kept: bool) -> None:
        result = new_request_id(incoming)
        assert (result == incoming) is kept
        assert len(result) >= 8

    def test_response_carries_request_id_and_request_is_logged(self, logs) -> None:
        client = TestClient(app_module.app, headers=auth_headers())
        response = client.get(
            "/api/mock-posts",
            params={"username": "demo_user", "count": 3},
            headers={"X-Request-ID": "trace-0001-abcd"},
        )
        assert response.headers["x-request-id"] == "trace-0001-abcd"
        [event] = events(logs.records, "http.request")
        assert event == {
            "method": "GET",
            "path": "/api/mock-posts",  # 不含查詢字串
            "status": 200,
            "duration_ms": event["duration_ms"],
        }

    def test_health_checks_are_not_logged(self, logs) -> None:
        TestClient(app_module.app).get("/api/health")
        assert events(logs.records, "http.request") == []


class TestTaskLogs:
    def test_completed_task_logs_seed_and_stage_durations(self, logs) -> None:
        client = TestClient(app_module.app, headers=auth_headers())
        task_id = client.post("/api/tasks", json={"username": "@Demo_User", "count": 5}).json()[
            "data"
        ]["task"]["id"]

        [created] = events(logs.records, "task.created")
        [completed] = events(logs.records, "task.completed")
        assert created["task_id"] == task_id
        assert completed["seed"] == seed_for("demo_user")
        assert completed["target_username"] == "demo_user"
        assert completed["post_count"] == 5
        for key in ("generate_ms", "analyze_ms", "save_ms"):
            assert completed[key] >= 0

    def test_cache_hit_is_logged(self, logs) -> None:
        client = TestClient(app_module.app, headers=auth_headers())
        client.post("/api/tasks", json={"username": "demo_user", "count": 5})
        client.post("/api/tasks", json={"username": "demo_user", "count": 5})
        assert len(events(logs.records, "task.cache_hit")) == 1

    def test_failure_logs_stage(self, logs, monkeypatch: pytest.MonkeyPatch) -> None:
        def boom(_dataset):
            raise RuntimeError("boom")

        monkeypatch.setattr("threadsinsightapi.task_service.analyze_dataset", boom)
        TestClient(app_module.app, headers=auth_headers()).post(
            "/api/tasks", json={"username": "demo_user", "count": 5}
        )
        [failed] = events(logs.records, "task.failed")
        assert failed["stage"] == "analyzing"
        assert failed["error_type"] == "RuntimeError"
        assert failed["generate_ms"] >= 0

    def test_tokens_never_appear_in_logs(self, logs) -> None:
        token = make_token()
        client = TestClient(app_module.app, headers={"Authorization": f"Bearer {token}"})
        client.post("/api/tasks", json={"username": "demo_user", "count": 5})
        bad = TestClient(app_module.app, headers={"Authorization": f"Bearer {token}x"})
        bad.get("/api/tasks")

        text = as_json(logs.records)
        assert token not in text
        assert "Bearer" not in text
        assert events(logs.records, "auth.rejected")  # 被拒絕的請求也有紀錄
