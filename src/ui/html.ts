/** HTML 字串工具與格式化。所有動態文字都必須經過 escapeHtml 才能放進樣板。 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

const numberFormat = new Intl.NumberFormat("zh-TW");
const percentFormat = new Intl.NumberFormat("zh-TW", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"] as const;

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatPercent(value: number | null): string {
  return value === null ? "—" : percentFormat.format(value);
}

/** "2026-11-18T22:49:00+08:00" → "11/18（三）22:49"，直接讀 +08:00 字串，不受瀏覽器時區影響。 */
export function formatPublishedAt(publishedAt: string): string {
  const [year, month, day] = publishedAt.slice(0, 10).split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}/${day}（${weekday}）${publishedAt.slice(11, 16)}`;
}
