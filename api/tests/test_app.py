import pytest
from auth_support import auth_headers
from fastapi.testclient import TestClient

from threadsinsightapi.app import app

client = TestClient(app, headers=auth_headers())


def test_returns_mock_dataset_in_envelope() -> None:
    response = client.get("/api/mock-posts", params={"username": "@demo_user"})

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    data = body["data"]
    assert data["data_source"] == "mock_dataset"
    assert data["username"] == "demo_user"
    assert len(data["posts"]) == 30
    assert all(post["is_synthetic"] is True for post in data["posts"])


def test_accepts_profile_url_and_count() -> None:
    response = client.get(
        "/api/mock-posts",
        params={"username": "https://www.threads.com/@demo_user", "count": 50},
    )
    assert response.status_code == 200
    assert len(response.json()["data"]["posts"]) == 50


def test_same_username_returns_same_posts() -> None:
    first = client.get("/api/mock-posts", params={"username": "demo_user"}).json()
    second = client.get("/api/mock-posts", params={"username": "DEMO_USER"}).json()
    assert first["data"]["posts"] == second["data"]["posts"]


def test_marks_response_as_synthetic_in_header() -> None:
    response = client.get("/api/mock-posts", params={"username": "demo_user"})
    assert response.headers["x-data-source"] == "mock_dataset"


def test_invalid_username_returns_400_envelope() -> None:
    response = client.get("/api/mock-posts", params={"username": "bad name"})

    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["data"] is None
    assert "username" in body["error"].lower()


def test_missing_username_returns_400_envelope() -> None:
    response = client.get("/api/mock-posts")
    assert response.status_code == 400
    assert response.json()["success"] is False


def test_accepts_count_of_one() -> None:
    response = client.get("/api/mock-posts", params={"username": "demo_user", "count": 1})
    assert response.status_code == 200
    assert len(response.json()["data"]["posts"]) == 1


def test_out_of_range_count_returns_400_envelope() -> None:
    for count in (0, 51, "abc"):
        response = client.get("/api/mock-posts", params={"username": "demo_user", "count": count})
        assert response.status_code == 400
        assert "count" in response.json()["error"]


def test_rejects_non_get_methods() -> None:
    assert client.post("/api/mock-posts", params={"username": "demo_user"}).status_code == 405


def test_unexpected_failure_returns_500_without_leaking_details(monkeypatch) -> None:
    def boom(*_args, **_kwargs):
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr("threadsinsightapi.app.analyze", boom)
    response = client.get("/api/mock-posts", params={"username": "demo_user"})

    assert response.status_code == 500
    assert response.json() == {
        "success": False,
        "data": None,
        "error": "Failed to generate mock dataset",
    }


def test_returns_cleaned_posts_with_features_and_report() -> None:
    response = client.get("/api/mock-posts", params={"username": "demo_user", "count": 30})

    data = response.json()["data"]
    assert data["cleaning"] == {
        "input_count": 30,
        "output_count": 30,
        "duplicates_removed": 0,
        "invalid_removed": 0,
    }
    for post in data["posts"]:
        assert post["engagement_score"] == post["likes_count"] + 2 * post["replies_count"]
        assert post["char_count"] > 0
        assert post["post_type"] in {"image", "link", "hashtag", "mention", "text_only"}
        assert post["published_at"].endswith("+08:00")


def test_returns_percentile_groups_and_summary() -> None:
    data = client.get("/api/mock-posts", params={"username": "demo_user", "count": 30}).json()[
        "data"
    ]

    assert data["grouping"] == {
        "high": 9,
        "medium": 12,
        "low": 9,
        "total": 30,
        "small_sample": False,
    }
    assert {p["engagement_group"] for p in data["posts"]} == {"high", "medium", "low"}


def test_flags_small_sample_below_ten_posts() -> None:
    data = client.get("/api/mock-posts", params={"username": "demo_user", "count": 3}).json()[
        "data"
    ]
    assert data["grouping"]["small_sample"] is True
    assert data["grouping"]["total"] == 3


def test_returns_basic_statistics() -> None:
    data = client.get("/api/mock-posts", params={"username": "demo_user"}).json()["data"]

    stats = data["stats"]
    assert set(stats) == {
        "averages",
        "length_buckets",
        "post_types",
        "weekday_hour",
        "top_hashtags",
        "top_keywords",
    }
    assert sum(b["count"] for b in stats["length_buckets"]) == len(data["posts"])
    assert len(stats["weekday_hour"]) == 7
    assert stats["top_keywords"][0].keys() == {"term", "posts"}


def test_returns_nlp_attribution_for_three_groups() -> None:
    data = client.get("/api/mock-posts", params={"username": "demo_user"}).json()["data"]

    nlp = data["nlp"]
    assert nlp["method"] == "rule_based_v1"
    assert [g["group"] for g in nlp["groups"]] == ["high", "medium", "low"]
    assert all(1 <= g["sample_size"] <= 5 for g in nlp["groups"])
    assert all(g["observations"] for g in nlp["groups"])
    assert sum(t["count"] for t in nlp["topics"]) == 30
    assert {"topic", "sentiment", "has_question", "has_cta"} <= data["posts"][0].keys()


def test_returns_rule_engine_strategy() -> None:
    data = client.get("/api/mock-posts", params={"username": "demo_user"}).json()["data"]

    strategy = data["strategy"]
    assert strategy["source"] == "rule_engine"
    assert len(strategy["insights"]) == 3
    assert all({"title", "evidence", "action"} <= i.keys() for i in strategy["insights"])
    assert (
        strategy["rewrite"] is None or strategy["rewrite"]["before"] != strategy["rewrite"]["after"]
    )


def test_health_needs_no_login() -> None:
    from fastapi.testclient import TestClient as Client

    response = Client(app).get("/api/health")
    assert response.status_code == 200
    assert response.json()["data"] == {"status": "ok"}


@pytest.mark.parametrize("path", ["/api/health", "/api/mock-posts?username=demo_user"])
def test_security_headers_on_every_response(path: str) -> None:
    from threadsinsightapi.app import SECURITY_HEADERS

    response = client.get(path)
    for name, value in SECURITY_HEADERS.items():
        assert response.headers[name] == value


def test_security_headers_on_errors() -> None:
    from fastapi.testclient import TestClient as Client

    response = Client(app).get("/api/tasks")
    assert response.status_code == 401
    assert response.headers["x-frame-options"] == "DENY"
