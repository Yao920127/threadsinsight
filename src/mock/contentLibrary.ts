/**
 * 通用社群範例主題庫（職場、生活、科技、觀點）。
 * 資料放在 shared/mock-content-library.json，TS 與 Python 產生器共用同一份。
 * 內容刻意中性、泛用，不模仿任何真實帳號的語氣（Mock Dataset 規則 4）。
 * 提及與連結只使用明顯虛構的帳號與保留網域 example.com。
 */
import library from "../../shared/mock-content-library.json" with { type: "json" };
import type { EngagementTier } from "./types.ts";
import type { Random } from "./random.ts";

interface Topic {
  readonly bodies: readonly string[];
  readonly hashtags: readonly string[];
}

interface TierStyle {
  readonly question: number;
  readonly url: number;
  readonly hashtags: number;
}

const TOPICS: readonly Topic[] = library.topics;
const QUESTION_CLOSERS: readonly string[] = library.question_closers;
const STATEMENT_CLOSERS: readonly string[] = library.statement_closers;
const FAKE_MENTIONS: readonly string[] = library.fake_mentions;
const MENTION_PROBABILITY: number = library.mention_probability;
/** 依互動層級調整內容特徵的機率，讓後續 NLP 分群能找到可解釋的差異。 */
const TIER_STYLE: Record<EngagementTier, TierStyle> = library.tier_style;

/**
 * 注意：亂數的呼叫順序就是輸出的一部分。Python 版（api/threadsinsightapi/content.py）
 * 必須以完全相同的順序呼叫，否則跨語言黃金檔測試會失敗。
 */
export function composeContent(rng: Random, tier: EngagementTier, postNumber: number): string {
  const topic = rng.pick(TOPICS);
  const style = TIER_STYLE[tier];
  const closer = rng.chance(style.question)
    ? rng.pick(QUESTION_CLOSERS)
    : rng.pick(STATEMENT_CLOSERS);
  const mention = rng.chance(MENTION_PROBABILITY) ? `謝謝 ${rng.pick(FAKE_MENTIONS)} 的提醒。` : "";
  const url = rng.chance(style.url) ? `延伸閱讀：https://example.com/notes/${postNumber}` : "";
  const tags = rng.chance(style.hashtags)
    ? rng.shuffle(topic.hashtags).slice(0, rng.int(1, 2)).join(" ")
    : "";
  return [rng.pick(topic.bodies), closer, mention, url, tags]
    .filter((part) => part.length > 0)
    .join("\n");
}
