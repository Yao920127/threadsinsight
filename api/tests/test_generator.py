import json
import re
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

import pytest

from threadsinsightapi.generator import InvalidCountError, generate_mock_dataset

GOLDEN_PATH = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "mock-golden.json"
FIXED_NOW = datetime.fromisoformat("2026-11-19T10:00:00+08:00")
ISO_TAIPEI = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$")


def generate(raw: str = "demo_user", count: int = 30):
    return generate_mock_dataset(raw, count=count, now=lambda: FIXED_NOW)


def _golden_cases() -> list[dict]:
    return json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", _golden_cases(), ids=lambda c: c["input"])
def test_matches_typescript_golden_output(case: dict) -> None:
    dataset = generate(case["input"], case["count"])
    wire_format = json.loads(json.dumps(asdict(dataset), ensure_ascii=False))
    assert wire_format == case["dataset"]


def test_batch_metadata() -> None:
    dataset = generate()
    assert dataset.data_source == "mock_dataset"
    assert "HTTP 401" in dataset.source_note
    assert dataset.generated_at == "2026-11-19T10:00:00+08:00"
    assert dataset.username == "demo_user"


def test_default_and_max_counts() -> None:
    assert len(generate_mock_dataset("demo_user").posts) == 30
    assert len(generate("demo_user", 50).posts) == 50


@pytest.mark.parametrize("count", [1, 5, 29])
def test_accepts_small_counts_as_prefix(count: int) -> None:
    posts = generate("demo_user", count).posts
    assert len(posts) == count
    assert posts == generate("demo_user", 50).posts[:count]


@pytest.mark.parametrize("count", [0, -1, 51, True])
def test_rejects_out_of_range_count(count: int) -> None:
    with pytest.raises(InvalidCountError):
        generate("demo_user", count)


def test_posts_follow_mock_rules() -> None:
    posts = generate("demo_user", 50).posts
    for index, post in enumerate(posts, start=1):
        assert post.is_synthetic is True
        assert post.post_url == f"mock://threads/@demo_user/post/{index}"
        assert ISO_TAIPEI.match(post.published_at)
        assert "threads.com" not in post.content
        assert post.media_type in {"text_only", "image"}
    assert len({p.content for p in posts}) == len(posts)
    nulls = [p for p in posts if p.views_count is None]
    assert 0 < len(nulls) < len(posts) / 2


@pytest.mark.parametrize("username", ["demo_user", "another_demo", "a", "user.name_99"])
def test_engagement_tiers_are_separated(username: str) -> None:
    posts = generate(username).posts

    def likes(tier: str) -> list[int]:
        return [p.likes_count for p in posts if p.engagement_tier == tier]

    high, medium, low = likes("high"), likes("medium"), likes("low")
    assert min(len(high), len(medium), len(low)) >= 3
    assert min(high) > max(medium)
    assert min(medium) > max(low)


def test_dataset_is_immutable() -> None:
    dataset = generate()
    with pytest.raises(AttributeError):
        dataset.posts[0].likes_count = 0  # type: ignore[misc]
    assert isinstance(dataset.posts, tuple)
