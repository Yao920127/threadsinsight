/** 由貼文計算儀表板指標。純函式，不碰 DOM，方便測試。 */
import type { EngagementGroup, PostType, Topic } from "../api/types.ts";
import type { MockPost } from "../mock/types.ts";

/** 已由後端依分數百分位分群的貼文。 */
export interface GroupedPost extends MockPost {
  readonly engagement_group: EngagementGroup;
  readonly post_type: PostType;
  readonly topic: Topic;
}

export interface Bucket {
  readonly label: string;
  readonly value: number;
  /** 標籤下方的補充文字，例如該區間的篇數。 */
  readonly detail?: string;
}

export interface RankedPost extends GroupedPost {
  readonly rank: number;
  /** PRD 加權互動分：likes + 2 × replies */
  readonly score: number;
}

export interface Summary {
  readonly postCount: number;
  readonly totalEngagement: number;
  readonly avgEngagement: number;
  readonly totalViews: number;
  readonly hiddenViewsCount: number;
  /** 有公開瀏覽數之貼文的（讚+回覆+轉發）/ 瀏覽數；全部未公開時為 null */
  readonly engagementRate: number | null;
  readonly hourSlots: readonly Bucket[];
  readonly weekdays: readonly Bucket[];
  /** 互動分群（前 30%／中 40%／後 30%）各組篇數 */
  readonly groups: readonly Bucket[];
  readonly topPosts: readonly RankedPost[];
}

const TOP_POST_LIMIT = 5;
const HOURS_PER_SLOT = 3;
const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"] as const;
export const GROUP_LABELS: Record<EngagementGroup, string> = {
  high: "高互動",
  medium: "中互動",
  low: "低互動",
};

/** published_at 已是 +08:00，直接讀字串即可得到台北時間，不受瀏覽器時區影響。 */
export function hourOf(publishedAt: string): number {
  return Number(publishedAt.slice(11, 13));
}

/** 0 = 星期日 … 6 = 星期六（台北時間）。 */
export function weekdayOf(publishedAt: string): number {
  const [year, month, day] = publishedAt.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function engagementOf(post: MockPost): number {
  return post.likes_count + post.replies_count + post.reposts_count;
}

function scoreOf(post: MockPost): number {
  return post.likes_count + 2 * post.replies_count;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function countBy<K extends string | number>(keys: readonly K[], order: readonly K[]): number[] {
  return order.map((key) => keys.filter((k) => k === key).length);
}

function buildHourSlots(posts: readonly MockPost[]): Bucket[] {
  const slotOf = posts.map((p) => Math.floor(hourOf(p.published_at) / HOURS_PER_SLOT));
  const slots = Array.from({ length: 24 / HOURS_PER_SLOT }, (_, i) => i);
  return countBy(slotOf, slots).map((value, i) => ({
    label: `${i * HOURS_PER_SLOT}–${i * HOURS_PER_SLOT + HOURS_PER_SLOT - 1} 時`,
    value,
  }));
}

function buildWeekdays(posts: readonly MockPost[]): Bucket[] {
  // 以星期一開頭：(getUTCDay + 6) % 7
  const indexOf = posts.map((p) => (weekdayOf(p.published_at) + 6) % 7);
  return countBy(indexOf, [0, 1, 2, 3, 4, 5, 6]).map((value, i) => ({
    label: WEEKDAY_LABELS[i],
    value,
  }));
}

function buildTopPosts(posts: readonly GroupedPost[]): RankedPost[] {
  return posts
    .map((post, index) => ({ post, index, score: scoreOf(post) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, TOP_POST_LIMIT)
    .map(({ post, score }, i) => ({ ...post, score, rank: i + 1 }));
}

export function summarizePosts(posts: readonly GroupedPost[]): Summary {
  const engagements = posts.map(engagementOf);
  const withViews = posts.filter((p) => p.views_count !== null);
  const totalViews = sum(withViews.map((p) => p.views_count ?? 0));

  return {
    postCount: posts.length,
    totalEngagement: sum(engagements),
    avgEngagement: Math.round(average(engagements)),
    totalViews,
    hiddenViewsCount: posts.length - withViews.length,
    engagementRate: totalViews > 0 ? sum(withViews.map(engagementOf)) / totalViews : null,
    hourSlots: buildHourSlots(posts),
    weekdays: buildWeekdays(posts),
    groups: (Object.keys(GROUP_LABELS) as EngagementGroup[]).map((group) => ({
      label: GROUP_LABELS[group],
      value: posts.filter((p) => p.engagement_group === group).length,
    })),
    topPosts: buildTopPosts(posts),
  };
}
