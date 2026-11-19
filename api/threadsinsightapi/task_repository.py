"""分析任務的資料存取（Repository）。

正式實作透過 Supabase PostgREST，並以「使用者的 access token」呼叫，所有查詢都經過 RLS
（ADR-001 原則 1）：程式碼不需要、也不應該自己加 user_id 條件來做權限判斷。
"""

import os
from dataclasses import dataclass
from datetime import datetime
from functools import cache
from typing import Any, Protocol

import httpx

from threadsinsightapi.auth import supabase_url

TASK_COLUMNS = (
    "id,target_username,target_url,requested_count,status,data_source,source_note,"
    "post_count,error_message,created_at,started_at,completed_at"
)
SUMMARY_COLUMNS = (
    "overview_metrics,top_posts,distributions,keywords_hashtags,"
    "nlp_cluster_analysis,strategy_insights"
)
IN_PROGRESS = "(pending,generating,analyzing)"
LIST_LIMIT = 100
REQUEST_TIMEOUT_SECONDS = 10.0

Row = dict[str, Any]


class RepositoryError(Exception):
    """資料庫無法使用或回應不符預期（回 503）；訊息不含 token 或使用者資料。"""


class TaskNotFoundError(Exception):
    """任務不存在，或屬於其他使用者（RLS 下兩者無法分辨，一律回 404）。"""


@dataclass(frozen=True)
class ReportRows:
    posts: list[Row]
    summary: Row | None


class TaskRepository(Protocol):
    def find_cached(self, username: str, count: int, since: datetime) -> Row | None: ...
    def create(self, user_id: str, username: str, target_url: str, count: int) -> Row: ...
    def update(self, task_id: str, fields: Row) -> Row: ...
    def save_results(self, task_id: str, posts: list[Row], summary: Row) -> Row: ...
    def get(self, task_id: str) -> Row: ...
    def list_recent(self) -> list[Row]: ...
    def report_rows(self, task_id: str) -> ReportRows: ...
    def delete(self, task_id: str) -> None: ...
    def fail_stale(self, started_before: datetime, message: str) -> None: ...
    def update_strategy(self, task_id: str, strategy: Row) -> None: ...


def publishable_key() -> str:
    """後端呼叫 PostgREST 也只用 publishable key；權限完全來自使用者 token。"""
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ.get(
        "VITE_SUPABASE_PUBLISHABLE_KEY"
    )
    if not key:
        raise RepositoryError("SUPABASE_PUBLISHABLE_KEY is not set")
    return key


@cache
def shared_http_client() -> httpx.Client:
    return httpx.Client(base_url=f"{supabase_url()}/rest/v1", timeout=REQUEST_TIMEOUT_SECONDS)


def _iso(value: datetime) -> str:
    return value.isoformat()


def _error_code(response: httpx.Response) -> str | None:
    """PostgREST 的錯誤代碼（例如 P0002）；回應不是 JSON 時為 None。"""
    try:
        body = response.json()
    except ValueError:
        return None
    return body.get("code") if isinstance(body, dict) else None


class PostgrestTaskRepository:
    def __init__(self, http: httpx.Client, api_key: str, access_token: str) -> None:
        self._http = http
        self._headers = {
            "apikey": api_key,
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        }

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        json: Any = None,
        prefer: str | None = None,
    ) -> Any:
        headers = {**self._headers, **({"Prefer": prefer} if prefer else {})}
        try:
            response = self._http.request(method, path, params=params, json=json, headers=headers)
        except httpx.HTTPError as error:
            raise RepositoryError(f"{method} {path} failed: {type(error).__name__}") from error
        if response.status_code >= 400:
            code = _error_code(response)
            if response.status_code == 404 or code == "P0002":
                raise TaskNotFoundError
            raise RepositoryError(f"{method} {path} returned {response.status_code} ({code})")
        return response.json() if response.content else None

    def _one(self, rows: Any) -> Row:
        if not isinstance(rows, list) or not rows:
            raise TaskNotFoundError
        return rows[0]

    def find_cached(self, username: str, count: int, since: datetime) -> Row | None:
        rows = self._request(
            "GET",
            "/analysis_tasks",
            params={
                "select": TASK_COLUMNS,
                "target_username": f"eq.{username}",
                "requested_count": f"eq.{count}",
                "status": "eq.completed",
                "completed_at": f"gte.{_iso(since)}",
                "order": "completed_at.desc",
                "limit": "1",
            },
        )
        return rows[0] if rows else None

    def create(self, user_id: str, username: str, target_url: str, count: int) -> Row:
        rows = self._request(
            "POST",
            "/analysis_tasks",
            params={"select": TASK_COLUMNS},
            json={
                "user_id": user_id,
                "target_username": username,
                "target_url": target_url,
                "requested_count": count,
            },
            prefer="return=representation",
        )
        return self._one(rows)

    def update(self, task_id: str, fields: Row) -> Row:
        rows = self._request(
            "PATCH",
            "/analysis_tasks",
            params={"id": f"eq.{task_id}", "select": TASK_COLUMNS},
            json=fields,
            prefer="return=representation",
        )
        return self._one(rows)

    def save_results(self, task_id: str, posts: list[Row], summary: Row) -> Row:
        self._request(
            "POST",
            "/rpc/save_analysis_results",
            json={"p_task_id": task_id, "p_posts": posts, "p_summary": summary},
        )
        return self.get(task_id)

    def get(self, task_id: str) -> Row:
        rows = self._request(
            "GET", "/analysis_tasks", params={"id": f"eq.{task_id}", "select": TASK_COLUMNS}
        )
        return self._one(rows)

    def list_recent(self) -> list[Row]:
        return self._request(
            "GET",
            "/analysis_tasks",
            params={"select": TASK_COLUMNS, "order": "created_at.desc", "limit": str(LIST_LIMIT)},
        )

    def report_rows(self, task_id: str) -> ReportRows:
        posts = self._request("GET", "/posts", params={"task_id": f"eq.{task_id}", "select": "*"})
        summaries = self._request(
            "GET",
            "/analysis_summaries",
            params={"task_id": f"eq.{task_id}", "select": SUMMARY_COLUMNS},
        )
        return ReportRows(posts=posts, summary=summaries[0] if summaries else None)

    def delete(self, task_id: str) -> None:
        rows = self._request(
            "DELETE",
            "/analysis_tasks",
            params={"id": f"eq.{task_id}", "select": "id"},
            prefer="return=representation",
        )
        self._one(rows)

    def fail_stale(self, started_before: datetime, message: str) -> None:
        self._request(
            "PATCH",
            "/analysis_tasks",
            params={"status": f"in.{IN_PROGRESS}", "started_at": f"lt.{_iso(started_before)}"},
            json={"status": "failed", "error_message": message},
            prefer="return=minimal",
        )

    def update_strategy(self, task_id: str, strategy: Row) -> None:
        self._request(
            "PATCH",
            "/analysis_summaries",
            params={"task_id": f"eq.{task_id}"},
            json={"strategy_insights": strategy},
            prefer="return=minimal",
        )
