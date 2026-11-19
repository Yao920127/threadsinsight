from dataclasses import asdict

import pytest

from threadsinsightapi.cleaning import CleanPost, clean_post, clean_posts
from threadsinsightapi.generator import generate_mock_dataset
from threadsinsightapi.grouping import assign_engagement_groups, edge_group_size


def _post(index: int, likes: int, replies: int = 0) -> CleanPost:
    return clean_post(
        {
            "post_url": f"mock://threads/@demo_user/post/{index}",
            "is_synthetic": True,
            "published_at": "2026-11-18T22:49:00+08:00",
            "content": "內容",
            "likes_count": likes,
            "replies_count": replies,
        }
    )


def _groups(scores: list[int]) -> list[str | None]:
    posts = [_post(i, likes) for i, likes in enumerate(scores)]
    return [p.engagement_group for p in assign_engagement_groups(posts).posts]


@pytest.mark.parametrize(
    ("total", "expected"),
    [(0, 0), (1, 0), (2, 1), (3, 1), (5, 2), (9, 3), (10, 3), (15, 5), (30, 9), (50, 15)],
)
def test_edge_group_size_rounds_half_up(total: int, expected: int) -> None:
    assert edge_group_size(total) == expected


def test_splits_ten_posts_into_3_4_3_by_score() -> None:
    scores = [50, 10, 90, 30, 70, 20, 100, 60, 40, 80]

    groups = _groups(scores)

    by_score = dict(zip(scores, groups, strict=True))
    assert [by_score[s] for s in (100, 90, 80)] == ["high"] * 3
    assert [by_score[s] for s in (70, 60, 50, 40)] == ["medium"] * 4
    assert [by_score[s] for s in (30, 20, 10)] == ["low"] * 3


def test_uses_weighted_score_not_likes_alone() -> None:
    posts = [_post(0, likes=100, replies=0), _post(1, likes=10, replies=60), _post(2, likes=50)]

    groups = [p.engagement_group for p in assign_engagement_groups(posts).posts]

    assert groups == ["medium", "high", "low"]  # 分數 100 / 130 / 50


def test_preserves_input_order_and_other_fields() -> None:
    posts = [_post(i, likes) for i, likes in enumerate([5, 500, 50])]

    result = assign_engagement_groups(posts)

    assert [p.post_url for p in result.posts] == [p.post_url for p in posts]
    for before, after in zip(posts, result.posts, strict=True):
        assert asdict(after) == {**asdict(before), "engagement_group": after.engagement_group}
    assert all(p.engagement_group is None for p in posts)  # 原物件不被修改


def test_tied_scores_share_the_higher_group() -> None:
    # 10 篇，第 3、4 名同分 → 同屬高互動
    groups = _groups([100, 90, 80, 80, 60, 50, 40, 30, 20, 10])

    assert groups[:4] == ["high"] * 4
    assert groups[4:7] == ["medium"] * 3
    assert groups[7:] == ["low"] * 3


def test_all_equal_scores_are_all_high() -> None:
    assert set(_groups([7] * 6)) == {"high"}


def test_result_does_not_depend_on_input_order() -> None:
    scores = [100, 90, 80, 80, 60, 50, 40, 30, 20, 10]
    forward = dict(zip(scores, _groups(scores), strict=True))
    backward = dict(zip(scores[::-1], _groups(scores[::-1]), strict=True))
    assert forward == backward


@pytest.mark.parametrize(
    ("total", "counts", "small"),
    [
        (0, (0, 0, 0), True),
        (1, (0, 1, 0), True),
        (2, (1, 0, 1), True),
        (5, (2, 1, 2), True),
        (10, (3, 4, 3), False),
        (30, (9, 12, 9), False),
    ],
)
def test_summary_counts_and_small_sample_flag(
    total: int, counts: tuple[int, int, int], small: bool
) -> None:
    posts = [_post(i, likes=i * 10) for i in range(total)]

    summary = assign_engagement_groups(posts).summary

    assert (summary.high, summary.medium, summary.low) == counts
    assert summary.total == total
    assert summary.small_sample is small


@pytest.mark.parametrize("count", [10, 30, 50])
def test_matches_generator_tiers_for_whole_blocks(count: int) -> None:
    # 生成器三層級的分數範圍互不重疊，且每 10 篇固定 3/4/3，
    # 所以篇數為 10 的倍數時，百分位分群必須與生成器的層級完全一致。
    dataset = generate_mock_dataset("demo_user", count=count)
    cleaned = clean_posts([asdict(p) for p in dataset.posts]).posts

    grouped = assign_engagement_groups(cleaned).posts

    assert [p.engagement_group for p in grouped] == [p.engagement_tier for p in grouped]
