/** Supabase Auth 錯誤轉成繁體中文訊息；原始英文訊息不直接顯示（PRD 例外情境 1）。 */
import type { LoginReason } from "./redirect.ts";

export const INVALID_CREDENTIALS = "帳號或密碼錯誤，請重新輸入。";
export const SESSION_EXPIRED = "登入階段已過期，請重新登入。";

const MESSAGES: Readonly<Record<string, string>> = {
  invalid_credentials: INVALID_CREDENTIALS,
  user_already_exists: "這個 Email 已經註冊，請直接登入。",
  email_exists: "這個 Email 已經註冊，請直接登入。",
  weak_password: "密碼強度不足，請至少使用 8 個字元。",
  email_address_invalid: "Email 格式不正確，請重新輸入。",
  email_not_confirmed: "這個 Email 尚未完成驗證，請先到信箱點擊確認連結。",
  over_email_send_rate_limit: "寄信次數過多，請稍候幾分鐘再試。",
  over_request_rate_limit: "嘗試次數過多，請稍候幾分鐘再試。",
  signup_disabled: "目前不開放註冊新帳號。",
  otp_expired: "登入連結已失效，請重新寄送。",
  flow_state_expired: "登入連結已失效，請重新寄送。",
  flow_state_not_found: "登入連結無法使用，請在同一個瀏覽器重新寄送。",
  bad_code_verifier: "登入連結無法使用，請在同一個瀏覽器重新寄送。",
  session_expired: SESSION_EXPIRED,
  session_not_found: SESSION_EXPIRED,
  refresh_token_not_found: SESSION_EXPIRED,
  refresh_token_already_used: SESSION_EXPIRED,
};

interface AuthErrorLike {
  readonly code?: string | undefined;
  readonly status?: number | undefined;
  readonly name?: string;
}

function isAuthErrorLike(error: unknown): error is AuthErrorLike {
  return typeof error === "object" && error !== null && ("code" in error || "status" in error);
}

export function authErrorMessage(error: unknown): string {
  if (!isAuthErrorLike(error)) return "登入服務暫時無法使用，請稍後再試。";
  const byCode = error.code ? MESSAGES[error.code] : undefined;
  if (byCode) return byCode;
  if (error.name === "AuthRetryableFetchError" || error.status === 0) {
    return "無法連線到登入服務，請確認 Supabase 已啟動（supabase start）。";
  }
  if (error.status === 429) return MESSAGES.over_request_rate_limit ?? "";
  return "登入失敗，請稍後再試。";
}

export function loginReasonMessage(reason: LoginReason | null): string {
  if (reason === "expired") return SESSION_EXPIRED;
  if (reason === "signed_out") return "已登出。";
  return "";
}
