import "./style.css";
import "./ui/stats.css";
import "./ui/reportActions.css";
import "./ui/attribution.css";
import "./ui/strategy.css";
import "./ui/aiSettings.css";
import "./ui/tasks.css";
import { clearUserKey, getUserKey, maskKey, saveUserKey } from "./ai/userKey.ts";
import { isUnauthorized, type RequestOptions } from "./api/envelope.ts";
import { isTaskId, type AnalysisTask, type TaskWithReport } from "./api/tasks.ts";
import {
  createTask,
  deleteTask,
  fetchTaskAiStrategy,
  getTask,
  listTasks,
  rerunTask,
} from "./api/tasksClient.ts";
import type { CleanDataset, StrategyResult } from "./api/types.ts";
import { initProtectedPage } from "./auth/protectedPage.ts";
import { handleUnauthorized } from "./auth/session.ts";
import {
  exportContent,
  exportFileName,
  MIME_TYPES,
  type ExportFormat,
} from "./export/exportData.ts";
import { summarizePosts } from "./analysis/metrics.ts";
import { initFormValidation } from "./ui/formValidation.ts";
import { escapeHtml } from "./ui/html.ts";
import { toUserMessage } from "./ui/messages.ts";
import { downloadText } from "./ui/download.ts";
import { applyBarRatios, renderReport } from "./ui/report.ts";
import {
  AI_ERROR_NOTICE,
  AI_TIMEOUT_NOTICE,
  renderStrategySection,
  AI_STATUS_ID,
  aiStatusText,
  renderAiStatus,
  STRATEGY_SECTION_ID,
  type StrategyState,
} from "./ui/strategySection.ts";
import { cacheNoticeText, type TaskAction } from "./ui/taskList.ts";
import { initTaskPanel } from "./ui/taskPanel.ts";

const REQUEST_TIMEOUT_MS = 15_000;
/** 伺服器端 LLM：30 秒逾時、最多重試 2 次（約 95 秒），前端多留一點緩衝。 */
const AI_TIMEOUT_MS = 100_000;

function requireElement<T extends Element>(selector: string, type: { new (): T }): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

const form = requireElement("#analyze-form", HTMLFormElement);
const usernameInput = requireElement("#username", HTMLInputElement);
const countInput = requireElement("#count", HTMLInputElement);
const forceInput = requireElement("#force", HTMLInputElement);
const submitButton = requireElement("#analyze-submit", HTMLButtonElement);
const status = requireElement("#status", HTMLElement);
const cacheNotice = requireElement("#cache-notice", HTMLElement);
const cacheNoticeTextEl = requireElement("#cache-notice-text", HTMLElement);
const cacheRerun = requireElement("#cache-rerun", HTMLButtonElement);
const report = requireElement("#report", HTMLElement);
const announcer = requireElement("#form-announcer", HTMLElement);
const aiKeyForm = requireElement("#ai-key-form", HTMLFormElement);
const aiKeyInput = requireElement("#ai-key", HTMLInputElement);
const aiKeyClear = requireElement("#ai-key-clear", HTMLButtonElement);
const aiKeyStatus = requireElement("#ai-key-status", HTMLElement);
const account = requireElement("#account", HTMLElement);
const accountEmail = requireElement("#account-email", HTMLElement);
const signOutButton = requireElement("#sign-out", HTMLButtonElement);

/** 建立／檢視／重跑任務的請求；新操作開始時取消舊的，避免舊結果蓋掉新報告。 */
let activeRequest: AbortController | null = null;
/** AI 建議的請求；換報告時一併取消。 */
let activeAi: AbortController | null = null;
/** 目前報告對應的資料，供匯出使用；匯出的內容與畫面完全一致。 */
let currentDataset: CleanDataset | null = null;
/** AI 失敗或重新產生時退回的策略（報告載入時的版本）。 */
let baseStrategy: StrategyResult | null = null;
let currentTask: AnalysisTask | null = null;
let tasks: readonly AnalysisTask[] = [];

const taskPanel = initTaskPanel(
  {
    list: requireElement("#task-list", HTMLElement),
    dialog: requireElement("#delete-dialog", HTMLDialogElement),
    dialogText: requireElement("#delete-description", HTMLElement),
  },
  (action, task) => void onTaskAction(action, task),
);

function setStatus(message: string, tone: "info" | "error" = "info"): void {
  status.dataset.tone = tone;
  status.innerHTML =
    tone === "error"
      ? `<span role="img" aria-label="錯誤">⚠</span> ${escapeHtml(message)}`
      : escapeHtml(message);
}

function showCacheNotice(task: AnalysisTask | null): void {
  cacheNotice.hidden = task === null;
  cacheNoticeTextEl.textContent = task ? cacheNoticeText(task.completed_at) : "";
}

function setLoading(loading: boolean): void {
  submitButton.disabled = loading;
  submitButton.textContent = loading ? "分析中…" : "開始分析";
  cacheRerun.disabled = loading;
  report.setAttribute("aria-busy", String(loading));
  taskPanel.setBusy(loading);
}

