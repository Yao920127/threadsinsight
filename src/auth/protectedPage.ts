/** 需要登入的頁面共用初始化（PRD F1）：確認登入狀態、顯示右上角帳號與登出按鈕。 */
import type { Account } from "./authClient.ts";
import { requireSession, signOut } from "./session.ts";

export interface AccountElements {
  readonly account: HTMLElement;
  readonly accountEmail: HTMLElement;
  readonly signOutButton: HTMLButtonElement;
}

const SESSION_UNAVAILABLE_MESSAGE = "無法確認登入狀態，請確認伺服器已啟動後重新整理頁面。";

/**
 * 回傳目前帳號；未登入時已導向 /login 並回傳 null。無法確認登入狀態時呼叫 onError 並回傳 null。
 * 確認前頁面內容由 CSS（[data-auth="pending"]）隱藏，避免未登入者先看到畫面。
 */
export async function initProtectedPage(
  elements: AccountElements,
  onError: (message: string) => void,
): Promise<Account | null> {
  elements.signOutButton.addEventListener("click", () => {
    elements.signOutButton.disabled = true;
    void signOut();
  });
  try {
    const account = await requireSession();
    if (account === null) return null;
    elements.accountEmail.textContent = account.email;
    elements.account.hidden = false;
    document.documentElement.dataset.auth = "ready";
    return account;
  } catch {
    document.documentElement.dataset.auth = "ready";
    onError(SESSION_UNAVAILABLE_MESSAGE);
    return null;
  }
}
