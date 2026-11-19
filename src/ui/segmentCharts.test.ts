import { describe, expect, test } from "vite-plus/test";
import type { PostStats } from "../api/types.ts";
import { generateMockDataset } from "../mock/index.ts";
import { toCleanDataset } from "../test/cleanDataset.ts";
import { renderReport } from "./report.ts";
import {
  bestPostType,
  renderLengthChart,
  renderPostTypeChart,
  renderTopicChart,
  toSegmentBuckets,
} from "./segmentCharts.ts";
import { summarizePosts } from "../analysis/metrics.ts";

const base = toCleanDataset(generateMockDataset("demo_user")).stats;
const stats: PostStats = {
  ...base,
  length_buckets: [
    { key: "0-50", count: 12, avg_engagement: 1234.56 },
    { key: "51-100", count: 18, avg_engagement: 300.4 },
    { key: "101-200", count: 0, avg_engagement: 0 },
    { key: "201-400", count: 0, avg_engagement: 0 },
    { key: "401+", count: 0, avg_engagement: 0 },
  ],
  post_types: [
    { key: "text_only", count: 3, avg_engagement: 10 },
    { key: "image", count: 12, avg_engagement: 900 },
    { key: "link", count: 4, avg_engagement: 50 },
    { key: "hashtag", count: 8, avg_engagement: 700 },
    { key: "mention", count: 3, avg_engagement: 400 },
  ],
};

describe("toSegmentBuckets", () => {
  test("uses the rounded average as the value and the post count as detail", () => {
    const buckets = toSegmentBuckets(stats.length_buckets, (key) => key);
    expect(buckets[0]).toEqual({ label: "0-50", value: 1235, detail: "12 篇" });
    expect(buckets[2]).toEqual({ label: "101-200", value: 0, detail: "0 篇" });
  });
});

describe("renderLengthChart", () => {
  test("lists every length bucket, including empty ones, with counts", () => {
    const html = renderLengthChart(stats);
    expect(html).toContain("文字長度與平均互動");
    expect(html.match(/<li class="bar">/g)).toHaveLength(5);
    expect(html).toContain("0–50");
    expect(html).toContain("401+");
    expect(html).toContain('<small class="bar-detail">18 篇</small>');
  });

  test("scales bars relative to the highest average", () => {
    const html = renderLengthChart(stats);
    expect(html).toContain('data-ratio="1.000"');
    expect(html).toContain('data-ratio="0.000"');
  });
});

describe("renderPostTypeChart", () => {
  test("labels all five post types in Traditional Chinese", () => {
    const html = renderPostTypeChart(stats);
    for (const label of ["純文字", "圖片", "連結", "Hashtag", "提及"]) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html).toContain("優先順序");
  });
});

test("the report includes both new charts alongside the existing ones", () => {
  const dataset = { ...toCleanDataset(generateMockDataset("demo_user")), stats };
  const html = renderReport(dataset, summarizePosts(dataset.posts));
  expect(html).toContain("文字長度與平均互動");
  expect(html).toContain("貼文類型與平均互動");
  expect(html.match(/<figure class="chart card">/g)?.length).toBeGreaterThanOrEqual(6);
});

describe("bestPostType", () => {
  test("picks the type with the highest average engagement", () => {
    expect(bestPostType(stats)).toBe("圖片");
  });

  test("ignores types with no posts even if their average is higher", () => {
    const withEmpty: PostStats = {
      ...stats,
      post_types: [
        { key: "text_only", count: 0, avg_engagement: 99_999 },
        { key: "link", count: 2, avg_engagement: 10 },
      ],
    };
    expect(bestPostType(withEmpty)).toBe("連結");
  });

  test("returns null when there are no posts", () => {
    expect(bestPostType({ ...stats, post_types: [] })).toBeNull();
  });
});

test("the report no longer shows a media-type chart", () => {
  const dataset = { ...toCleanDataset(generateMockDataset("demo_user")), stats };
  const html = renderReport(dataset, summarizePosts(dataset.posts));
  expect(html).not.toContain("媒體類型");
  expect(html).toContain("平均互動最高的貼文類型");
});

test("the report header offers CSV and JSON export buttons", () => {
  const dataset = toCleanDataset(generateMockDataset("demo_user"));
  const html = renderReport(dataset, summarizePosts(dataset.posts));
  expect(html).toContain('data-export="csv"');
  expect(html).toContain('data-export="json"');
  expect(html.match(/<button type="button"/g)).toHaveLength(2);
});

test("renders the topic chart with Chinese labels and counts", () => {
  const { nlp } = toCleanDataset(generateMockDataset("demo_user"));
  const html = renderTopicChart(nlp);
  expect(html).toContain("主題與平均互動");
  for (const label of ["職場", "生活", "科技", "觀點", "其他"]) {
    expect(html).toContain(`>${label}<`);
  }
  expect(html).toContain('<small class="bar-detail">30 篇</small>');
});

test("the report includes the attribution section and topic tags on post cards", () => {
  const dataset = toCleanDataset(generateMockDataset("demo_user"));
  const html = renderReport(dataset, summarizePosts(dataset.posts));
  expect(html).toContain("三群組內容歸因");
  expect(html.match(/<span class="tag">觀點<\/span>/g)).toHaveLength(30);
});
