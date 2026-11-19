"""規則引擎：3 點內容策略觀察與改寫範例（PRD F4 第 4 步的備援；例外情境 6）。

LLM 建議（之後以 Claude Haiku 5.5 產生）逾時或失敗時改顯示這裡的結果，報告因此不會中斷。

做法：
1. 候選觀察：在發文時段、貼文類型、主題、字數、提問、hashtag、外部連結各面向中，
   找出平均互動數與整體差距最大的組合（至少 2 篇、差距至少 10%）。
2. 依差距大小取前 3 點，每個面向最多 1 點；不足 3 點時以「資料不足以判斷」補齊，不硬湊結論。
3. 改寫範例：取互動最低的貼文，依入選觀察套用對應的改寫規則（加提問、移除連結、補 hashtag）。

使用全部貼文而非抽樣，數字較穩定；仍屬相關性觀察，不代表因果。
"""

import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from threadsinsightapi.cleaning import CleanPost, find_hashtags
from threadsinsightapi.stats import engagement_of

MIN_SEGMENT_POSTS = 2
#: 每組至少要佔總篇數的比例（與 MIN_SEGMENT_POSTS 取大者），避免 2 篇的巧合被當成規律
MIN_SEGMENT_SHARE = 0.1
MIN_LIFT = 0.1
INSIGHT_COUNT = 3
HOURS_PER_SLOT = 3
SMALL_SAMPLE_THRESHOLD = 10
SOURCE = "rule_engine"

Category = Literal["time", "post_type", "topic", "length", "question", "hashtag", "link"]

TOPIC_LABELS = {
    "career": "職場",
    "life": "生活",
    "tech": "科技",
    "opinion": "觀點",
    "other": "其他",
}
POST_TYPE_LABELS = {
    "text_only": "純文字", "image": "圖片", "link": "連結", "hashtag": "Hashtag", "mention": "提及",
}  # fmt: skip
LENGTH_BUCKETS: tuple[tuple[str, int, int | None], ...] = (
    ("50 字以內", 0, 50),
    ("51–100 字", 51, 100),
    ("101–200 字", 101, 200),
    ("201–400 字", 201, 400),
    ("超過 400 字", 401, None),
)
QUESTION_CLOSER = "你們怎麼看？"
LINK_NOTE = "（連結放在第一則留言）"
# 中文與英數字之間補空格（「提高 Hashtag 類型」「以 51–100 字」）
_CJK_THEN_LATIN_RE = re.compile(r"([\u3400-\u9fff])([A-Za-z0-9#])")
_LATIN_THEN_CJK_RE = re.compile(r"([A-Za-z0-9%])([\u3400-\u9fff])")
_URL_RE = re.compile(r"(?:https?://|www\.)\S+", re.IGNORECASE)
_HASHTAG_ONLY_LINE_RE = re.compile(r"^(?:#\w+\s*)+$")


@dataclass(frozen=True)
class Insight:
    #: 規則引擎的面向；補位用為 insufficient；LLM 產生的為 ai
    category: Category | Literal["insufficient", "ai"]
    title: str
    evidence: str
    action: str
    #: 與整體平均互動的相對差距（+0.25 = 高 25%）；補位用的觀察為 None
    lift: float | None


@dataclass(frozen=True)
class Rewrite:
    post_url: str
    before: str
    after: str
    changes: tuple[str, ...]


@dataclass(frozen=True)
class StrategyResult:
    source: str
    insights: tuple[Insight, ...]
    rewrite: Rewrite | None
    notice: str | None
    #: source 為 llm 時的模型 ID
    model: str | None = None


@dataclass(frozen=True)
class _Candidate:
    category: Category
    label: str
    count: int
    average: float
    lift: float

    @property
    def signal(self) -> str:
        """同一訊號只取一點：「Hashtag 類型」與「使用 hashtag」都是 hashtag 訊號，連結亦同。"""
        if self.category == "post_type" and self.label == POST_TYPE_LABELS["hashtag"]:
            return "hashtag"
        if self.category == "post_type" and self.label == POST_TYPE_LABELS["link"]:
            return "link"
        return self.category


def min_segment_posts(total: int) -> int:
    return max(MIN_SEGMENT_POSTS, round(total * MIN_SEGMENT_SHARE))


def spaced(text: str) -> str:
    return _LATIN_THEN_CJK_RE.sub(r"\1 \2", _CJK_THEN_LATIN_RE.sub(r"\1 \2", text))


def _average(posts: Sequence[CleanPost]) -> float:
    return sum(map(engagement_of, posts)) / len(posts) if posts else 0.0


