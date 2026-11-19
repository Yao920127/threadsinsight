/**
 * 測試用：把 TS 產生器的輸出轉成 API 回傳的 CleanDataset 形狀。
 *
 * 特徵值是固定假值（真正的計算由 Python 測試驗證）。分群直接沿用生成器層級：
 * 篇數為 10 的倍數時與百分位分群完全一致（見 api/tests/test_grouping.py），
 * 其他篇數只是近似，UI 測試不依賴精確組數。
 */
import { hourOf, weekdayOf } from "../analysis/metrics.ts";
import type {
  CleanDataset,
  CleanPost,
  GroupProfile,
  NlpAnalysis,
  PostStats,
  StrategyResult,
  TextStructure,
} from "../api/types.ts";
import type { MockDataset, MockPost } from "../mock/types.ts";

const SMALL_SAMPLE_THRESHOLD = 10;

export function toCleanPost(post: MockPost): CleanPost {
  return {
    ...post,
    engagement_score: post.likes_count + 2 * post.replies_count,
    char_count: 20,
    hashtag_count: 1,
    mention_count: 0,
    url_count: 0,
    post_type: "hashtag",
    engagement_group: post.engagement_tier,
    topic: "opinion",
    sentiment: "neutral",
    has_question: /[？?]/.test(post.content),
    has_cta: false,
  };
}

/** 只有熱力圖依真實發文時間計算；其他統計為固定假值。 */
function fakeStats(posts: readonly CleanPost[]): PostStats {
  const weekdayHour = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const post of posts) {
    weekdayHour[(weekdayOf(post.published_at) + 6) % 7][hourOf(post.published_at)] += 1;
  }
  const segment = (key: string) => ({ key, count: 0, avg_engagement: 0 });
  return {
    averages: { likes: 1234.5, replies: 56.7, reposts: 8.9, engagement: 1300.1, char_count: 42 },
    length_buckets: ["0-50", "51-100", "101-200", "201-400", "401+"].map(segment),
    post_types: ["text_only", "image", "link", "hashtag", "mention"].map(segment),
    weekday_hour: weekdayHour,
    top_hashtags: [{ term: "#職場", posts: 3 }],
    top_keywords: [
      { term: "工作", posts: 4 },
      { term: "習慣", posts: 2 },
    ],
  };
}

const FAKE_STRUCTURE: TextStructure = {
  avg_char_count: 38.9,
  avg_sentence_count: 2.4,
  question_rate: 0.3,
  cta_rate: 0.4,
  hashtag_rate: 0.5,
  link_rate: 0.2,
  mention_rate: 0.1,
  image_rate: 0.4,
  positive_rate: 0.6,
  negative_rate: 0.1,
};

/** 三組都有固定的假歸因結果；篇數取自實際分群，0 篇的組標為樣本不足。 */
function fakeNlp(posts: readonly CleanPost[]): NlpAnalysis {
  const profile = (group: GroupProfile["group"]): GroupProfile => {
    const members = posts.filter((p) => p.engagement_group === group);
    const sample = members.slice(0, 5);
    const insufficient = sample.length === 0;
    return {
      group,
      post_count: members.length,
      sample_size: sample.length,
      insufficient,
      sample_urls: sample.map((p) => p.post_url),
      keywords: insufficient ? [] : [{ term: `${group}詞`, weight: 0.05 }],
      structure: insufficient ? null : FAKE_STRUCTURE,
      topics: insufficient ? [] : [["opinion", sample.length]],
      observations: insufficient ? [] : [`${group} 組的觀察。`],
    };
  };
  return {
    method: "rule_based_v1",
    topics: ["career", "life", "tech", "opinion", "other"].map((key) => ({
      key,
      count: key === "opinion" ? posts.length : 0,
      avg_engagement: key === "opinion" ? 500 : 0,
    })),
    baseline: posts.length ? FAKE_STRUCTURE : null,
    groups: (["high", "medium", "low"] as const).map(profile),
  };
}

const FAKE_STRATEGY: StrategyResult = {
  source: "rule_engine",
  insights: [
    {
      category: "hashtag",
      title: "使用 hashtag 的貼文互動較高",
      evidence: "14 篇平均互動 1696。",
      action: "每篇加上 1–2 個 hashtag。",
      lift: 0.69,
    },
    {
      category: "topic",
      title: "「職場」主題最受歡迎",
      evidence: "5 篇平均互動 1402。",
      action: "以「職場」為主軸。",
      lift: 0.39,
    },
    {
      category: "insufficient",
      title: "資料不足以判斷更多規律",
      evidence: "沒有第 3 個面向。",
      action: "持續累積貼文。",
      lift: null,
    },
  ],
  rewrite: {
    post_url: "mock://threads/@demo_user/post/16",
    before: "原文。\n延伸閱讀：https://example.com/notes/16",
    after: "原文。\n（連結放在第一則留言）",
    changes: ["把外部連結移到第一則留言"],
  },
  notice: null,
};

export function toCleanDataset(dataset: MockDataset): CleanDataset {
  const posts = dataset.posts.map(toCleanPost);
  const countOf = (group: CleanPost["engagement_group"]): number =>
    posts.filter((p) => p.engagement_group === group).length;
  return {
    ...dataset,
    posts,
    cleaning: {
      input_count: posts.length,
      output_count: posts.length,
      duplicates_removed: 0,
      invalid_removed: 0,
    },
    grouping: {
      high: countOf("high"),
      medium: countOf("medium"),
      low: countOf("low"),
      total: posts.length,
      small_sample: posts.length < SMALL_SAMPLE_THRESHOLD,
    },
    stats: fakeStats(posts),
    nlp: fakeNlp(posts),
    strategy: FAKE_STRATEGY,
  };
}
