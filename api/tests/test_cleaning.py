from dataclasses import asdict
from typing import Any

import pytest

from threadsinsightapi.cleaning import (
    InvalidRecordError,
    clean_post,
    clean_posts,
    extract_features,
    to_taipei,
)
from threadsinsightapi.generator import generate_mock_dataset


def _record(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "post_url": "mock://threads/@demo_user/post/1",
        "is_synthetic": True,
        "published_at": "2026-11-18T22:49:00+08:00",
        "content": "今天開會\n#職場",
        "likes_count": 100,
        "replies_count": 10,
        "reposts_count": 3,
        "views_count": 2000,
        "media_type": "text_only",
        "engagement_tier": "medium",
    }
    return {**base, **overrides}


class TestExtractFeatures:
    def test_counts_hashtags_mentions_and_urls(self) -> None:
        content = "謝謝 @demo.colleague 的提醒。\n延伸閱讀：https://example.com/notes/3\n#職場 #AI"

        features = extract_features(content, "text_only")

        assert features.hashtag_count == 2
        assert features.mention_count == 1
        assert features.url_count == 1
        assert features.post_type == "link"

    def test_char_count_excludes_whitespace_and_urls(self) -> None:
        features = extract_features("一二 三\n看 https://example.com/x", "text_only")
        assert features.char_count == 4

    def test_ignores_email_csharp_and_url_fragments(self) -> None:
        content = "寄信到 name@example.com，學 C# 中 https://example.com/#anchor"

        features = extract_features(content, "text_only")

        assert features.mention_count == 0
        assert features.hashtag_count == 0
        assert features.url_count == 1

    @pytest.mark.parametrize(
        ("content", "media_type", "expected"),
        [
            ("有圖 https://example.com #職場", "image", "image"),
            ("看 www.example.com #職場", "text_only", "link"),
            ("#職場 @mock_reader", "text_only", "hashtag"),
            ("謝謝 @mock_reader", "text_only", "mention"),
            ("純文字", "text_only", "text_only"),
            ("", "text_only", "text_only"),
        ],
    )
    def test_post_type_priority(self, content: str, media_type: Any, expected: str) -> None:
        assert extract_features(content, media_type).post_type == expected


class TestToTaipei:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("2026-11-18T14:49:00Z", "2026-11-18T22:49:00+08:00"),
            ("2026-11-18T14:49:00+00:00", "2026-11-18T22:49:00+08:00"),
            ("2026-11-18T23:30:00-05:00", "2026-11-19T12:30:00+08:00"),
            ("2026-11-18T22:49:00.987+08:00", "2026-11-18T22:49:00+08:00"),
            ("2026-11-18T22:49:00", "2026-11-18T22:49:00+08:00"),
        ],
    )
    def test_converts_to_taipei(self, raw: str, expected: str) -> None:
        assert to_taipei(raw) == expected

    @pytest.mark.parametrize("raw", ["yesterday", "", None, 1_700_000_000])
    def test_rejects_unparseable(self, raw: Any) -> None:
        with pytest.raises(InvalidRecordError):
            to_taipei(raw)


class TestCleanPost:
    def test_adds_features_and_engagement_score(self) -> None:
        post = clean_post(_record())

        assert post.engagement_score == 100 + 2 * 10
        assert post.hashtag_count == 1
        assert post.post_type == "hashtag"
        assert post.char_count == len("今天開會#職場")

    def test_fills_missing_counts_and_content(self) -> None:
        record = _record(content=None, likes_count=None, replies_count=None, reposts_count=None)
        del record["media_type"]
        del record["engagement_tier"]

        post = clean_post(record)

        assert (post.likes_count, post.replies_count, post.reposts_count) == (0, 0, 0)
        assert post.content == ""
        assert post.media_type == "text_only"
        assert post.engagement_tier is None
        assert post.engagement_score == 0

    def test_keeps_hidden_views_as_null(self) -> None:
        assert clean_post(_record(views_count=None)).views_count is None

    @pytest.mark.parametrize(
        "overrides",
        [
            {"post_url": ""},
            {"post_url": None},
            {"is_synthetic": False},
            {"is_synthetic": "true"},
            {"likes_count": -1},
            {"likes_count": 1.5},
            {"likes_count": True},
            {"views_count": "100"},
            {"content": 123},
            {"media_type": "video"},
            {"engagement_tier": "viral"},
            {"published_at": "not a date"},
        ],
    )
    def test_rejects_invalid_fields(self, overrides: dict[str, Any]) -> None:
        with pytest.raises(InvalidRecordError):
            clean_post(_record(**overrides))


class TestCleanPosts:
    def test_removes_duplicates_and_invalid_records(self) -> None:
        records: list[Any] = [
            _record(),
            _record(likes_count=999),  # 同一 post_url：保留第一筆
            _record(post_url="mock://threads/@demo_user/post/2", is_synthetic=False),
            "not a record",
            _record(post_url="mock://threads/@demo_user/post/3"),
        ]

        result = clean_posts(records)

        assert [p.post_url for p in result.posts] == [
            "mock://threads/@demo_user/post/1",
            "mock://threads/@demo_user/post/3",
        ]
        assert result.posts[0].likes_count == 100
        assert asdict(result.report) == {
            "input_count": 5,
            "output_count": 2,
            "duplicates_removed": 1,
            "invalid_removed": 2,
        }

    def test_empty_input(self) -> None:
        result = clean_posts([])
        assert result.posts == ()
        assert result.report.output_count == 0

    def test_generator_output_passes_unchanged(self) -> None:
        dataset = generate_mock_dataset("demo_user", count=50)
        raw = [asdict(post) for post in dataset.posts]

        result = clean_posts(raw)

        assert result.report.output_count == 50
        assert result.report.duplicates_removed == 0
        assert result.report.invalid_removed == 0
        for original, cleaned in zip(raw, result.posts, strict=True):
            assert {k: v for k, v in asdict(cleaned).items() if k in original} == original
        assert {p.post_type for p in result.posts} >= {"image", "link"}
