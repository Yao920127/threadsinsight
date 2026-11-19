/**
 * 匯出貼文明細（PRD F5、AC-4）。純函式，產生檔案內容與檔名；下載由 ui/download.ts 負責。
 *
 * - CSV：RFC 4180（CRLF 換行、含逗號／引號／換行的欄位加雙引號），開頭加 UTF-8 BOM，
 *   Excel 直接開啟中文不亂碼。每列保留 data_source 與 is_synthetic（Mock Dataset 規則 2）。
 * - JSON：API 回傳的完整資料（貼文、清理、分群、統計），縮排 2 格。
 */
import type { CleanDataset, CleanPost } from "../api/types.ts";

export type ExportFormat = "csv" | "json";

export const MIME_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8",
};

/** 用字元碼產生 BOM，避免原始碼裡出現看不見的字元。 */
export const UTF8_BOM = String.fromCharCode(0xfeff);

type CsvValue = string | number | boolean | null;

/** 欄位順序即 CSV 欄位順序。 */
export const CSV_COLUMNS: readonly (readonly [string, (post: CleanPost) => CsvValue])[] = [
  ["post_url", (p) => p.post_url],
  ["is_synthetic", (p) => p.is_synthetic],
  ["published_at", (p) => p.published_at],
  ["content", (p) => p.content],
  ["likes_count", (p) => p.likes_count],
  ["replies_count", (p) => p.replies_count],
  ["reposts_count", (p) => p.reposts_count],
  ["views_count", (p) => p.views_count],
  ["engagement_score", (p) => p.engagement_score],
  ["engagement_group", (p) => p.engagement_group],
  ["post_type", (p) => p.post_type],
  ["media_type", (p) => p.media_type],
  ["char_count", (p) => p.char_count],
  ["hashtag_count", (p) => p.hashtag_count],
  ["mention_count", (p) => p.mention_count],
  ["url_count", (p) => p.url_count],
];

// 試算表會把這些開頭的儲存格當公式執行（CSV injection），文字欄位前加 ' 讓它保持純文字
const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

export function toCsvCell(value: CsvValue): string {
  if (value === null) return "";
  if (typeof value !== "string") return String(value);
  const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(dataset: CleanDataset): string {
  const header = ["data_source", ...CSV_COLUMNS.map(([name]) => name)];
  const rows = dataset.posts.map((post) => [
    dataset.data_source,
    ...CSV_COLUMNS.map(([, read]) => read(post)),
  ]);
  const lines = [header, ...rows].map((row) => row.map(toCsvCell).join(","));
  return `${UTF8_BOM}${lines.join("\r\n")}\r\n`;
}

export function toJson(dataset: CleanDataset): string {
  return `${JSON.stringify(dataset, null, 2)}\n`;
}

/** 檔名標明 mock，避免檔案被拿去當成真實帳號資料。username 已正規化為 [a-z0-9._]。 */
export function exportFileName(dataset: CleanDataset, format: ExportFormat): string {
  return `threadsinsight-mock-${dataset.username}-${dataset.posts.length}posts.${format}`;
}

export function exportContent(dataset: CleanDataset, format: ExportFormat): string {
  return format === "csv" ? toCsv(dataset) : toJson(dataset);
}
