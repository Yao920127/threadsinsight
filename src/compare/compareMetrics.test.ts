import { describe, expect, test } from "vite-plus/test";
import type { AnalysisTask } from "../api/tasks.ts";
import { generateMockDataset } from "../mock/index.ts";
import { toCleanDataset } from "../test/cleanDataset.ts";
import {
  accountLabel,
  compareCsv,
  compareFileName,
  compareJson,
  highestIndexes,
  isValidSelection,
  parseSelection,
  postsPerWeek,
  toAccountMetrics,
} from "./compareMetrics.ts";

const ID_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ID_B = "bbbbbbbb-0000-0000-0000-000000000002";

function task(id: string, username: string): AnalysisTask {
  return {
    id,
    target_username: username,
    requested_count: 30,
    status: "completed",
    data_source: "mock_dataset",
    post_count: 30,
    error_message: null,
    created_at: "2026-11-19T17:20:00+00:00",
    started_at: "2026-11-19T17:20:00+00:00",
    completed_at: "2026-11-19T17:21:00+00:00",
  };
}

const reportA = toCleanDataset(generateMockDataset("demo_user"));
const reportB = toCleanDataset(generateMockDataset("another.user", { count: 12 }));

describe("toAccountMetrics", () => {
  const metrics = toAccountMetrics(task(ID_A, "demo_user"), reportA);

  test("copies averages from the backend statistics", () => {
    expect(metrics.username).toBe("demo_user");
    expect(metrics.postCount).toBe(30);
    expect(metrics.avgLikes).toBe(reportA.stats.averages.likes);
    expect(metrics.avgReplies).toBe(reportA.stats.averages.replies);
    expect(metrics.avgReposts).toBe(reportA.stats.averages.reposts);
    expect(metrics.avgChars).toBe(reportA.stats.averages.char_count);
  });

  test("picks the most common length bucket and best post type (ties keep the first)", () => {
    const segment = (key: string, count: number, avg: number) => ({
      key,
      count,
      avg_engagement: avg,
    });
    const report = {
      ...reportA,
      stats: {
        ...reportA.stats,
        length_buckets: [
          segment("0-50", 3, 10),
          segment("51-100", 10, 10),
          segment("101-200", 10, 10),
          segment("201-400", 5, 10),
          segment("401+", 2, 10),
        ],
        post_types: [
          segment("text_only", 4, 120.04),
          segment("image", 0, 999),
          segment("link", 6, 300.26),
          segment("hashtag", 10, 300.26),
          segment("mention", 0, 0),
        ],
      },
    };
    const result = toAccountMetrics(task(ID_A, "demo_user"), report);
    expect(result.dominantLength).toBe("51-100");
    expect(result.bestType).toBe("link"); // 0 篇的 image 不算
    expect(result.bestTypeEngagement).toBe(300.3);
  });

  test("engagement rate and frequency are positive", () => {
    expect(metrics.engagementRate).toBeGreaterThan(0);
    expect(metrics.postsPerWeek).toBeGreaterThan(0);
  });
});

describe("postsPerWeek", () => {
  test("divides by the span in weeks", () => {
    expect(postsPerWeek(["2026-11-01T00:00:00+08:00", "2026-11-15T00:00:00+08:00"])).toBe(1);
  });

  test("treats a span shorter than a day as one day", () => {
    expect(postsPerWeek(["2026-11-01T09:00:00+08:00", "2026-11-01T10:00:00+08:00"])).toBe(14);
  });

  test("returns 0 without posts", () => {
    expect(postsPerWeek([])).toBe(0);
  });
});

describe("highestIndexes", () => {
  test("marks every maximum", () => {
    expect([...highestIndexes([1, 3, 3, 2])]).toEqual([1, 2]);
  });

  test("marks nothing when all values tie or too few are known", () => {
    expect(highestIndexes([2, 2]).size).toBe(0);
    expect(highestIndexes([2, null]).size).toBe(0);
  });

  test("ignores null values", () => {
    expect([...highestIndexes([null, 1, 4])]).toEqual([2]);
  });
});

describe("selection", () => {
  test("keeps valid unique ids up to four", () => {
    const ids = ["1", "2", "3", "4", "5"].map((n) => `${n.repeat(8)}-0000-0000-0000-000000000000`);
    expect(parseSelection([ID_A, ID_A, "bad", ...ids].join(","))).toEqual([
      ID_A,
      ...ids.slice(0, 3),
    ]);
    expect(parseSelection(null)).toEqual([]);
  });

  test("requires two to four", () => {
    expect([1, 2, 4, 5].map(isValidSelection)).toEqual([false, true, true, false]);
  });
});

describe("export", () => {
  const accounts = [
    toAccountMetrics(task(ID_A, "demo_user"), reportA),
    toAccountMetrics(task(ID_B, "another.user"), reportB),
  ];

  test("CSV marks every row as synthetic", () => {
    const csv = compareCsv(accounts);
    const lines = csv.trimEnd().split("\r\n");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("data_source,is_synthetic,username");
    expect(lines.slice(1).every((line) => line.startsWith("mock_dataset,true,"))).toBe(true);
  });

  test("JSON carries the mock marker and one entry per account", () => {
    const json = JSON.parse(compareJson(accounts));
    expect(json.data_source).toBe("mock_dataset");
    expect(json.is_synthetic).toBe(true);
    expect(json.accounts.map((a: { username: string }) => a.username)).toEqual([
      "demo_user",
      "another.user",
    ]);
  });

  test("file name says mock", () => {
    expect(compareFileName(accounts, "csv")).toBe(
      "threadsinsight-mock-compare-demo_user-vs-another.user.csv",
    );
  });

  test("label includes post count", () => {
    expect(accountLabel(accounts[1])).toBe("@another.user（12 篇）");
  });
});
