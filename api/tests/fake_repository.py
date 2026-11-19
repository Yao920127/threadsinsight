"""記憶體版 TaskRepository：模擬 RLS（每個實例只看得到自己 user_id 的資料）與 PostgREST 的
回傳格式（timestamptz 以 UTC 字串、numeric 以浮點數讀回），讓往返測試涵蓋轉換邏輯。"""

import copy
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from threadsinsightapi.task_repository import ReportRows, Row, TaskNotFoundError

DEFAULT_SOURCE_NOTE = (
    "Scraping blocked (HTTP 401 on graphql/query) & official API unavailable; "
    "using deterministic Mock Dataset"
)


@dataclass
class Store:
    tasks: dict[str, Row] = field(default_factory=dict)
    posts: dict[str, list[Row]] = field(default_factory=dict)
    summaries: dict[str, Row] = field(default_factory=dict)
    now: datetime | None = None  # 固定時間，測試快取與逾時

    def clock(self) -> datetime:
        return self.now or datetime.now(UTC)


def _utc(value: str) -> str:
    return datetime.fromisoformat(value).astimezone(UTC).isoformat()


class FakeTaskRepository:
    def __init__(self, store: Store, user_id: str) -> None:
        self.store = store
        self.user_id = user_id
        self.calls: list[str] = []

    def _own(self, task_id: str) -> Row:
        task = self.store.tasks.get(task_id)
        if task is None or task["user_id"] != self.user_id:
            raise TaskNotFoundError
        return task

    def _visible(self) -> list[Row]:
        return [t for t in self.store.tasks.values() if t["user_id"] == self.user_id]

    def find_cached(self, username: str, count: int, since: datetime) -> Row | None:
        self.calls.append("find_cached")
        hits = [
            t
            for t in self._visible()
            if t["target_username"] == username
            and t["requested_count"] == count
            and t["status"] == "completed"
            and datetime.fromisoformat(t["completed_at"]) >= since
        ]
        hits.sort(key=lambda t: t["completed_at"], reverse=True)
        return copy.deepcopy(hits[0]) if hits else None

    def create(self, user_id: str, username: str, target_url: str, count: int) -> Row:
        self.calls.append("create")
        assert user_id == self.user_id  # RLS：只能替自己建立
        now = self.store.clock().isoformat()
        task = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "target_username": username,
            "target_url": target_url,
            "requested_count": count,
            "status": "pending",
            "data_source": "mock_dataset",
            "source_note": DEFAULT_SOURCE_NOTE,
            "post_count": 0,
            "error_message": None,
            "created_at": now,
            "started_at": now,
            "completed_at": None,
        }
        self.store.tasks[task["id"]] = task
        return copy.deepcopy(task)

    def update(self, task_id: str, fields: Row) -> Row:
        self.calls.append(f"update:{fields.get('status')}")
        task = self._own(task_id)
        task.update(fields)
        return copy.deepcopy(task)

    def save_results(self, task_id: str, posts: list[Row], summary: Row) -> Row:
        self.calls.append("save_results")
        task = self._own(task_id)
        self.store.posts[task_id] = [
            {
                **copy.deepcopy(post),
                "published_at": _utc(post["published_at"]),
                "engagement_score": float(post["engagement_score"]),
                "is_synthetic": True,
            }
            for post in posts
        ]
        self.store.summaries[task_id] = copy.deepcopy(summary)
        task.update(
            status="completed",
            completed_at=self.store.clock().isoformat(),
            post_count=len(posts),
            error_message=None,
        )
        return copy.deepcopy(task)

    def get(self, task_id: str) -> Row:
        return copy.deepcopy(self._own(task_id))

    def list_recent(self) -> list[Row]:
        tasks = sorted(self._visible(), key=lambda t: t["created_at"], reverse=True)
        return copy.deepcopy(tasks)

    def report_rows(self, task_id: str) -> ReportRows:
        self._own(task_id)
        return ReportRows(
            posts=copy.deepcopy(self.store.posts.get(task_id, [])),
            summary=copy.deepcopy(self.store.summaries.get(task_id)),
        )

    def delete(self, task_id: str) -> None:
        self._own(task_id)
        del self.store.tasks[task_id]
        self.store.posts.pop(task_id, None)
        self.store.summaries.pop(task_id, None)

    def fail_stale(self, started_before: datetime, message: str) -> None:
        for task in self._visible():
            if task["status"] in ("pending", "generating", "analyzing") and (
                datetime.fromisoformat(task["started_at"]) < started_before
            ):
                task.update(status="failed", error_message=message)

    def update_strategy(self, task_id: str, strategy: Row) -> None:
        self._own(task_id)
        self.store.summaries[task_id]["strategy_insights"] = copy.deepcopy(strategy)


def stored_task(store: Store, task_id: str) -> dict[str, Any]:
    return store.tasks[task_id]
