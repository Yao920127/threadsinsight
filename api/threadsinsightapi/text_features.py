"""逐篇文字特徵（PRD F4 第 3 步的 NLP 管線）：句型、提問、行動呼籲、情緒極性、主題。

全部以規則與詞典判斷，結果確定、可重現，不呼叫外部模型。詞典刻意保持通用，
不針對合成資料的主題庫調整，換成其他資料來源時仍然適用（準確度另見測試）。
"""

import re
from dataclasses import dataclass
from typing import Literal

from threadsinsightapi.cleaning import strip_entities
from threadsinsightapi.keywords import segment

Sentiment = Literal["positive", "neutral", "negative"]
Topic = Literal["career", "life", "tech", "opinion", "other"]

TOPIC_ORDER: tuple[Topic, ...] = ("career", "life", "tech", "opinion", "other")

# 情緒極性門檻：(正向詞數 − 負向詞數) / 情緒詞總數
SENTIMENT_THRESHOLD = 0.2

_SENTENCE_END_RE = re.compile(r"[。！？!?\n]+")
_QUESTION_RE = re.compile(r"[？?]")

# 明確邀請讀者互動的說法（提問句另計，不重複算在這裡）
CTA_PHRASES: tuple[str, ...] = (
    "留言", "分享", "轉發", "按讚", "追蹤", "告訴我", "說說", "聊聊", "想聽聽",
    "你們", "大家怎麼", "你會怎麼", "標記", "tag",
)  # fmt: skip

POSITIVE_WORDS: frozenset[str] = frozenset(
    {
        "好", "喜歡", "開心", "滿足", "輕鬆", "值得", "有用", "進步", "變好", "安靜",
        "成長", "努力", "感謝", "謝謝", "強", "省下", "幸福", "期待", "順利", "放鬆",
        "享受", "推薦", "成功", "愛", "美好", "舒服", "專注", "穩", "完成", "累積",
    }
)  # fmt: skip
NEGATIVE_WORDS: frozenset[str] = frozenset(
    {
        "焦慮", "難", "最難", "壞掉", "變差", "怕", "卡", "漏掉", "爭論", "放棄",
        "羨慕", "累", "浪費", "失敗", "討厭", "煩", "糟", "壓力", "痛苦", "生氣",
        "擔心", "後悔", "無聊", "崩潰", "失望",
    }
)  # fmt: skip

# 主題詞典：子字串比對（含 hashtag 文字），命中最多者為主題；全無命中或平手時依 TOPIC_ORDER
TOPIC_KEYWORDS: dict[Topic, tuple[str, ...]] = {
    "career": (
        "職場", "工作", "會議", "開會", "議程", "主管", "同事", "團隊", "面試", "週報",
        "遠端", "截止", "任務", "專案", "薪水", "升遷", "履歷", "老闆", "上班", "合作",
    ),
    "life": (
        "生活", "日常", "週末", "睡眠", "走路", "運動", "煮飯", "房間", "整理", "記帳",
        "早起", "朋友", "咖啡", "看書", "熱茶", "外送", "下雨", "吃飯", "旅行", "習慣",
    ),
    "tech": (
        "科技", "AI", "工具", "程式", "系統", "更新", "電池", "密碼", "通知", "備份",
        "硬碟", "耳機", "自動化", "腳本", "app", "軟體", "數位", "網站", "手機", "podcast",
    ),
    "opinion": (
        "觀點", "思考", "心態", "成長", "完美", "爭論", "休息", "能力", "羨慕", "節奏",
        "判斷", "資訊", "累積", "頓悟", "放棄", "相信", "在意", "保護", "過程", "結果",
    ),
}  # fmt: skip


@dataclass(frozen=True)
class TextFeatures:
    sentence_count: int
    has_question: bool
    has_cta: bool
    #: −1（全負向）到 1（全正向）；沒有情緒詞時為 0
    polarity: float
    sentiment: Sentiment
    topic: Topic


def count_sentences(content: str) -> int:
    return len([part for part in _SENTENCE_END_RE.split(content) if part.strip()])


def has_cta(content: str) -> bool:
    lowered = content.lower()
    return any(phrase.lower() in lowered for phrase in CTA_PHRASES)


def polarity_of(content: str) -> float:
    tokens = segment(strip_entities(content))
    positive = sum(token in POSITIVE_WORDS for token in tokens)
    negative = sum(token in NEGATIVE_WORDS for token in tokens)
    total = positive + negative
    return round((positive - negative) / total, 3) if total else 0.0


def sentiment_of(polarity: float) -> Sentiment:
    if polarity > SENTIMENT_THRESHOLD:
        return "positive"
    if polarity < -SENTIMENT_THRESHOLD:
        return "negative"
    return "neutral"


def classify_topic(content: str) -> Topic:
    lowered = content.lower()
    hits = {
        topic: sum(lowered.count(word.lower()) for word in words)
        for topic, words in TOPIC_KEYWORDS.items()
    }
    best = max(hits.values())
    if best == 0:
        return "other"
    return next(topic for topic in TOPIC_ORDER if hits.get(topic) == best)


def extract_text_features(content: str) -> TextFeatures:
    polarity = polarity_of(content)
    return TextFeatures(
        sentence_count=count_sentences(strip_entities(content)),
        has_question=bool(_QUESTION_RE.search(content)),
        has_cta=has_cta(content),
        polarity=polarity,
        sentiment=sentiment_of(polarity),
        topic=classify_topic(content),
    )
