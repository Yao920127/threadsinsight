export type MediaType = "text_only" | "image";
export type EngagementTier = "high" | "medium" | "low";

export interface MockPost {
  readonly post_url: string;
  readonly is_synthetic: true;
  readonly published_at: string;
  readonly content: string;
  readonly views_count: number | null;
  readonly likes_count: number;
  readonly replies_count: number;
  readonly reposts_count: number;
  readonly media_type: MediaType;
  /** 生成器指定的互動層級（ground truth），供測試與分群驗證使用。 */
  readonly engagement_tier: EngagementTier;
}

export interface MockDataset {
  readonly data_source: "mock_dataset";
  readonly source_note: string;
  readonly generated_at: string;
  readonly username: string;
  readonly posts: readonly MockPost[];
}

export interface GenerateOptions {
  /** 貼文數，預設 30，範圍 1–50。 */
  readonly count?: number;
  /** 注入時鐘，只影響 generated_at，不影響貼文內容。 */
  readonly now?: () => Date;
}
