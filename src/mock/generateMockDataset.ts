import { composeContent } from "./contentLibrary.ts";
import { normalizeUsername } from "./normalizeUsername.ts";
import { blockPattern, createRandom, hashSeed, pickWeighted, type Random } from "./random.ts";
import type { EngagementTier, GenerateOptions, MediaType, MockDataset, MockPost } from "./types.ts";

export const DEFAULT_POST_COUNT = 30;
export const MIN_POST_COUNT = 1;
export const MAX_POST_COUNT = 50;
export const SOURCE_NOTE =
  "Scraping blocked (HTTP 401 on graphql/query) & official API unavailable; using deterministic Mock Dataset";

/**
 * 發文時間的固定錨點（Asia/Taipei 當日 00:00）。
 * 為了符合「同帳號每次生成完全相同」，時間不隨執行當下變動。
 */
const ANCHOR_MS = Date.parse("2026-11-19T00:00:00+08:00");
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const TAIPEI_OFFSET_MS = 8 * HOUR_MS;
const POSTING_WINDOW_DAYS = 80;
const MAX_CONTENT_ATTEMPTS = 25;

/** 模擬真實發文習慣：午休與晚間較多，深夜較少。 */
const HOUR_WEIGHTS: readonly (readonly [number, number])[] = [
  [7, 2],
  [8, 4],
  [9, 3],
  [10, 2],
  [11, 3],
  [12, 6],
  [13, 4],
  [14, 2],
  [15, 2],
  [16, 2],
  [17, 3],
  [18, 4],
  [19, 5],
  [20, 7],
  [21, 8],
  [22, 7],
  [23, 4],
  [0, 2],
  [1, 1],
];

const TIER_RANGES: Record<EngagementTier, { likes: [number, number]; replies: [number, number] }> =
  {
    high: { likes: [900, 3200], replies: [60, 400] },
    medium: { likes: [150, 600], replies: [12, 55] },
    low: { likes: [3, 80], replies: [0, 10] },
  };

export function toTaipeiIso(date: Date): string {
  const shifted = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  const iso = shifted.toISOString().slice(0, 19);
  return `${iso}+08:00`;
}

function validateCount(count: number): number {
  if (!Number.isInteger(count) || count < MIN_POST_COUNT || count > MAX_POST_COUNT) {
    throw new RangeError(
      `count must be an integer between ${MIN_POST_COUNT} and ${MAX_POST_COUNT}, got ${count}`,
    );
  }
  return count;
}

function buildTimestamps(rng: Random, total: number): string[] {
  const dayOffsets = rng
    .shuffle(Array.from({ length: POSTING_WINDOW_DAYS }, (_, day) => day))
    .slice(0, total)
    .sort((a, b) => a - b);
  return dayOffsets.map((day) => {
    // 0、1 點視為當晚延續（隔日凌晨），讓同一「發文日」的時間區間不與相鄰日重疊
    const hour = pickWeighted(rng, HOUR_WEIGHTS);
    const hourOfDay = hour < 7 ? hour + 24 : hour;
    const startOfDay = ANCHOR_MS - (day + 1) * DAY_MS;
    const ms = startOfDay + hourOfDay * HOUR_MS + rng.int(0, 59) * 60_000;
    return toTaipeiIso(new Date(ms));
  });
}

function buildEngagement(rng: Random, tier: EngagementTier, hideViews: boolean) {
  const range = TIER_RANGES[tier];
  const likes = rng.int(...range.likes);
  return {
    likes_count: likes,
    replies_count: rng.int(...range.replies),
    reposts_count: Math.round((likes * rng.int(1, 8)) / 100),
    views_count: hideViews ? null : likes * rng.int(12, 40),
  };
}

function buildUniqueContents(rng: Random, tiers: readonly EngagementTier[]): string[] {
  return tiers.reduce<string[]>((contents, tier, index) => {
    const seen = new Set(contents);
    let candidate = composeContent(rng, tier, index + 1);
    for (let attempt = 0; seen.has(candidate) && attempt < MAX_CONTENT_ATTEMPTS; attempt++) {
      candidate = composeContent(rng, tier, index + 1);
    }
    const unique = seen.has(candidate) ? `${candidate}\n（第 ${index + 1} 則）` : candidate;
    return [...contents, unique];
  }, []);
}

/**
 * 依 threadsinsightapi Mock Dataset 規則，以正規化後的 username 為種子確定性產生合成貼文。
 * 一律生成 MAX_POST_COUNT 篇再截取，確保較少篇數的結果是較多篇數的前綴。
 */
export function generateMockDataset(input: string, options: GenerateOptions = {}): MockDataset {
  const username = normalizeUsername(input);
  const count = validateCount(options.count ?? DEFAULT_POST_COUNT);
  const now = options.now ?? (() => new Date());
  const rng = createRandom(hashSeed(`threadsinsight:${username}`));

  const tiers = blockPattern<EngagementTier>(rng, MAX_POST_COUNT, [
    ["high", 3],
    ["medium", 4],
    ["low", 3],
  ]);
  const hiddenViews = blockPattern<boolean>(rng, MAX_POST_COUNT, [
    [true, rng.int(1, 2)],
    [false, 8],
  ]);
  const mediaTypes = blockPattern<MediaType>(rng, MAX_POST_COUNT, [
    ["image", 4],
    ["text_only", 6],
  ]);
  const timestamps = buildTimestamps(rng, MAX_POST_COUNT);
  const contents = buildUniqueContents(rng, tiers);

  const posts = tiers.slice(0, count).map((tier, index): MockPost =>
    Object.freeze({
      post_url: `mock://threads/@${username}/post/${index + 1}`,
      is_synthetic: true,
      published_at: timestamps[index],
      content: contents[index],
      ...buildEngagement(rng, tier, hiddenViews[index]),
      media_type: mediaTypes[index],
      engagement_tier: tier,
    }),
  );

  return Object.freeze({
    data_source: "mock_dataset",
    source_note: SOURCE_NOTE,
    generated_at: toTaipeiIso(now()),
    username,
    posts: Object.freeze(posts),
  });
}
