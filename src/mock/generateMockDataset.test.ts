import { describe, expect, test } from "vite-plus/test";
import { generateMockDataset } from "./generateMockDataset.ts";

const FIXED_NOW = new Date("2026-11-19T10:00:00+08:00");
const ISO_TAIPEI = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/;

function generate(input = "demo_user", count?: number) {
  return generateMockDataset(input, { count, now: () => FIXED_NOW });
}

describe("generateMockDataset - batch metadata", () => {
  test("marks the batch as mock_dataset with a source note", () => {
    const dataset = generate();

    expect(dataset.data_source).toBe("mock_dataset");
    expect(dataset.source_note).toMatch(/HTTP 401/);
    expect(dataset.source_note).toMatch(/Mock Dataset/);
    expect(dataset.username).toBe("demo_user");
  });

  test("stamps generated_at in UTC+8 from the injected clock", () => {
    expect(generate().generated_at).toBe("2026-11-19T10:00:00+08:00");
  });
});

describe("generateMockDataset - count", () => {
  test("defaults to 30 posts", () => {
    expect(generate().posts).toHaveLength(30);
  });

  test("accepts up to 50 posts", () => {
    expect(generate("demo_user", 50).posts).toHaveLength(50);
  });

  test.each([1, 5, 29])("accepts a small count of %s", (count) => {
    const posts = generate("demo_user", count).posts;
    expect(posts).toHaveLength(count);
    // 較少篇數仍是 50 篇版本的前綴，同帳號資料一致
    expect(posts).toEqual(generate("demo_user", 50).posts.slice(0, count));
  });

  test.each([0, -1, 51, 30.5, Number.NaN])("rejects count %s", (count) => {
    expect(() => generate("demo_user", count)).toThrow(RangeError);
  });

  test("rejects an invalid username", () => {
    expect(() => generate("not a user")).toThrow(/username/i);
  });
});

describe("generateMockDataset - per-post fields", () => {
  const { posts } = generate("demo_user", 50);

  test("every post is flagged synthetic with a mock:// url", () => {
    posts.forEach((post, index) => {
      expect(post.is_synthetic).toBe(true);
      expect(post.post_url).toBe(`mock://threads/@demo_user/post/${index + 1}`);
      expect(post.post_url).not.toMatch(/threads\.(com|net)/);
    });
  });

  test("post urls and contents are unique", () => {
    expect(new Set(posts.map((p) => p.post_url)).size).toBe(posts.length);
    expect(new Set(posts.map((p) => p.content)).size).toBe(posts.length);
  });

  test("published_at is ISO-8601 in +08:00, recent, and newest first", () => {
    const times = posts.map((p) => Date.parse(p.published_at));
    posts.forEach((p) => expect(p.published_at).toMatch(ISO_TAIPEI));
    times.forEach((t, i) => {
      if (i > 0) expect(t).toBeLessThan(times[i - 1]);
    });
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    expect(Date.parse("2026-11-19T00:00:00+08:00") - times[times.length - 1]).toBeLessThan(
      ninetyDaysMs,
    );
  });

  test("counts are non-negative integers and media_type is valid", () => {
    posts.forEach((p) => {
      [p.likes_count, p.replies_count, p.reposts_count].forEach((n) => {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
      });
      expect(["text_only", "image"]).toContain(p.media_type);
      expect(p.content.trim().length).toBeGreaterThan(0);
    });
  });

  test("some but not all views_count are null; non-null views exceed likes", () => {
    const nulls = posts.filter((p) => p.views_count === null);
    expect(nulls.length).toBeGreaterThan(0);
    expect(nulls.length).toBeLessThan(posts.length / 2);
    posts
      .filter((p) => p.views_count !== null)
      .forEach((p) => expect(p.views_count).toBeGreaterThan(p.likes_count));
  });

  test("both media types appear", () => {
    const types = new Set(posts.map((p) => p.media_type));
    expect(types).toEqual(new Set(["text_only", "image"]));
  });

  test("does not link to real threads.com content", () => {
    posts.forEach((p) => expect(p.content).not.toMatch(/threads\.(com|net)/));
  });
});

describe("generateMockDataset - engagement tiers", () => {
  test.each(["demo_user", "another_demo", "a", "user.name_99"])(
    "likes and replies span clearly separated high/medium/low tiers for %s",
    (username) => {
      const { posts } = generate(username);
      const byTier = (tier: string) => posts.filter((p) => p.engagement_tier === tier);
      const high = byTier("high");
      const medium = byTier("medium");
      const low = byTier("low");

      expect(high.length).toBeGreaterThanOrEqual(3);
      expect(medium.length).toBeGreaterThanOrEqual(3);
      expect(low.length).toBeGreaterThanOrEqual(3);

      const minLikes = (list: typeof posts) => Math.min(...list.map((p) => p.likes_count));
      const maxLikes = (list: typeof posts) => Math.max(...list.map((p) => p.likes_count));
      expect(minLikes(high)).toBeGreaterThan(maxLikes(medium));
      expect(minLikes(medium)).toBeGreaterThan(maxLikes(low));

      const avgReplies = (list: typeof posts) =>
        list.reduce((sum, p) => sum + p.replies_count, 0) / list.length;
      expect(avgReplies(high)).toBeGreaterThan(avgReplies(medium));
      expect(avgReplies(medium)).toBeGreaterThan(avgReplies(low));
    },
  );
});

describe("generateMockDataset - determinism", () => {
  test("same username (any input form) yields identical posts", () => {
    const a = generate("demo_user");
    const b = generateMockDataset("https://www.threads.com/@Demo_User", {
      now: () => new Date("2026-12-01T00:00:00+08:00"),
    });
    expect(b.posts).toEqual(a.posts);
  });

  test("a smaller count is a prefix of a larger count", () => {
    expect(generate("demo_user", 50).posts.slice(0, 30)).toEqual(generate("demo_user", 30).posts);
  });

  test("different usernames yield different datasets", () => {
    const a = generate("demo_user").posts.map((p) => p.content);
    const b = generate("someone_else").posts.map((p) => p.content);
    expect(b).not.toEqual(a);
  });

  test("returned posts are frozen", () => {
    const { posts } = generate();
    expect(Object.isFrozen(posts)).toBe(true);
    expect(Object.isFrozen(posts[0])).toBe(true);
  });
});
