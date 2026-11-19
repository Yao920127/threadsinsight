"""三群組一致化 NLP 內容歸因（PRD F4 第 3 步）。

1. 抽樣：每組取 min(5, 該組篇數) 篇最具代表性的貼文——高互動取分數最高、
   中互動取最接近該組中位數、低互動取分數最低；同分依原順序。該組 0 篇時標示樣本不足。
2. 對三組樣本套用完全相同的分析：TF-IDF 關鍵詞（每組樣本視為一份文件）、
   結構特徵比例、情緒極性、主題組成。
3. 歸因：把各組樣本的特徵比例與「全部貼文」比較，差距達 20 個百分點才寫成一條觀察。
   這是相關性觀察，不是因果結論；樣本很小時尤其如此。
"""

import math
import statistics
from collections import Counter
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace

from threadsinsightapi.cleaning import CleanPost, EngagementGroup
from threadsinsightapi.keywords import tokenize
from threadsinsightapi.stats import SegmentStats, segment_stats
from threadsinsightapi.text_features import TOPIC_ORDER, TextFeatures, extract_text_features

MAX_SAMPLE_SIZE = 5
TOP_TFIDF_TERMS = 5
#: 比例差距門檻（20 個百分點）
RATE_GAP_THRESHOLD = 0.2
#: 平均字數相對差距門檻（20%）
LENGTH_GAP_THRESHOLD = 0.2
GROUP_ORDER: tuple[EngagementGroup, ...] = ("high", "medium", "low")
METHOD = "rule_based_v1"


@dataclass(frozen=True)
class AnnotatedPost:
    post: CleanPost
    text: TextFeatures


@dataclass(frozen=True)
class WeightedTerm:
    term: str
    weight: float


@dataclass(frozen=True)
class Structure:
    avg_char_count: float
    avg_sentence_count: float
    question_rate: float
    cta_rate: float
    hashtag_rate: float
    link_rate: float
    mention_rate: float
    image_rate: float
    positive_rate: float
    negative_rate: float


@dataclass(frozen=True)
class GroupProfile:
    group: EngagementGroup
    post_count: int
    sample_size: int
    #: 該組沒有貼文，略過歸因（PRD F4 小樣本規則）
    insufficient: bool
    sample_urls: tuple[str, ...]
    keywords: tuple[WeightedTerm, ...]
    structure: Structure | None
    topics: tuple[tuple[str, int], ...]
    observations: tuple[str, ...]


@dataclass(frozen=True)
class Attribution:
    method: str
    baseline: Structure | None
    groups: tuple[GroupProfile, ...]


# ---------- 抽樣 ----------


def sample_group(posts: Sequence[CleanPost], group: EngagementGroup) -> list[CleanPost]:
    members = [(index, post) for index, post in enumerate(posts) if post.engagement_group == group]
    if not members:
        return []
    size = min(MAX_SAMPLE_SIZE, len(members))
    if group == "high":
        ranked = sorted(members, key=lambda m: (-m[1].engagement_score, m[0]))
    elif group == "low":
        ranked = sorted(members, key=lambda m: (m[1].engagement_score, m[0]))
    else:
        median = statistics.median(p.engagement_score for _, p in members)
        ranked = sorted(members, key=lambda m: (abs(m[1].engagement_score - median), m[0]))
    return [post for _, post in ranked[:size]]


# ---------- 結構特徵 ----------


def _rate(items: Sequence[AnnotatedPost], test: Callable[[AnnotatedPost], bool]) -> float:
    return round(sum(map(test, items)) / len(items), 3)


def _mean(values: Sequence[float]) -> float:
    return round(sum(values) / len(values), 1)


def summarize_structure(items: Sequence[AnnotatedPost]) -> Structure | None:
    if not items:
        return None
    return Structure(
        avg_char_count=_mean([i.post.char_count for i in items]),
        avg_sentence_count=_mean([i.text.sentence_count for i in items]),
        question_rate=_rate(items, lambda i: i.text.has_question),
        cta_rate=_rate(items, lambda i: i.text.has_cta),
        hashtag_rate=_rate(items, lambda i: i.post.hashtag_count > 0),
        link_rate=_rate(items, lambda i: i.post.url_count > 0),
        mention_rate=_rate(items, lambda i: i.post.mention_count > 0),
        image_rate=_rate(items, lambda i: i.post.media_type == "image"),
        positive_rate=_rate(items, lambda i: i.text.sentiment == "positive"),
        negative_rate=_rate(items, lambda i: i.text.sentiment == "negative"),
    )


# ---------- TF-IDF ----------


def tfidf_by_group(documents: dict[str, list[str]], limit: int) -> dict[str, list[WeightedTerm]]:
    """每組樣本的詞合成一份文件，找出各組「特有」的詞。

    idf = ln((1 + N) / (1 + df))：出現在所有組的詞 idf 為 0、不列入，
    讓結果突顯組間差異。只有一組有樣本時無從比較，idf 一律為 1（退回詞頻）。
    """
    non_empty = {key: tokens for key, tokens in documents.items() if tokens}
    total_docs = len(non_empty)
    df = Counter(term for tokens in non_empty.values() for term in set(tokens))

    def idf(term: str) -> float:
        return 1.0 if total_docs == 1 else math.log((1 + total_docs) / (1 + df[term]))

    result: dict[str, list[WeightedTerm]] = {}
    for key, tokens in documents.items():
        counts = Counter(tokens)
        scored = [(term, count / len(tokens) * idf(term)) for term, count in counts.items()]
        ranked = sorted((item for item in scored if item[1] > 0), key=lambda i: (-i[1], i[0]))
        result[key] = [WeightedTerm(term, round(weight, 4)) for term, weight in ranked[:limit]]
    return result


