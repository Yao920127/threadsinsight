import { describe, expect, test, vi } from "vite-plus/test";
import { generateMockDataset } from "../mock/index.ts";
import { toCleanDataset } from "../test/cleanDataset.ts";
import { ApiError } from "./envelope.ts";
import { isAnalysisTask, isInProgress, isTaskList, isTaskWithReport } from "./tasks.ts";
import {
  createTask,
  deleteTask,
  fetchTaskAiStrategy,
  getTask,
  listTasks,
  rerunTask,
} from "./tasksClient.ts";

const dataset = JSON.parse(JSON.stringify(toCleanDataset(generateMockDataset("demo_user"))));
const ID = "aaaaaaaa-0000-0000-0000-000000000001";
const task = {
  id: ID,
  target_username: "demo_user",
  requested_count: 30,
  status: "completed",
  data_source: "mock_dataset",
  post_count: 30,
  error_message: null,
  created_at: "2026-11-19T17:20:00+00:00",
  started_at: "2026-11-19T17:20:00+00:00",
  completed_at: "2026-11-19T17:21:00+00:00",
};
const withReport = { task, report: dataset, cached: false };

function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data, error: null }), { status });
}

function call(fetchImpl: ReturnType<typeof vi.fn>): [string, RequestInit] {
  return fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
}

describe("task validators", () => {
  test("accepts a well-formed task", () => {
    expect(isAnalysisTask(task)).toBe(true);
    expect(isTaskWithReport(withReport)).toBe(true);
    expect(isTaskList({ tasks: [task] })).toBe(true);
  });

  test.each([
    ["bad id", { ...task, id: "1" }],
    ["unknown status", { ...task, status: "done" }],
    ["real data source", { ...task, data_source: "scraped" }],
    ["non-integer count", { ...task, requested_count: 1.5 }],
  ])("rejects %s", (_name, value) => {
    expect(isAnalysisTask(value)).toBe(false);
  });

  test("report must be null for unfinished tasks", () => {
    const pending = { ...task, status: "analyzing", completed_at: null };
    expect(isTaskWithReport({ task: pending, report: null, cached: false })).toBe(true);
    expect(isTaskWithReport({ task: pending, report: dataset, cached: false })).toBe(false);
  });

  test("rejects a report that is not a synthetic dataset", () => {
    const real = { ...dataset, data_source: "scraped" };
    expect(isTaskWithReport({ task, report: real, cached: false })).toBe(false);
  });

  test("isInProgress", () => {
    expect(isInProgress("generating")).toBe(true);
    expect(isInProgress("completed")).toBe(false);
  });
});

describe("tasks client", () => {
  test("createTask posts JSON with the login cookie", async () => {
    const fetchImpl = vi.fn(async () => ok(withReport, 201));
    const result = await createTask(
      { username: "demo_user", count: 30, force: true },
      { fetchImpl, baseUrl: "" },
    );
    const [url, init] = call(fetchImpl);
    expect(url).toBe("/api/tasks");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      username: "demo_user",
      count: 30,
      force: true,
    });
    expect(init.credentials).toBe("same-origin");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(result.task.id).toBe(ID);
  });

  test("listTasks, getTask, rerunTask and deleteTask use the task paths", async () => {
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === "/api/tasks") return ok({ tasks: [task] });
      if (url.endsWith("/rerun") || url.endsWith(ID)) {
        return ok(fetchImpl.mock.calls.length === 4 ? { id: ID } : withReport);
      }
      return ok(null);
    });
    const options = { fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "" };

    expect((await listTasks(options)).tasks).toHaveLength(1);
    expect((await getTask(ID, options)).report?.username).toBe("demo_user");
    expect((await rerunTask(ID, options)).task.status).toBe("completed");
    expect(await deleteTask(ID, options)).toEqual({ id: ID });

    const methods = fetchImpl.mock.calls.map(([url, init]) => [url, init?.method]);
    expect(methods).toEqual([
      ["/api/tasks", "GET"],
      [`/api/tasks/${ID}`, "GET"],
      [`/api/tasks/${ID}/rerun`, "POST"],
      [`/api/tasks/${ID}`, "DELETE"],
    ]);
  });

  test("rejects a malformed task payload", async () => {
    const fetchImpl = vi.fn(async () => ok({ task: { id: "x" }, report: null, cached: false }));
    const error = await getTask(ID, { fetchImpl }).catch((e: unknown) => e);
    expect((error as ApiError).kind).toBe("invalid_response");
  });

  test("encodes the task id in the path", async () => {
    const fetchImpl = vi.fn(async () => ok(withReport));
    await getTask("../x", { fetchImpl, baseUrl: "" }).catch(() => undefined);
    expect(call(fetchImpl)[0]).toBe("/api/tasks/..%2Fx");
  });
});

describe("fetchTaskAiStrategy", () => {
  const strategy = { ...dataset.strategy, source: "llm", model: "claude-haiku-5-5" };

  test("posts to the task's AI endpoint", async () => {
    const fetchImpl = vi.fn(async () => ok(strategy));
    const result = await fetchTaskAiStrategy(ID, { fetchImpl, baseUrl: "" });
    expect(call(fetchImpl)[0]).toBe(`/api/tasks/${ID}/ai-strategy`);
    expect(call(fetchImpl)[1].method).toBe("POST");
    expect(result.model).toBe("claude-haiku-5-5");
  });

  test("adds refresh and sends the user's key in a header, never in the URL", async () => {
    const fetchImpl = vi.fn(async () => ok(strategy));
    const apiKey = `sk-ant-api03-${"a".repeat(40)}`;
    await fetchTaskAiStrategy(ID, { fetchImpl, baseUrl: "", apiKey, refresh: true });
    const [url, init] = call(fetchImpl);
    expect(url).toBe(`/api/tasks/${ID}/ai-strategy?refresh=true`);
    expect(url).not.toContain(apiKey);
    expect(init.headers).toMatchObject({ "X-User-Anthropic-Key": apiKey });
  });

  test("omits the key header when there is no key", async () => {
    const fetchImpl = vi.fn(async () => ok(strategy));
    await fetchTaskAiStrategy(ID, { fetchImpl, apiKey: null });
    expect(call(fetchImpl)[1].headers).toEqual({ Accept: "application/json" });
  });

  test("rejects a malformed strategy", async () => {
    const fetchImpl = vi.fn(async () => ok({ source: "llm", insights: "nope" }));
    const error = await fetchTaskAiStrategy(ID, { fetchImpl }).catch((e: unknown) => e);
    expect((error as ApiError).kind).toBe("invalid_response");
  });
});
