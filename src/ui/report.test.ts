import { describe, expect, test } from "vite-plus/test";
import { summarizePosts } from "../analysis/metrics.ts";
import { generateMockDataset } from "../mock/index.ts";
import { toCleanDataset } from "../test/cleanDataset.ts";
import { renderReport, SMALL_SAMPLE_NOTE, type ReportDataset } from "./report.ts";

function makeDataset(count = 30): ReportDataset {
  return toCleanDataset(
    generateMockDataset("demo_user", {
      count,
      now: () => new Date("2026-11-19T10:00:00+08:00"),
    }),
  );
}

const dataset = makeDataset();

function render(data: ReportDataset = dataset): string {
  return renderReport(data, summarizePosts(data.posts));
}

describe("renderReport", () => {
  test("always shows the non-dismissable mock disclosure banner", () => {
    const html = render();
    expect(html).toContain("示範資料（Mock Dataset），非 @demo_user 的真實貼文");
    expect(html).not.toMatch(/關閉|dismiss|close/i);
  });

  test("renders KPI cards, at least three charts and the top-5 table", () => {
    const html = render();
    expect(html.match(/class="kpi"/g)).toHaveLength(5);
    expect((html.match(/class="chart card"/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(html.match(/<tr class="top-row">/g)).toHaveLength(5);
  });

  test("never links to threads.com and shows mock urls as plain text", () => {
    const html = render();
    expect(html).not.toMatch(/threads\.(com|net)/);
    expect(html).not.toMatch(/href="mock:/);
  });

  test("escapes post content and username", () => {
    const hostile: ReportDataset = {
      ...dataset,
      username: "<b>x</b>",
      posts: dataset.posts.map((p, i) =>
        i === 0 ? { ...p, content: `<script>alert(1)</script>`, likes_count: 999_999 } : p,
      ),
    };
    const html = render(hostile);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("@&lt;b&gt;x&lt;/b&gt;");
  });

  test("notes hidden view counts and shows a dash for them", () => {
    const html = render();
    const hidden = dataset.posts.filter((p) => p.views_count === null).length;
    expect(html).toContain(`${hidden} 篇未公開瀏覽數`);
  });

  test("exposes chart values as text, not only as bar lengths", () => {
    const html = render();
    expect(html).toMatch(/<span class="bar-value">\d+<\/span>/);
  });

  test("uses no inline style attributes so a strict CSP can apply", () => {
    expect(render()).not.toMatch(/\sstyle="/);
  });
});

describe("renderReport - all posts", () => {
  test.each([1, 30, 50])("lists every one of %s posts", (count) => {
    const data = makeDataset(count);
    const html = render(data);
    expect(html.match(/<article class="post-card"/g)).toHaveLength(count);
    expect(html).toContain(`全部貼文（${count} 篇）`);
  });

  test("shows the full content without truncation, keeping line breaks", () => {
    const longPost = dataset.posts.find((p) => p.content.includes("\n"));
    expect(longPost).toBeDefined();
    const html = render();
    expect(html).toContain(longPost!.content.split("\n").join("\n"));
  });

  test("shows every metric, the mock url as text and labels hidden views", () => {
    const html = render();
    const first = dataset.posts[0];
    expect(html).toContain(`<code class="post-url">${first.post_url}</code>`);
    expect(html.match(/<dt>讚<\/dt>/g)).toHaveLength(dataset.posts.length);
    const hidden = dataset.posts.filter((p) => p.views_count === null).length;
    expect(html.match(/未公開/g)?.length).toBeGreaterThanOrEqual(hidden);
  });

  test("links from the report header to the post list", () => {
    expect(render()).toMatch(/href="#all-posts"/);
  });

  test("titles the top list by the actual number when fewer than five posts", () => {
    const data = makeDataset(3);
    const html = render(data);
    expect(html).toContain("Top 3 貼文");
    expect(html.match(/<tr class="top-row">/g)).toHaveLength(3);
  });
});

describe("renderReport - engagement groups", () => {
  test("labels the group chart by percentile split", () => {
    expect(render()).toContain("互動分群（前 30%／中 40%／後 30%）");
  });

  test("tags each post card with its percentile group", () => {
    const html = render();
    const high = dataset.posts.filter((p) => p.engagement_group === "high").length;
    expect(html.match(/class="tag tag-high"/g)).toHaveLength(high);
  });

  test.each([
    [9, true],
    [10, false],
  ])("small-sample note for %s posts: %s", (count, shown) => {
    expect(render(makeDataset(count)).includes(SMALL_SAMPLE_NOTE)).toBe(shown);
  });
});
