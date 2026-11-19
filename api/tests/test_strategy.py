from dataclasses import asdict, replace
from typing import Any

import pytest

from threadsinsightapi.attribution import run_nlp
from threadsinsightapi.cleaning import CleanPost, clean_post, clean_posts
from threadsinsightapi.generator import generate_mock_dataset
from threadsinsightapi.grouping import assign_engagement_groups
from threadsinsightapi.strategy import (
    INSIGHT_COUNT,
    LINK_NOTE,
    QUESTION_CLOSER,
    build_rewrite,
    build_strategy,
    collect_candidates,
    min_segment_posts,
    select_insights,
    spaced,
)


def _post(index: int, likes: int, content: str = "內容。", **overrides: Any) -> CleanPost:
    post = clean_post(
        {
            "post_url": f"mock://threads/@demo_user/post/{index}",
            "is_synthetic": True,
            "published_at": overrides.pop("published_at", "2026-11-18T10:00:00+08:00"),
            "content": content,
            "likes_count": likes,
        }
    )
    return replace(post, topic="opinion", has_question="？" in content, has_cta=False, **overrides)


def _pipeline(username: str, count: int) -> tuple[CleanPost, ...]:
    dataset = generate_mock_dataset(username, count=count)
    cleaned = clean_posts([asdict(p) for p in dataset.posts]).posts
    return run_nlp(assign_engagement_groups(cleaned).posts).posts


@pytest.mark.parametrize(("total", "minimum"), [(1, 2), (10, 2), (30, 3), (50, 5)])
def test_min_segment_posts_scales_with_total(total: int, minimum: int) -> None:
    assert min_segment_posts(total) == minimum


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("提高Hashtag類型", "提高 Hashtag 類型"), ("以51–100 字為", "以 51–100 字為"),
     ("已經 有空格", "已經 有空格"), ("（69%）。", "（69%）。")],
)  # fmt: skip
def test_spaced_inserts_spaces_between_cjk_and_latin(raw: str, expected: str) -> None:
    assert spaced(raw) == expected


class TestInsights:
    def test_always_returns_three(self) -> None:
        for count in (1, 2, 5, 30, 50):
            assert len(select_insights(_pipeline("demo_user", count))) == INSIGHT_COUNT

    def test_detects_a_strong_question_effect(self) -> None:
        posts = [_post(i, 1000, "你覺得呢？") for i in range(5)] + [
            _post(i + 5, 100, "就這樣。") for i in range(5)
        ]

        insights = select_insights(posts)

        question = next(i for i in insights if i.category == "question")
        assert question.lift is not None and question.lift > 0
        assert "5 篇平均互動 1000" in question.evidence
        assert QUESTION_CLOSER in question.action

    def test_reports_negative_link_effect_with_avoid_advice(self) -> None:
        posts = [_post(i, 50, "看 https://example.com/x") for i in range(4)] + [
            _post(i + 4, 500, "純文字。") for i in range(6)
        ]

        link = next(i for i in select_insights(posts) if i.category == "link")

        assert link.lift is not None and link.lift < 0
        assert "低於整體" in link.evidence
        assert "留言" in link.action

    def test_same_signal_is_used_once(self) -> None:
        for username in ("demo_user", "another_demo", "demo.user_01"):
            insights = select_insights(_pipeline(username, 40))
            hashtag_like = [
                i for i in insights if i.category == "hashtag" or "Hashtag 類型" in i.title
            ]
            assert len(hashtag_like) <= 1

    def test_fills_with_explicit_insufficient_notes_instead_of_guessing(self) -> None:
        same = [_post(i, 100) for i in range(6)]

        insights = select_insights(same)

        assert [i.category for i in insights] == ["insufficient"] * 3
        assert all(i.lift is None for i in insights)

    def test_ignores_segments_below_the_minimum_size(self) -> None:
        posts = [_post(0, 9000, published_at="2026-11-18T01:00:00+08:00")] + [
            _post(i, 100) for i in range(1, 20)
        ]
        assert not any(c.category == "time" for c in collect_candidates(posts))

    def test_empty_input(self) -> None:
        assert collect_candidates([]) == []
        assert [i.category for i in select_insights([])] == ["insufficient"] * 3


