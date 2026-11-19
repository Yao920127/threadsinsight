/**
 * PRD F5 指定的兩張互動圖表：文字長度 × 平均互動、貼文類型 × 平均互動。
 * 資料由 Python stats.py 計算（length_buckets、post_types）；這裡只轉成長條圖。
 */
import type { Bucket } from "../analysis/metrics.ts";
import type { NlpAnalysis, PostStats, PostType, SegmentStats } from "../api/types.ts";
import { topicLabel } from "./attributionSection.ts";
import { renderBarChart } from "./barChart.ts";
import { formatNumber } from "./html.ts";

const UNIT = "平均互動數（讚 + 回覆 + 轉發）／篇";

export const POST_TYPE_LABELS: Record<PostType, string> = {
  text_only: "純文字",
  image: "圖片",
  link: "連結",
  hashtag: "Hashtag",
  mention: "提及",
};

function isPostType(key: string): key is PostType {
  return key in POST_TYPE_LABELS;
}

/** 平均互動數最高的貼文類型（只看至少 1 篇的類型；同分取排列在前者）。沒有貼文時為 null。 */
export function bestPostType(stats: PostStats): string | null {
  const best = stats.post_types
    .filter((segment) => segment.count > 0)
    .reduce<SegmentStats | null>(
      (top, segment) =>
        top === null || segment.avg_engagement > top.avg_engagement ? segment : top,
      null,
    );
  if (best === null) return null;
  return isPostType(best.key) ? POST_TYPE_LABELS[best.key] : best.key;
}

/** 長條長度為平均互動數，標籤下方附篇數；0 篇的區間仍列出，避免誤以為漏算。 */
export function toSegmentBuckets(
  segments: readonly SegmentStats[],
  labelOf: (key: string) => string,
): Bucket[] {
  return segments.map((segment) => ({
    label: labelOf(segment.key),
    value: Math.round(segment.avg_engagement),
    detail: `${formatNumber(segment.count)} 篇`,
  }));
}

export function renderLengthChart(stats: PostStats): string {
  return renderBarChart(
    "文字長度與平均互動",
    UNIT,
    toSegmentBuckets(stats.length_buckets, (key) => key.replace("-", "–")),
    "字數不含網址與空白；區間上下限皆包含。",
  );
}

export function renderPostTypeChart(stats: PostStats): string {
  return renderBarChart(
    "貼文類型與平均互動",
    UNIT,
    toSegmentBuckets(stats.post_types, (key) => (isPostType(key) ? POST_TYPE_LABELS[key] : key)),
    "每篇只歸一類，優先順序：圖片 > 連結 > Hashtag > 提及 > 純文字。",
  );
}

export function renderTopicChart(nlp: NlpAnalysis): string {
  return renderBarChart(
    "主題與平均互動",
    UNIT,
    toSegmentBuckets(nlp.topics, topicLabel),
    "主題依關鍵詞規則判斷；無法歸類者列為「其他」。",
  );
}
