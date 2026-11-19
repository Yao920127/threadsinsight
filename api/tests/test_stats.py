from dataclasses import asdict
from typing import Any

import pytest

from threadsinsightapi.cleaning import CleanPost, clean_post, clean_posts
from threadsinsightapi.generator import generate_mock_dataset
from threadsinsightapi.keywords import STOPWORDS, template_words, tokenize, top_keywords
from threadsinsightapi.stats import (
    LENGTH_BUCKETS,
    compute_stats,
    length_bucket_of,
)


def _post(index: int = 1, **overrides: Any) -> CleanPost:
    record: dict[str, Any] = {
        "post_url": f"mock://threads/@demo_user/post/{index}",
        "is_synthetic": True,
        "published_at": "2026-11-18T22:49:00+08:00",  # 星期三 22 時
        "content": "內容",
        "likes_count": 10,
        "replies_count": 2,
        "reposts_count": 1,
        "views_count": 100,
        **overrides,
    }
    return clean_post(record)


class TestAverages:
    def test_rounds_to_one_decimal(self) -> None:
        posts = [_post(1, likes_count=10, replies_count=1), _post(2, likes_count=15)]

        averages = compute_stats(posts).averages

        assert averages.likes == 12.5
        assert averages.replies == 1.5  # (1 + 2) / 2
        assert averages.reposts == 1.0
        assert averages.engagement == pytest.approx((12 + 18) / 2)

    def test_empty_input_is_all_zero(self) -> None:
        stats = compute_stats([])
        assert asdict(stats.averages) == {
            "likes": 0.0,
            "replies": 0.0,
            "reposts": 0.0,
            "engagement": 0.0,
            "char_count": 0.0,
        }
        assert all(b.count == 0 for b in stats.length_buckets)
        assert stats.top_hashtags == ()
        assert stats.top_keywords == ()


class TestLengthBuckets:
    @pytest.mark.parametrize(
        ("chars", "bucket"),
        [(0, "0-50"), (50, "0-50"), (51, "51-100"), (100, "51-100"), (101, "101-200"),
         (200, "101-200"), (201, "201-400"), (400, "201-400"), (401, "401+"), (5000, "401+")],
    )  # fmt: skip
    def test_bucket_boundaries_are_inclusive(self, chars: int, bucket: str) -> None:
        assert length_bucket_of(chars) == bucket

    def test_rejects_negative(self) -> None:
        with pytest.raises(ValueError):
            length_bucket_of(-1)

    def test_lists_every_bucket_with_count_and_average_engagement(self) -> None:
        posts = [
            _post(1, content="短" * 10, likes_count=100, replies_count=0, reposts_count=0),
            _post(2, content="短" * 20, likes_count=50, replies_count=0, reposts_count=0),
            _post(3, content="長" * 150, likes_count=7, replies_count=0, reposts_count=0),
        ]

        buckets = {b.key: b for b in compute_stats(posts).length_buckets}

        assert list(buckets) == [key for key, _, _ in LENGTH_BUCKETS]
        assert (buckets["0-50"].count, buckets["0-50"].avg_engagement) == (2, 75.0)
        assert (buckets["101-200"].count, buckets["101-200"].avg_engagement) == (1, 7.0)
        assert buckets["401+"].count == 0
        assert buckets["401+"].avg_engagement == 0.0


def test_post_types_cover_all_types_in_fixed_order() -> None:
    posts = [
        _post(1, content="看 https://example.com"),
        _post(2, content="#職場"),
        _post(3, media_type="image"),
    ]

    types = compute_stats(posts).post_types

    assert [t.key for t in types] == ["text_only", "image", "link", "hashtag", "mention"]
    assert {t.key: t.count for t in types} == {
        "text_only": 0,
        "image": 1,
        "link": 1,
        "hashtag": 1,
        "mention": 0,
    }


def test_weekday_hour_matrix_is_monday_first_in_taipei_time() -> None:
    posts = [
        _post(1, published_at="2026-11-18T22:49:00+08:00"),  # 三 22 時
        _post(2, published_at="2026-11-18T14:10:00Z"),  # 台北 三 22 時
        _post(3, published_at="2026-11-22T00:05:00+08:00"),  # 日 0 時
    ]

    matrix = compute_stats(posts).weekday_hour

    assert len(matrix) == 7
    assert all(len(row) == 24 for row in matrix)
    assert matrix[2][22] == 2
    assert matrix[6][0] == 1
    assert sum(map(sum, matrix)) == 3


def test_top_hashtags_count_posts_case_insensitively() -> None:
    posts = [
        _post(1, content="#AI #AI #職場"),
        _post(2, content="#ai"),
        _post(3, content="#職場 https://example.com/#notatag"),
    ]

    tags = [(t.term, t.posts) for t in compute_stats(posts).top_hashtags]

    assert tags == [("#AI", 2), ("#職場", 2)]


class TestKeywords:
    def test_tokenize_drops_entities_stopwords_short_and_numeric_tokens(self) -> None:
        tokens = tokenize("我們 今天 開會 2026 @mock_reader #職場 https://example.com/a")

        assert "開會" in tokens
        assert "今天" in tokens
        assert not {"我們", "2026", "職場", "mock_reader", "example"} & set(tokens)
        assert all(len(t) >= 2 for t in tokens)

    def test_segments_traditional_chinese_with_big_dictionary(self) -> None:
        # 內建簡體詞典會切成「事永遠」「三十分」；繁體詞典 dict.txt.big 才切得對
        tokens = tokenize("重要的事永遠要寫清楚截止日，每天走路三十分鐘")

        assert {"永遠", "截止日", "三十分鐘"} <= set(tokens)
        assert not {"事永遠", "三十分"} & set(tokens)

    def test_counts_document_frequency_with_stable_ties(self) -> None:
        contents = ["開會 開會 開會", "開會 議程", "議程", "咖啡"]

        # 同頻率依 Unicode 碼位排序（「議」U+8B70 < 「開」U+958B），只為結果可重現
        assert top_keywords(contents, limit=3) == [("議程", 2), ("開會", 2), ("咖啡", 1)]

    def test_limit_and_empty(self) -> None:
        assert top_keywords([], limit=10) == []
        assert len(top_keywords(["開會 議程 咖啡 早餐"], limit=2)) == 2


def test_generated_dataset_produces_meaningful_terms() -> None:
    dataset = generate_mock_dataset("demo_user", count=30)
    posts = clean_posts([asdict(p) for p in dataset.posts]).posts

    stats = compute_stats(posts)

    assert sum(b.count for b in stats.length_buckets) == 30
    assert sum(t.count for t in stats.post_types) == 30
    assert sum(map(sum, stats.weekday_hour)) == 30
    assert stats.top_hashtags and all(t.term.startswith("#") for t in stats.top_hashtags)
    assert len(stats.top_keywords) == 10
    assert [t.posts for t in stats.top_keywords] == sorted(
        (t.posts for t in stats.top_keywords), reverse=True
    )


def test_template_words_come_from_the_content_library() -> None:
    words = template_words()

    assert {"謝謝", "提醒", "延伸", "閱讀", "聽聽", "做法"} <= words
    assert not words & STOPWORDS  # 停用詞本來就排除，不必重複


@pytest.mark.parametrize("username", ["demo_user", "another_demo", "demo.user_01"])
def test_keywords_exclude_mock_template_words(username: str) -> None:
    dataset = generate_mock_dataset(username, count=50)
    posts = clean_posts([asdict(p) for p in dataset.posts]).posts

    terms = {t.term for t in compute_stats(posts).top_keywords}

    assert terms
    assert not terms & template_words()
