/**
 * 多帳號比較（PRD F5、AC-5）：把 2～4 個已完成任務的報告整理成可並排比較的指標。純函式，不碰 DOM。
 */
import { summarizePosts } from "../analysis/metrics.ts";
import { isTaskId, type AnalysisTask } from "../api/tasks.ts";
import type { CleanDataset, PostType, SegmentStats } from "../api/types.ts";
import { toCsvCell, UTF8_BOM } from "../export/exportData.ts";

export const MIN_SELECTION = 2;
export const MAX_SELECTION = 4;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;

export interface AccountMetrics {
  readonly taskId: string;
  readonly username: string;
  readonly postCount: number;
  readonly completedAt: string | null;
  readonly avgLikes: number;
  readonly avgReplies: number;
  readonly avgReposts: number;
  readonly avgChars: number;
  /** 有公開瀏覽數之貼文的（讚+回覆+轉發）/ 瀏覽數；全部未公開時為 null。 */
  readonly engagementRate: number | null;
  /** 每週發文篇數：篇數 ÷ 最早到最晚發文的週數（不足 1 天以 1 天計）。 */
  readonly postsPerWeek: number;
  /** 篇數最多的字數區間（主力貼文長度）。 */
  readonly dominantLength: string | null;
  /** 平均互動數最高的貼文類型。 */
  readonly bestType: PostType | null;
  readonly bestTypeEngagement: number | null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 依 key 取最大值的區段；同分取排列在前者（與報告頁 bestPostType 一致）。 */
function maxBy(
  segments: readonly SegmentStats[],
  value: (s: SegmentStats) => number,
): SegmentStats | null {
  return segments
    .filter((segment) => segment.count > 0)
    .reduce<SegmentStats | null>(
      (top, segment) => (top === null || value(segment) > value(top) ? segment : top),
      null,
    );
}

export function postsPerWeek(publishedAt: readonly string[]): number {
  if (publishedAt.length === 0) return 0;
  const times = publishedAt.map((iso) => new Date(iso).getTime());
  const spanDays = Math.max((Math.max(...times) - Math.min(...times)) / DAY_MS, 1);
  return round1((publishedAt.length / spanDays) * DAYS_PER_WEEK);
}

export function toAccountMetrics(task: AnalysisTask, report: CleanDataset): AccountMetrics {
  const { averages, length_buckets, post_types } = report.stats;
  const bestType = maxBy(post_types, (s) => s.avg_engagement);
  return {
    taskId: task.id,
    username: report.username,
    postCount: report.posts.length,
    completedAt: task.completed_at,
    avgLikes: averages.likes,
    avgReplies: averages.replies,
    avgReposts: averages.reposts,
    avgChars: averages.char_count,
    engagementRate: summarizePosts(report.posts).engagementRate,
    postsPerWeek: postsPerWeek(report.posts.map((post) => post.published_at)),
    dominantLength: maxBy(length_buckets, (s) => s.count)?.key ?? null,
    bestType: (bestType?.key as PostType | undefined) ?? null,
    bestTypeEngagement: bestType ? round1(bestType.avg_engagement) : null,
  };
}

/** 數值列中最高者的位置；全部相同或少於 2 個有效值時不標示。 */
export function highestIndexes(values: readonly (number | null)[]): ReadonlySet<number> {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length < 2 || new Set(valid).size === 1) return new Set();
  const max = Math.max(...valid);
  return new Set(values.flatMap((v, i) => (v === max ? [i] : [])));
}

/** 網址 ?tasks=a,b,c：只留合法、不重複的任務 ID，最多 4 個。 */
export function parseSelection(raw: string | null): string[] {
  const ids = (raw ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(isTaskId);
  return [...new Set(ids)].slice(0, MAX_SELECTION);
}

export function isValidSelection(count: number): boolean {
  return count >= MIN_SELECTION && count <= MAX_SELECTION;
}

/** 欄位標題：同一帳號可能有不同篇數的任務，一律附上篇數。 */
export function accountLabel(metrics: Pick<AccountMetrics, "username" | "postCount">): string {
  return `@${metrics.username}（${metrics.postCount} 篇）`;
}

type ExportValue = string | number | boolean | null;

const EXPORT_FIELDS: readonly (readonly [string, (m: AccountMetrics) => ExportValue])[] = [
  ["username", (m) => m.username],
  ["post_count", (m) => m.postCount],
  ["avg_likes", (m) => m.avgLikes],
  ["avg_replies", (m) => m.avgReplies],
  ["avg_reposts", (m) => m.avgReposts],
  ["avg_char_count", (m) => m.avgChars],
  [
    "engagement_rate",
    (m) => (m.engagementRate === null ? null : round1(m.engagementRate * 1000) / 1000),
  ],
  ["posts_per_week", (m) => m.postsPerWeek],
  ["dominant_length_bucket", (m) => m.dominantLength],
  ["best_post_type", (m) => m.bestType],
  ["best_post_type_avg_engagement", (m) => m.bestTypeEngagement],
  ["task_id", (m) => m.taskId],
  ["completed_at", (m) => m.completedAt],
];

/** 每個帳號一列；每列都標明 data_source 與 is_synthetic（Mock Dataset 規則 2）。 */
export function compareCsv(accounts: readonly AccountMetrics[]): string {
  const header = ["data_source", "is_synthetic", ...EXPORT_FIELDS.map(([name]) => name)];
  const rows = accounts.map((m) => [
    "mock_dataset",
    true,
    ...EXPORT_FIELDS.map(([, read]) => read(m)),
  ]);
  const lines = [header, ...rows].map((row) => row.map(toCsvCell).join(","));
  return `${UTF8_BOM}${lines.join("\r\n")}\r\n`;
}

export function compareJson(accounts: readonly AccountMetrics[]): string {
  const payload = {
    data_source: "mock_dataset",
    is_synthetic: true,
    accounts: accounts.map((m) =>
      Object.fromEntries(EXPORT_FIELDS.map(([name, read]) => [name, read(m)])),
    ),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** 檔名標明 mock，避免被當成真實帳號資料。username 已正規化為 [a-z0-9._]。 */
export function compareFileName(
  accounts: readonly AccountMetrics[],
  format: "csv" | "json",
): string {
  return `threadsinsight-mock-compare-${accounts.map((m) => m.username).join("-vs-")}.${format}`;
}
