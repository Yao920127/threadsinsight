import { describe, expect, test } from "vite-plus/test";
import type { AnalysisTask } from "../api/tasks.ts";
import {
  TASK_FAILED_MESSAGE,
  cacheNoticeText,
  formatTaipeiDateTime,
  parseTaskAction,
  renderTaskList,
} from "./taskList.ts";

function task(overrides: Partial<AnalysisTask> = {}): AnalysisTask {
  return {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    target_username: "demo_user",
    requested_count: 30,
    status: "completed",
    data_source: "mock_dataset",
    post_count: 30,
    error_message: null,
    created_at: "2026-11-19T17:20:00+00:00",
    started_at: "2026-11-19T17:20:00+00:00",
    completed_at: "2026-11-19T17:21:00+00:00",
    ...overrides,
  };
}

function actions(html: string): string[] {
  return [...html.matchAll(/data-task-action="(\w+)"/g)].map((m) => m[1]);
}

describe("formatTaipeiDateTime", () => {
  test("converts UTC to Asia/Taipei", () => {
    expect(formatTaipeiDateTime("2026-11-19T17:21:00+00:00")).toBe("2026/11/20 01:21");
  });

  test("handles invalid input", () => {
    expect(formatTaipeiDateTime("nope")).toBe("—");
  });
});

test("cacheNoticeText follows PRD wording", () => {
  expect(cacheNoticeText("2026-11-19T17:21:00+00:00")).toBe(
    "已為您載入 24 小時內的最新分析快取（更新時間：2026/11/20 01:21），點擊『重新分析』可重新計算。",
  );
});

describe("renderTaskList", () => {
  test("shows empty state", () => {
    expect(renderTaskList([], null)).toContain("還沒有分析任務");
  });

  test("completed task can be viewed, rerun and deleted", () => {
    const html = renderTaskList([task()], null);
    expect(actions(html)).toEqual(["view", "rerun", "delete"]);
    expect(html).toContain("已完成");
    expect(html).toContain("Mock Dataset 合成資料");
    expect(html).toContain("2026/11/20 01:21");
  });

  test("failed task shows PRD message and rerun", () => {
    const html = renderTaskList([task({ status: "failed", completed_at: null })], null);
    expect(actions(html)).toEqual(["rerun", "delete"]);
    expect(html).toContain(TASK_FAILED_MESSAGE);
  });

  test("in-progress task can only be deleted", () => {
    const html = renderTaskList([task({ status: "analyzing", completed_at: null })], null);
    expect(actions(html)).toEqual(["delete"]);
    expect(html).toContain("分析中");
  });

  test("marks the active task", () => {
    const html = renderTaskList([task()], "aaaaaaaa-0000-0000-0000-000000000001");
    expect(html).toContain('aria-current="true"');
  });

  test("escapes usernames", () => {
    const html = renderTaskList([task({ target_username: "<img src=x>" })], null);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

test("parseTaskAction accepts known actions only", () => {
  expect(parseTaskAction("view")).toBe("view");
  expect(parseTaskAction("delete")).toBe("delete");
  expect(parseTaskAction("drop")).toBeNull();
  expect(parseTaskAction(undefined)).toBeNull();
});
