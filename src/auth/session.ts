/** 受保護頁面的登入檢查（PRD F1、AC-1）：未登入導向 /login，API 回 401 時帶著「已過期」提示回登入頁。 */
import { isUnauthorized } from "../api/envelope.ts";
import { fetchCurrentAccount, signOutRequest, type Account } from "./authClient.ts";
import { loginUrl, type LoginReason } from "./redirect.ts";

const SESSION_CHECK_TIMEOUT_MS = 10_000;

function currentPath(): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

/** 第一次導向為準，避免連續的 401 互相覆蓋提示。 */
let redirecting = false;

export function redirectToLogin(reason?: LoginReason): void {
  if (redirecting) return;
  redirecting = true;
  window.location.replace(loginUrl(currentPath(), reason));
}

/**
 * 向後端確認登入狀態；沒登入就導向登入頁並回傳 null（呼叫端應停止初始化）。
 * 後端無法連線等其他錯誤會丟出，由頁面顯示錯誤訊息。
 */
export async function requireSession(): Promise<Account | null> {
  try {
    return await fetchCurrentAccount({ signal: AbortSignal.timeout(SESSION_CHECK_TIMEOUT_MS) });
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
    redirectToLogin();
    return null;
  }
}

/** 後端判定登入狀態無效（401）：帶著「已過期」提示回登入頁。 */
export function handleUnauthorized(): void {
  redirectToLogin("expired");
}

export async function signOut(): Promise<void> {
  try {
    await signOutRequest({ signal: AbortSignal.timeout(SESSION_CHECK_TIMEOUT_MS) });
  } finally {
    // 不論伺服器是否回應，都回登入頁；cookie 已由伺服器清除，或會在到期後失效
    redirectToLogin("signed_out");
  }
}
