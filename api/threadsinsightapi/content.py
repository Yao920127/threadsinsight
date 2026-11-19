"""通用社群範例主題庫。資料與 TS 共用 shared/mock-content-library.json。

內容中性、泛用，不模仿任何真實帳號語氣（Mock Dataset 規則 4）；
提及與連結只使用虛構帳號與保留網域 example.com。
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from threadsinsightapi.prng import Random

EngagementTier = Literal["high", "medium", "low"]

LIBRARY_PATH = Path(__file__).resolve().parents[2] / "shared" / "mock-content-library.json"


@dataclass(frozen=True)
class Topic:
    bodies: tuple[str, ...]
    hashtags: tuple[str, ...]


@dataclass(frozen=True)
class TierStyle:
    question: float
    url: float
    hashtags: float


@dataclass(frozen=True)
class ContentLibrary:
    topics: tuple[Topic, ...]
    question_closers: tuple[str, ...]
    statement_closers: tuple[str, ...]
    fake_mentions: tuple[str, ...]
    mention_probability: float
    tier_style: dict[str, TierStyle]


def load_library(path: Path = LIBRARY_PATH) -> ContentLibrary:
    """載入並驗證主題庫；格式錯誤時於啟動階段直接失敗。"""
    raw = json.loads(path.read_text(encoding="utf-8"))
    try:
        library = ContentLibrary(
            topics=tuple(Topic(tuple(t["bodies"]), tuple(t["hashtags"])) for t in raw["topics"]),
            question_closers=tuple(raw["question_closers"]),
            statement_closers=tuple(raw["statement_closers"]),
            fake_mentions=tuple(raw["fake_mentions"]),
            mention_probability=float(raw["mention_probability"]),
            tier_style={
                tier: TierStyle(**raw["tier_style"][tier]) for tier in ("high", "medium", "low")
            },
        )
    except (KeyError, TypeError) as error:
        raise ValueError(f"Malformed content library at {path}: {error}") from error
    if not library.topics or any(not t.bodies or not t.hashtags for t in library.topics):
        raise ValueError(f"Content library at {path} has an empty topic")
    return library


LIBRARY = load_library()

# 固定句型（與 src/mock/contentLibrary.ts 相同，改動時兩邊與黃金檔要一起更新）
MENTION_PREFIX = "謝謝 "
MENTION_SUFFIX = " 的提醒。"
URL_LABEL = "延伸閱讀："


def template_phrases(library: ContentLibrary = LIBRARY) -> tuple[str, ...]:
    """每篇都可能出現的範本句（不含主文），供關鍵字統計排除。"""
    return (
        *library.question_closers,
        *library.statement_closers,
        f"{MENTION_PREFIX}{MENTION_SUFFIX}",
        URL_LABEL,
    )


def compose_content(rng: Random, tier: EngagementTier, post_number: int) -> str:
    """亂數呼叫順序必須與 src/mock/contentLibrary.ts 的 composeContent 完全相同。"""
    topic = rng.pick(LIBRARY.topics)
    style = LIBRARY.tier_style[tier]
    closer = (
        rng.pick(LIBRARY.question_closers)
        if rng.chance(style.question)
        else rng.pick(LIBRARY.statement_closers)
    )
    mention = (
        f"{MENTION_PREFIX}{rng.pick(LIBRARY.fake_mentions)}{MENTION_SUFFIX}"
        if rng.chance(LIBRARY.mention_probability)
        else ""
    )
    url = f"{URL_LABEL}https://example.com/notes/{post_number}" if rng.chance(style.url) else ""
    tags = ""
    if rng.chance(style.hashtags):
        shuffled = rng.shuffle(topic.hashtags)
        tags = " ".join(shuffled[: rng.int(1, 2)])
    body = rng.pick(topic.bodies)
    return "\n".join(part for part in (body, closer, mention, url, tags) if part)
