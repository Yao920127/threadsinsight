"""中文斷詞與高頻關鍵字（PRD F4 第 1 步）。使用 Jieba，詞典第一次使用時才載入。

詞典用 Jieba 官方的繁體加強版 `dict.txt.big`（MIT 授權，來源見 data/README.md），
內建詞典偏簡體，斷繁體會切錯（例如「事永遠」「三十分」）。

關鍵字以「出現在幾篇貼文」計數（文件頻率），同一篇重複出現只算一次，
避免單篇洗版主導排名。網址、hashtag、mention 先移除，hashtag 另行統計。
"""

import logging
import re
from collections import Counter
from collections.abc import Iterable
from functools import cache
from pathlib import Path

import jieba

from threadsinsightapi.cleaning import strip_entities
from threadsinsightapi.content import template_phrases

MIN_KEYWORD_LENGTH = 2
DICTIONARY_PATH = Path(__file__).resolve().parent / "data" / "dict.txt.big"

# 只排除跨主題都常見、本身不帶主題意義的虛詞與代名詞；保留「留言」「謝謝」等
# 可能反映貼文風格的詞，留給後續 NLP 判斷。
STOPWORDS: frozenset[str] = frozenset(
    {
        "一個", "一下", "一點", "不是", "之後", "之前", "也是", "什麼", "他們", "但是",
        "你們", "其實", "只是", "可以", "因為", "如果", "就是", "已經", "我們", "所以",
        "時候", "有人", "沒有", "然後", "現在", "而是", "自己", "這個", "這件", "這樣",
        "通常", "那個", "那樣", "還是", "怎麼", "這些", "那些", "大家", "比較", "還有",
    }
)  # fmt: skip

# 至少含一個中日韓文字或英文字母；排除純數字與純符號
_MEANINGFUL_RE = re.compile(r"[\u3400-\u9fff\uf900-\ufaffA-Za-z]")


@cache
def _tokenizer() -> jieba.Tokenizer:
    jieba.setLogLevel(logging.WARNING)
    tokenizer = jieba.Tokenizer(dictionary=str(DICTIONARY_PATH))
    tokenizer.initialize()
    return tokenizer


def segment(text: str) -> list[str]:
    """Jieba 原始斷詞結果（去掉空白），保留單字詞，供情緒判斷等需要完整詞序的分析。"""
    return [token for token in (raw.strip() for raw in _tokenizer().lcut(text)) if token]


def _candidate_tokens(text: str) -> list[str]:
    return [
        token
        for token in segment(text)
        if len(token) >= MIN_KEYWORD_LENGTH
        and token not in STOPWORDS
        and _MEANINGFUL_RE.search(token)
    ]


@cache
def template_words() -> frozenset[str]:
    """合成資料範本句（結語、「謝謝…的提醒」「延伸閱讀」）斷出的詞。

    這些詞每篇都可能出現，會擠掉真正的主題詞，所以不列入關鍵字。
    由主題庫自動產生，範本句改了這份清單會跟著變。
    """
    return frozenset(token for phrase in template_phrases() for token in _candidate_tokens(phrase))


def tokenize(content: str) -> list[str]:
    """回傳可作為關鍵字的詞（依出現順序，可重複）。"""
    excluded = template_words()
    return [token for token in _candidate_tokens(strip_entities(content)) if token not in excluded]


def top_keywords(contents: Iterable[str], limit: int) -> list[tuple[str, int]]:
    """依文件頻率排序（同頻率依詞本身排序，結果可重現）。"""
    document_frequency: Counter[str] = Counter()
    for content in contents:
        document_frequency.update(set(tokenize(content)))
    ranked = sorted(document_frequency.items(), key=lambda item: (-item[1], item[0]))
    return ranked[:limit]
