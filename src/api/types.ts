/** `GET /api/mock-posts` 的回應型別：生成後再經 Python 端清理與特徵萃取（PRD F3）。 */
import type { MockDataset, MockPost } from "../mock/types.ts";

/** 單一主要類型，優先順序：圖片 > 連結 > hashtag > mention > 純文字。 */
export type PostType = "image" | "link" | "hashtag" | "mention" | "text_only";

/** 依加權互動分百分位切出的組別（Python grouping.py）：前 30%／中 40%／後 30%。 */
export type EngagementGroup = "high" | "medium" | "low";

export const ENGAGEMENT_GROUPS: readonly EngagementGroup[] = ["high", "medium", "low"];

export type Topic = "career" | "life" | "tech" | "opinion" | "other";
export const TOPICS: readonly Topic[] = ["career", "life", "tech", "opinion", "other"];

export type Sentiment = "positive" | "neutral" | "negative";
export const SENTIMENTS: readonly Sentiment[] = ["positive", "neutral", "negative"];

export const POST_TYPES: readonly PostType[] = ["image", "link", "hashtag", "mention", "text_only"];

export interface CleanPost extends MockPost {
  /** 加權互動分：likes + 2 × replies。 */
  readonly engagement_score: number;
  /** 不含空白與網址的字元數。 */
  readonly char_count: number;
  readonly hashtag_count: number;
  readonly mention_count: number;
  readonly url_count: number;
  readonly post_type: PostType;
  readonly engagement_group: EngagementGroup;
  /** 以下由 Python text_features.py 依規則與詞典判斷。 */
  readonly topic: Topic;
  readonly sentiment: Sentiment;
  readonly has_question: boolean;
  readonly has_cta: boolean;
}

export interface CleaningReport {
  readonly input_count: number;
  readonly output_count: number;
  readonly duplicates_removed: number;
  readonly invalid_removed: number;
}

export interface GroupingSummary {
  readonly high: number;
  readonly medium: number;
  readonly low: number;
  readonly total: number;
  /** 總篇數 < 10：分群結果僅供參考（PRD F4 小樣本規則）。 */
  readonly small_sample: boolean;
}

export interface CleanDataset extends MockDataset {
  readonly posts: readonly CleanPost[];
  readonly cleaning: CleaningReport;
  readonly grouping: GroupingSummary;
  readonly stats: PostStats;
  readonly nlp: NlpAnalysis;
  readonly strategy: StrategyResult;
}

/** 某區間／類別的篇數與平均互動數（讚 + 回覆 + 轉發）。 */
export interface SegmentStats {
  readonly key: string;
  readonly count: number;
  readonly avg_engagement: number;
}

export interface TermCount {
  readonly term: string;
  /** 出現在幾篇貼文（同篇重複只算一次）。 */
  readonly posts: number;
}

/** PRD F4 第 1 步的基礎統計（Python stats.py）。平均值已四捨五入到小數第一位。 */
export interface PostStats {
  readonly averages: {
    readonly likes: number;
    readonly replies: number;
    readonly reposts: number;
    readonly engagement: number;
    readonly char_count: number;
  };
  /** 0-50、51-100、101-200、201-400、401+ 字。 */
  readonly length_buckets: readonly SegmentStats[];
  /** text_only、image、link、hashtag、mention，順序固定。 */
  readonly post_types: readonly SegmentStats[];
  /** 7 列（星期一…星期日）× 24 欄（0…23 時，台北時間）的發文篇數。 */
  readonly weekday_hour: readonly (readonly number[])[];
  readonly top_hashtags: readonly TermCount[];
  readonly top_keywords: readonly TermCount[];
}

/** 一組抽樣貼文（或全部貼文）的結構特徵；比例為 0–1。 */
export interface TextStructure {
  readonly avg_char_count: number;
  readonly avg_sentence_count: number;
  readonly question_rate: number;
  readonly cta_rate: number;
  readonly hashtag_rate: number;
  readonly link_rate: number;
  readonly mention_rate: number;
  readonly image_rate: number;
  readonly positive_rate: number;
  readonly negative_rate: number;
}

export interface WeightedTerm {
  readonly term: string;
  readonly weight: number;
}

/** 單一互動組的抽樣與歸因結果（Python attribution.py）。 */
export interface GroupProfile {
  readonly group: EngagementGroup;
  readonly post_count: number;
  readonly sample_size: number;
  /** 該組沒有貼文，略過歸因。 */
  readonly insufficient: boolean;
  readonly sample_urls: readonly string[];
  /** TF-IDF：各組特有的詞（三組共有的詞不列入）。 */
  readonly keywords: readonly WeightedTerm[];
  readonly structure: TextStructure | null;
  /** [主題, 篇數]，依 career、life、tech、opinion、other 排列，只列有篇數者。 */
  readonly topics: readonly (readonly [string, number])[];
  readonly observations: readonly string[];
}

/** PRD F4 第 3 步：三群組一致化 NLP 內容歸因。 */
export interface NlpAnalysis {
  readonly method: string;
  /** 各主題的篇數與平均互動數。 */
  readonly topics: readonly SegmentStats[];
  /** 全部貼文的結構特徵，作為各組比較基準；沒有貼文時為 null。 */
  readonly baseline: TextStructure | null;
  readonly groups: readonly GroupProfile[];
}

export interface StrategyInsight {
  /** time、post_type、topic、length、question、hashtag、link，或補位用的 insufficient。 */
  readonly category: string;
  readonly title: string;
  readonly evidence: string;
  readonly action: string;
  /** 與整體平均互動的相對差距；補位用的觀察為 null。 */
  readonly lift: number | null;
}

export interface StrategyRewrite {
  readonly post_url: string;
  readonly before: string;
  readonly after: string;
  readonly changes: readonly string[];
}

/** PRD F4 第 4 步：3 點策略觀察與改寫範例。source 為 rule_engine（規則引擎）或之後的 llm。 */
export interface StrategyResult {
  readonly source: string;
  readonly insights: readonly StrategyInsight[];
  readonly rewrite: StrategyRewrite | null;
  readonly notice: string | null;
  /** source 為 llm 時的模型 ID（例如 claude-haiku-5-5）。 */
  readonly model?: string | null;
}