def _best_segment(
    category: Category,
    posts: Sequence[CleanPost],
    key: Callable[[CleanPost], str | None],
    overall: float,
) -> _Candidate | None:
    """各分組中平均互動最高者（篇數不足者不列入）。"""
    groups: dict[str, list[CleanPost]] = {}
    for post in posts:
        label = key(post)
        if label is not None:
            groups.setdefault(label, []).append(post)
    eligible = [
        _Candidate(category, label, len(items), _average(items), _average(items) / overall - 1)
        for label, items in groups.items()
        if len(items) >= min_segment_posts(len(posts))
    ]
    if len(eligible) < 2:  # 只有一組無從比較
        return None
    return max(eligible, key=lambda c: (c.lift, -c.count, c.label))


def _binary(
    category: Category,
    posts: Sequence[CleanPost],
    test: Callable[[CleanPost], bool],
    overall: float,
) -> _Candidate | None:
    """「有」與「沒有」某特徵的貼文比較；回傳「有」那組（lift 可正可負）。"""
    with_feature = [p for p in posts if test(p)]
    without = [p for p in posts if not test(p)]
    if min(len(with_feature), len(without)) < min_segment_posts(len(posts)):
        return None
    average = _average(with_feature)
    return _Candidate(category, "有", len(with_feature), average, average / overall - 1)


def _slot_of(post: CleanPost) -> str:
    start = datetime.fromisoformat(post.published_at).hour // HOURS_PER_SLOT * HOURS_PER_SLOT
    return f"{start}–{start + HOURS_PER_SLOT - 1} 時"


def _length_of(post: CleanPost) -> str:
    return next(
        label
        for label, low, high in LENGTH_BUCKETS
        if post.char_count >= low and (high is None or post.char_count <= high)
    )


def collect_candidates(posts: Sequence[CleanPost]) -> list[_Candidate]:
    overall = _average(posts)
    if overall <= 0:
        return []
    found = [
        _best_segment("time", posts, _slot_of, overall),
        _best_segment("post_type", posts, lambda p: POST_TYPE_LABELS[p.post_type], overall),
        _best_segment("topic", posts, lambda p: TOPIC_LABELS.get(p.topic or "other"), overall),
        _best_segment("length", posts, _length_of, overall),
        _binary("question", posts, lambda p: bool(p.has_question), overall),
        _binary("hashtag", posts, lambda p: p.hashtag_count > 0, overall),
        _binary("link", posts, lambda p: p.url_count > 0, overall),
    ]
    return [c for c in found if c is not None and abs(c.lift) >= MIN_LIFT]


def _percent(value: float) -> str:
    return f"{round(abs(value) * 100)}%"


def _describe(candidate: _Candidate, overall: float) -> Insight:
    insight = _describe_raw(candidate, overall)
    return Insight(
        insight.category,
        spaced(insight.title),
        spaced(insight.evidence),
        spaced(insight.action),
        insight.lift,
    )


def _describe_raw(candidate: _Candidate, overall: float) -> Insight:
    avg, count, label = round(candidate.average), candidate.count, candidate.label
    higher = candidate.lift > 0
    compare = f"{'高' if higher else '低'}於整體平均 {round(overall)}（{_percent(candidate.lift)}）"
    evidence = f"{count} 篇平均互動 {avg}，{compare}。"
    match candidate.category:
        case "time":
            return Insight(
                "time",
                f"{label}發文表現最好",
                evidence,
                f"把重點貼文安排在 {label}發布，再觀察是否持續領先。",
                candidate.lift,
            )
        case "post_type":
            return Insight(
                "post_type",
                f"{label}類型貼文互動最高",
                evidence,
                f"提高{label}類型貼文的比例，並比較同主題不同類型的表現。",
                candidate.lift,
            )
        case "topic":
            return Insight(
                "topic",
                f"「{label}」主題最受歡迎",
                evidence,
                f"以「{label}」為主軸規劃系列內容，其他主題可嘗試與它結合。",
                candidate.lift,
            )
        case "length":
            return Insight(
                "length",
                f"{label}的貼文互動最高",
                evidence,
                f"新貼文以{label}為目標篇幅，重點放在第一句。",
                candidate.lift,
            )
        case "question":
            if higher:
                return Insight(
                    "question",
                    "含提問的貼文互動較高",
                    evidence,
                    f"在結尾加一句開放式提問，例如「{QUESTION_CLOSER}」。",
                    candidate.lift,
                )
            return Insight(
                "question",
                "含提問的貼文互動反而較低",
                evidence,
                "提問不一定有效；改試具體情境的提問，或直接分享結論。",
                candidate.lift,
            )
        case "hashtag":
            if higher:
                return Insight(
                    "hashtag",
                    "使用 hashtag 的貼文互動較高",
                    evidence,
                    "每篇加上 1–2 個與主題相符的 hashtag。",
                    candidate.lift,
                )
            return Insight(
                "hashtag",
                "使用 hashtag 的貼文互動較低",
                evidence,
                "減少與內容無關的 hashtag，避免像廣告。",
                candidate.lift,
            )
        case "link":
            if higher:
                return Insight(
                    "link",
                    "附連結的貼文互動較高",
                    evidence,
                    "延伸閱讀的連結有加分，可附上並說明讀者能得到什麼。",
                    candidate.lift,
                )
            return Insight(
                "link",
                "附外部連結的貼文互動較低",
                evidence,
                "把連結移到第一則留言，讓貼文本身完整可讀。",
                candidate.lift,
            )
    raise ValueError(f"unknown category: {candidate.category}")  # pragma: no cover


