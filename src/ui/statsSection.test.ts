import { describe, expect, test } from "vite-plus/test";
import type { PostStats } from "../api/types.ts";
import { generateMockDataset } from "../mock/index.ts";
import { toCleanDataset } from "../test/cleanDataset.ts";
import { findPeakSlot, heatLevel, renderStatsSection, toSlots } from "./statsSection.ts";

const stats = toCleanDataset(generateMockDataset("demo_user")).stats;

function emptyMatrix(): number[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
}

describe("toSlots", () => {
  test("merges 24 hours into eight 3-hour slots per weekday", () => {
    const matrix = emptyMatrix();
    matrix[2][21] = 1;
    matrix[2][23] = 2;
    matrix[6][0] = 1;

    const slots = toSlots(matrix);

    expect(slots).toHaveLength(7);
    expect(slots.every((row) => row.length === 8)).toBe(true);
    expect(slots[2][7]).toBe(3);
    expect(slots[6][0]).toBe(1);
  });
});

describe("findPeakSlot", () => {
  test("returns the busiest cell, preferring the earliest on ties", () => {
    const slots = toSlots(emptyMatrix());
    slots[4][6] = 2;
    slots[1][3] = 2;
    expect(findPeakSlot(slots)).toEqual({ weekday: 1, slot: 3, posts: 2 });
  });

  test("returns null when there are no posts", () => {
    expect(findPeakSlot(toSlots(emptyMatrix()))).toBeNull();
  });
});

describe("heatLevel", () => {
  test.each([
    [0, 4, 0],
    [1, 4, 1],
    [2, 4, 2],
    [3, 4, 3],
    [4, 4, 4],
    [1, 1, 4],
    [0, 0, 0],
  ])("%s of max %s → level %s", (posts, max, level) => {
    expect(heatLevel(posts, max)).toBe(level);
  });
});

describe("renderStatsSection", () => {
  test("shows averages, a 7×8 heatmap and both term lists", () => {
    const html = renderStatsSection(stats);

    expect(html).toContain("平均讚");
    expect(html).toContain("1,234.5");
    expect(html.match(/<tr>/g)).toHaveLength(8); // 表頭 + 7 天
    expect(html.match(/<td class="heat-\d">/g)).toHaveLength(56);
    expect(html).toContain("最常發文：星期");
    expect(html).toContain("高頻關鍵字");
    expect(html).toContain("#職場");
  });

  test("heatmap cell counts add up to the number of posts", () => {
    const html = renderStatsSection(stats);
    const total = [...html.matchAll(/<td class="heat-\d">(\d+)<\/td>/g)].reduce(
      (sum, match) => sum + Number(match[1]),
      0,
    );
    expect(total).toBe(30);
  });

  test("shows empty states and escapes terms", () => {
    const empty: PostStats = {
      ...stats,
      weekday_hour: emptyMatrix(),
      top_hashtags: [],
      top_keywords: [{ term: "<img src=x>", posts: 1 }],
    };

    const html = renderStatsSection(empty);

    expect(html).toContain("沒有貼文使用 hashtag。");
    expect(html).toContain("沒有貼文");
    expect(html).toContain("&lt;img src=x&gt;");
    expect(html).not.toContain("<img");
  });
});
