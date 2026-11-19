"""三層互動分群（PRD F4 第 2 步）。

依加權互動分 `engagement_score`（likes + 2 × replies）由高到低排名後切三組：
高互動 Top 30%、中互動 Middle 40%、低互動 Bottom 30%。

- 組數以整數四捨五入（.5 進位）：高、低各 `(3n + 5) // 10` 篇，其餘為中。
  例：n=10 → 3/4/3、n=30 → 9/12/9、n=5 → 2/1/2、n=1 → 0/1/0。
- 同分的貼文一定同組：落在切點上的同分貼文全部歸入較高的組，
  因此結果與輸入順序無關，但高組篇數可能略多於 30%。
- 分群只看分數，不讀生成器的 `engagement_tier`，換成其他資料來源時仍然成立。
"""

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, replace

from threadsinsightapi.cleaning import CleanPost, EngagementGroup

SMALL_SAMPLE_THRESHOLD = 10


@dataclass(frozen=True)
class GroupingSummary:
    high: int
    medium: int
    low: int
    total: int
    #: 總篇數 < 10：分群結果僅供參考（PRD F4 小樣本規則）
    small_sample: bool


@dataclass(frozen=True)
class GroupingResult:
    posts: tuple[CleanPost, ...]
    summary: GroupingSummary


def edge_group_size(total: int) -> int:
    """高組與低組的目標篇數：round(total × 30%)，.5 進位。"""
    return (3 * total + 5) // 10


def _group_for_rank(rank: int, total: int) -> EngagementGroup:
    edge = edge_group_size(total)
    if rank < edge:
        return "high"
    if rank < total - edge:
        return "medium"
    return "low"


def assign_engagement_groups(posts: Sequence[CleanPost]) -> GroupingResult:
    """回傳帶有 engagement_group 的新貼文（保留原順序）與各組篇數。"""
    total = len(posts)
    scores = sorted((post.engagement_score for post in posts), reverse=True)
    # 同分取第一次出現的名次 → 同分必定同組，且落在切點上時歸入較高的組
    first_rank: dict[int, int] = {}
    for rank, score in enumerate(scores):
        first_rank.setdefault(score, rank)

    grouped = tuple(
        replace(post, engagement_group=_group_for_rank(first_rank[post.engagement_score], total))
        for post in posts
    )
    counts = Counter(post.engagement_group for post in grouped)
    return GroupingResult(
        posts=grouped,
        summary=GroupingSummary(
            high=counts["high"],
            medium=counts["medium"],
            low=counts["low"],
            total=total,
            small_sample=total < SMALL_SAMPLE_THRESHOLD,
        ),
    )
