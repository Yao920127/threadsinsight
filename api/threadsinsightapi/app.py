"""threadsinsightapi HTTP 端點。只提供合成資料（Mock Dataset），不做任何外部抓取。

- GET /api/mock-posts：即時產生的完整分析報告（不寫入資料庫，供預覽與測試）。
- /api/tasks…：分析任務管理（建立、列表、檢視、重跑、刪除、AI 建議），見 tasks_api.py。

- /api/auth…：會員註冊、登入、登出（見 auth_api.py）。

除了健康檢查與 /api/auth 的註冊、登入、登出，所有端點都需要登入（httpOnly cookie），未登入回 401。
"""

import logging
import time
from collections.abc import Awaitable, Callable
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import FastAPI, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from threadsinsightapi.auth import (
    AuthError,
    EmailTakenError,
    InvalidCredentialsError,
    InvalidSignupError,
)
from threadsinsightapi.auth_api import router as auth_router
from threadsinsightapi.db import RepositoryError
from threadsinsightapi.dependencies import (
    CurrentUser,
    get_account_store,
    get_ai_client,
    get_client_factory,
    get_task_repository,
    require_user,
)
from threadsinsightapi.generator import (
    DEFAULT_POST_COUNT,
    MAX_POST_COUNT,
    MIN_POST_COUNT,
    InvalidCountError,
)
from threadsinsightapi.normalize import InvalidUsernameError
from threadsinsightapi.observability import elapsed_ms, log_event, new_request_id, request_id_var
from threadsinsightapi.pipeline import analyze
from threadsinsightapi.report import report_data
from threadsinsightapi.responses import envelope
from threadsinsightapi.task_repository import TaskNotFoundError
from threadsinsightapi.task_service import TaskNotReadyError
from threadsinsightapi.tasks_api import MAX_INPUT_LENGTH, router

# 測試以 dependency_overrides 替換這些相依項目
__all__ = [
    "app",
    "get_account_store",
    "get_ai_client",
    "get_client_factory",
    "get_task_repository",
    "require_user",
]

logger = logging.getLogger("threadsinsightapi")

app = FastAPI(
    title="threadsinsightapi",
    description="Deterministic synthetic Threads-like posts. Never real posts from any account.",
    version="0.4.0",
)
app.include_router(auth_router)
app.include_router(router)

# API 只回 JSON：禁止嵌入、禁止 MIME 猜測、不載入任何資源。
# 直接連 API 時也生效；網頁的標頭另由 nginx 設定。
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Cross-Origin-Resource-Policy": "same-origin",
}


REQUEST_ID_HEADER = "X-Request-ID"
http_logger = logging.getLogger("threadsinsightapi.http")
# 會改變資料的請求方法；這些請求若帶著其他網站的 Origin，一律拒絕（防跨站請求偽造）
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def is_cross_site(request: Request) -> bool:
    """瀏覽器送出的跨站請求會帶 Origin；與本站 Host 不同即為跨站。

    沒有 Origin 的請求不是瀏覽器跨站送出的（例如 curl），不在此限，但仍需登入。
    """
    origin = request.headers.get("origin")
    if request.method not in UNSAFE_METHODS or not origin:
        return False
    return urlsplit(origin).netloc != request.headers.get("host", "")


@app.middleware("http")
async def _request_context(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """每個請求一個 request_id（日誌與回應標頭共用），記錄耗時，並加上安全標頭。"""
    request_id = new_request_id(request.headers.get(REQUEST_ID_HEADER))
    token = request_id_var.set(request_id)
    start = time.perf_counter()
    status = 500
    try:
        if is_cross_site(request):
            log_event(logger, "http.cross_site_rejected", logging.WARNING, path=request.url.path)
            response = envelope(403, error="Cross-site request rejected")
        else:
            response = await call_next(request)
        status = response.status_code
        for name, value in SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response
    finally:
        # 只記錄路徑，不記錄查詢字串與標頭（可能含帳號輸入或 token）
        if request.url.path != "/api/health":
            log_event(
                http_logger,
                "http.request",
                method=request.method,
                path=request.url.path,
                status=status,
                duration_ms=elapsed_ms(start),
            )
        request_id_var.reset(token)


@app.get("/api/health", include_in_schema=False)
def health() -> JSONResponse:
    """容器健康檢查用；不需登入、不連資料庫、不回傳任何設定。"""
    return envelope(200, data={"status": "ok"})


@app.exception_handler(RequestValidationError)
async def _on_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    fields = sorted({str(err["loc"][-1]) for err in exc.errors()})
    return envelope(400, error=f"Invalid query parameter(s): {', '.join(fields)}")


@app.exception_handler(AuthError)
async def _on_auth_error(_: Request, exc: AuthError) -> JSONResponse:
    log_event(logger, "auth.rejected", reason=str(exc))  # 只記錄原因分類，不記錄 cookie
    return envelope(401, error="Authentication required")


@app.exception_handler(InvalidCredentialsError)
async def _on_invalid_credentials(_: Request, _exc: InvalidCredentialsError) -> JSONResponse:
    return envelope(401, error="Invalid email or password")


@app.exception_handler(EmailTakenError)
async def _on_email_taken(_: Request, _exc: EmailTakenError) -> JSONResponse:
    return envelope(409, error="Email already registered")


@app.exception_handler(InvalidSignupError)
async def _on_invalid_signup(_: Request, exc: InvalidSignupError) -> JSONResponse:
    return envelope(400, error=str(exc))


@app.exception_handler(RepositoryError)
async def _on_repository_error(_: Request, exc: RepositoryError) -> JSONResponse:
    log_event(logger, "db.unavailable", logging.ERROR, reason=str(exc))
    return envelope(503, error="Database unavailable")


@app.exception_handler(TaskNotFoundError)
async def _on_task_not_found(_: Request, _exc: TaskNotFoundError) -> JSONResponse:
    return envelope(404, error="Task not found")


@app.exception_handler(TaskNotReadyError)
async def _on_task_not_ready(_: Request, _exc: TaskNotReadyError) -> JSONResponse:
    return envelope(409, error="Task is not completed")


@app.exception_handler(InvalidUsernameError)
@app.exception_handler(InvalidCountError)
async def _on_invalid_input(_: Request, exc: ValueError) -> JSONResponse:
    return envelope(400, error=str(exc))


Username = Annotated[
    str,
    Query(
        min_length=1,
        max_length=MAX_INPUT_LENGTH,
        description="Threads username, @username, or profile URL",
    ),
]
Count = Annotated[
    int,
    Query(ge=MIN_POST_COUNT, le=MAX_POST_COUNT, description="Number of synthetic posts"),
]


@app.get("/api/mock-posts")
def get_mock_posts(
    _user: CurrentUser, username: Username, count: Count = DEFAULT_POST_COUNT
) -> JSONResponse:
    """回傳以 username 為種子、已清理並分析的合成貼文。同一帳號每次回傳相同的貼文。"""
    try:
        result = analyze(username, count)
    except (InvalidUsernameError, InvalidCountError):
        raise
    except Exception:
        logger.exception("Analysis failed for count=%s", count)
        return envelope(500, error="Failed to generate mock dataset")
    return envelope(200, data=report_data(result))
