/** 比較頁的 HTML 片段：任務勾選清單與並排比較表。所有動態文字都經 escapeHtml。 */
import type { AnalysisTask } from "../api/tasks.ts";
import { escapeHtml, formatNumber, formatPercent } from "../ui/html.ts";
import { POST_TYPE_LABELS } from "../ui/segmentCharts.ts";
import { formatTaipeiDateTime } from "../ui/taskList.ts";
import {
  accountLabel,
  highestIndexes,
  MAX_SELECTION,
  type AccountMetrics,
} from "./compareMetrics.ts";

interface CompareRow {
  readonly label: string;
  readonly hint?: string;
  readonly text: (m: AccountMetrics) => string;
  /** 有數值的列才標示最高者。 */
  readonly value?: (m: AccountMetrics) => number | null;
}

const ROWS: readonly CompareRow[] = [
  { label: "貼文數", text: (m) => `${formatNumber(m.postCount)} 篇` },
  { label: "平均按讚", text: (m) => formatNumber(m.avgLikes), value: (m) => m.avgLikes },
  { label: "平均回覆", text: (m) => formatNumber(m.avgReplies), value: (m) => m.avgReplies },
  { label: "平均轉發", text: (m) => formatNumber(m.avgReposts), value: (m) => m.avgReposts },
  {
    label: "互動率",
    hint: "（讚＋回覆＋轉發）÷ 瀏覽數，只計有公開瀏覽數的貼文",
    text: (m) => formatPercent(m.engagementRate),
    value: (m) => m.engagementRate,
  },
  {
    label: "發文頻率",
    hint: "篇／週",
    text: (m) => `${formatNumber(m.postsPerWeek)} 篇／週`,
    value: (m) => m.postsPerWeek,
  },
  { label: "平均字數", text: (m) => `${formatNumber(m.avgChars)} 字` },
  {
    label: "主力貼文長度",
    hint: "篇數最多的字數區間",
    text: (m) => (m.dominantLength ? `${m.dominantLength.replace("-", "–")} 字` : "—"),
  },
  {
    label: "最佳貼文類型",
    hint: "平均互動數最高的類型",
    text: (m) =>
      m.bestType
        ? `${POST_TYPE_LABELS[m.bestType]}（平均互動 ${formatNumber(m.bestTypeEngagement ?? 0)}）`
        : "—",
  },
];

function renderCell(row: CompareRow, metrics: AccountMetrics, highest: boolean): string {
  const badge = highest ? ' <span class="compare-best">最高</span>' : "";
  return `<td${highest ? ' class="is-best"' : ""}>${escapeHtml(row.text(metrics))}${badge}</td>`;
}

function renderRow(row: CompareRow, accounts: readonly AccountMetrics[]): string {
  const best = row.value ? highestIndexes(accounts.map(row.value)) : new Set<number>();
  const hint = row.hint ? `<span class="compare-hint">${escapeHtml(row.hint)}</span>` : "";
  return `
    <tr>
      <th scope="row">${escapeHtml(row.label)}${hint}</th>
      ${accounts.map((m, i) => renderCell(row, m, best.has(i))).join("")}
    </tr>`;
}

export function renderComparison(accounts: readonly AccountMetrics[]): string {
  const names = accounts.map((m) => `@${m.username}`).join("、");
  return `
    <p class="mock-banner" role="note">
      <span class="badge-pill">Mock</span>
      <span>示範資料（Mock Dataset），非 ${escapeHtml(names)} 的真實貼文表現</span>
    </p>
    <div class="compare-head">
      <h2 id="compare-result-title" class="section-title" tabindex="-1">比較結果</h2>
      <div class="report-actions">
        <button type="button" class="button-outline" data-compare-export="csv">匯出 CSV</button>
        <button type="button" class="button-outline" data-compare-export="json">匯出 JSON</button>
      </div>
    </div>
    <div class="compare-scroll" role="region" aria-labelledby="compare-result-title" tabindex="0">
      <table class="compare-table">
        <caption class="visually-hidden">${escapeHtml(names)} 的指標比較</caption>
        <thead>
          <tr>
            <td></td>
            ${accounts.map((m) => `<th scope="col">${escapeHtml(accountLabel(m))}</th>`).join("")}
          </tr>
        </thead>
        <tbody>${ROWS.map((row) => renderRow(row, accounts)).join("")}</tbody>
      </table>
    </div>
    <p class="footnote">「最高」標示每列數值最高的帳號；數值相同時不標示。平均值由各任務的合成貼文計算。</p>`;
}

function renderOption(task: AnalysisTask, checked: boolean, disabled: boolean): string {
  const time = task.completed_at ?? task.created_at;
  return `
    <li>
      <label class="compare-option">
        <input type="checkbox" name="task" value="${escapeHtml(task.id)}"${checked ? " checked" : ""}${disabled ? " disabled" : ""} />
        <span class="compare-option-title">@${escapeHtml(task.target_username)}
          <span class="task-count">${formatNumber(task.requested_count)} 篇</span></span>
        <span class="compare-option-meta">${formatTaipeiDateTime(time)}</span>
      </label>
    </li>`;
}

/** 只列出已完成的任務；已選滿 4 個時，其餘選項停用。 */
export function renderTaskPicker(
  tasks: readonly AnalysisTask[],
  selected: ReadonlySet<string>,
): string {
  const completed = tasks.filter((task) => task.status === "completed");
  if (completed.length < 2) {
    return `<p class="task-empty">需要至少 2 個已完成的分析任務才能比較。<a href="/">回到分析頁</a>建立任務。</p>`;
  }
  const full = selected.size >= MAX_SELECTION;
  const options = completed
    .map((task) => renderOption(task, selected.has(task.id), full && !selected.has(task.id)))
    .join("");
  return `<ul class="compare-options" role="list">${options}</ul>`;
}
