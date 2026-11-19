/**
 * 「內容策略建議」區塊（PRD F4 第 4 步、F5「3 點策略觀察與建議」）。
 * 報告先顯示規則引擎結果（pending），Claude Haiku 5.5 的結果回來後整個區塊替換；
 * AI 失敗時保留規則引擎結果並顯示提示（例外情境 6）。
 */
import type { StrategyInsight, StrategyResult, StrategyRewrite } from "../api/types.ts";
import { escapeHtml } from "./html.ts";

export const STRATEGY_SECTION_ID = "strategy";

/** 前端自己判定的失敗（例如等太久或連線中斷）；伺服器端失敗的說明由 API 的 notice 提供。 */
export const AI_TIMEOUT_NOTICE = "AI 深度建議生成逾時，目前已顯示系統規則引擎產出之基礎策略觀察。";
export const AI_ERROR_NOTICE =
  "AI 深度建議暫時無法產生，目前已顯示系統規則引擎產出之基礎策略觀察。";

const MODEL_LABELS: Record<string, string> = { "claude-haiku-5-5": "Claude Haiku 5.5" };

export type StrategyState = "pending" | "settled";

export function modelLabel(model: string | null | undefined): string {
  return (model && MODEL_LABELS[model]) || model || "AI 模型";
}

export function sourceNote(strategy: Pick<StrategyResult, "source" | "model">): string {
  if (strategy.source === "rule_engine") {
    return "由規則引擎依互動數據產生，屬相關性觀察，不代表因果。";
  }
  if (strategy.source === "llm") {
    return `由 ${modelLabel(strategy.model)} 依互動數據產生，屬相關性觀察，不代表因果；建議發布前自行判斷。`;
  }
  return `來源：${strategy.source}`;
}

function renderInsight(insight: StrategyInsight, index: number): string {
  const variant =
    insight.category === "insufficient" ? " is-muted" : insight.category === "ai" ? " is-ai" : "";
  return `
    <li class="card strategy-card${variant}">
      <p class="strategy-index" aria-hidden="true">${index + 1}</p>
      <h3 class="chart-title">${escapeHtml(insight.title)}</h3>
      <p class="strategy-evidence">${escapeHtml(insight.evidence)}</p>
      <p class="strategy-action"><span>建議</span>${escapeHtml(insight.action)}</p>
    </li>`;
}

function renderRewrite(rewrite: StrategyRewrite | null): string {
  if (rewrite === null) {
    return `<p class="footnote">這次的資料沒有適用的改寫規則（提問、hashtag、連結的互動差距都未達門檻）。</p>`;
  }
  const changes = rewrite.changes.map((c) => `<li>${escapeHtml(c)}</li>`).join("");
  return `
    <figure class="card rewrite-card">
      <figcaption>
        <h3 class="chart-title">改寫範例：互動最低的貼文</h3>
        <p class="chart-unit"><code>${escapeHtml(rewrite.post_url)}</code></p>
      </figcaption>
      <div class="rewrite-columns">
        <div>
          <p class="rewrite-label">原文</p>
          <p class="rewrite-text">${escapeHtml(rewrite.before)}</p>
        </div>
        <div>
          <p class="rewrite-label">改寫後</p>
          <p class="rewrite-text is-after">${escapeHtml(rewrite.after)}</p>
        </div>
      </div>
      <ul class="rewrite-changes" aria-label="改了什麼">${changes}</ul>
    </figure>`;
}

/** 來源標籤：一眼分辨 AI 與規則引擎的結果（文字本身就是資訊，不只靠顏色）。 */
export function renderSourceBadge(strategy: Pick<StrategyResult, "source" | "model">): string {
  if (strategy.source === "llm") {
    return `<span class="source-badge is-ai">AI · ${escapeHtml(modelLabel(strategy.model))}</span>`;
  }
  return `<span class="source-badge">規則引擎</span>`;
}

export function renderStrategySection(
  strategy: StrategyResult,
  state: StrategyState = "settled",
): string {
  const notes = [sourceNote(strategy), ...(strategy.notice ? [strategy.notice] : [])]
    .map((note) => `<p class="footnote">${escapeHtml(note)}</p>`)
    .join("");
  const pending =
    state === "pending"
      ? `<p class="ai-status" role="status">AI 深度建議產生中（${escapeHtml(modelLabel("claude-haiku-5-5"))}），先顯示規則引擎的基礎觀察…</p>`
      : "";
  return `
    <section id="${STRATEGY_SECTION_ID}" class="report-section" aria-labelledby="strategy-title" aria-busy="${state === "pending"}">
      <div class="section-head">
        <div class="strategy-title-row">
          <h2 id="strategy-title" class="section-title">內容策略建議</h2>
          ${renderSourceBadge(strategy)}
        </div>
        ${notes}
        ${pending}
      </div>
      <ol class="strategy-list">${strategy.insights.map(renderInsight).join("")}</ol>
      ${renderRewrite(strategy.rewrite)}
    </section>`;
}

export const AI_STATUS_ID = "ai-report-status";

/** 規則引擎版本附帶的 notice 轉成簡短原因。 */
export function fallbackReason(notice: string | null): string {
  if (!notice) return "暫時無法產生";
  if (notice.includes("尚未啟用")) return "尚未設定 API 金鑰";
  if (notice.includes("金鑰無效")) return "API 金鑰無效或沒有權限";
  if (notice.includes("逾時")) return "等候逾時";
  return "暫時無法產生";
}

/** 一句話描述 AI 建議目前的狀態，顯示在報告標題下與金鑰設定區。 */
export function aiStatusText(strategy: StrategyResult, state: StrategyState): string {
  const model = modelLabel("claude-haiku-5-5");
  if (state === "pending") return `AI 策略建議產生中（${model}）…`;
  if (strategy.source === "llm") return `✓ AI 策略建議已完成（${modelLabel(strategy.model)}）`;
  return `AI 策略建議未產生：${fallbackReason(strategy.notice)}，目前顯示規則引擎的基礎觀察`;
}

/** 報告標題下的 AI 狀態列，附「查看建議」連結直接跳到策略區塊。 */
export function renderAiStatus(strategy: StrategyResult, state: StrategyState): string {
  const tone =
    state === "pending" ? "is-pending" : strategy.source === "llm" ? "is-done" : "is-fallback";
  return `
    <p id="${AI_STATUS_ID}" class="ai-report-status ${tone}" role="status">
      <span>${escapeHtml(aiStatusText(strategy, state))}</span>
      <a href="#${STRATEGY_SECTION_ID}">查看建議</a>
    </p>`;
}
