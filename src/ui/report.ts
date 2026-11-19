/** 報告區塊的 HTML 樣板。所有動態文字都經過 escapeHtml。 */
import type { GroupedPost, RankedPost, Summary } from "../analysis/metrics.ts";
import type { GroupingSummary, NlpAnalysis, PostStats, StrategyResult } from "../api/types.ts";
import { renderAttributionSection } from "./attributionSection.ts";
import type { MockDataset } from "../mock/types.ts";
import { escapeHtml, formatNumber, formatPercent, formatPublishedAt } from "./html.ts";
import { renderBarChart } from "./barChart.ts";
import { SMALL_SAMPLE_NOTE } from "./notes.ts";
import { ALL_POSTS_ID, renderAllPosts } from "./postList.ts";
import {
  bestPostType,
  POST_TYPE_LABELS,
  renderLengthChart,
  renderPostTypeChart,
  renderTopicChart,
} from "./segmentCharts.ts";
import { renderStatsSection } from "./statsSection.ts";
import { renderAiStatus, renderStrategySection } from "./strategySection.ts";

const CONTENT_PREVIEW_LENGTH = 60;
export { SMALL_SAMPLE_NOTE } from "./notes.ts";

/** 報告需要的資料：已分群的貼文與分群摘要（API 回傳的 CleanDataset 即符合）。 */
export interface ReportDataset extends MockDataset {
  readonly posts: readonly GroupedPost[];
  readonly grouping: GroupingSummary;
  readonly stats: PostStats;
  readonly nlp: NlpAnalysis;
  readonly strategy: StrategyResult;
}

function renderBanner(username: string): string {
  // 規則 7：固定揭露、不可關閉，因此沒有任何關閉控制項
  return `
    <p class="mock-banner" role="note">
      <span class="badge-pill">Mock</span>
      <span>示範資料（Mock Dataset），非 @${escapeHtml(username)} 的真實貼文</span>
    </p>`;
}

function renderKpi(label: string, value: string, note = ""): string {
  const noteHtml = note ? `<p class="kpi-note">${escapeHtml(note)}</p>` : "";
  return `
    <div class="kpi">
      <dt class="kpi-label">${escapeHtml(label)}</dt>
      <dd class="kpi-value">${escapeHtml(value)}</dd>
      ${noteHtml ? `<dd>${noteHtml}</dd>` : ""}
    </div>`;
}

function renderKpis(summary: Summary, stats: PostStats): string {
  const hiddenNote =
    summary.hiddenViewsCount > 0
      ? `${summary.hiddenViewsCount} 篇未公開瀏覽數，已排除`
      : "全部貼文皆有瀏覽數";
  return `
    <dl class="kpi-grid">
      ${renderKpi("收錄篇數", formatNumber(summary.postCount))}
      ${renderKpi("總互動", formatNumber(summary.totalEngagement), "讚 + 回覆 + 轉發")}
      ${renderKpi("總瀏覽", formatNumber(summary.totalViews), hiddenNote)}
      ${renderKpi("平均互動", formatNumber(summary.avgEngagement), `互動率 ${formatPercent(summary.engagementRate)}`)}
      ${renderKpi("最佳類型", bestPostType(stats) ?? "—", "平均互動最高的貼文類型")}
    </dl>`;
}

function renderTopRow(post: RankedPost): string {
  const preview = post.content.replace(/\s+/g, " ");
  const short =
    preview.length > CONTENT_PREVIEW_LENGTH
      ? `${preview.slice(0, CONTENT_PREVIEW_LENGTH)}…`
      : preview;
  return `
    <tr class="top-row">
      <th scope="row">
        <span class="rank">#${post.rank}</span>
        <span class="top-time">${escapeHtml(formatPublishedAt(post.published_at))}</span>
      </th>
      <td class="top-content" title="${escapeHtml(preview)}">${escapeHtml(short)}</td>
      <td class="num">${formatNumber(post.likes_count)}</td>
      <td class="num">${formatNumber(post.replies_count)}</td>
      <td class="num">${formatNumber(post.reposts_count)}</td>
      <td class="num">${post.views_count === null ? "—" : formatNumber(post.views_count)}</td>
      <td>${POST_TYPE_LABELS[post.post_type]}</td>
    </tr>`;
}

function renderTopPosts(posts: readonly RankedPost[]): string {
  return `
    <section class="report-section" aria-labelledby="top-title">
      <div tabindex="0" role="region" aria-labelledby="top-title" class="table-wrapper card">
        <table class="top-table">
          <caption id="top-title" class="section-title">Top ${posts.length} 貼文</caption>
          <thead>
            <tr>
              <th scope="col">排名／時間</th>
              <th scope="col">內容</th>
              <th scope="col" class="num">讚</th>
              <th scope="col" class="num">回覆</th>
              <th scope="col" class="num">轉發</th>
              <th scope="col" class="num">瀏覽</th>
              <th scope="col">類型</th>
            </tr>
          </thead>
          <tbody>${posts.map(renderTopRow).join("")}</tbody>
        </table>
      </div>
      <p class="footnote">排序依加權互動分（讚 + 2 × 回覆）。網址為 <code>mock://</code> 偽協議，不對應任何真實貼文。</p>
    </section>`;
}

/** 以 CSSOM 套用長條比例（不寫行內 style 屬性，方便日後採用嚴格 CSP）。 */
export function applyBarRatios(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(".bar-fill[data-ratio]").forEach((bar) => {
    bar.style.setProperty("--ratio", bar.dataset.ratio ?? "0");
  });
}

export function renderReport(dataset: ReportDataset, summary: Summary): string {
  return `
    ${renderBanner(dataset.username)}
    <header class="report-header">
      <p class="caption-uppercase">分析報告</p>
      <h2 class="report-title">@${escapeHtml(dataset.username)} 的互動概況</h2>
      <div class="report-actions">
        <a class="button-outline" href="#${ALL_POSTS_ID}">查看全部 ${dataset.posts.length} 篇貼文</a>
        <button type="button" class="button-outline" data-export="csv">匯出 CSV</button>
        <button type="button" class="button-outline" data-export="json">匯出 JSON</button>
      </div>
      ${renderAiStatus(dataset.strategy, "pending")}
    </header>
    <section class="report-section" aria-label="總覽指標">${renderKpis(summary, dataset.stats)}</section>
    ${renderStrategySection(dataset.strategy, "pending")}
    <section class="report-section" aria-labelledby="charts-title">
      <h2 id="charts-title" class="section-title">互動分布</h2>
      <div class="chart-grid">
        ${renderBarChart("發文時段分布", "篇", summary.hourSlots)}
        ${renderBarChart("星期分布", "篇", summary.weekdays)}
        ${renderBarChart(
          "互動分群（前 30%／中 40%／後 30%）",
          "篇",
          summary.groups,
          dataset.grouping.small_sample ? SMALL_SAMPLE_NOTE : "",
        )}
        ${renderLengthChart(dataset.stats)}
        ${renderPostTypeChart(dataset.stats)}
        ${renderTopicChart(dataset.nlp)}
      </div>
    </section>
    ${renderStatsSection(dataset.stats)}
    ${renderAttributionSection(dataset.nlp, dataset.grouping.small_sample)}
    ${renderTopPosts(summary.topPosts)}
    ${renderAllPosts(dataset.posts)}
    <footer class="report-source">
      <p>資料來源：<code>${escapeHtml(dataset.data_source)}</code>．產生時間 ${escapeHtml(dataset.generated_at)}</p>
      <p>${escapeHtml(dataset.source_note)}</p>
    </footer>`;
}
