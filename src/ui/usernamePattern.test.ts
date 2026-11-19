/**
 * index.html 的 username `pattern` 由瀏覽器以 RegExp `v` 旗標編譯；
 * 若在 v 模式下無效，瀏覽器會「默默忽略」整條規則，前端驗證就失效。
 */
import { describe, expect, test } from "vite-plus/test";
import html from "../../index.html?raw";

const pattern = html.match(/id="username"[\s\S]*?pattern="([^"]+)"/)?.[1] ?? "";

function compile(): RegExp {
  return new RegExp(`^(?:${pattern})$`, "v");
}

describe("username input pattern", () => {
  test("is valid under the v flag that browsers use for pattern attributes", () => {
    expect(pattern).not.toBe("");
    expect(compile).not.toThrow();
  });

  test.each([
    "demo_user",
    "@demo_user",
    " demo_user ",
    "demo.user_01",
    "https://www.threads.com/@demo_user",
    "threads.net/@demo_user?hl=zh-tw",
    "https://www.threads.com/@demo_user/post/abc",
  ])("accepts %j", (value) => {
    expect(compile().test(value)).toBe(true);
  });

  test.each(["bad name!", "中文帳號", "a".repeat(31), "https://example.com/@demo_user", ""])(
    "rejects %j",
    (value) => {
      expect(compile().test(value)).toBe(false);
    },
  );
});
