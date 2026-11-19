/** 水平長條圖。長條比例寫在 data-ratio，由 applyBarRatios 以 CSSOM 套用（不寫行內 style）。 */
import type { Bucket } from "../analysis/metrics.ts";
import { escapeHtml, formatNumber } from "./html.ts";

export function renderBarChart(
  title: string,
  unit: string,
  buckets: readonly Bucket[],
  note = "",
): string {
  const max = Math.max(1, ...buckets.map((b) => b.value));
  const bars = buckets
    .map(
      (b) => `
        <li class="bar">
          <span class="bar-label">${escapeHtml(b.label)}${b.detail ? `<small class="bar-detail">${escapeHtml(b.detail)}</small>` : ""}</span>
          <span class="bar-track" aria-hidden="true"><span class="bar-fill" data-ratio="${(b.value / max).toFixed(3)}"></span></span>
          <span class="bar-value">${formatNumber(b.value)}</span>
        </li>`,
    )
    .join("");
  return `
    <figure class="chart card">
      <figcaption>
        <h3 class="chart-title">${escapeHtml(title)}</h3>
        <p class="chart-unit">單位：${escapeHtml(unit)}</p>
      </figcaption>
      <ul class="bars">${bars}</ul>
      ${note ? `<p class="footnote chart-note">${escapeHtml(note)}</p>` : ""}
    </figure>`;
}
