/** 需要登入的頁面共用初始化（PRD F1）：確認 session、顯示右上角帳號與登出按鈕。 */
import type { Session } from "@supabase/supabase-js";
import { requireSession, signOut } from "./session.ts";
import { AuthConfigError } from "./supabaseClient.ts";

export interface AccountElements {
  readonly account: HTMLElement;
  readonly accountEmail: HTMLElement;
  readonly signOutButton: HTMLButtonElement;
}

export const AUTH_CONFIG_MESSAGE =
  "尚未設定 Supabase：請在 .env 填入 VITE_SUPABASE_URL 與 VITE_SUPABASE_PUBLISHABLE_KEY。";
const AUTH_UNKNOWN_MESSAGE = "無法確認登入狀態，請重新整理頁面。";

/**
 * 回傳 session；未登入時已導向 /login 並回傳 null。無法確認登入狀態時呼叫 onError 並回傳 null。
 * 確認前頁面內容由 CSS（[data-auth="pending"]）隱藏，避免未登入者先看到畫面。
 */
export async function initProtectedPage(
  elements: AccountElements,
  onError: (message: string) => void,
): Promise<Session | null> {
  elements.signOutButton.addEventListener("click", () => {
    elements.signOutButton.disabled = true;
    void signOut();
  });
  try {
    const session = await requireSession();
    if (session === null) return null;
    elements.accountEmail.textContent = session.user.email ?? "已登入";
    elements.account.hidden = false;
    document.documentElement.dataset.auth = "ready";
    return session;
  } catch (error) {
    document.documentElement.dataset.auth = "ready";
    onError(error instanceof AuthConfigError ? AUTH_CONFIG_MESSAGE : AUTH_UNKNOWN_MESSAGE);
    return null;
  }
}
