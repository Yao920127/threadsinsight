/** API 回應的執行期驗證：只接受形狀正確的合成資料，其餘一律拒收。 */
import type { MockPost } from "../mock/types.ts";
import {
  ENGAGEMENT_GROUPS,
  POST_TYPES,
  SENTIMENTS,
  TOPICS,
  type CleanDataset,
  type CleanPost,
  type CleaningReport,
  type GroupingSummary,
  type GroupProfile,
  type NlpAnalysis,
  type PostStats,
  type StrategyResult,
  type TextStructure,
} from "./types.ts";

const MOCK_URL_PREFIX = "mock://threads/@";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isMockPost(value: unknown): value is MockPost {
  if (!isRecord(value)) return false;
  return (
    typeof value.post_url === "string" &&
    value.post_url.startsWith(MOCK_URL_PREFIX) &&
    value.is_synthetic === true &&
    typeof value.published_at === "string" &&
    typeof value.content === "string" &&
    (value.views_count === null || isCount(value.views_count)) &&
    isCount(value.likes_count) &&
    isCount(value.replies_count) &&
    isCount(value.reposts_count) &&
    (value.media_type === "text_only" || value.media_type === "image") &&
    (value.engagement_tier === "high" ||
      value.engagement_tier === "medium" ||
      value.engagement_tier === "low")
  );
}

function isCleanPost(value: unknown): value is CleanPost {
  return (
    isMockPost(value) &&
    isRecord(value) &&
    isCount(value.engagement_score) &&
    isCount(value.char_count) &&
    isCount(value.hashtag_count) &&
    isCount(value.mention_count) &&
    isCount(value.url_count) &&
    POST_TYPES.includes(value.post_type as CleanPost["post_type"]) &&
    ENGAGEMENT_GROUPS.includes(value.engagement_group as CleanPost["engagement_group"]) &&
    TOPICS.includes(value.topic as CleanPost["topic"]) &&
    SENTIMENTS.includes(value.sentiment as CleanPost["sentiment"]) &&
    typeof value.has_question === "boolean" &&
    typeof value.has_cta === "boolean"
  );
}

function isCleaningReport(value: unknown): value is CleaningReport {
  return (
    isRecord(value) &&
    isCount(value.input_count) &&
    isCount(value.output_count) &&
    isCount(value.duplicates_removed) &&
    isCount(value.invalid_removed)
  );
}

function isGroupingSummary(value: unknown): value is GroupingSummary {
  return (
    isRecord(value) &&
    isCount(value.high) &&
    isCount(value.medium) &&
    isCount(value.low) &&
    isCount(value.total) &&
    typeof value.small_sample === "boolean"
  );
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isSegmentList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.key === "string" &&
        isCount(item.count) &&
        isNumber(item.avg_engagement),
    )
  );
}

function isTermList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((item) => isRecord(item) && typeof item.term === "string" && isCount(item.posts))
  );
}

const DAYS_PER_WEEK = 7;
const HOURS_PER_DAY = 24;

function isWeekdayHourMatrix(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === DAYS_PER_WEEK &&
    value.every((row) => Array.isArray(row) && row.length === HOURS_PER_DAY && row.every(isCount))
  );
}

function isPostStats(value: unknown): value is PostStats {
  if (!isRecord(value) || !isRecord(value.averages)) return false;
  const { averages } = value;
  return (
    [
      averages.likes,
      averages.replies,
      averages.reposts,
      averages.engagement,
      averages.char_count,
    ].every(isNumber) &&
    isSegmentList(value.length_buckets) &&
    isSegmentList(value.post_types) &&
    isWeekdayHourMatrix(value.weekday_hour) &&
    isTermList(value.top_hashtags) &&
    isTermList(value.top_keywords)
  );
}

const STRUCTURE_FIELDS = [
  "avg_char_count",
  "avg_sentence_count",
  "question_rate",
  "cta_rate",
  "hashtag_rate",
  "link_rate",
  "mention_rate",
  "image_rate",
  "positive_rate",
  "negative_rate",
] as const;

function isStructure(value: unknown): value is TextStructure {
  return isRecord(value) && STRUCTURE_FIELDS.every((field) => isNumber(value[field]));
}

function isGroupProfile(value: unknown): value is GroupProfile {
  return (
    isRecord(value) &&
    ENGAGEMENT_GROUPS.includes(value.group as GroupProfile["group"]) &&
    isCount(value.post_count) &&
    isCount(value.sample_size) &&
    typeof value.insufficient === "boolean" &&
    Array.isArray(value.sample_urls) &&
    value.sample_urls.every((url) => typeof url === "string" && url.startsWith(MOCK_URL_PREFIX)) &&
    Array.isArray(value.keywords) &&
    value.keywords.every((k) => isRecord(k) && typeof k.term === "string" && isNumber(k.weight)) &&
    (value.structure === null || isStructure(value.structure)) &&
    Array.isArray(value.topics) &&
    value.topics.every(
      (t) => Array.isArray(t) && t.length === 2 && typeof t[0] === "string" && isCount(t[1]),
    ) &&
    Array.isArray(value.observations) &&
    value.observations.every((o) => typeof o === "string")
  );
}

function isNlpAnalysis(value: unknown): value is NlpAnalysis {
  return (
    isRecord(value) &&
    typeof value.method === "string" &&
    isSegmentList(value.topics) &&
    (value.baseline === null || isStructure(value.baseline)) &&
    Array.isArray(value.groups) &&
    value.groups.every(isGroupProfile)
  );
}

export function isStrategy(value: unknown): value is StrategyResult {
  return (
    isRecord(value) &&
    typeof value.source === "string" &&
    (value.notice === null || typeof value.notice === "string") &&
    (value.model === undefined || value.model === null || typeof value.model === "string") &&
    Array.isArray(value.insights) &&
    value.insights.every(
      (i) =>
        isRecord(i) &&
        ["category", "title", "evidence", "action"].every((k) => typeof i[k] === "string") &&
        (i.lift === null || (typeof i.lift === "number" && Number.isFinite(i.lift))),
    ) &&
    (value.rewrite === null ||
      (isRecord(value.rewrite) &&
        typeof value.rewrite.post_url === "string" &&
        value.rewrite.post_url.startsWith(MOCK_URL_PREFIX) &&
        typeof value.rewrite.before === "string" &&
        typeof value.rewrite.after === "string" &&
        Array.isArray(value.rewrite.changes) &&
        value.rewrite.changes.every((c) => typeof c === "string")))
  );
}

/** 只接受合成資料：Mock Dataset 規則 2、3、8（逐筆標示、mock:// 網址、不混用真實資料）。 */
export function isCleanDataset(value: unknown): value is CleanDataset {
  return (
    isRecord(value) &&
    isCleaningReport(value.cleaning) &&
    isGroupingSummary(value.grouping) &&
    isPostStats(value.stats) &&
    isNlpAnalysis(value.nlp) &&
    isStrategy(value.strategy) &&
    value.data_source === "mock_dataset" &&
    typeof value.source_note === "string" &&
    typeof value.generated_at === "string" &&
    typeof value.username === "string" &&
    Array.isArray(value.posts) &&
    value.posts.every(isCleanPost)
  );
}