/** 網址記錄目前任務（?task=…），重新整理或分享給自己的其他裝置都能回到同一份報告。 */
function syncUrl(taskId: string | null): void {
  const url = new URL(window.location.href);
  url.search = taskId ? new URLSearchParams({ task: taskId }).toString() : "";
  window.history.replaceState(null, "", url);
}

/** 登入狀態在 httpOnly cookie 裡，由瀏覽器自動帶上；這裡只需要逾時與取消。 */
function requestOptions(signal?: AbortSignal): RequestOptions {
  return { signal };
}

function renderTasks(): void {
  taskPanel.render(tasks, currentTask?.id ?? null);
}

async function refreshTasks(): Promise<void> {
  try {
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    tasks = (await listTasks(requestOptions(signal))).tasks;
    renderTasks();
  } catch (error) {
    if (isUnauthorized(error)) handleUnauthorized();
    else setStatus(toUserMessage(error), "error");
  } finally {
    if (activeRequest === null) taskPanel.setBusy(false);
  }
}

function replaceStrategy(strategy: StrategyResult, state: StrategyState = "settled"): void {
  if (currentDataset === null) return;
  currentDataset = { ...currentDataset, strategy };
  const fragment = (html: string) => document.createRange().createContextualFragment(html);
  report
    .querySelector(`#${STRATEGY_SECTION_ID}`)
    ?.replaceWith(fragment(renderStrategySection(strategy, state)));
  report.querySelector(`#${AI_STATUS_ID}`)?.replaceWith(fragment(renderAiStatus(strategy, state)));
  showKeyStatus(aiStatusText(strategy, state));
}

function withNotice(strategy: StrategyResult, notice: string): StrategyResult {
  return { ...strategy, notice: strategy.notice ? `${notice} ${strategy.notice}` : notice };
}

/** 報告顯示後在背景取得 AI 建議；成功結果由後端存回任務，失敗時保留原策略並加註原因。 */
async function loadAiStrategy(taskId: string, refresh: boolean): Promise<void> {
  activeAi?.abort();
  const request = new AbortController();
  activeAi = request;
  const fallbackBase = baseStrategy;
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(AI_TIMEOUT_MS)]);
    const strategy = await fetchTaskAiStrategy(taskId, {
      ...requestOptions(signal),
      apiKey: getUserKey(),
      refresh,
    });
    if (!request.signal.aborted) replaceStrategy(strategy);
  } catch (error) {
    if (isUnauthorized(error)) {
      handleUnauthorized();
      return;
    }
    if (request.signal.aborted || fallbackBase === null) return;
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    replaceStrategy(withNotice(fallbackBase, timedOut ? AI_TIMEOUT_NOTICE : AI_ERROR_NOTICE));
  }
}

function showReport(result: TaskWithReport, loaded: boolean): void {
  currentTask = result.task;
  syncUrl(result.task.id);
  renderTasks();
  const dataset = result.report;
  if (dataset === null) {
    report.hidden = true;
    currentDataset = null;
    showCacheNotice(null);
    setStatus("這個任務尚未完成，沒有可顯示的報告。");
    return;
  }
  currentDataset = dataset;
  baseStrategy = dataset.strategy;
  report.innerHTML = renderReport(dataset, summarizePosts(dataset.posts));
  applyBarRatios(report);
  report.hidden = false;
  showCacheNotice(result.cached ? result.task : null);
  const { input_count, output_count } = dataset.cleaning;
  setStatus(
    result.cached || loaded
      ? `已載入 @${dataset.username} 的${result.cached ? "快取" : ""}報告（${output_count} 篇合成貼文）。`
      : `已生成並清理 ${output_count}/${input_count} 篇 @${dataset.username} 的合成貼文。`,
  );
  // 已存過 AI 建議就直接顯示，不再呼叫（費用由使用者或伺服器金鑰支付）
  if (dataset.strategy.source === "llm") replaceStrategy(dataset.strategy);
  else void loadAiStrategy(result.task.id, false);
}

/** 共用流程：取消前一個請求、顯示載入中、處理錯誤，完成後更新任務列表。 */
async function runTaskRequest(
  pending: string,
  send: (options: RequestOptions) => Promise<TaskWithReport>,
  loaded = false,
): Promise<void> {
  activeRequest?.abort();
  activeAi?.abort();
  const request = new AbortController();
  activeRequest = request;
  setLoading(true);
  setStatus(pending);
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
    const result = await send(requestOptions(signal));
    if (!request.signal.aborted) showReport(result, loaded);
  } catch (error) {
    if (request.signal.aborted) return; // 被新請求取代的舊請求直接忽略
    if (isUnauthorized(error)) {
      handleUnauthorized();
      return;
    }
    setStatus(toUserMessage(error), "error");
  } finally {
    if (activeRequest === request) {
      activeRequest = null;
      setLoading(false);
      void refreshTasks();
    }
  }
}

function runAnalysis(username: string, count: number, force: boolean): Promise<void> {
  return runTaskRequest(`正在分析 ${username}…`, (options) =>
    createTask({ username, count, force }, options),
  );
}

