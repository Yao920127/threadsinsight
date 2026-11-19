"""分析任務的流程（PRD F2）：建立（含 24 小時快取）、執行、重跑、逾時判定。

狀態依序為 pending → generating → analyzing → completed，任何一步失敗即標為 failed。
管線在請求內同步執行（通常 1 秒內），每個階段都寫回資料庫；若程序在中途結束，
任務會停在進行中狀態，由 fail_stale_tasks 在超過 3 分鐘後標為 failed（例外情境 8）。
"""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from threadsinsightapi.generator import generate_mock_dataset, seed_for
from threadsinsightapi.normalize import normalize_username
from threadsinsightapi.observability import log_event, timed
from threadsinsightapi.pipeline import analyze_dataset
from threadsinsightapi.report import from_storage, report_data, to_storage
from threadsinsightapi.task_repository import Row, TaskRepository

logger = logging.getLogger("threadsinsightapi.tasks")

CACHE_TTL = timedelta(hours=24)  # PRD 例外情境 7
STALE_AFTER = timedelta(minutes=3)  # PRD 例外情境 8
PIPELINE_FAILED = "Pipeline failed"
STALE_MESSAGE = "Timed out after 3 minutes"


class TaskFailedError(Exception):
    """管線執行失敗；任務已標為 failed。"""

    def __init__(self, task: Row) -> None:
        super().__init__("Analysis pipeline failed")
        self.task = task


class TaskNotReadyError(Exception):
    """任務尚未完成，沒有報告可用。"""


@dataclass(frozen=True)
class TaskResult:
    task: Row
    report: dict[str, Any] | None
    cached: bool = False


def _now() -> datetime:
    return datetime.now(UTC)


def run_task(repo: TaskRepository, task: Row) -> TaskResult:
    """執行一個 pending 任務。生成與分析是確定性的，失敗多半是程式錯誤，記錄後標為 failed。

    日誌記錄每個階段的耗時與生成種子（PRD 第 7 節），可用 seed 重現同一批合成資料。
    """
    task_id = task["id"]
    username = task["target_username"]
    count = task["requested_count"]
    stage = "generating"
    durations: dict[str, float] = {}
    try:
        repo.update(task_id, {"status": "generating"})
        with timed() as t:
            dataset = generate_mock_dataset(username, count=count)
        durations["generate_ms"] = t["ms"]
        stage = "analyzing"
        repo.update(task_id, {"status": "analyzing"})
        with timed() as t:
            report = report_data(analyze_dataset(dataset))
            posts, summary = to_storage(report)
        durations["analyze_ms"] = t["ms"]
    except Exception as error:
        log_event(
            logger,
            "task.failed",
            logging.ERROR,
            task_id=task_id,
            stage=stage,
            error_type=type(error).__name__,
            **durations,
        )
        logger.exception("Task pipeline raised")
        failed = repo.update(task_id, {"status": "failed", "error_message": PIPELINE_FAILED})
        raise TaskFailedError(failed) from error
    stage = "saving"
    with timed() as t:
        saved = repo.save_results(task_id, posts, summary)
    log_event(
        logger,
        "task.completed",
        task_id=task_id,
        target_username=username,
        seed=seed_for(username),
        requested_count=count,
        post_count=len(posts),
        save_ms=t["ms"],
        **durations,
    )
    return TaskResult(task=saved, report=report)


def create_task(
    repo: TaskRepository, user_id: str, raw_username: str, count: int, force: bool
) -> TaskResult:
    """先查 24 小時內同帳號、同篇數的完成任務；命中且未強制重跑時直接回傳快取報告。"""
    username = normalize_username(raw_username)  # 不合法時丟 InvalidUsernameError
    if not force:
        cached = repo.find_cached(username, count, _now() - CACHE_TTL)
        if cached is not None:
            log_event(logger, "task.cache_hit", task_id=cached["id"], requested_count=count)
            return TaskResult(task=cached, report=load_report(repo, cached), cached=True)
    task = repo.create(user_id, username, raw_username.strip(), count)
    log_event(logger, "task.created", task_id=task["id"], requested_count=count, force=force)
    return run_task(repo, task)


def rerun_task(repo: TaskRepository, task_id: str) -> TaskResult:
    """保留任務 ID 重新執行；舊貼文與彙總在寫入新結果時於同一交易內替換。"""
    repo.get(task_id)  # 不存在或不是本人的任務 → TaskNotFoundError
    task = repo.update(
        task_id,
        {
            "status": "pending",
            "completed_at": None,
            "error_message": None,
            "started_at": _now().isoformat(),
        },
    )
    log_event(logger, "task.rerun", task_id=task_id)
    return run_task(repo, task)


def load_report(repo: TaskRepository, task: Row) -> dict[str, Any]:
    if task["status"] != "completed":
        raise TaskNotReadyError
    rows = repo.report_rows(task["id"])
    if rows.summary is None or not rows.posts:
        raise TaskNotReadyError
    return from_storage(task, rows.posts, rows.summary)


def fail_stale_tasks(repo: TaskRepository) -> None:
    repo.fail_stale(_now() - STALE_AFTER, STALE_MESSAGE)
