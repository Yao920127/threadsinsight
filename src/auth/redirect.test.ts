import { describe, expect, test } from "vite-plus/test";
import { loginUrl, parseLoginReason, safeNextPath } from "./redirect.ts";

const ORIGIN = "http://localhost:5173";

describe("safeNextPath", () => {
  test("keeps same-origin paths with query and hash", () => {
    expect(safeNextPath("/?username=demo_user&count=40", ORIGIN)).toBe(
      "/?username=demo_user&count=40",
    );
    expect(safeNextPath("/compare#top", ORIGIN)).toBe("/compare#top");
  });

  test.each([
    null,
    "",
    "https://evil.example/",
    "//evil.example/path",
    "/\\evil.example",
    "javascript:alert(1)",
    "evil",
    "/login",
    "/login?next=/",
  ])("falls back to home for unsafe value %s", (raw) => {
    expect(safeNextPath(raw, ORIGIN)).toBe("/");
  });
});

describe("loginUrl", () => {
  test("omits next for home and adds reason", () => {
    expect(loginUrl("/")).toBe("/login");
    expect(loginUrl("/", "expired")).toBe("/login?reason=expired");
  });

  test("encodes next path", () => {
    expect(loginUrl("/?username=demo_user&count=40")).toBe(
      "/login?next=%2F%3Fusername%3Ddemo_user%26count%3D40",
    );
  });
});

describe("parseLoginReason", () => {
  test("accepts known reasons only", () => {
    expect(parseLoginReason("expired")).toBe("expired");
    expect(parseLoginReason("signed_out")).toBe("signed_out");
    expect(parseLoginReason("<script>")).toBeNull();
    expect(parseLoginReason(null)).toBeNull();
  });
});
