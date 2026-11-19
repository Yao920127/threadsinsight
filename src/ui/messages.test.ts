import { describe, expect, test } from "vite-plus/test";
import { ApiError } from "../api/envelope.ts";
import { toUserMessage } from "./messages.ts";

describe("toUserMessage", () => {
  test.each([
    [new ApiError("network", "x"), /無法連線.*API/],
    [new ApiError("http", "Invalid Threads username: 'a b'", 400), /帳號格式/],
    [new ApiError("http", "Invalid query parameter(s): count", 400), /1 到 50/],
    [new ApiError("http", "Failed to generate mock dataset", 500), /伺服器.*稍後/],
    [new ApiError("invalid_response", "x", 200), /格式不符/],
    [new ApiError("http", "Authentication required", 401), /登入階段已過期/],
    [new ApiError("http", "Database unavailable", 503), /資料庫暫時無法使用/],
    [new ApiError("http", "Analysis failed", 500), /重新執行/],
    [new ApiError("http", "Task not found", 404), /找不到/],
    [new ApiError("http", "Task is not completed", 409), /尚未完成/],
    [new ApiError("http", "Too many analysis requests", 429), /稍候一分鐘/],
    [new DOMException("t", "TimeoutError"), /逾時/],
    [new Error("boom"), /未預期/],
  ])("maps %o to a Traditional Chinese message", (error, expected) => {
    expect(toUserMessage(error)).toMatch(expected);
  });
});
