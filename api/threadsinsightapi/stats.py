"""基礎統計指標（PRD F4 第 1 步）：平均值、文字長度區間、貼文類型、
星期 × 小時發文矩陣、高頻 hashtag 與關鍵字。

「互動數」一律指 likes + replies + reposts（與前端 engagementOf 相同）。
平均值四捨五入到小數第一位；空集合的平均為 0。
"""

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from threadsinsightapi.cleaning import CleanPost, PostType, find_hashtags
from threadsinsightapi.keywords import top_keywords

TOP_TERM_LIMIT = 10
HOURS_PER_DAY = 24
DAYS_PER_WEEK = 7

# (key, 下限, 上限〔含〕)；上限 None 表示無上限
LENGTH_BUCKETS: tuple[tuple[str, int, int | None], ...] = (
    ("0-50", 0, 50),
    ("51-100", 51, 100),
    ("101-200", 101, 200),
    ("201-400", 201, 400),
    ("401+", 401, None),
)
POST_TYPE_ORDER: tuple[PostType, ...] = ("text_only", "image", "link", "hashtag", "mention")


@dataclass(frozen=True)
class Averages:
    likes: float
    replies: float
    reposts: float
    engagement: float
    char_count: float


@dataclass(frozen=True)
class SegmentStats:
    """某個區間／類別的篇數與平均互動數。"""

    key: str
    count: int
    avg_engagement: float


@dataclass(frozen=True)
class TermCount:
    term: str
    #: 出現在幾篇貼文（同篇重複只算一次）
    posts: int


@dataclass(frozen=True)
class PostStats:
    averages: Averages
    length_buckets: tuple[SegmentStats, ...]
    post_types: tuple[SegmentStats, ...]
    #: 7 列（星期一…星期日）× 24 欄（0…23 時，Asia/Taipei）的發文篇數
    weekday_hour: tuple[tuple[int, ...], ...]
    top_hashtags: tuple[TermCount, ...]
    top_keywords: tuple[TermCount, ...]


def engagement_of(post: CleanPost) -> int:
    return post.likes_count + post.replies_count + post.reposts_count


def _average(values: Sequence[int]) -> float:
    return round(sum(values) / len(values), 1) if values else 0.0


def segment_stats(key: str, posts: Sequence[CleanPost]) -> SegmentStats:
    return SegmentStats(
        key=key, count=len(posts), avg_engagement=_average([engagement_of(p) for p in posts])
    )


def length_bucket_of(char_count: int) -> str:
    for key, low, high in LENGTH_BUCKETS:
        if char_count >= low and (high is None or char_count <= high):
            return key
    raise ValueError(f"char_count must be non-negative, got {char_count}")


def _weekday_hour(posts: Sequence[CleanPost]) -> tuple[tuple[int, ...], ...]:
    cells = Counter(
        (moment.weekday(), moment.hour)
        for moment in (datetime.fromisoformat(p.published_at) for p in posts)
    )
    return tuple(
        tuple(cells[(day, hour)] for hour in range(HOURS_PER_DAY)) for day in range(DAYS_PER_WEEK)
    )


def _top_hashtags(posts: Sequence[CleanPost]) -> tuple[TermCount, ...]:
    """不分大小寫合併（#AI 與 #ai 同一個），顯示第一次出現的寫法。"""
    display: dict[str, str] = {}
    frequency: Counter[str] = Counter()
    for post in posts:
        tags = find_hashtags(post.content)
        for tag in tags:
            display.setdefault(tag.casefold(), tag)
        frequency.update({tag.casefold() for tag in tags})
    ranked = sorted(frequency.items(), key=lambda item: (-item[1], item[0]))
    return tuple(TermCount(term=display[key], posts=n) for key, n in ranked[:TOP_TERM_LIMIT])


def compute_stats(posts: Sequence[CleanPost]) -> PostStats:
    return PostStats(
        averages=Averages(
            likes=_average([p.likes_count for p in posts]),
            replies=_average([p.replies_count for p in posts]),
            reposts=_average([p.reposts_count for p in posts]),
            engagement=_average([engagement_of(p) for p in posts]),
            char_count=_average([p.char_count for p in posts]),
        ),
        length_buckets=tuple(
            segment_stats(key, [p for p in posts if length_bucket_of(p.char_count) == key])
            for key, _, _ in LENGTH_BUCKETS
        ),
        post_types=tuple(
            segment_stats(kind, [p for p in posts if p.post_type == kind])
            for kind in POST_TYPE_ORDER
        ),
        weekday_hour=_weekday_hour(posts),
        top_hashtags=_top_hashtags(posts),
        top_keywords=tuple(
            TermCount(term=term, posts=n)
            for term, n in top_keywords((p.content for p in posts), TOP_TERM_LIMIT)
        ),
    )
