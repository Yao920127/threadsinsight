import { describe, expect, test } from "vite-plus/test";
import type { AnalysisTask } from "../api/tasks.ts";
import type { AccountMetrics } from "./compareMetrics.ts";
import { renderComparison, renderTaskPicker } from "./compareView.ts";

function metrics(overrides: Partial<AccountMetrics>): AccountMetrics {
  return {
    taskId: "aaaaaaaa-0000-0000-0000-000000000001",
    username: "demo_user",
    postCount: 30,
    completedAt: null,
    avgLikes: 100,
    avgReplies: 10,
    avgReposts: 5,
    avgChars: 80,
    engagementRate: 0.05,
    postsPerWeek: 7,
    dominantLength: "51-100",
    bestType: "image",
    bestTypeEngagement: 150.5,
    ...overrides,
  };
}

function task(n: number, status: AnalysisTask["status"] = "completed"): AnalysisTask {
  return {
    id: `${String(n).repeat(8)}-0000-0000-0000-000000000000`,
    target_username: `user_${n}`,
    requested_count: 30,
    status,
    data_source: "mock_dataset",
    post_count: 30,
    error_message: null,
    created_at: "2026-11-19T17:20:00+00:00",
    started_at: "2026-11-19T17:20:00+00:00",
    completed_at: status === "completed" ? "2026-11-19T17:21:00+00:00" : null,
  };
}

describe("renderComparison", () => {
  const html = renderComparison([
    metrics({}),
    metrics({ username: "another.user", postCount: 12, avgLikes: 200, engagementRate: null }),
  ]);

  test("shows one column per account with post counts", () => {
    expect(html).toContain("@demo_user（30 篇）");
    expect(html).toContain("@another.user（12 篇）");
  });

  test("covers the AC-5 metrics", () => {
    for (const label of [
      "平均按讚",
      "平均回覆",
      "平均轉發",
      "平均字數",
      "最佳貼文類型",
      "互動率",
      "發文頻率",
      "主力貼文長度",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("圖片（平均互動 150.5）");
    expect(html).toContain("51–100 字");
  });

  test("marks the highest value with text, not only color", () => {
    expect(html.match(/最高<\/span>/g)).toHaveLength(1); // 只有平均按讚有差異
    expect(html).toContain("—"); // 未公開瀏覽數的互動率
  });

  test("always shows the mock disclosure and export buttons", () => {
    expect(html).toContain("示範資料（Mock Dataset）");
    expect(html).toContain('data-compare-export="csv"');
    expect(html).toContain('data-compare-export="json"');
  });

  test("escapes usernames", () => {
    expect(renderComparison([metrics({ username: "<b>x" }), metrics({})])).not.toContain("<b>x");
  });
});

describe("renderTaskPicker", () => {
  test("lists only completed tasks", () => {
    const html = renderTaskPicker([task(1), task(2), task(3, "failed")], new Set());
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).not.toContain("user_3");
  });

  test("asks for more tasks when fewer than two are completed", () => {
    expect(renderTaskPicker([task(1), task(2, "analyzing")], new Set())).toContain("至少 2 個");
  });

  test("disables unchecked options once four are selected", () => {
    const tasks = [1, 2, 3, 4, 5].map((n) => task(n));
    const html = renderTaskPicker(tasks, new Set(tasks.slice(0, 4).map((t) => t.id)));
    expect(html.match(/ checked/g)).toHaveLength(4);
    expect(html.match(/ disabled/g)).toHaveLength(1);
  });
});
