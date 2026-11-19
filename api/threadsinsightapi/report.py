"""報告的序列化：API 回傳格式，以及寫入／讀回 posts、analysis_summaries 的對應。

讀回的報告必須與當場分析的結果完全相同（測試以往返比對確保），前端不需要分辨來源。
"""

from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from typing import Any

from threadsinsightapi.pipeline import Analysis

TAIPEI = timezone(timedelta(hours=8))
TOP_POST_LIMIT = 5

# posts 表中與報告貼文同名的欄位（其餘欄位由資料庫產生或由任務提供）
_POST_FIELDS = (
    "post_url",
    "published_at",
    "content",
    "views_count",
    "likes_count",
    "replies_count",
    "reposts_count",
    "engagement_score",
    "engagement_group",
    "engagement_tier",
    "char_count",
    "hashtag_count",
    "mention_count",
    "url_count",
    "media_type",
    "post_type",
    "topic",
    "sentiment",
    "has_question",
    "has_cta",
)
_DISTRIBUTION_KEYS = ("length_buckets", "post_types", "weekday_hour")
_KEYWORD_KEYS = ("top_keywords", "top_hashtags")


def report_data(result: Analysis) -> dict[str, Any]:
    """`/api/mock-posts` 與任務端點共用的報告格式。"""
    nlp = result.nlp
    return {
        **asdict(result.dataset),
        "posts": [asdict(post) for post in nlp.posts],
        "cleaning": asdict(result.cleaning),
        "grouping": asdict(result.grouping),
        "stats": asdict(result.stats),
        "nlp": {"topics": [asdict(t) for t in nlp.topics], **asdict(nlp.attribution)},
        "strategy": asdict(result.strategy),
    }


def _post_number(post_url: str) -> str:
    """mock://threads/@demo_user/post/12 → "12"，作為 platform_post_id 與排序依據。"""
    return post_url.rsplit("/", 1)[-1]


def to_storage(report: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """拆成 posts 資料列與 analysis_summaries 各欄位。"""
    posts = [
        {"platform_post_id": _post_number(post["post_url"]), **{k: post[k] for k in _POST_FIELDS}}
        for post in report["posts"]
    ]
    stats = report["stats"]
    ranked = sorted(report["posts"], key=lambda post: post["engagement_score"], reverse=True)
    summary = {
        "overview_metrics": {
            "generated_at": report["generated_at"],
            "source_note": report["source_note"],
            "cleaning": report["cleaning"],
            "grouping": report["grouping"],
            "averages": stats["averages"],
        },
        "top_posts": [
            {"post_url": post["post_url"], "engagement_score": post["engagement_score"]}
            for post in ranked[:TOP_POST_LIMIT]
        ],
        "distributions": {key: stats[key] for key in _DISTRIBUTION_KEYS},
        "keywords_hashtags": {key: stats[key] for key in _KEYWORD_KEYS},
        "nlp_cluster_analysis": report["nlp"],
        "strategy_insights": report["strategy"],
    }
    return posts, summary


def _taipei_iso(value: str) -> str:
    """PostgREST 以 UTC 回傳 timestamptz；報告一律用 +08:00（PRD AC-2）。"""
    return datetime.fromisoformat(value).astimezone(TAIPEI).isoformat()


def _number(value: Any) -> Any:
    """numeric 欄位可能以 82.0 讀回；整數值還原成 int，與當場分析的結果一致。"""
    return int(value) if isinstance(value, float) and value.is_integer() else value


def _row_to_post(row: dict[str, Any]) -> dict[str, Any]:
    post = {key: row[key] for key in _POST_FIELDS}
    post["published_at"] = _taipei_iso(row["published_at"])
    post["engagement_score"] = _number(row["engagement_score"])
    post["is_synthetic"] = True  # 資料庫約束保證 is_synthetic = true
    return post


def from_storage(
    task: dict[str, Any], post_rows: list[dict[str, Any]], summary: dict[str, Any]
) -> dict[str, Any]:
    """由資料庫資料列還原報告。"""
    overview = summary["overview_metrics"]
    rows = sorted(post_rows, key=lambda row: int(row["platform_post_id"]))
    return {
        "data_source": task["data_source"],
        "source_note": overview["source_note"],
        "generated_at": overview["generated_at"],
        "username": task["target_username"],
        "posts": [_row_to_post(row) for row in rows],
        "cleaning": overview["cleaning"],
        "grouping": overview["grouping"],
        "stats": {
            "averages": overview["averages"],
            **summary["distributions"],
            **summary["keywords_hashtags"],
        },
        "nlp": summary["nlp_cluster_analysis"],
        "strategy": summary["strategy_insights"],
    }
