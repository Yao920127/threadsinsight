import { describe, expect, test } from "vite-plus/test";
import { ApiError } from "../api/envelope.ts";
import {
  EMAIL_TAKEN,
  INVALID_CREDENTIALS,
  SESSION_EXPIRED,
  authErrorMessage,
  loginReasonMessage,
} from "./authMessages.ts";

describe("authErrorMessage", () => {
  test.each([
    [new ApiError("http", "Invalid email or password", 401), INVALID_CREDENTIALS],
    [new ApiError("http", "Email already registered", 409), EMAIL_TAKEN],
    [new ApiError("http", "Too many attempts", 429), "嘗試次數過多，請稍候一分鐘再試。"],
    [new ApiError("http", "Invalid email address", 400), "Email 格式不正確，請重新輸入。"],
    [new ApiError("http", "Password must be 8-128 characters", 400), "密碼需為 8 到 128 個字元。"],
    [
      new ApiError("network", "Network request failed"),
      "無法連線到伺服器，請確認服務已啟動後再試。",
    ],
  ])("maps %o", (error, expected) => {
    expect(authErrorMessage(error)).toBe(expected);
  });

  test("never shows raw English messages", () => {
    expect(authErrorMessage(new ApiError("http", "Boom", 500))).toBe("登入失敗，請稍後再試。");
    expect(authErrorMessage(new TypeError("x"))).toBe("登入失敗，請稍後再試。");
  });
});

test("loginReasonMessage", () => {
  expect(loginReasonMessage("expired")).toBe(SESSION_EXPIRED);
  expect(loginReasonMessage("signed_out")).toBe("已登出。");
  expect(loginReasonMessage(null)).toBe("");
});
