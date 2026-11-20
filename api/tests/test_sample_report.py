"""範例資料與報告輸出（考題交付內容 data/、reports/）。"""

import json
from pathlib import Path

import pytest

from threadsinsightapi.pipeline import analyze
from threadsinsightapi.report import report_data
from threadsinsightapi.sample_report import main, render_markdown, write_samples


@pytest.fixture(scope="module")
def report() -> dict:
    return report_data(analyze("demo_user", 30))


class TestRenderMarkdown:
    def test_has_required_sections(self, report: dict) -> None:
        md = render_markdown(report)
        for heading in ("## 總覽指標", "## Top 5 貼文", "## 圖表", "## 內容策略觀察"):
            assert heading in md

    def test_discloses_mock_data(self, report: dict) -> None:
        md = render_markdown(report)
        assert "示範資料" in md
        assert "非 @demo_user 的真實貼文" in md

    def test_top_posts_sorted_by_engagement_score(self, report: dict) -> None:
        md = render_markdown(report)
        top_rows = [line for line in md.splitlines() if line.startswith("| ") and "mock://" in line]
        scores = [int(row.split("|")[3].strip()) for row in top_rows]
        assert len(scores) == 5
        assert scores == sorted(scores, reverse=True)
        best = max(p["engagement_score"] for p in report["posts"])
        assert scores[0] == best

    def test_has_two_charts(self, report: dict) -> None:
        md = render_markdown(report)
        assert md.count("```mermaid") == 2
        assert md.count("xychart-beta") == 2

    def test_three_insights_with_evidence(self, report: dict) -> None:
        md = render_markdown(report)
        for insight in report["strategy"]["insights"]:
            assert insight["title"] in md
            assert insight["evidence"] in md

    def test_missing_views_shown_as_unpublished(self, report: dict) -> None:
        posts = [{**p, "views_count": None} for p in report["posts"]]
        md = render_markdown({**report, "posts": posts})
        assert "未公開" in md
        assert "None" not in md

    def test_pipe_in_content_does_not_break_table(self, report: dict) -> None:
        posts = [{**p, "content": "a|b\nc"} for p in report["posts"]]
        md = render_markdown({**report, "posts": posts})
        assert "a\\|b c" in md


class TestWriteSamples:
    def test_writes_dataset_and_reports(self, tmp_path: Path) -> None:
        paths = write_samples("demo_user", 30, tmp_path / "data", tmp_path / "reports")

        dataset = json.loads(paths.dataset.read_text(encoding="utf-8"))
        assert dataset["data_source"] == "mock_dataset"
        assert len(dataset["posts"]) == 30
        assert all(p["post_url"].startswith("mock://threads/@demo_user/") for p in dataset["posts"])

        full = json.loads(paths.report_json.read_text(encoding="utf-8"))
        assert full["stats"]["averages"]["likes"] > 0
        assert paths.report_markdown.read_text(encoding="utf-8").startswith("# ")

    def test_same_username_gives_same_posts(self, tmp_path: Path) -> None:
        first = write_samples("demo_user", 30, tmp_path / "a", tmp_path / "a")
        second = write_samples("demo_user", 30, tmp_path / "b", tmp_path / "b")
        posts = [
            json.loads(p.dataset.read_text(encoding="utf-8"))["posts"] for p in (first, second)
        ]
        assert posts[0] == posts[1]

    def test_main_uses_arguments(self, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
        main(
            [
                "another_demo",
                "--count",
                "12",
                "--data-dir",
                str(tmp_path / "d"),
                "--reports-dir",
                str(tmp_path / "r"),
            ]
        )
        assert (tmp_path / "d" / "another_demo_12.json").exists()
        assert (tmp_path / "r" / "another_demo_12_report.md").exists()
        assert "another_demo_12_report.md" in capsys.readouterr().out