# ---------- 觀察 ----------

# (欄位, 描述, 高互動組比例較高時的解讀, 低互動組比例較高時的解讀)
_RATE_FEATURES: tuple[tuple[str, str, str, str], ...] = (
    ("question_rate", "包含提問", "提問可能引導讀者回覆", "提問未必能單獨帶動互動"),
    (
        "cta_rate",
        "明確邀請讀者互動",
        "直接邀請留言或分享可能提高參與",
        "邀請互動的寫法可能流於形式",
    ),
    ("hashtag_rate", "使用 hashtag", "hashtag 可能增加曝光", "hashtag 未必帶來實質互動"),
    ("link_rate", "附外部連結", "連結內容可能提供額外價值", "外部連結可能把讀者帶離貼文"),
    ("mention_rate", "提及其他帳號", "提及可能帶來被提及者的互動", "提及未帶來明顯效果"),
    ("image_rate", "附圖片", "圖片可能吸引停留", "圖片未必提升互動"),
    ("positive_rate", "語氣正向", "正向語氣可能較受歡迎", "正向語氣未必提升互動"),
    ("negative_rate", "語氣負向", "坦白談困難可能引起共鳴", "負面語氣可能降低互動意願"),
)


def _percent(value: float) -> str:
    return f"{round(value * 100)}%"


def build_observations(
    group: EngagementGroup, sample: Structure, baseline: Structure
) -> tuple[str, ...]:
    if group == "medium":
        return ("中互動組作為對照，特徵差異僅供參考。",) + _differences(sample, baseline, None)
    return _differences(sample, baseline, group) or (
        "抽樣貼文的結構特徵與整體差異不大（各項差距皆小於 20 個百分點）。",
    )


def _differences(
    sample: Structure, baseline: Structure, group: EngagementGroup | None
) -> tuple[str, ...]:
    notes: list[str] = []
    for field, label, high_reading, low_reading in _RATE_FEATURES:
        value, base = getattr(sample, field), getattr(baseline, field)
        gap = value - base
        if abs(gap) < RATE_GAP_THRESHOLD:
            continue
        direction = "高於" if gap > 0 else "低於"
        spacer = " " if label[-1].isascii() else ""  # 「hashtag 的」中英文之間留空格
        sentence = f"{label}{spacer}的比例 {_percent(value)}，{direction}整體 {_percent(base)}"
        reading = _reading(group, gap, high_reading, low_reading)
        notes.append(f"{sentence}；{reading}。" if reading else f"{sentence}。")
    if baseline.avg_char_count > 0:
        ratio = sample.avg_char_count / baseline.avg_char_count - 1
        if abs(ratio) >= LENGTH_GAP_THRESHOLD:
            longer = "較長" if ratio > 0 else "較短"
            notes.append(
                f"平均 {sample.avg_char_count:g} 字，篇幅{longer}"
                f"（整體 {baseline.avg_char_count:g} 字）。"
            )
    return tuple(notes)


def _reading(group: EngagementGroup | None, gap: float, high: str, low: str) -> str:
    if group == "high" and gap > 0:
        return high
    if group == "low" and gap > 0:
        return low
    return ""


# ---------- 主流程 ----------


def annotate(posts: Sequence[CleanPost]) -> list[AnnotatedPost]:
    return [AnnotatedPost(post, extract_text_features(post.content)) for post in posts]


def attribute(annotated: Sequence[AnnotatedPost]) -> Attribution:
    posts = [item.post for item in annotated]
    by_url = {item.post.post_url: item for item in annotated}
    baseline = summarize_structure(annotated)
    samples = {
        group: [by_url[p.post_url] for p in sample_group(posts, group)] for group in GROUP_ORDER
    }
    keywords = tfidf_by_group(
        {
            group: [t for item in items for t in tokenize(item.post.content)]
            for group, items in samples.items()
        },
        TOP_TFIDF_TERMS,
    )
    profiles = []
    for group in GROUP_ORDER:
        items = samples[group]
        structure = summarize_structure(items)
        topic_counts = Counter(item.text.topic for item in items)
        profiles.append(
            GroupProfile(
                group=group,
                post_count=sum(p.engagement_group == group for p in posts),
                sample_size=len(items),
                insufficient=not items,
                sample_urls=tuple(item.post.post_url for item in items),
                keywords=tuple(keywords[group]),
                structure=structure,
                topics=tuple((t, topic_counts[t]) for t in TOPIC_ORDER if topic_counts[t]),
                observations=(
                    build_observations(group, structure, baseline)
                    if structure is not None and baseline is not None
                    else ()
                ),
            )
        )
    return Attribution(method=METHOD, baseline=baseline, groups=tuple(profiles))


@dataclass(frozen=True)
class NlpResult:
    #: 附上逐篇文字特徵（topic、sentiment、has_question、has_cta）的貼文，順序不變
    posts: tuple[CleanPost, ...]
    #: 各主題的篇數與平均互動數，依 TOPIC_ORDER 排列
    topics: tuple[SegmentStats, ...]
    attribution: Attribution


def run_nlp(posts: Sequence[CleanPost]) -> NlpResult:
    """對已分群的貼文執行完整 NLP 管線。"""
    annotated = annotate(posts)
    enriched = tuple(
        replace(
            item.post,
            topic=item.text.topic,
            sentiment=item.text.sentiment,
            has_question=item.text.has_question,
            has_cta=item.text.has_cta,
        )
        for item in annotated
    )
    topics = tuple(
        segment_stats(topic, [p for p in enriched if p.topic == topic]) for topic in TOPIC_ORDER
    )
    return NlpResult(posts=enriched, topics=topics, attribution=attribute(annotated))
