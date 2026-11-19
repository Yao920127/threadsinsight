"""分析任務的資料存取（Repository）。

正式實作直接連 PostgreSQL，每個操作都在 `user_transaction` 內執行：交易以權限受限的角色
並帶著目前使用者的 ID 進行，RLS 只放行本人的資料（ADR-002）。程式碼不自行加 user_id 條件
來做權限判斷；看不到別人的任務是資料庫保證的。
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from threadsinsightapi.db import RepositoryError, Row, jsonable, user_transaction

__all__ = [
    "LIST_LIMIT",
    "PostgresTaskRepository",
    "ReportRows",
    "RepositoryError",
    "Row",
    "TaskNotFoundError",
    "TaskRepository",
]

TASK_COLUMNS = (
    "id, target_username, target_url, requested_count, status, data_source, source_note, "
    "post_count, error_message, created_at, started_at, completed_at"
)
SUMMARY_COLUMNS = (
    "overview_metrics, top_posts, distributions, keywords_hashtags, "
    "nlp_cluster_analysis, strategy_insights"
)
POST_COLUMNS = (
    "platform_post_id, post_url, published_at, content, views_count, likes_count, "
    "replies_count, reposts_count, engagement_score, engagement_group, engagement_tier, "
    "char_count, hashtag_count, mention_count, url_count, media_type, post_type, topic, "
    "sentiment, has_question, has_cta"
)
# update() 只允許修改這些欄位，其餘一律拒絕（欄位名稱不能來自外部輸入）
UPDATABLE_COLUMNS = frozenset({"status", "error_message", "completed_at", "started_at"})
LIST_LIMIT = 100


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


def _one(row: Row | None) -> Row:
    if row is None:
        raise TaskNotFoundError
    return jsonable(row)


class PostgresTaskRepository:
    def __init__(self, pool: ConnectionPool, user_id: str) -> None:
        self._pool = pool
        self._user_id = user_id

    def _tx(self) -> Any:
        return user_transaction(self._pool, self._user_id)

    def find_cached(self, username: str, count: int, since: datetime) -> Row | None:
        with self._tx() as cur:
            cur.execute(
                f"select {TASK_COLUMNS} from analysis_tasks "  # noqa: S608 欄位為固定常數
                "where target_username = %s and requested_count = %s and status = 'completed' "
                "and completed_at >= %s order by completed_at desc limit 1",
                (username, count, since),
            )
            row = cur.fetchone()
        return jsonable(row) if row else None

    def create(self, user_id: str, username: str, target_url: str, count: int) -> Row:
        with self._tx() as cur:
            cur.execute(
                "insert into analysis_tasks "  # noqa: S608 欄位為固定常數
                "(user_id, target_username, target_url, requested_count) "
                f"values (%s, %s, %s, %s) returning {TASK_COLUMNS}",
                (user_id, username, target_url, count),
            )
            return _one(cur.fetchone())

    def update(self, task_id: str, fields: Row) -> Row:
        unknown = set(fields) - UPDATABLE_COLUMNS
        if unknown or not fields:
            raise ValueError(f"cannot update columns: {sorted(unknown) or 'none'}")
        assignments = sql.SQL(", ").join(
            sql.SQL("{} = {}").format(sql.Identifier(column), sql.Placeholder())
            for column in fields
        )
        query = sql.SQL("update analysis_tasks set {} where id = %s returning {}").format(
            assignments, sql.SQL(TASK_COLUMNS)
        )
        with self._tx() as cur:
            cur.execute(query, (*fields.values(), task_id))
            return _one(cur.fetchone())

    def save_results(self, task_id: str, posts: list[Row], summary: Row) -> Row:
        try:
            with self._tx() as cur:
                cur.execute(
                    "select 1 from save_analysis_results(%s, %s, %s)",
                    (task_id, Jsonb(posts), Jsonb(summary)),
                )
        except psycopg.errors.NoDataFound as error:  # 函式以 P0002 表示任務不存在
            raise TaskNotFoundError from error
        return self.get(task_id)

    def get(self, task_id: str) -> Row:
        with self._tx() as cur:
            cur.execute(
                f"select {TASK_COLUMNS} from analysis_tasks where id = %s",  # noqa: S608
                (task_id,),
            )
            return _one(cur.fetchone())

    def list_recent(self) -> list[Row]:
        with self._tx() as cur:
            cur.execute(
                f"select {TASK_COLUMNS} from analysis_tasks "  # noqa: S608
                "order by created_at desc limit %s",
                (LIST_LIMIT,),
            )
            return [jsonable(row) for row in cur.fetchall()]

    def report_rows(self, task_id: str) -> ReportRows:
        with self._tx() as cur:
            cur.execute(
                f"select {POST_COLUMNS} from posts where task_id = %s",  # noqa: S608
                (task_id,),
            )
            posts = [jsonable(row) for row in cur.fetchall()]
            cur.execute(
                f"select {SUMMARY_COLUMNS} from analysis_summaries where task_id = %s",  # noqa: S608
                (task_id,),
            )
            summary = cur.fetchone()
        return ReportRows(posts=posts, summary=jsonable(summary) if summary else None)

    def delete(self, task_id: str) -> None:
        with self._tx() as cur:
            cur.execute("delete from analysis_tasks where id = %s returning id", (task_id,))
            _one(cur.fetchone())

    def fail_stale(self, started_before: datetime, message: str) -> None:
        with self._tx() as cur:
            cur.execute(
                "update analysis_tasks set status = 'failed', error_message = %s "
                "where status in ('pending', 'generating', 'analyzing') and started_at < %s",
                (message, started_before),
            )

    def update_strategy(self, task_id: str, strategy: Row) -> None:
        with self._tx() as cur:
            cur.execute(
                "update analysis_summaries set strategy_insights = %s where task_id = %s",
                (Jsonb(strategy), task_id),
            )
