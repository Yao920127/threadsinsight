/** 分析任務 API（/api/tasks…）。所有請求都帶登入 token，後端以使用者身分存取資料庫。 */
import { requestEnvelope, type RequestOptions } from "./envelope.ts";
import {
  isDeleted,
  isTaskList,
  isTaskWithReport,
  type TaskList,
  type TaskWithReport,
} from "./tasks.ts";
import type { StrategyResult } from "./types.ts";
import { isStrategy } from "./validators.ts";

export const USER_KEY_HEADER = "X-User-Anthropic-Key";

const INVALID_TASK = "Payload is not an analysis task";

function taskPath(id: string, suffix = ""): string {
  return `/api/tasks/${encodeURIComponent(id)}${suffix}`;
}

export interface CreateTaskInput {
  readonly username: string;
  readonly count: number;
  /** 「強制重新分析」：忽略 24 小時快取。 */
  readonly force: boolean;
}

export function createTask(input: CreateTaskInput, options: RequestOptions = {}) {
  return requestEnvelope<TaskWithReport>(
    {
      method: "POST",
      path: "/api/tasks",
      body: input,
      validate: isTaskWithReport,
      invalidMessage: INVALID_TASK,
    },
    options,
  );
}

export function listTasks(options: RequestOptions = {}) {
  return requestEnvelope<TaskList>(
    { path: "/api/tasks", validate: isTaskList, invalidMessage: "Payload is not a task list" },
    options,
  );
}

export function getTask(id: string, options: RequestOptions = {}) {
  return requestEnvelope<TaskWithReport>(
    { path: taskPath(id), validate: isTaskWithReport, invalidMessage: INVALID_TASK },
    options,
  );
}

export function rerunTask(id: string, options: RequestOptions = {}) {
  return requestEnvelope<TaskWithReport>(
    {
      method: "POST",
      path: taskPath(id, "/rerun"),
      validate: isTaskWithReport,
      invalidMessage: INVALID_TASK,
    },
    options,
  );
}

export function deleteTask(id: string, options: RequestOptions = {}) {
  return requestEnvelope<{ readonly id: string }>(
    {
      method: "DELETE",
      path: taskPath(id),
      validate: isDeleted,
      invalidMessage: "Unexpected delete response",
    },
    options,
  );
}

export interface AiStrategyOptions extends RequestOptions {
  /** 使用者在網頁輸入的金鑰；以標頭送出（不放網址，避免進入瀏覽紀錄與伺服器日誌）。 */
  readonly apiKey?: string | null;
  /** 忽略已存的 AI 建議重新產生（例如換了金鑰）。 */
  readonly refresh?: boolean;
}

/** Claude Haiku 5.5 建議；伺服器失敗時仍回 200 與規則引擎結果（source = rule_engine）。 */
export function fetchTaskAiStrategy(id: string, options: AiStrategyOptions = {}) {
  return requestEnvelope<StrategyResult>(
    {
      method: "POST",
      path: taskPath(id, options.refresh ? "/ai-strategy?refresh=true" : "/ai-strategy"),
      headers: options.apiKey ? { [USER_KEY_HEADER]: options.apiKey } : {},
      validate: isStrategy,
      invalidMessage: "Payload is not a strategy result",
    },
    options,
  );
}