function openTask(task: AnalysisTask): Promise<void> {
  return runTaskRequest(
    `正在載入 @${task.target_username} 的報告…`,
    (options) => getTask(task.id, options),
    true,
  );
}

function rerun(task: AnalysisTask): Promise<void> {
  return runTaskRequest(`正在重新分析 @${task.target_username}…`, (options) =>
    rerunTask(task.id, options),
  );
}

async function remove(task: AnalysisTask): Promise<void> {
  taskPanel.setBusy(true);
  try {
    await deleteTask(task.id, requestOptions(AbortSignal.timeout(REQUEST_TIMEOUT_MS)));
    if (currentTask?.id === task.id) {
      activeAi?.abort();
      currentTask = null;
      currentDataset = null;
      report.hidden = true;
      report.innerHTML = "";
      showCacheNotice(null);
      syncUrl(null);
    }
    setStatus(`已刪除 @${task.target_username} 的分析任務。`);
  } catch (error) {
    if (isUnauthorized(error)) {
      handleUnauthorized();
      return;
    }
    setStatus(toUserMessage(error), "error");
  }
  await refreshTasks();
}

function onTaskAction(action: TaskAction, task: AnalysisTask): Promise<void> {
  if (action === "view") return openTask(task);
  if (action === "rerun") return rerun(task);
  return remove(task);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void runAnalysis(usernameInput.value.trim(), countInput.valueAsNumber, forceInput.checked);
  forceInput.checked = false; // 強制重跑只套用這一次
});

cacheRerun.addEventListener("click", () => {
  if (currentTask) void rerun(currentTask);
});

function isExportFormat(value: string | undefined): value is ExportFormat {
  return value === "csv" || value === "json";
}

// 報告以 innerHTML 重繪，用事件委派處理匯出按鈕
report.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-export]") : null;
  if (!(button instanceof HTMLButtonElement) || currentDataset === null) return;
  const format = button.dataset.export;
  if (!isExportFormat(format)) return;
  try {
    downloadText(
      exportFileName(currentDataset, format),
      exportContent(currentDataset, format),
      MIME_TYPES[format],
    );
    setStatus(`已匯出 ${exportFileName(currentDataset, format)}。`);
  } catch {
    setStatus("匯出失敗，請重新整理後再試一次。", "error");
  }
});

initFormValidation(form, announcer);
initFormValidation(aiKeyForm, announcer);

/** 金鑰設定區的狀態：使用中的金鑰（遮蔽）與 AI 建議進度，就在使用者輸入金鑰的地方給回饋。 */
function showKeyStatus(aiStatus = ""): void {
  const key = getUserKey();
  const keyText = key ? `使用中：${maskKey(key)}（只保存在此分頁）。` : "";
  aiKeyStatus.textContent = [keyText, aiStatus].filter(Boolean).join(" ");
}

/** 換了金鑰後，若已有報告就用新金鑰重新產生 AI 建議（忽略已存的結果）。 */
function regenerateAiStrategy(): void {
  if (currentTask === null || currentDataset === null || baseStrategy === null) return;
  replaceStrategy(currentDataset.strategy, "pending");
  void loadAiStrategy(currentTask.id, true);
}

aiKeyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    saveUserKey(aiKeyInput.value);
  } catch {
    aiKeyStatus.textContent = "金鑰格式不正確，未儲存。";
    return;
  }
  aiKeyForm.reset(); // 清空輸入並清除「已互動」狀態，避免空白必填欄位被標成錯誤
  showKeyStatus();
  regenerateAiStrategy();
});

aiKeyClear.addEventListener("click", () => {
  clearUserKey();
  aiKeyForm.reset(); // 清空輸入並清除「已互動」狀態，避免空白必填欄位被標成錯誤
  aiKeyStatus.textContent = "已清除金鑰。";
});

/** 網址參數：?task=<id> 開啟該任務；舊格式 ?username=…&count=… 會建立（或命中快取）任務。 */
function runInitialQuery(): void {
  const params = new URLSearchParams(window.location.search);
  const taskId = params.get("task");
  if (isTaskId(taskId)) {
    void runTaskRequest("正在載入報告…", (options) => getTask(taskId, options), true);
    return;
  }
  const sharedUsername = params.get("username");
  if (!sharedUsername) return;
  usernameInput.value = sharedUsername;
  const sharedCount = Number(params.get("count"));
  if (Number.isInteger(sharedCount)) countInput.value = String(sharedCount);
  if (form.checkValidity()) {
    void runAnalysis(sharedUsername.trim(), countInput.valueAsNumber, false);
  }
}

/** 未登入者看不到儀表板（PRD F1）：先確認 session，再顯示頁面與載入任務。 */
async function bootstrap(): Promise<void> {
  const session = await initProtectedPage({ account, accountEmail, signOutButton }, (message) => {
    setStatus(message, "error");
    submitButton.disabled = true;
  });
  if (session === null) return;
  showKeyStatus();
  runInitialQuery();
  void refreshTasks();
}

void bootstrap();
