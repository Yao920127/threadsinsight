"""結構化日誌（PRD 第 7 節：生成種子、任務階段耗時、LLM 呼叫狀態）。

- 每筆日誌是一行 JSON：時間、等級、logger、事件名稱、request_id，以及事件欄位。
- request_id 由 HTTP middleware 設定，同一個請求內的所有日誌自動帶上，並回傳在 X-Request-ID 標頭。
- 只記錄白名單內的基本型別欄位；token、金鑰、Email、貼文內文一律不記錄（見 FORBIDDEN_FIELDS）。
"""

import json
import logging
import os
import re
import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

# 呼叫端傳入的 X-Request-ID 只接受安全字元，避免日誌注入
_REQUEST_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")
FIELDS_ATTR = "event_fields"
# 誤傳時直接丟掉，不寫進日誌（防呆，不取代呼叫端的責任）
FORBIDDEN_FIELDS = frozenset(
    {"authorization", "token", "access_token", "api_key", "apikey", "password", "email", "content"}
)
Scalar = str | int | float | bool | None


def new_request_id(incoming: str | None = None) -> str:
    if incoming and _REQUEST_ID.fullmatch(incoming):
        return incoming
    return uuid.uuid4().hex


def _clean(fields: dict[str, Any]) -> dict[str, Scalar]:
    return {
        key: value
        for key, value in fields.items()
        if key.lower() not in FORBIDDEN_FIELDS
        and isinstance(value, str | int | float | bool | None)
    }


def log_event(logger: logging.Logger, event: str, level: int = logging.INFO, **fields: Any) -> None:
    """記錄一個事件。fields 只接受基本型別，其餘欄位會被丟掉。"""
    # request_id 在寫入當下記進紀錄，之後才格式化（例如非同步 handler）也不會遺失
    logger.log(
        level, event, extra={FIELDS_ATTR: _clean(fields), "request_id": request_id_var.get()}
    )


def elapsed_ms(start: float) -> float:
    return round((time.perf_counter() - start) * 1000, 1)


@contextmanager
def timed() -> Iterator[dict[str, float]]:
    """with timed() as t: …；結束後 t["ms"] 為耗時毫秒。"""
    result: dict[str, float] = {}
    start = time.perf_counter()
    try:
        yield result
    finally:
        result["ms"] = elapsed_ms(start)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "event": record.getMessage(),
            "request_id": getattr(record, "request_id", None) or request_id_var.get(),
            **getattr(record, FIELDS_ATTR, {}),
        }
        if record.exc_info:
            # 只記錄例外類型與堆疊，不記錄例外訊息中可能夾帶的輸入內容
            payload["exc_type"] = record.exc_info[0].__name__ if record.exc_info[0] else None
            payload["stack"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


class TextFormatter(logging.Formatter):
    """開發時較好讀的格式：時間 等級 事件 key=value…"""

    def format(self, record: logging.LogRecord) -> str:
        fields = getattr(record, FIELDS_ATTR, {})
        request_id = getattr(record, "request_id", None) or request_id_var.get()
        parts = [f"{key}={value}" for key, value in fields.items()]
        if request_id:
            parts.append(f"request_id={request_id[:8]}")
        line = f"{self.formatTime(record, '%H:%M:%S')} {record.levelname:<7} {record.getMessage()}"
        text = " ".join([line, *parts])
        return f"{text}\n{self.formatException(record.exc_info)}" if record.exc_info else text


def configure_logging() -> None:
    """LOG_FORMAT=json（預設）或 text；LOG_LEVEL 預設 INFO。只設定本專案的 logger。"""
    handler = logging.StreamHandler()
    is_text = os.environ.get("LOG_FORMAT", "json").lower() == "text"
    handler.setFormatter(TextFormatter() if is_text else JsonFormatter())
    root = logging.getLogger("threadsinsightapi")
    root.handlers = [handler]
    root.setLevel(os.environ.get("LOG_LEVEL", "INFO").upper())
    root.propagate = False
