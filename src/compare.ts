import "./style.css";
import "./ui/tasks.css";
import "./ui/reportActions.css";
import "./compare/compare.css";
import { isUnauthorized, type RequestOptions } from "./api/envelope.ts";
import type { AnalysisTask } from "./api/tasks.ts";
import { getTask, listTasks } from "./api/tasksClient.ts";
import { initProtectedPage } from "./auth/protectedPage.ts";
import { handleUnauthorized } from "./auth/session.ts";
import {
  compareCsv,
  compareFileName,
  compareJson,
  isValidSelection,
  MAX_SELECTION,
  MIN_SELECTION,
  parseSelection,
  toAccountMetrics,
  type AccountMetrics,
} from "./compare/compareMetrics.ts";
import { renderComparison, renderTaskPicker } from "./compare/compareView.ts";
import { MIME_TYPES } from "./export/exportData.ts";
import { downloadText } from "./ui/download.ts";
import { escapeHtml } from "./ui/html.ts";
import { toUserMessage } from "./ui/messages.ts";

const REQUEST_TIMEOUT_MS = 15_000;

function requireElement<T extends Element>(selector: string, type: { new (): T }): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const form = requireElement("#compare-form", HTMLFormElement);
const picker = requireElement("#compare-picker", HTMLElement);
const countText = requireElement("#compare-count", HTMLElement);
const submitButton = requireElement("#compare-submit", HTMLButtonElement);
const status = requireElement("#status", HTMLElement);
const result = requireElement("#compare-result", HTMLElement);

let tasks: readonly AnalysisTask[] = [];
let selected = new Set<string>();
let accounts: readonly AccountMetrics[] = [];
let activeRequest: AbortController | null = null;

function setStatus(message: string, tone: "info" | "error" = "info"): void {
  status.dataset.tone = tone;
  status.innerHTML =
    tone === "error"
      ? `<span role="img" aria-label="錯誤">⚠</span> ${escapeHtml(message)}`
      : escapeHtml(message);
}

/** 登入狀態在 httpOnly cookie 裡，由瀏覽器自動帶上；這裡只需要逾時與取消。 */
function requestOptions(signal: AbortSignal): RequestOptions {
  return { signal };
}

function handleError(error: unknown): void {
  if (isUnauthorized(error)) {
    handleUnauthorized();
    return;
  }
  setStatus(toUserMessage(error), "error");
}

function renderPicker(): void {
  picker.innerHTML = renderTaskPicker(tasks, selected);
  picker.setAttribute("aria-busy", "false");
  countText.textContent = `已選 ${selected.size}／${MAX_SELECTION} 個（至少 ${MIN_SELECTION} 個）`;
  submitButton.disabled = !isValidSelection(selected.size);
}

function syncUrl(): void {
  const url = new URL(window.location.href);
  url.search = accounts.length > 0 ? `?tasks=${accounts.map((m) => m.taskId).join(",")}` : "";
  window.history.replaceState(null, "", url);
}

async function compare(ids: readonly string[], moveFocus: boolean): Promise<void> {
  activeRequest?.abort();
  const request = new AbortController();
  activeRequest = request;
  submitButton.disabled = true;
  result.setAttribute("aria-busy", "true");
  setStatus(`正在載入 ${ids.length} 個任務的報告…`);
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
    const options = requestOptions(signal);
    const loaded = await Promise.all(ids.map((id) => getTask(id, options)));
    if (request.signal.aborted) return;
    const metrics = loaded.flatMap((item) =>
      item.report === null ? [] : [toAccountMetrics(item.task, item.report)],
    );
    if (metrics.length !== loaded.length) {
      setStatus("所選任務中有尚未完成的任務，無法比較。", "error");
      return;
    }
    accounts = metrics;
    result.innerHTML = renderComparison(accounts);
    result.hidden = false;
    syncUrl();
    setStatus(`已比較 ${accounts.length} 個帳號。`);
    // 按鈕在載入期間停用會失去焦點；由使用者觸發時把焦點移到結果標題
    if (moveFocus) result.querySelector<HTMLElement>("#compare-result-title")?.focus();
  } catch (error) {
    if (!request.signal.aborted) handleError(error);
  } finally {
    if (activeRequest === request) {
      activeRequest = null;
      result.setAttribute("aria-busy", "false");
      submitButton.disabled = !isValidSelection(selected.size);
    }
  }
}

picker.addEventListener("change", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return;
  const next = new Set(selected);
  if (input.checked) next.add(input.value);
  else next.delete(input.value);
  selected = next;
  renderPicker();
  // 重繪後把焦點放回剛剛操作的選項，鍵盤使用者不會失去位置
  picker.querySelector<HTMLInputElement>(`input[value="${CSS.escape(input.value)}"]`)?.focus();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (isValidSelection(selected.size)) void compare([...selected], true);
});

result.addEventListener("click", (event) => {
  const button =
    event.target instanceof Element ? event.target.closest("[data-compare-export]") : null;
  if (!(button instanceof HTMLButtonElement) || accounts.length === 0) return;
  const format = button.dataset.compareExport === "json" ? "json" : "csv";
  const content = format === "csv" ? compareCsv(accounts) : compareJson(accounts);
  downloadText(compareFileName(accounts, format), content, MIME_TYPES[format]);
  setStatus(`已匯出 ${compareFileName(accounts, format)}。`);
});

async function loadTasks(): Promise<void> {
  try {
    tasks = (await listTasks(requestOptions(AbortSignal.timeout(REQUEST_TIMEOUT_MS)))).tasks;
  } catch (error) {
    picker.setAttribute("aria-busy", "false");
    picker.innerHTML = "";
    handleError(error);
    return;
  }
  // 網址 ?tasks=… 預先勾選（只保留仍存在且已完成的任務）
  const completed = new Set(tasks.filter((t) => t.status === "completed").map((t) => t.id));
  const preset = parseSelection(new URLSearchParams(window.location.search).get("tasks"));
  selected = new Set(preset.filter((id) => completed.has(id)));
  renderPicker();
  if (isValidSelection(selected.size)) void compare([...selected], false);
}

async function bootstrap(): Promise<void> {
  const session = await initProtectedPage(
    {
      account: requireElement("#account", HTMLElement),
      accountEmail: requireElement("#account-email", HTMLElement),
      signOutButton: requireElement("#sign-out", HTMLButtonElement),
    },
    (message) => setStatus(message, "error"),
  );
  if (session !== null) await loadTasks();
}

void bootstrap();
