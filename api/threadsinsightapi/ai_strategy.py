"""AI 內容策略建議（PRD F4 第 4 步、例外情境 6）：以 Claude Haiku 5.5 產生 3 點觀察與改寫範例。

- 只送彙總數據與少數合成貼文內文，不含任何真實帳號資料；系統提示明確說明資料為合成。
- 30 秒逾時，SDK 自動重試 2 次（408／409／429／5xx／連線錯誤／逾時，指數退避）。
- 逾時、API 錯誤、拒答（stop_reason == "refusal"，Haiku 5.5 沒有伺服器端備援）、
  輸出不合格或未設定金鑰時，一律退回規則引擎結果並附上說明，報告不會中斷。
- API 金鑰只在伺服器端讀取（ANTHROPIC_API_KEY），絕不送到前端。
"""

import json
import logging
import os
import re
import time
from collections.abc import Sequence
from dataclasses import asdict, replace
from typing import Any, Protocol

import anthropic
from pydantic import BaseModel, ValidationError

from threadsinsightapi.attribution import Attribution
from threadsinsightapi.cleaning import CleanPost
from threadsinsightapi.observability import elapsed_ms, log_event
from threadsinsightapi.stats import PostStats, engagement_of
from threadsinsightapi.strategy import Insight, Rewrite, StrategyResult

logger = logging.getLogger("threadsinsightapi.ai")

MODEL = "claude-haiku-5-5"
EFFORT = "medium"  # Haiku 5.5 的預設值，明確寫出以免日後預設改變
MAX_TOKENS = 16000  # 含思考；不要壓低，否則思考用完額度會沒有輸出
TIMEOUT_SECONDS = 30.0
MAX_RETRIES = 2
INSIGHT_COUNT = 3
MAX_TITLE_LENGTH = 40
MAX_TEXT_LENGTH = 200
MAX_REWRITE_LENGTH = 400
TOP_POSTS_IN_PROMPT = 3

NOTICE_TIMEOUT = "AI 深度建議生成逾時，目前已顯示系統規則引擎產出之基礎策略觀察。"
NOTICE_ERROR = "AI 深度建議暫時無法產生，目前已顯示系統規則引擎產出之基礎策略觀察。"
NOTICE_DISABLED = (
    "尚未啟用 AI 建議：可在上方「AI 建議設定」輸入你的 Anthropic API 金鑰，"
    "目前顯示系統規則引擎產出之基礎策略觀察。"
)
NOTICE_AUTH = "AI 建議無法產生：API 金鑰無效或沒有權限，目前已顯示系統規則引擎產出之基礎策略觀察。"

# 使用者在網頁輸入的金鑰：只檢查格式，不記錄、不回傳、不快取
_USER_KEY_RE = re.compile(r"^sk-ant-[A-Za-z0-9_-]{20,200}$")

SYSTEM_PROMPT = "\n".join(
    (
        "你是社群內容策略顧問，協助分析 Threads 貼文的互動表現。",
        "",
        "重要前提：",
        "- 這批貼文是系統產生的合成示範資料（Mock Dataset），不是任何真實帳號的貼文。"
        "不要說成是該帳號本人的表現，也不要推測帳號主人是誰。",
        "- 只根據提供的數據下結論，引用數字時要與資料一致；"
        "資料顯示的是相關性，不要寫成保證有效的因果。",
        "- 一律使用繁體中文（台灣用語）。",
        "",
        "請產出：",
        "1. 恰好 3 點內容策略觀察。每點包含：title（20 字內的結論）、"
        "evidence（引用資料中的具體數字）、action（下一篇貼文就能執行的具體做法）。"
        "3 點要涵蓋不同面向，不要重複同一個訊號。",
        "2. 一個改寫範例：改寫提供的「互動最低貼文」。保留原本的主題與意思，套用你的建議；"
        "不要加入任何網址，原文的連結請改寫成「連結放在留言」之類的說明。"
        "after 是改寫後全文，changes 用 1–4 個短句說明改了什麼。",
        "",
        "寫給一般讀者看：",
        "- 不要出現資料欄位名稱或英文代號（例如 hashtag_rate、avg_char_count、high、link、"
        "text_only）。請改用中文說法：high／medium／low 組寫成「高／中／低互動組」，"
        "比例寫成百分比（1.0 → 100%），貼文類型寫成「純文字、圖片、連結、Hashtag、提及」。",
        "- 平均值取整數（1646.6 → 1647）。",
        "- 不要提到「規則引擎」或「JSON」等系統用語。",
    )
)


