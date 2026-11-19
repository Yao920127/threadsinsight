import { describe, expect, test, vi } from "vite-plus/test";
import { generateMockDataset } from "../mock/index.ts";
import { toCleanDataset } from "../test/cleanDataset.ts";
import { ApiError, fetchMockPosts, isUnauthorized } from "./mockPostsClient.ts";

const dataset = JSON.parse(JSON.stringify(toCleanDataset(generateMockDataset("demo_user"))));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Data-Source": "mock_dataset" },
  });
}

describe("fetchMockPosts", () => {
  test("requests the endpoint with encoded query and returns the dataset", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ success: true, data: dataset, error: null }),
    );

    const result = await fetchMockPosts("@demo user", 40, {
      fetchImpl,
      baseUrl: "http://api.test",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://api.test/api/mock-posts?username=%40demo+user&count=40",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(result.username).toBe("demo_user");
    expect(result.posts).toHaveLength(30);
  });

  test("surfaces the server error message with its status", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ success: false, data: null, error: "Invalid Threads username: 'x y'" }, 400),
    );

    const error = await fetchMockPosts("x y", 30, { fetchImpl }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).message).toMatch(/username/);
  });

  test("sends the access token as a bearer header", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ success: true, data: dataset, error: null }),
    );
    await fetchMockPosts("demo_user", 30, { fetchImpl, accessToken: "header.payload.sig" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("header.payload.sig");
    expect(init.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer header.payload.sig",
    });
  });

  test("flags 401 responses as unauthorized", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ success: false, data: null, error: "Authentication required" }, 401),
    );
    const error = await fetchMockPosts("demo_user", 30, { fetchImpl }).catch((e: unknown) => e);
    expect(isUnauthorized(error)).toBe(true);
    expect(isUnauthorized(new ApiError("http", "x", 400))).toBe(false);
    expect(isUnauthorized(new Error("x"))).toBe(false);
  });

  test("reports a network failure as a connection error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const error = await fetchMockPosts("demo_user", 30, { fetchImpl }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("network");
  });

  test("rethrows aborts untouched so callers can ignore superseded requests", async () => {
    const abort = new DOMException("aborted", "AbortError");
    const fetchImpl = vi.fn(async () => {
      throw abort;
    });
    await expect(fetchMockPosts("demo_user", 30, { fetchImpl })).rejects.toBe(abort);
  });

  test("rejects a non-JSON body", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>", { status: 502 }));
    const error = await fetchMockPosts("demo_user", 30, { fetchImpl }).catch((e: unknown) => e);
    expect((error as ApiError).kind).toBe("invalid_response");
    expect((error as ApiError).status).toBe(502);
  });

  test.each([
    ["non-mock data source", { ...dataset, data_source: "scraped" }],
    ["a missing cleaning report", { ...dataset, cleaning: undefined }],
    ["a missing grouping summary", { ...dataset, grouping: undefined }],
    ["missing statistics", { ...dataset, stats: undefined }],
    ["missing NLP analysis", { ...dataset, nlp: undefined }],
    ["missing strategy", { ...dataset, strategy: undefined }],
    [
      "a rewrite of a real post url",
      {
        ...dataset,
        strategy: {
          ...dataset.strategy,
          rewrite: { ...dataset.strategy.rewrite, post_url: "https://www.threads.com/@x/post/1" },
        },
      },
    ],
    ["an unknown topic", { ...dataset, posts: [{ ...dataset.posts[0], topic: "sports" }] }],
    [
      "a group sample pointing at a real url",
      {
        ...dataset,
        nlp: {
          ...dataset.nlp,
          groups: [
            { ...dataset.nlp.groups[0], sample_urls: ["https://www.threads.com/@x/post/1"] },
          ],
        },
      },
    ],
    [
      "a malformed weekday-hour matrix",
      { ...dataset, stats: { ...dataset.stats, weekday_hour: [[1, 2, 3]] } },
    ],
    [
      "a negative average",
      {
        ...dataset,
        stats: { ...dataset.stats, averages: { ...dataset.stats.averages, likes: -1 } },
      },
    ],
    [
      "an unknown engagement group",
      { ...dataset, posts: [{ ...dataset.posts[0], engagement_group: "viral" }] },
    ],
    [
      "a post without extracted features",
      { ...dataset, posts: [{ ...dataset.posts[0], char_count: undefined }] },
    ],
    ["an unknown post type", { ...dataset, posts: [{ ...dataset.posts[0], post_type: "video" }] }],
    [
      "a post not flagged synthetic",
      { ...dataset, posts: [{ ...dataset.posts[0], is_synthetic: false }] },
    ],
    [
      "a real threads.com post url",
      {
        ...dataset,
        posts: [{ ...dataset.posts[0], post_url: "https://www.threads.com/@x/post/1" }],
      },
    ],
    ["missing posts", { ...dataset, posts: undefined }],
  ])("refuses a payload with %s (Mock Dataset rule 8: never mix data)", async (_, data) => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true, data, error: null }));
    const error = await fetchMockPosts("demo_user", 30, { fetchImpl }).catch((e: unknown) => e);
    expect((error as ApiError).kind).toBe("invalid_response");
  });
});
