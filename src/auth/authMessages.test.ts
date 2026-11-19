import { describe, expect, test } from "vite-plus/test";
import {
  INVALID_CREDENTIALS,
  SESSION_EXPIRED,
  authErrorMessage,
  loginReasonMessage,
} from "./authMessages.ts";

describe("authErrorMessage", () => {
  test("maps known Supabase codes to Traditional Chinese", () => {
    expect(authErrorMessage({ code: "invalid_credentials", status: 400 })).toBe(
      INVALID_CREDENTIALS,
    );
    expect(authErrorMessage({ code: "refresh_token_not_found", status: 400 })).toBe(
      SESSION_EXPIRED,
    );
    expect(authErrorMessage({ code: "user_already_exists", status: 422 })).toContain("已經註冊");
  });

  test("explains network failures", () => {
    expect(authErrorMessage({ name: "AuthRetryableFetchError", status: 0 })).toContain(
      "supabase start",
    );
  });

  test("handles rate limits without a code", () => {
    expect(authErrorMessage({ status: 429 })).toContain("稍候");
  });

  test("never shows raw English messages", () => {
    const message = authErrorMessage({ code: "something_new", status: 500, message: "Boom" });
    expect(message).toBe("登入失敗，請稍後再試。");
    expect(authErrorMessage(new TypeError("x"))).toContain("暫時無法使用");
    expect(authErrorMessage(null)).toContain("暫時無法使用");
  });
});

test("loginReasonMessage", () => {
  expect(loginReasonMessage("expired")).toBe(SESSION_EXPIRED);
  expect(loginReasonMessage("signed_out")).toBe("已登出。");
  expect(loginReasonMessage(null)).toBe("");
});
