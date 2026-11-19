/** 分析任務的型別與執行期驗證（PRD F2）。 */
import type { CleanDataset } from "./types.ts";
import { isCleanDataset, isRecord } from "./validators.ts";

export const TASK_STATUSES = ["pending", "generating", "analyzing", "completed", "failed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface AnalysisTask {
  readonly id: string;
  readonly target_username: string;
  readonly requested_count: number;
  readonly status: TaskStatus;
  readonly data_source: "mock_dataset";
  readonly post_count: number;
  readonly error_message: string | null;
  readonly created_at: string;
  readonly started_at: string;
  readonly completed_at: string | null;
}

export interface TaskWithReport {
  readonly task: AnalysisTask;
  /** 任務未完成時為 null。 */
  readonly report: CleanDataset | null;
  /** 是否命中 24 小時快取（PRD 例外情境 7）。 */
  readonly cached: boolean;
}

export interface TaskList {
  readonly tasks: readonly AnalysisTask[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isTaskId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isAnalysisTask(value: unknown): value is AnalysisTask {
  if (!isRecord(value)) return false;
  return (
    isTaskId(value.id) &&
    typeof value.target_username === "string" &&
    Number.isInteger(value.requested_count) &&
    TASK_STATUSES.includes(value.status as TaskStatus) &&
    value.data_source === "mock_dataset" &&
    Number.isInteger(value.post_count) &&
    isNullableString(value.error_message) &&
    typeof value.created_at === "string" &&
    typeof value.started_at === "string" &&
    isNullableString(value.completed_at)
  );
}

export function isTaskWithReport(value: unknown): value is TaskWithReport {
  if (!isRecord(value)) return false;
  const reportOk =
    value.report === null ||
    (isCleanDataset(value.report) &&
      isAnalysisTask(value.task) &&
      value.task.status === "completed");
  return isAnalysisTask(value.task) && reportOk && typeof value.cached === "boolean";
}

export function isTaskList(value: unknown): value is TaskList {
  return isRecord(value) && Array.isArray(value.tasks) && value.tasks.every(isAnalysisTask);
}

export function isDeleted(value: unknown): value is { readonly id: string } {
  return isRecord(value) && isTaskId(value.id);
}

export function isInProgress(status: TaskStatus): boolean {
  return status === "pending" || status === "generating" || status === "analyzing";
}