class AiInsight(BaseModel):
    title: str
    evidence: str
    action: str


class AiRewrite(BaseModel):
    after: str
    changes: list[str]


class AiStrategy(BaseModel):
    insights: list[AiInsight]
    rewrite: AiRewrite


class InvalidAiOutputError(ValueError):
    """模型輸出不符合格式或內容規則。"""


class MessagesClient(Protocol):
    """測試時注入假的 client；正式環境為 anthropic.Anthropic()。"""

    @property
    def messages(self) -> Any: ...


def is_valid_user_key(value: str) -> bool:
    return bool(_USER_KEY_RE.fullmatch(value.strip()))


def ai_enabled() -> bool:
    """THREADSINSIGHT_AI=on／off 可強制開關；預設在有設定金鑰時啟用。"""
    mode = os.environ.get("THREADSINSIGHT_AI", "auto").lower()
    if mode == "off":
        return False
    if mode == "on":
        return True
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def create_client(api_key: str | None = None) -> anthropic.Anthropic:
    """api_key 為 None 時由 SDK 從環境變數（ANTHROPIC_API_KEY 等）取得憑證。"""
    return anthropic.Anthropic(api_key=api_key, timeout=TIMEOUT_SECONDS, max_retries=MAX_RETRIES)


def lowest_post(posts: Sequence[CleanPost]) -> CleanPost | None:
    if not posts:
        return None
    return min(enumerate(posts), key=lambda item: (engagement_of(item[1]), item[0]))[1]


def build_prompt(
    username: str,
    posts: Sequence[CleanPost],
    stats: PostStats,
    attribution: Attribution,
    rule_strategy: StrategyResult,
) -> str:
    """把分析結果整理成精簡 JSON；只放合成資料的彙總與少數內文。"""
    top = sorted(posts, key=lambda p: -engagement_of(p))[:TOP_POSTS_IN_PROMPT]
    target = lowest_post(posts)
    payload = {
        "username": username,
        "post_count": len(posts),
        "averages": asdict(stats.averages),
        "post_types": [asdict(s) for s in stats.post_types if s.count],
        "length_buckets": [asdict(s) for s in stats.length_buckets if s.count],
        "top_keywords": [asdict(t) for t in stats.top_keywords],
        "group_profiles": [
            {
                "group": g.group,
                "post_count": g.post_count,
                "keywords": [k.term for k in g.keywords],
                "structure": asdict(g.structure) if g.structure else None,
            }
            for g in attribution.groups
        ],
        "rule_engine_findings": [
            {"title": i.title, "evidence": i.evidence}
            for i in rule_strategy.insights
            if i.lift is not None
        ],
        "top_posts": [{"content": p.content, "engagement": engagement_of(p)} for p in top],
        "lowest_post": {"content": target.content, "engagement": engagement_of(target)}
        if target
        else None,
    }
    return (
        "以下是合成示範資料的分析結果（JSON）。請依系統說明產出 3 點觀察與改寫範例。\n\n"
        + json.dumps(payload, ensure_ascii=False)
    )


def _check_text(value: str, limit: int, field: str) -> str:
    text = value.strip()
    if not text:
        raise InvalidAiOutputError(f"{field} is empty")
    if len(text) > limit:
        raise InvalidAiOutputError(f"{field} exceeds {limit} characters")
    if "threads.com" in text.lower() or "threads.net" in text.lower():
        raise InvalidAiOutputError(f"{field} mentions a real Threads URL")  # Mock Dataset 規則 3
    return text


