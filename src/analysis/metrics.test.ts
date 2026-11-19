import { describe, expect, test } from "vite-plus/test";
import { generateMockDataset } from "../mock/index.ts";
import { toCleanDataset } from "../test/cleanDataset.ts";
import { summarizePosts, weekdayOf, hourOf, type GroupedPost } from "./metrics.ts";

function post(overrides: Partial<GroupedPost>): GroupedPost {
  return {
    post_url: "mock://threads/@demo_user/post/1",
    is_synthetic: true,
    published_at: "2026-11-18T22:49:00+08:00",
    content: "內容",
    views_count: 1000,
    likes_count: 10,
    replies_count: 2,
    reposts_count: 1,
    media_type: "text_only",
    engagement_tier: "low",
    engagement_group: "low",
    post_type: "text_only",
    topic: "other",
    ...overrides,
  };
}

describe("time helpers", () => {
  test("reads hour and weekday in Asia/Taipei from the ISO string", () => {
    // 2026-11-18 是星期三
    expect(hourOf("2026-11-18T22:49:00+08:00")).toBe(22);
    expect(weekdayOf("2026-11-18T22:49:00+08:00")).toBe(3);
    expect(weekdayOf("2026-11-22T00:10:00+08:00")).toBe(0);
  });
});

describe("summarizePosts", () => {
  test("totals and averages engagement, excluding null views from view totals", () => {
    const summary = summarizePosts([
      post({ likes_count: 10, replies_count: 2, reposts_count: 1, views_count: 100 }),
      post({ likes_count: 20, replies_count: 4, reposts_count: 3, views_count: null }),
    ]);

    expect(summary.postCount).toBe(2);
    expect(summary.totalEngagement).toBe(40);
    expect(summary.avgEngagement).toBe(20);
    expect(summary.totalViews).toBe(100);
    expect(summary.hiddenViewsCount).toBe(1);
    // 只用有公開瀏覽數的貼文計算互動率：13 / 100
    expect(summary.engagementRate).toBeCloseTo(0.13);
  });

  test("engagement rate is null when no post exposes views", () => {
    expect(summarizePosts([post({ views_count: null })]).engagementRate).toBeNull();
  });

  test("ranks top posts by likes + 2 × replies, keeping original order on ties", () => {
    const posts = [
      post({ post_url: "a", likes_count: 9, replies_count: 0 }),
      post({ post_url: "b", likes_count: 0, replies_count: 5 }),
      post({ post_url: "c", likes_count: 12, replies_count: 0 }),
      post({ post_url: "d", likes_count: 5, replies_count: 0 }),
      post({ post_url: "e", likes_count: 1, replies_count: 0 }),
      post({ post_url: "f", likes_count: 12, replies_count: 0 }),
    ];
    const top = summarizePosts(posts).topPosts;

    expect(top.map((p) => p.post_url)).toEqual(["c", "f", "b", "a", "d"]);
    expect(top[0].score).toBe(12);
    expect(top[0].rank).toBe(1);
  });

  test("buckets posting time into 3-hour slots and weekdays", () => {
    const summary = summarizePosts([
      post({ published_at: "2026-11-18T22:49:00+08:00" }),
      post({ published_at: "2026-11-17T21:05:00+08:00" }),
      post({ published_at: "2026-11-16T00:30:00+08:00" }),
    ]);

    expect(summary.hourSlots).toHaveLength(8);
    expect(summary.hourSlots.find((b) => b.label === "21–23 時")?.value).toBe(2);
    expect(summary.hourSlots.find((b) => b.label === "0–2 時")?.value).toBe(1);
    expect(summary.weekdays.map((b) => b.label)).toEqual([
      "一",
      "二",
      "三",
      "四",
      "五",
      "六",
      "日",
    ]);
    expect(summary.weekdays.map((b) => b.value)).toEqual([1, 1, 1, 0, 0, 0, 0]);
  });

  test("counts percentile groups in high/medium/low order, ignoring the generator tier", () => {
    const summary = summarizePosts([
      post({ engagement_group: "low", engagement_tier: "high" }),
      post({ engagement_group: "high" }),
      post({ engagement_group: "low" }),
    ]);
    expect(summary.groups).toEqual([
      { label: "高互動", value: 1 },
      { label: "中互動", value: 0 },
      { label: "低互動", value: 2 },
    ]);
  });

  test("handles an empty list without dividing by zero", () => {
    const summary = summarizePosts([]);
    expect(summary.avgEngagement).toBe(0);
    expect(summary.topPosts).toEqual([]);
  });

  test("works on a generated dataset", () => {
    const { posts } = toCleanDataset(generateMockDataset("demo_user"));
    const summary = summarizePosts(posts);
    expect(summary.postCount).toBe(30);
    expect(summary.topPosts).toHaveLength(5);
    expect(summary.hourSlots.reduce((sum, b) => sum + b.value, 0)).toBe(30);
  });
});
