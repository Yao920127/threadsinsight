"""分析任務端點（PRD F2、例外情境 7、8）。所有資料存取都以使用者身分經過 RLS。

- POST   /api/tasks                    建立任務；24 小時內同帳號同篇數已完成時回傳快取
- GET    /api/tasks                    任務列表（新到舊）
- GET    /api/tasks/{id}               任務與報告
- POST   /api/tasks/{id}/rerun         保留 ID 重新執行
- DELETE /api/tasks/{id}               刪除任務與其貼文、彙總
- POST   /api/tasks/{id}/ai-strategy   Claude Haiku 5.5 建議，成功結果存回該任務
"""

import logging
import os
from collections.abc import Callable
from dataclasses import asdict
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from threadsinsightapi.ai_strategy import MessagesClient, generate_ai_strategy, is_valid_user_key
from threadsinsightapi.dependencies import (
    CurrentUser,
    Repository,
    get_ai_client,
    get_client_factory,
)
from threadsinsightapi.generator import DEFAULT_POST_COUNT, MAX_POST_COUNT, MIN_POST_COUNT
from threadsinsightapi.pipeline import analyze
from threadsinsightapi.responses import envelope
from threadsinsightapi.task_repository import Row
from threadsinsightapi.task_service import (
    TaskFailedError,
    TaskResult,
    create_task,
    fail_stale_tasks,
    load_report,
    rerun_task,
)
from threadsinsightapi.throttle import RateLimiter

logger = logging.getLogger("threadsinsightapi.tasks")

# 帳號名稱最多 30 字元；完整 URL 給足餘裕但仍設上限，避免超長輸入
MAX_INPUT_LENGTH = 200
USER_KEY_HEADER = "X-User-Anthropic-Key"
AI_RATE_LIMIT = 10  # 每位使用者每分鐘最多 10 次實際呼叫（讀取已存結果不計）
AI_RATE_WINDOW_SECONDS = 60.0

TASK_RATE_LIMIT = 30  # 建立／重跑任務：每位使用者每分鐘最多 30 次
ai_limiter = RateLimiter(AI_RATE_LIMIT, AI_RATE_WINDOW_SECONDS)
task_limiter = RateLimiter(TASK_RATE_LIMIT, AI_RATE_WINDOW_SECONDS)
TOO_MANY_TASKS = "Too many analysis requests; please retry in a minute"
router = APIRouter(prefix="/api/tasks")

# 回傳給前端的任務欄位（不含 user_id）
_PUBLIC_TASK_FIELDS = (
    "id",
    "target_username",
    "requested_count",
    "status",
    "data_source",
    "post_count",
    "error_message",
    "created_at",
    "started_at",
    "completed_at",
)


class CreateTaskBody(BaseModel):
    username: str = Field(min_length=1, max_length=MAX_INPUT_LENGTH)
    count: int = Field(default=DEFAULT_POST_COUNT, ge=MIN_POST_COUNT, le=MAX_POST_COUNT)
    force: bool = False  # 「強制重新分析」：忽略 24 小時快取


def _public_task(task: Row) -> Row:
    return {key: task.get(key) for key in _PUBLIC_TASK_FIELDS}


def _result_payload(result: TaskResult) -> dict[str, Any]:
    return {"task": _public_task(result.task), "report": result.report, "cached": result.cached}


def _failed(error: TaskFailedError) -> JSONResponse:
    return envelope(500, data={"task": _public_task(error.task)}, error="Analysis failed")


@router.post("")
def post_task(body: CreateTaskBody, user: CurrentUser, repo: Repository) -> JSONResponse:
    if not task_limiter.allow(user.id):
        return envelope(429, error=TOO_MANY_TASKS)
    try:
        result = create_task(repo, user.id, body.username, body.count, body.force)
    except TaskFailedError as error:
        return _failed(error)
    return envelope(200 if result.cached else 201, data=_result_payload(result))


@router.get("")
def list_tasks(repo: Repository) -> JSONResponse:
    fail_stale_tasks(repo)  # 例外情境 8：讀取時順便把卡住的任務標為 failed
    return envelope(200, data={"tasks": [_public_task(task) for task in repo.list_recent()]})


@router.get("/{task_id}")
def get_task(task_id: UUID, repo: Repository) -> JSONResponse:
    fail_stale_tasks(repo)
    task = repo.get(str(task_id))
    report = load_report(repo, task) if task["status"] == "completed" else None
    return envelope(200, data={"task": _public_task(task), "report": report, "cached": False})


@router.post("/{task_id}/rerun")
def post_rerun(task_id: UUID, user: CurrentUser, repo: Repository) -> JSONResponse:
    if not task_limiter.allow(user.id):
        return envelope(429, error=TOO_MANY_TASKS)
    try:
        result = rerun_task(repo, str(task_id))
    except TaskFailedError as error:
        return _failed(error)
    return envelope(200, data=_result_payload(result))


@router.delete("/{task_id}")
def delete_task(task_id: UUID, repo: Repository) -> JSONResponse:
    repo.delete(str(task_id))
    return envelope(200, data={"id": str(task_id)})


def _choose_client(
    user_key: str | None,
    server_client: MessagesClient | None,
    client_factory: Callable[[str], MessagesClient],
) -> MessagesClient | None:
    """網頁輸入的金鑰優先於伺服器金鑰；THREADSINSIGHT_AI=off 時一律停用。"""
    if os.environ.get("THREADSINSIGHT_AI", "auto").lower() == "off":
        return server_client  # get_ai_client 在 off 時已回傳 None
    return client_factory(user_key.strip()) if user_key else server_client


@router.post("/{task_id}/ai-strategy")
def post_ai_strategy(
    task_id: UUID,
    user: CurrentUser,
    repo: Repository,
    server_client: Annotated[MessagesClient | None, Depends(get_ai_client)],
    client_factory: Annotated[Callable[[str], MessagesClient], Depends(get_client_factory)],
    refresh: Annotated[bool, Query(description="忽略已存的 AI 建議重新產生")] = False,
    user_key: Annotated[str | None, Header(alias=USER_KEY_HEADER)] = None,
) -> JSONResponse:
    """Claude Haiku 5.5 策略建議；任何失敗都回傳規則引擎結果與說明（source = rule_engine）。

    成功結果存入該任務的 analysis_summaries.strategy_insights，之後開啟同一任務不再重新呼叫。
    金鑰以標頭傳入，不記錄、不回傳、不寫入資料庫。
    """
    if user_key is not None and not is_valid_user_key(user_key):
        return envelope(400, error="Invalid Anthropic API key format")
    task = repo.get(str(task_id))
    stored = load_report(repo, task)["strategy"]  # 未完成 → TaskNotReadyError → 409
    if stored.get("source") == "llm" and not refresh:
        return envelope(200, data=stored)

    client = _choose_client(user_key, server_client, client_factory)
    if client is not None and not ai_limiter.allow(user.id):
        return envelope(429, error="Too many AI strategy requests; please retry in a minute")
    result = analyze(task["target_username"], task["requested_count"])  # 確定性，與已存報告相同
    strategy = generate_ai_strategy(
        client,
        result.dataset.username,
        result.nlp.posts,
        result.stats,
        result.nlp.attribution,
        result.strategy,
    )
    if strategy.source == "llm":  # 只保存成功結果，失敗下次可重試
        repo.update_strategy(str(task_id), asdict(strategy))
    return envelope(200, data=asdict(strategy))
