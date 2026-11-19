/** 會員 API 的錯誤轉成繁體中文訊息；原始英文訊息不直接顯示（PRD 例外情境 1）。 */
import { ApiError } from "../api/envelope.ts";
import type { LoginReason } from "./redirect.ts";

export const INVALID_CREDENTIALS = "帳號或密碼錯誤，請重新輸入。";
export const SESSION_EXPIRED = "登入階段已過期，請重新登入。";
export const EMAIL_TAKEN = "這個 Email 已經註冊，請直接登入。";
const RATE_LIMITED = "嘗試次數過多，請稍候一分鐘再試。";
const NETWORK = "無法連線到伺服器，請確認服務已啟動後再試。";
const INVALID_EMAIL = "Email 格式不正確，請重新輸入。";
const INVALID_PASSWORD = "密碼需為 8 到 128 個字元。";
const GENERIC = "登入失敗，請稍後再試。";

export function authErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return GENERIC;
  if (error.kind === "network") return NETWORK;
  if (error.status === 401) return INVALID_CREDENTIALS;
  if (error.status === 409) return EMAIL_TAKEN;
  if (error.status === 429) return RATE_LIMITED;
  if (error.status === 400)
    return /password/i.test(error.message) ? INVALID_PASSWORD : INVALID_EMAIL;
  return GENERIC;
}

export function loginReasonMessage(reason: LoginReason | null): string {
  if (reason === "expired") return SESSION_EXPIRED;
  if (reason === "signed_out") return "已登出。";
  return "";
}
