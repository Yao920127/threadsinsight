import { describe, expect, test } from "vite-plus/test";
import { normalizeUsername } from "./normalizeUsername.ts";

describe("normalizeUsername", () => {
  test.each([
    ["demo_user", "demo_user"],
    ["@demo_user", "demo_user"],
    ["  @Demo_User  ", "demo_user"],
    ["https://www.threads.com/@demo_user", "demo_user"],
    ["https://threads.com/@demo_user/", "demo_user"],
    ["https://www.threads.net/@demo.user_01?hl=zh-tw", "demo.user_01"],
    ["https://www.threads.com/@demo_user/post/ABC123", "demo_user"],
    ["www.threads.com/@demo_user", "demo_user"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeUsername(input)).toBe(expected);
  });

  test.each([
    [""],
    ["   "],
    ["@"],
    ["bad name"],
    ["中文帳號"],
    ["a".repeat(31)],
    ["https://example.com/@demo_user"],
    ["https://www.threads.com/"],
  ])("rejects invalid input %j", (input) => {
    expect(() => normalizeUsername(input)).toThrow(/username/i);
  });
});
