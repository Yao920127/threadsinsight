from dataclasses import asdict
from typing import Any

import pytest

from threadsinsightapi.attribution import (
    GROUP_ORDER,
    MAX_SAMPLE_SIZE,
    annotate,
    attribute,
    build_observations,
    run_nlp,
    sample_group,
    summarize_structure,
    tfidf_by_group,
)
from threadsinsightapi.cleaning import CleanPost, clean_post, clean_posts
from threadsinsightapi.generator import generate_mock_dataset
from threadsinsightapi.grouping import assign_engagement_groups


def _post(index: int, likes: int, content: str = "內容。", **overrides: Any) -> CleanPost:
    return clean_post(
        {
            "post_url": f"mock://threads/@demo_user/post/{index}",
            "is_synthetic": True,
            "published_at": "2026-11-18T22:49:00+08:00",
            "content": content,
            "likes_count": likes,
            **overrides,
        }
    )


def _grouped(scores: list[int]) -> tuple[CleanPost, ...]:
    return assign_engagement_groups([_post(i, s) for i, s in enumerate(scores)]).posts


def _generated(count: int, username: str = "demo_user") -> tuple[CleanPost, ...]:
    dataset = generate_mock_dataset(username, count=count)
    cleaned = clean_posts([asdict(p) for p in dataset.posts]).posts
    return assign_engagement_groups(cleaned).posts


class TestSampling:
    def test_high_takes_top_scores_and_low_takes_bottom(self) -> None:
        posts = _grouped(list(range(100, 0, -5)))  # 20 篇：高 6、中 8、低 6

        high = [p.engagement_score for p in sample_group(posts, "high")]
        low = [p.engagement_score for p in sample_group(posts, "low")]

        assert high == [100, 95, 90, 85, 80]
        assert low == [5, 10, 15, 20, 25]

    def test_medium_takes_posts_nearest_the_group_median(self) -> None:
        posts = _grouped(list(range(100, 0, -5)))
        medium = [p for p in posts if p.engagement_group == "medium"]
        scores = sorted(p.engagement_score for p in medium)  # 40…75，中位數 57.5

        sample = sorted(p.engagement_score for p in sample_group(posts, "medium"))

        assert len(medium) == 8
        assert sample == scores[1:6] or sample == scores[2:7]
        assert all(abs(s - 57.5) <= 15 for s in sample)

    @pytest.mark.parametrize("count", [1, 2, 3, 7, 10, 30, 50])
    def test_sample_size_is_min_of_five_and_group_size(self, count: int) -> None:
        posts = _generated(count)
        for group in GROUP_ORDER:
            members = sum(p.engagement_group == group for p in posts)
            assert len(sample_group(posts, group)) == min(MAX_SAMPLE_SIZE, members)


class TestTfidf:
    def test_terms_unique_to_a_group_outrank_shared_terms(self) -> None:
        result = tfidf_by_group(
            {"high": ["提問", "共同", "共同"], "medium": ["共同"], "low": ["連結", "共同"]},
            limit=3,
        )

        assert [t.term for t in result["high"]] == ["提問"]
        assert [t.term for t in result["low"]] == ["連結"]
        assert result["medium"] == []  # 只有三組共有的詞，沒有特有詞

    def test_single_non_empty_group_falls_back_to_term_frequency(self) -> None:
        result = tfidf_by_group({"high": ["甲", "甲", "乙"], "medium": [], "low": []}, limit=5)
        assert [(t.term, t.weight) for t in result["high"]] == [("甲", 0.6667), ("乙", 0.3333)]

    def test_empty_group_gets_no_terms(self) -> None:
        assert tfidf_by_group({"high": ["詞"], "medium": []}, limit=5)["medium"] == []


class TestObservations:
    def _structure(self, contents: list[str]) -> Any:
        return summarize_structure(annotate([_post(i, 1, c) for i, c in enumerate(contents)]))

    def test_reports_gaps_of_twenty_points_with_group_specific_reading(self) -> None:
        baseline = self._structure(["你覺得呢？", "一般內容。", "一般內容。", "一般內容。"])
        sample = self._structure(["你覺得呢？", "大家怎麼看？"])

        high = build_observations("high", sample, baseline)
        low = build_observations("low", sample, baseline)

        assert any("提問" in o and "100%" in o and "25%" in o and "引導讀者回覆" in o for o in high)
        assert any("提問" in o and "未必" in o for o in low)

    def test_says_no_difference_when_gaps_are_small(self) -> None:
        same = self._structure(["一般內容。", "一般內容。"])
        assert build_observations("high", same, same) == (
            "抽樣貼文的結構特徵與整體差異不大（各項差距皆小於 20 個百分點）。",
        )

    def test_medium_group_is_framed_as_a_reference(self) -> None:
        same = self._structure(["一般內容。"])
        assert build_observations("medium", same, same)[0].startswith("中互動組作為對照")

    def test_reports_length_gaps_of_twenty_percent(self) -> None:
        baseline = self._structure(["短。", "短。", "長" * 40 + "。"])
        sample = self._structure(["長" * 40 + "。"])
        notes = build_observations("high", sample, baseline)
        assert any("平均 41 字，篇幅較長（整體 15 字）" in o for o in notes)  # 句號也算 1 字

    def test_spaces_between_latin_label_and_chinese(self) -> None:
        baseline = self._structure(["#職場", "一般。", "一般。", "一般。"])
        sample = self._structure(["#職場", "#生活"])
        assert any("hashtag 的比例" in o for o in build_observations("high", sample, baseline))


class TestAttribute:
    def test_marks_empty_groups_insufficient_without_failing(self) -> None:
        posts = _generated(2)  # 高 1、中 0、低 1

        groups = {g.group: g for g in attribute(annotate(posts)).groups}

        assert groups["medium"].insufficient
        assert groups["medium"].sample_size == 0
        assert groups["medium"].structure is None
        assert groups["medium"].observations == ()
        assert not groups["high"].insufficient

    def test_handles_no_posts(self) -> None:
        result = attribute([])
        assert result.baseline is None
        assert all(g.insufficient for g in result.groups)

    def test_is_deterministic(self) -> None:
        posts = _generated(30)
        assert attribute(annotate(posts)) == attribute(annotate(posts))

    def test_rediscovers_the_generator_link_pattern_on_a_full_group(self) -> None:
        # 產生器設定低互動貼文較常附連結（45% vs 高互動 10%）；50 篇時低互動組應明顯較多
        posts = _generated(50)
        groups = {g.group: g for g in attribute(annotate(posts)).groups}

        assert groups["low"].structure is not None and groups["high"].structure is not None
        assert groups["low"].structure.link_rate > groups["high"].structure.link_rate


def test_run_nlp_adds_text_features_and_topic_stats() -> None:
    posts = _generated(30)

    result = run_nlp(posts)

    assert [p.post_url for p in result.posts] == [p.post_url for p in posts]
    assert all(p.topic in {"career", "life", "tech", "opinion", "other"} for p in result.posts)
    assert all(p.sentiment in {"positive", "neutral", "negative"} for p in result.posts)
    assert all(isinstance(p.has_question, bool) for p in result.posts)
    assert [t.key for t in result.topics] == ["career", "life", "tech", "opinion", "other"]
    assert sum(t.count for t in result.topics) == 30
