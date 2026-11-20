"""產生範例資料與 Markdown 報告（考題交付內容 data/、reports/）。

用法：`uv run python -m threadsinsightapi.sample_report demo_user --count 30`
（需在 api/ 目錄，或以 `vp run samples` 從專案根目錄執行）。

只產出確定性合成資料：同一帳號每次的貼文都相同，報告開頭註明非真實貼文。
"""

import argparse
import json
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from threadsinsightapi.generator import DEFAULT_POST_COUNT, generate_mock_dataset
from threadsinsightapi.pipeline import analyze_dataset
from threadsinsightapi.report import report_data

TOP_POST_LIMIT = 5
CONTENT_PREVIEW_CHARS = 40
WEEKDAY_LABELS = ("一", "二", "三", "四", "五", "六", "日")
POST_TYPE_LABELS = {
    "text_only": "純文字",
    "image": "含圖片",
    "link": "含連結",
    "hashtag": "含 hashtag",
    "mention": "含 mention",
}


@dataclass(frozen=True)
class SamplePaths:
    dataset: Path
    report_json: Path
    report_markdown: Path


def _cell(text: str) -> str:
    """表格儲存格：換行改空白、跳脫 |，避免破壞 Markdown 表格。"""
    return " ".join(text.split()).replace("|", "\\|")


def _number(value: float | int | None) -> str:
    if value is None:
        return "未公開"
    return f"{value:,.0f}" if float(value).is_integer() else f"{value:,.1f}"


def _bar_chart(title: str, labels: Sequence[str], values: Sequence[float], y_label: str) -> str:
    axis = ", ".join(f'"{label}"' for label in labels)
    bars = ", ".join(_number(v).replace(",", "") for v in values)
    return "\n".join(
        [
            "```mermaid",
            "xychart-beta",
            f'    title "{title}"',
            f"    x-axis [{axis}]",
            f'    y-axis "{y_label}"',
            f"    bar [{bars}]",
            "```",
        ]
    )


def _overview(report: dict[str, Any]) -> list[str]:
    posts = report["posts"]
    averages = report["stats"]["averages"]
    cleaning = report["cleaning"]
    with_views = [p for p in posts if p["views_count"] is not None]
    return [
        "## 總覽指標",
        "",
        "| 指標 | 數值 |",
        "| :--- | ---: |",
        f"| 收錄篇數 | {len(posts)} |",
        f"| 平均讚數 | {_number(averages['likes'])} |",
        f"| 平均回覆數 | {_number(averages['replies'])} |",
        f"| 平均轉發數 | {_number(averages['reposts'])} |",
        f"| 平均互動數（讚＋回覆＋轉發） | {_number(averages['engagement'])} |",
        f"| 有公開瀏覽數的貼文 | {len(with_views)} 篇 |",
        f"| 清理時移除的重複／無效貼文 | "
        f"{cleaning['duplicates_removed']}／{cleaning['invalid_removed']} 篇 |",
    ]


def _top_posts(report: dict[str, Any]) -> list[str]:
    ranked = sorted(report["posts"], key=lambda p: p["engagement_score"], reverse=True)
    rows = [
        f"| {rank} | {_cell(p['published_at'][:16].replace('T', ' '))} "
        f"| {p['engagement_score']} | {p['likes_count']} | {p['replies_count']} "
        f"| {_number(p['views_count'])} | {_cell(p['content'][:CONTENT_PREVIEW_CHARS])}… "
        f"| {p['post_url']} |"
        for rank, p in enumerate(ranked[:TOP_POST_LIMIT], start=1)
    ]
    return [
        "## Top 5 貼文",
        "",
        "依加權互動分（讚 + 2 × 回覆）排序。",
        "",
        "| 名次 | 發文時間 | 互動分 | 讚 | 回覆 | 瀏覽 | 內容 | 網址 |",
        "| ---: | :--- | ---: | ---: | ---: | ---: | :--- | :--- |",
        *rows,
    ]


def _charts(report: dict[str, Any]) -> list[str]:
    stats = report["stats"]
    weekday_counts = [sum(row) for row in stats["weekday_hour"]]
    types = stats["post_types"]
    return [
        "## 圖表",
        "",
        _bar_chart("星期幾發文篇數", [f"週{d}" for d in WEEKDAY_LABELS], weekday_counts, "篇數"),
        "",
        _bar_chart(
            "各貼文類型的平均互動數",
            [POST_TYPE_LABELS.get(t["key"], t["key"]) for t in types],
            [t["avg_engagement"] for t in types],
            "平均互動數",
        ),
    ]


def _insights(report: dict[str, Any]) -> list[str]:
    items = [
        f"{i}. **{x['title']}**：{x['evidence']}建議：{x['action']}"
        for i, x in enumerate(report["strategy"]["insights"], start=1)
    ]
    return [
        "## 內容策略觀察",
        "",
        *items,
        "",
        "以上是規則引擎依全部貼文算出的相關性觀察，不代表因果；"
        "網站上可再用 Claude Haiku 產生 AI 建議。",
    ]


def render_markdown(report: dict[str, Any]) -> str:
    """把 report_data 的結果轉成 Markdown 報告：總覽、Top 5、2 張圖、3 點觀察。"""
    username = report["username"]
    header = [
        f"# @{username} 貼文分析報告（範例）",
        "",
        f"> 示範資料（Mock Dataset），非 @{username} 的真實貼文。"
        f"產生時間：{report['generated_at']}。",
        "",
    ]
    sections = [_overview(report), _top_posts(report), _charts(report), _insights(report)]
    body = [line for section in sections for line in [*section, ""]]
    return "\n".join([*header, *body]).rstrip() + "\n"


def _write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_samples(username: str, count: int, data_dir: Path, reports_dir: Path) -> SamplePaths:
    """寫出原始合成資料、完整報告 JSON 與 Markdown 報告。"""
    dataset = generate_mock_dataset(username, count)
    report = report_data(analyze_dataset(dataset))
    stem = f"{dataset.username}_{len(dataset.posts)}"
    data_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)
    paths = SamplePaths(
        dataset=data_dir / f"{stem}.json",
        report_json=reports_dir / f"{stem}_report.json",
        report_markdown=reports_dir / f"{stem}_report.md",
    )
    _write_json(paths.dataset, asdict(dataset))
    _write_json(paths.report_json, report)
    paths.report_markdown.write_text(render_markdown(report), encoding="utf-8")
    return paths


def main(argv: Sequence[str] | None = None) -> None:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="產生範例合成資料與分析報告")
    parser.add_argument("username", nargs="?", default="demo_user")
    parser.add_argument("--count", type=int, default=DEFAULT_POST_COUNT)
    parser.add_argument("--data-dir", type=Path, default=root / "data")
    parser.add_argument("--reports-dir", type=Path, default=root / "reports")
    args = parser.parse_args(argv)
    paths = write_samples(args.username, args.count, args.data_dir, args.reports_dir)
    for path in (paths.dataset, paths.report_json, paths.report_markdown):
        print(f"已寫入 {path}")  # noqa: T201 - 指令列工具的輸出


if __name__ == "__main__":
    main()
