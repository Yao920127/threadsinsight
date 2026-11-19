"""資料清理與特徵萃取（PRD F3 第 2 步）。

輸入是「貼文形狀」的原始紀錄（dict），刻意不假設來源可信：
- 去重：同一 `post_url` 只保留第一筆。
- 缺失值：計數欄位缺失補 0、文字缺失補空字串；`views_count` 保留 null 表示未公開。
- 時區：`published_at` 一律轉成 Asia/Taipei（+08:00），無時區資訊者視為台北時間。
- 隔離：`is_synthetic` 不是 true 的紀錄一律剔除（Mock Dataset 規則 8，不混用真實資料）。
- 特徵：字元數、hashtag／mention／連結數量、貼文類型、加權互動分。
"""

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from threadsinsightapi.content import EngagementTier

PostType = Literal["image", "link", "hashtag", "mention", "text_only"]
MediaType = Literal["text_only", "image"]
EngagementGroup = Literal["high", "medium", "low"]

TAIPEI = timezone(timedelta(hours=8))
_MEDIA_TYPES: frozenset[str] = frozenset({"text_only", "image"})
_TIERS: frozenset[str] = frozenset({"high", "medium", "low"})

_URL_RE = re.compile(r"(?:https?://|www\.)\S+", re.IGNORECASE)
# 前面不能是文字或 #／&，排除「C#」與 HTML 實體「&#123;」
_HASHTAG_RE = re.compile(r"(?<![\w#&])#\w+")
# 前面不能是文字、@ 或句點，排除 email（name@example.com）
_MENTION_RE = re.compile(r"(?<![\w@.])@[a-z0-9._]{1,30}", re.IGNORECASE)
_WHITESPACE_RE = re.compile(r"\s+")


class InvalidRecordError(ValueError):
    """紀錄缺少必要欄位或欄位型別錯誤，無法清理。"""


@dataclass(frozen=True)
class PostFeatures:
    char_count: int
    hashtag_count: int
    mention_count: int
    url_count: int
    post_type: PostType


@dataclass(frozen=True)
class CleanPost:
    post_url: str
    is_synthetic: Literal[True]
    published_at: str
    content: str
    likes_count: int
    replies_count: int
    reposts_count: int
    views_count: int | None
    media_type: MediaType
    engagement_tier: EngagementTier | None
    engagement_score: int
    char_count: int
    hashtag_count: int
    mention_count: int
    url_count: int
    post_type: PostType
    #: 由 grouping.assign_engagement_groups 依分數百分位填入；清理階段為 None
    engagement_group: EngagementGroup | None = None
    #: 以下由 attribution.run_nlp 填入（text_features 的逐篇結果）；清理階段為 None
    topic: str | None = None
    sentiment: str | None = None
    has_question: bool | None = None
    has_cta: bool | None = None


@dataclass(frozen=True)
class CleaningReport:
    input_count: int
    output_count: int
    duplicates_removed: int
    invalid_removed: int


@dataclass(frozen=True)
class CleanResult:
    posts: tuple[CleanPost, ...]
    report: CleaningReport


def find_hashtags(content: str) -> list[str]:
    """依出現順序回傳 hashtag（含 #，不在網址內者）。"""
    return _HASHTAG_RE.findall(_URL_RE.sub(" ", content))


def strip_entities(content: str) -> str:
    """移除網址、hashtag 與 mention，只留下可供斷詞的文字。"""
    text = _URL_RE.sub(" ", content)
    return _MENTION_RE.sub(" ", _HASHTAG_RE.sub(" ", text))


def extract_features(content: str, media_type: MediaType) -> PostFeatures:
    """字元數不含空白與網址；hashtag／mention 也只在去掉網址後的文字中計算。"""
    url_count = len(_URL_RE.findall(content))
    text = _URL_RE.sub(" ", content)
    hashtag_count = len(find_hashtags(content))
    mention_count = len(_MENTION_RE.findall(text))
    return PostFeatures(
        char_count=len(_WHITESPACE_RE.sub("", text)),
        hashtag_count=hashtag_count,
        mention_count=mention_count,
        url_count=url_count,
        post_type=_post_type(media_type, url_count, hashtag_count, mention_count),
    )


