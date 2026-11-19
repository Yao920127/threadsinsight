/**
 * 「內容統計」區塊（PRD F4 第 1 步）：平均值、星期 × 時段熱力圖、高頻關鍵字與 hashtag。
 * 資料由 Python stats.py 計算；這裡只負責呈現。所有動態文字都經過 escapeHtml。
 */
import type { PostStats, TermCount } from "../api/types.ts";
import { escapeHtml, formatNumber } from "./html.ts";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"] as const;
const HOURS_PER_SLOT = 3;
const HEAT_LEVELS = 4;

export interface PeakSlot {
  readonly weekday: number;
  readonly slot: number;
  readonly posts: number;
}

/** 把 24 小時併成 3 小時一格，手機寬度也放得下 8 欄。 */
export function toSlots(weekdayHour: PostStats["weekday_hour"]): number[][] {
  return weekdayHour.map((hours) =>
    Array.from({ length: hours.length / HOURS_PER_SLOT }, (_, slot) =>
      hours
        .slice(slot * HOURS_PER_SLOT, (slot + 1) * HOURS_PER_SLOT)
        .reduce((sum, count) => sum + count, 0),
    ),
  );
}

/** 發文最多的格子；同篇數時取較早的星期與時段。沒有貼文時為 null。 */
export function findPeakSlot(slots: readonly (readonly number[])[]): PeakSlot | null {
  const cells = slots.flatMap((row, weekday) =>
    row.map((posts, slot) => ({ weekday, slot, posts })),
  );
  return cells.reduce<PeakSlot | null>(
    (peak, cell) => (cell.posts > (peak?.posts ?? 0) ? cell : peak),
    null,
  );
}

/** 0 = 沒有貼文；1…4 依該格篇數相對最大值分級（顏色只作輔助，格內仍顯示數字）。 */
export function heatLevel(posts: number, max: number): number {
  return posts === 0 || max === 0 ? 0 : Math.ceil((posts / max) * HEAT_LEVELS);
}

function slotLabel(slot: number): string {
  const start = slot * HOURS_PER_SLOT;
  return `${start}–${start + HOURS_PER_SLOT - 1}`;
}

function renderAverages(averages: PostStats["averages"]): string {
  const items: [string, number][] = [
    ["平均讚", averages.likes],
    ["平均回覆", averages.replies],
    ["平均轉發", averages.reposts],
    ["平均字數", averages.char_count],
  ];
  return `
    <dl class="avg-grid">
      ${items
        .map(
          ([label, value]) => `
        <div class="avg-item">
          <dt>${escapeHtml(label)}</dt>
          <dd>${formatNumber(value)}</dd>
        </div>`,
        )
        .join("")}
    </dl>`;
}

function renderHeatmap(weekdayHour: PostStats["weekday_hour"]): string {
  const slots = toSlots(weekdayHour);
  const max = Math.max(0, ...slots.flat());
  const peak = findPeakSlot(slots);
  const peakText = peak
    ? `最常發文：星期${WEEKDAY_LABELS[peak.weekday]} ${slotLabel(peak.slot)} 時（${peak.posts} 篇）`
    : "沒有貼文";
  // 標頭只顯示起點小時，完整區間放在 abbr title，窄螢幕才放得下 8 欄
  const header = slots[0]
    .map(
      (_, slot) =>
        `<th scope="col"><abbr title="${slotLabel(slot)} 時">${slot * HOURS_PER_SLOT}</abbr></th>`,
    )
    .join("");
  const rows = slots
    .map(
      (row, weekday) => `
        <tr>
          <th scope="row">${WEEKDAY_LABELS[weekday]}</th>
          ${row.map((posts) => `<td class="heat-${heatLevel(posts, max)}">${posts}</td>`).join("")}
        </tr>`,
    )
    .join("");
  return `
    <figure class="chart card heatmap-card">
      <figcaption>
        <h3 class="chart-title">星期 × 時段發文分布</h3>
        <p class="chart-unit">單位：篇．欄為時段起點（台北時間，每格 3 小時）．${escapeHtml(peakText)}</p>
      </figcaption>
      <div class="heatmap-scroll" tabindex="0" role="region" aria-label="星期 × 時段發文熱力圖">
        <table class="heatmap">
          <thead><tr><th scope="col"><span class="visually-hidden">星期</span></th>${header}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </figure>`;
}

function renderTermList(title: string, terms: readonly TermCount[], emptyText: string): string {
  const items = terms.length
    ? `<ol class="term-list">${terms
        .map(
          (t) => `
          <li class="term-item">
            <span class="term">${escapeHtml(t.term)}</span>
            <span class="term-count">${formatNumber(t.posts)} 篇</span>
          </li>`,
        )
        .join("")}</ol>`
    : `<p class="footnote">${escapeHtml(emptyText)}</p>`;
  return `
    <figure class="chart card">
      <figcaption>
        <h3 class="chart-title">${escapeHtml(title)}</h3>
        <p class="chart-unit">依出現在幾篇貼文排序</p>
      </figcaption>
      ${items}
    </figure>`;
}

export function renderStatsSection(stats: PostStats): string {
  return `
    <section class="report-section" aria-labelledby="stats-title">
      <h2 id="stats-title" class="section-title">內容統計</h2>
      ${renderAverages(stats.averages)}
      <div class="chart-grid stats-grid">
        ${renderHeatmap(stats.weekday_hour)}
        ${renderTermList("高頻關鍵字", stats.top_keywords, "沒有可統計的關鍵字。")}
        ${renderTermList("高頻 Hashtag", stats.top_hashtags, "沒有貼文使用 hashtag。")}
      </div>
    </section>`;
}
