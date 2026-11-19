"""完整分析管線：生成 → 清理 → 分群 → NLP → 統計 → 規則策略。兩個端點共用，確保結果一致。"""

from dataclasses import asdict, dataclass

from threadsinsightapi.attribution import NlpResult, run_nlp
from threadsinsightapi.cleaning import CleaningReport, clean_posts
from threadsinsightapi.generator import MockDataset, generate_mock_dataset
from threadsinsightapi.grouping import GroupingSummary, assign_engagement_groups
from threadsinsightapi.stats import PostStats, compute_stats
from threadsinsightapi.strategy import StrategyResult, build_strategy


@dataclass(frozen=True)
class Analysis:
    dataset: MockDataset
    cleaning: CleaningReport
    grouping: GroupingSummary
    nlp: NlpResult
    stats: PostStats
    strategy: StrategyResult


def analyze(username: str, count: int) -> Analysis:
    """丟出 InvalidUsernameError／InvalidCountError 讓呼叫端回 400。"""
    return analyze_dataset(generate_mock_dataset(username, count=count))


def analyze_dataset(dataset: MockDataset) -> Analysis:
    """任務的 analyzing 階段：清理、分群、NLP、統計與規則策略。"""
    cleaned = clean_posts([asdict(post) for post in dataset.posts])
    grouped = assign_engagement_groups(cleaned.posts)
    nlp = run_nlp(grouped.posts)
    return Analysis(
        dataset=dataset,
        cleaning=cleaned.report,
        grouping=grouped.summary,
        nlp=nlp,
        stats=compute_stats(nlp.posts),
        strategy=build_strategy(nlp.posts),
    )