def _post_type(media_type: MediaType, urls: int, hashtags: int, mentions: int) -> PostType:
    """單一主要類型，優先順序：圖片 > 連結 > hashtag > mention > 純文字。"""
    if media_type == "image":
        return "image"
    if urls:
        return "link"
    if hashtags:
        return "hashtag"
    if mentions:
        return "mention"
    return "text_only"


def to_taipei(published_at: Any) -> str:
    """把任意 ISO-8601 字串轉為 `YYYY-MM-DDTHH:MM:SS+08:00`（秒以下截斷）。"""
    if not isinstance(published_at, str):
        raise InvalidRecordError("published_at must be an ISO-8601 string")
    try:
        parsed = datetime.fromisoformat(published_at)
    except ValueError as error:
        raise InvalidRecordError(f"published_at is not ISO-8601: {published_at!r}") from error
    aware = parsed if parsed.tzinfo else parsed.replace(tzinfo=TAIPEI)
    return aware.astimezone(TAIPEI).strftime("%Y-%m-%dT%H:%M:%S+08:00")


def _count(record: Mapping[str, Any], field: str) -> int:
    value = record.get(field)
    if value is None:
        return 0
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise InvalidRecordError(f"{field} must be a non-negative integer")
    return value


def _views(record: Mapping[str, Any]) -> int | None:
    return None if record.get("views_count") is None else _count(record, "views_count")


def _text(record: Mapping[str, Any]) -> str:
    value = record.get("content")
    if value is None:
        return ""
    if not isinstance(value, str):
        raise InvalidRecordError("content must be a string")
    return value


def _media_type(record: Mapping[str, Any]) -> MediaType:
    value = record.get("media_type") or "text_only"
    if value not in _MEDIA_TYPES:
        raise InvalidRecordError(f"unknown media_type: {value!r}")
    return value


def _tier(record: Mapping[str, Any]) -> EngagementTier | None:
    value = record.get("engagement_tier")
    if value is None:
        return None
    if value not in _TIERS:
        raise InvalidRecordError(f"unknown engagement_tier: {value!r}")
    return value


def clean_post(record: Mapping[str, Any]) -> CleanPost:
    """清理單筆紀錄；無法修補的錯誤丟出 InvalidRecordError。"""
    post_url = record.get("post_url")
    if not isinstance(post_url, str) or not post_url:
        raise InvalidRecordError("post_url is required")
    if record.get("is_synthetic") is not True:
        raise InvalidRecordError("only synthetic records are accepted")

    content = _text(record)
    media_type = _media_type(record)
    likes = _count(record, "likes_count")
    replies = _count(record, "replies_count")
    features = extract_features(content, media_type)
    return CleanPost(
        post_url=post_url,
        is_synthetic=True,
        published_at=to_taipei(record.get("published_at")),
        content=content,
        likes_count=likes,
        replies_count=replies,
        reposts_count=_count(record, "reposts_count"),
        views_count=_views(record),
        media_type=media_type,
        engagement_tier=_tier(record),
        engagement_score=likes + 2 * replies,
        char_count=features.char_count,
        hashtag_count=features.hashtag_count,
        mention_count=features.mention_count,
        url_count=features.url_count,
        post_type=features.post_type,
    )


def clean_posts(records: Sequence[Mapping[str, Any]]) -> CleanResult:
    """依序清理；重複的 post_url 保留第一筆，無效紀錄剔除並計數。"""
    seen: set[str] = set()
    posts: list[CleanPost] = []
    duplicates = 0
    invalid = 0
    for record in records:
        try:
            if not isinstance(record, Mapping):
                raise InvalidRecordError("record must be an object")
            post = clean_post(record)
        except InvalidRecordError:
            invalid += 1
            continue
        if post.post_url in seen:
            duplicates += 1
            continue
        seen.add(post.post_url)
        posts.append(post)
    return CleanResult(
        posts=tuple(posts),
        report=CleaningReport(
            input_count=len(records),
            output_count=len(posts),
            duplicates_removed=duplicates,
            invalid_removed=invalid,
        ),
    )