def _filler(index: int) -> Insight:
    return Insight(
        "insufficient",
        "資料不足以判斷更多規律",
        f"目前沒有第 {index} 個面向的互動差距達 {round(MIN_LIFT * 100)}%，"
        "且兩邊篇數都足以比較。",
        "持續累積貼文後重新分析，或拉長分析期間。",
        None,
    )


def select_insights(posts: Sequence[CleanPost]) -> tuple[Insight, ...]:
    overall = _average(posts)
    ranked = sorted(collect_candidates(posts), key=lambda c: (-abs(c.lift), c.category))
    chosen: list[_Candidate] = []
    for candidate in ranked:
        if len(chosen) == INSIGHT_COUNT:
            break
        if all(candidate.signal != c.signal for c in chosen):
            chosen.append(candidate)
    described = [_describe(c, overall) for c in chosen]
    return tuple(described + [_filler(i + 1) for i in range(len(described), INSIGHT_COUNT)])


# ---------- 改寫範例 ----------


def _same_topic_hashtag(post: CleanPost, posts: Sequence[CleanPost]) -> str | None:
    """同主題、互動最高的貼文所用的第一個 hashtag。"""
    peers = sorted(
        (p for p in posts if p.topic == post.topic and p.hashtag_count > 0),
        key=lambda p: -engagement_of(p),
    )
    for peer in peers:
        tags = find_hashtags(peer.content)
        if tags:
            return tags[0]
    return None


def _replace_link_lines(text: str) -> str:
    """含連結的行換成一行說明（只留一次），其餘內容與順序不變。"""
    lines, noted = [], False
    for line in text.split("\n"):
        if not _URL_RE.search(line):
            lines.append(line)
        elif not noted:
            lines.append(LINK_NOTE)
            noted = True
    return "\n".join(lines)


def _insert_before_hashtags(text: str, addition: str) -> str:
    """把新的一行放在結尾的 hashtag 行之前（hashtag 慣例放最後）。"""
    lines = text.rstrip().split("\n")
    cut = len(lines)
    while cut > 0 and _HASHTAG_ONLY_LINE_RE.match(lines[cut - 1].strip()):
        cut -= 1
    return "\n".join([*lines[:cut], addition, *lines[cut:]])


def build_rewrite(posts: Sequence[CleanPost]) -> Rewrite | None:
    """取互動最低的貼文，依所有達門檻的提問／hashtag／連結觀察套用改寫規則。

    參考全部達門檻的觀察而不只入選的 3 點，否則常因最低那篇剛好不符條件而沒有範例。
    沒有可套用的規則時回傳 None。
    """
    if not posts:
        return None
    target = min(enumerate(posts), key=lambda item: (engagement_of(item[1]), item[0]))[1]
    candidates = collect_candidates(posts)
    positive = {c.signal for c in candidates if c.lift > 0}
    negative = {c.signal for c in candidates if c.lift < 0}
    text, changes = target.content, []

    if "link" in negative and target.url_count > 0:
        text = _replace_link_lines(text)
        changes.append("把外部連結移到第一則留言")
    if "question" in positive and not (target.has_question or target.has_cta):
        text = _insert_before_hashtags(text, QUESTION_CLOSER)
        changes.append("結尾加上開放式提問")
    if "hashtag" in positive and target.hashtag_count == 0:
        tag = _same_topic_hashtag(target, posts)
        if tag:
            text = f"{text.rstrip()}\n{tag}"
            changes.append(f"補上同主題常用的 {tag}")

    if not changes:
        return None
    return Rewrite(target.post_url, target.content, text, tuple(changes))


def build_strategy(posts: Sequence[CleanPost]) -> StrategyResult:
    insights = select_insights(posts)
    notice = (
        f"樣本少於 {SMALL_SAMPLE_THRESHOLD} 篇，策略觀察僅供參考。"
        if len(posts) < SMALL_SAMPLE_THRESHOLD
        else None
    )
    return StrategyResult(SOURCE, insights, build_rewrite(posts), notice)
