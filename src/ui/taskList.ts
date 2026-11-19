/** 任務列表（PRD F2）：狀態標籤、資料來源標記與操作按鈕。按鈕以 data-task-action 交給事件委派處理。 */
import { isInProgress, type AnalysisTask, type TaskStatus } from "../api/tasks.ts";
import { escapeHtml, formatNumber } from "./html.ts";

export const STATUS_LABELS: Readonly<Record<TaskStatus, string>> = {
  pending: "等待中",
  generating: "生成資料中",
  analyzing: "分析中",
  completed: "已完成",
  failed: "失敗",
};

/** PRD 例外情境 8 的使用者訊息。 */
export const TASK_FAILED_MESSAGE = "分析過程發生非預期錯誤，請點擊『重新執行』再試一次。";

export type TaskAction = "view" | "rerun" | "delete";

const TASK_ACTIONS: readonly TaskAction[] = ["view", "rerun", "delete"];

export function parseTaskAction(value: string | undefined): TaskAction | null {
  return TASK_ACTIONS.find((action) => action === value) ?? null;
}

const dateTimeFormat = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** 資料庫時間（UTC）→ 台北時間「2026/11/20 01:23」，不受瀏覽器時區影響。 */
export function formatTaipeiDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  // 自行組字串：各瀏覽器的 zh-TW 格式會插入不同的不可見空白
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    dateTimeFormat.formatToParts(date).find((p) => p.type === type)?.value ?? "";
  return `${part("year")}/${part("month")}/${part("day")} ${part("hour")}:${part("minute")}`;
}

/** PRD 例外情境 7 的快取提示。 */
export function cacheNoticeText(completedAt: string | null): string {
  const time = completedAt ? formatTaipeiDateTime(completedAt) : "—";
  return `已為您載入 24 小時內的最新分析快取（更新時間：${time}），點擊『重新分析』可重新計算。`;
}

function renderActions(task: AnalysisTask): string {
  const label = `@${escapeHtml(task.target_username)}`;
  const buttons: string[] = [];
  if (task.status === "completed") {
    buttons.push(
      `<button type="button" class="button-outline" data-task-action="view" aria-label="檢視 ${label} 的報告">檢視報告</button>`,
    );
  }
  if (!isInProgress(task.status)) {
    buttons.push(
      `<button type="button" class="button-outline" data-task-action="rerun" aria-label="重新執行 ${label} 的分析">重新執行</button>`,
    );
  }
  buttons.push(
    `<button type="button" class="button-outline task-delete" data-task-action="delete" aria-label="刪除 ${label} 的分析任務">刪除</button>`,
  );
  return `<div class="task-actions">${buttons.join("")}</div>`;
}

function renderTask(task: AnalysisTask, activeId: string | null): string {
  const time = task.completed_at ?? task.created_at;
  const current = task.id === activeId ? ' aria-current="true"' : "";
  const error =
    task.status === "failed" ? `<p class="task-error">${escapeHtml(TASK_FAILED_MESSAGE)}</p>` : "";
  return `
    <li class="task-card" data-task-id="${escapeHtml(task.id)}" data-status="${task.status}"${current}>
      <div class="task-main">
        <p class="task-title">@${escapeHtml(task.target_username)}
          <span class="task-count">${formatNumber(task.requested_count)} 篇</span></p>
        <p class="task-meta">
          <span class="task-status">${STATUS_LABELS[task.status]}</span>
          <time datetime="${escapeHtml(time)}">${formatTaipeiDateTime(time)}</time>
          <span class="task-source">Mock Dataset 合成資料</span>
        </p>
        ${error}
      </div>
      ${renderActions(task)}
    </li>`;
}

export function renderTaskList(tasks: readonly AnalysisTask[], activeId: string | null): string {
  if (tasks.length === 0) {
    return `<p class="task-empty">還沒有分析任務。輸入帳號開始第一次分析，結果會保存在這裡。</p>`;
  }
  return `<ul class="task-list" role="list">${tasks.map((t) => renderTask(t, activeId)).join("")}</ul>`;
}