class TestRewrite:
    def test_rewrites_the_lowest_post_with_applicable_rules(self) -> None:
        posts = [
            _post(0, 900, "好文章？\n#職場"),
            _post(1, 900, "你們覺得？\n#職場"),
            _post(2, 900, "大家說說？\n#職場"),
            _post(3, 50, "最低的一篇。\n延伸閱讀：https://example.com/a"),
            _post(4, 60, "另一篇。\n延伸閱讀：https://example.com/b"),
            _post(5, 70, "第三篇。\nhttps://example.com/c"),
        ]

        rewrite = build_rewrite(posts)

        assert rewrite is not None
        assert rewrite.post_url.endswith("/post/3")
        assert "https://" not in rewrite.after
        assert LINK_NOTE in rewrite.after
        assert QUESTION_CLOSER in rewrite.after
        assert rewrite.after.endswith("#職場")  # hashtag 留在最後一行
        assert rewrite.after.index(QUESTION_CLOSER) < rewrite.after.index("#職場")
        assert len(rewrite.changes) == 3

    def test_does_not_add_a_question_when_the_post_already_invites_replies(self) -> None:
        posts = [_post(i, 900, "你覺得呢？") for i in range(3)] + [
            replace(_post(3, 10, "想聽聽大家的做法。"), has_cta=True),
            _post(4, 20, "就這樣。"),
            _post(5, 30, "記錄一下。"),
        ]
        rewrite = build_rewrite(posts)
        assert rewrite is None or QUESTION_CLOSER not in rewrite.after

    def test_returns_none_when_no_rule_applies(self) -> None:
        assert build_rewrite([_post(i, 100) for i in range(5)]) is None
        assert build_rewrite([]) is None


class TestBuildStrategy:
    def test_marks_source_and_small_samples(self) -> None:
        small = build_strategy(_pipeline("demo_user", 5))
        large = build_strategy(_pipeline("demo_user", 30))

        assert small.source == large.source == "rule_engine"
        assert small.notice is not None and "10 篇" in small.notice
        assert large.notice is None

    def test_is_deterministic(self) -> None:
        posts = _pipeline("demo_user", 30)
        assert build_strategy(posts) == build_strategy(posts)


@pytest.mark.parametrize(
    ("category", "label", "lift", "title_part", "action_part"),
    [
        ("time", "18–20 時", 0.3, "18–20 時發文", "安排在 18–20 時"),
        ("post_type", "圖片", 0.3, "圖片類型", "提高圖片類型"),
        ("topic", "職場", 0.3, "「職場」主題", "以「職場」為主軸"),
        ("length", "51–100 字", 0.3, "51–100 字的貼文", "以 51–100 字為目標"),
        ("question", "有", -0.3, "反而較低", "具體情境"),
        ("hashtag", "有", -0.3, "hashtag 的貼文互動較低", "減少"),
        ("link", "有", 0.3, "附連結的貼文互動較高", "說明讀者"),
    ],
)
def test_every_category_has_readable_wording(
    category: str, label: str, lift: float, title_part: str, action_part: str
) -> None:
    from threadsinsightapi.strategy import _Candidate, _describe

    insight = _describe(_Candidate(category, label, 4, 1300.0, lift), 1000.0)  # type: ignore[arg-type]

    assert title_part in insight.title
    assert action_part in insight.action
    assert "4 篇平均互動 1300" in insight.evidence
    assert ("高於" if lift > 0 else "低於") in insight.evidence


def test_link_post_type_counts_as_the_link_signal() -> None:
    from threadsinsightapi.strategy import _Candidate

    assert _Candidate("post_type", "連結", 3, 1.0, 0.2).signal == "link"
    assert _Candidate("post_type", "圖片", 3, 1.0, 0.2).signal == "post_type"


def test_question_goes_above_existing_hashtag_lines() -> None:
    from threadsinsightapi.strategy import _insert_before_hashtags

    assert (
        _insert_before_hashtags("主文。\n#職場 #效率", "你們怎麼看？")
        == "主文。\n你們怎麼看？\n#職場 #效率"
    )
    assert _insert_before_hashtags("主文。", "你們怎麼看？") == "主文。\n你們怎麼看？"