def to_strategy(output: AiStrategy, target: CleanPost) -> StrategyResult:
    """驗證模型輸出並轉成與規則引擎相同的結構（source = "llm"）。"""
    if len(output.insights) != INSIGHT_COUNT:
        raise InvalidAiOutputError(f"expected {INSIGHT_COUNT} insights, got {len(output.insights)}")
    insights = tuple(
        Insight(
            category="ai",
            title=_check_text(i.title, MAX_TITLE_LENGTH, "title"),
            evidence=_check_text(i.evidence, MAX_TEXT_LENGTH, "evidence"),
            action=_check_text(i.action, MAX_TEXT_LENGTH, "action"),
            lift=None,
        )
        for i in output.insights
    )
    after = _check_text(output.rewrite.after, MAX_REWRITE_LENGTH, "rewrite")
    if "http://" in after or "https://" in after:
        raise InvalidAiOutputError("rewrite must not contain URLs")
    changes = tuple(_check_text(c, MAX_TEXT_LENGTH, "change") for c in output.rewrite.changes)
    if not changes:
        raise InvalidAiOutputError("rewrite has no changes")
    return StrategyResult(
        source="llm",
        insights=insights,
        rewrite=Rewrite(target.post_url, target.content, after, changes),
        notice=None,
        model=MODEL,
    )


def fallback(rule_strategy: StrategyResult, notice: str) -> StrategyResult:
    combined = f"{notice} {rule_strategy.notice}" if rule_strategy.notice else notice
    return replace(rule_strategy, notice=combined)


def generate_ai_strategy(
    client: MessagesClient | None,
    username: str,
    posts: Sequence[CleanPost],
    stats: PostStats,
    attribution: Attribution,
    rule_strategy: StrategyResult,
) -> StrategyResult:
    """呼叫 Claude Haiku 5.5；任何失敗都退回規則引擎結果（附說明），不會丟出例外。"""
    target = lowest_post(posts)
    if client is None or target is None:
        _log_call("disabled" if client is None else "no_posts", 0.0)
        return fallback(rule_strategy, NOTICE_DISABLED if client is None else NOTICE_ERROR)
    start = time.perf_counter()
    try:
        response = client.messages.parse(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            output_config={"effort": EFFORT},
            messages=[
                {
                    "role": "user",
                    "content": build_prompt(username, posts, stats, attribution, rule_strategy),
                }
            ],
            output_format=AiStrategy,
        )
    except anthropic.APITimeoutError:
        _log_call("timeout", elapsed_ms(start))
        return fallback(rule_strategy, NOTICE_TIMEOUT)
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as error:
        _log_call("auth_error", elapsed_ms(start), error_type=type(error).__name__)
        return fallback(rule_strategy, NOTICE_AUTH)
    except anthropic.APIError as error:
        _log_call("api_error", elapsed_ms(start), error_type=type(error).__name__)
        return fallback(rule_strategy, NOTICE_ERROR)
    except (ValidationError, ValueError) as error:
        _log_call("parse_error", elapsed_ms(start), error_type=type(error).__name__)
        return fallback(rule_strategy, NOTICE_ERROR)

    usage = getattr(response, "usage", None)
    call = {
        "stop_reason": response.stop_reason,
        "input_tokens": getattr(usage, "input_tokens", None),
        "output_tokens": getattr(usage, "output_tokens", None),
        "anthropic_request_id": getattr(response, "_request_id", None),
    }
    duration = elapsed_ms(start)
    if response.stop_reason != "end_turn" or response.parsed_output is None:
        # refusal（安全分類器拒答）或 max_tokens 截斷：都不採用
        status = "refusal" if response.stop_reason == "refusal" else "incomplete"
        _log_call(status, duration, **call)
        return fallback(rule_strategy, NOTICE_ERROR)
    try:
        strategy = to_strategy(response.parsed_output, target)
    except InvalidAiOutputError:
        _log_call("invalid_output", duration, **call)
        return fallback(rule_strategy, NOTICE_ERROR)
    _log_call("success", duration, **call)
    return strategy


def _log_call(status: str, duration_ms: float, **fields: Any) -> None:
    """llm.call 事件。status 不是 success 時，使用者看到的是規則引擎結果。

    不記錄提示內容與金鑰。
    """
    level = logging.INFO if status in ("success", "disabled") else logging.WARNING
    log_event(
        logger, "llm.call", level, model=MODEL, status=status, duration_ms=duration_ms, **fields
    )
