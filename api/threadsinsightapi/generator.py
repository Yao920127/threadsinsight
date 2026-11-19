"""Mock Dataset 產生器。輸出與 src/mock/generateMockDataset.ts 逐字相同（見黃金檔測試）。"""

import math
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from threadsinsightapi.content import EngagementTier, compose_content
from threadsinsightapi.normalize import normalize_username
from threadsinsightapi.prng import Random, block_pattern, hash_seed, pick_weighted

MediaType = Literal["text_only", "image"]

DEFAULT_POST_COUNT = 30
MIN_POST_COUNT = 1
MAX_POST_COUNT = 50
SOURCE_NOTE = (
    "Scraping blocked (HTTP 401 on graphql/query) & official API unavailable; "
    "using deterministic Mock Dataset"
)

# 固定錨點：2026-11-19 00:00 Asia/Taipei。時間不隨執行當下變動，確保可重現。
_ANCHOR_MS = int(datetime.fromisoformat("2026-11-19T00:00:00+08:00").timestamp() * 1000)
_HOUR_MS = 60 * 60 * 1000
_DAY_MS = 24 * _HOUR_MS
_TAIPEI_OFFSET_MS = 8 * _HOUR_MS
_POSTING_WINDOW_DAYS = 80
_MAX_CONTENT_ATTEMPTS = 25

_HOUR_WEIGHTS: tuple[tuple[int, int], ...] = (
    (7, 2), (8, 4), (9, 3), (10, 2), (11, 3), (12, 6), (13, 4), (14, 2), (15, 2),
    (16, 2), (17, 3), (18, 4), (19, 5), (20, 7), (21, 8), (22, 7), (23, 4), (0, 2), (1, 1),
)  # fmt: skip

_TIER_RANGES: dict[str, dict[str, tuple[int, int]]] = {
    "high": {"likes": (900, 3200), "replies": (60, 400)},
    "medium": {"likes": (150, 600), "replies": (12, 55)},
    "low": {"likes": (3, 80), "replies": (0, 10)},
}


class InvalidCountError(ValueError):
    """count 不在 1–50 的整數範圍內。"""


@dataclass(frozen=True)
class MockPost:
    post_url: str
    is_synthetic: Literal[True]
    published_at: str
    content: str
    likes_count: int
    replies_count: int
    reposts_count: int
    views_count: int | None
    media_type: MediaType
    engagement_tier: EngagementTier


@dataclass(frozen=True)
class MockDataset:
    data_source: Literal["mock_dataset"]
    source_note: str
    generated_at: str
    username: str
    posts: tuple[MockPost, ...]


def to_taipei_iso(epoch_ms: int) -> str:
    """同 JS `toISOString().slice(0, 19) + "+08:00"`：秒以下直接截斷。"""
    seconds = (epoch_ms + _TAIPEI_OFFSET_MS) // 1000
    return datetime.fromtimestamp(seconds, UTC).strftime("%Y-%m-%dT%H:%M:%S") + "+08:00"


def _js_round(value: float) -> int:
    """JS Math.round（.5 一律進位），不同於 Python 的銀行家捨入。"""
    return math.floor(value + 0.5)


def _validate_count(count: int) -> int:
    if isinstance(count, bool) or not isinstance(count, int):
        raise InvalidCountError(f"count must be an integer, got {count!r}")
    if not MIN_POST_COUNT <= count <= MAX_POST_COUNT:
        raise InvalidCountError(
            f"count must be between {MIN_POST_COUNT} and {MAX_POST_COUNT}, got {count}"
        )
    return count


def _build_timestamps(rng: Random, total: int) -> list[str]:
    day_offsets = sorted(rng.shuffle(range(_POSTING_WINDOW_DAYS))[:total])
    timestamps = []
    for day in day_offsets:
        hour = pick_weighted(rng, _HOUR_WEIGHTS)
        hour_of_day = hour + 24 if hour < 7 else hour  # 0、1 點視為當晚延續
        start_of_day = _ANCHOR_MS - (day + 1) * _DAY_MS
        epoch_ms = start_of_day + hour_of_day * _HOUR_MS + rng.int(0, 59) * 60_000
        timestamps.append(to_taipei_iso(epoch_ms))
    return timestamps


def _build_unique_contents(rng: Random, tiers: list[EngagementTier]) -> list[str]:
    contents: list[str] = []
    for index, tier in enumerate(tiers):
        seen = set(contents)
        candidate = compose_content(rng, tier, index + 1)
        attempt = 0
        while candidate in seen and attempt < _MAX_CONTENT_ATTEMPTS:
            candidate = compose_content(rng, tier, index + 1)
            attempt += 1
        contents.append(f"{candidate}\n（第 {index + 1} 則）" if candidate in seen else candidate)
    return contents


def _build_post(
    rng: Random, username: str, index: int, tier: EngagementTier, hide_views: bool,
    published_at: str, content: str, media_type: MediaType,
) -> MockPost:  # fmt: skip
    ranges = _TIER_RANGES[tier]
    likes = rng.int(*ranges["likes"])
    replies = rng.int(*ranges["replies"])
    reposts = _js_round(likes * rng.int(1, 8) / 100)
    views = None if hide_views else likes * rng.int(12, 40)
    return MockPost(
        post_url=f"mock://threads/@{username}/post/{index + 1}",
        is_synthetic=True,
        published_at=published_at,
        content=content,
        likes_count=likes,
        replies_count=replies,
        reposts_count=reposts,
        views_count=views,
        media_type=media_type,
        engagement_tier=tier,
    )


def seed_for(username: str) -> int:
    """正規化後帳號的亂數種子；記錄在日誌中，可用來重現同一批合成資料。"""
    return hash_seed(f"threadsinsight:{username}")


def generate_mock_dataset(
    raw_username: str,
    count: int = DEFAULT_POST_COUNT,
    now: Callable[[], datetime] = lambda: datetime.now(UTC),
) -> MockDataset:
    """以正規化後的 username 為種子確定性產生合成貼文。

    一律先生成 MAX_POST_COUNT 篇再截取，所以較少篇數的結果是較多篇數的前綴。
    `now` 只影響 generated_at。
    """
    username = normalize_username(raw_username)
    count = _validate_count(count)
    rng = Random(seed_for(username))

    tiers: list[EngagementTier] = block_pattern(
        rng, MAX_POST_COUNT, [("high", 3), ("medium", 4), ("low", 3)]
    )
    hidden_per_block = rng.int(1, 2)
    hidden_views = block_pattern(rng, MAX_POST_COUNT, [(True, hidden_per_block), (False, 8)])
    media_types: list[MediaType] = block_pattern(
        rng, MAX_POST_COUNT, [("image", 4), ("text_only", 6)]
    )
    timestamps = _build_timestamps(rng, MAX_POST_COUNT)
    contents = _build_unique_contents(rng, tiers)

    posts = tuple(
        _build_post(
            rng, username, i, tiers[i], hidden_views[i], timestamps[i], contents[i], media_types[i]
        )
        for i in range(count)
    )
    return MockDataset(
        data_source="mock_dataset",
        source_note=SOURCE_NOTE,
        generated_at=to_taipei_iso(int(now().timestamp() * 1000)),
        username=username,
        posts=posts,
    )
