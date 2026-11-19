/** 受保護頁面的登入檢查（PRD F1、AC-1）：未登入導向 /login，API 回 401 時清除 session 再導向。 */
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "./supabaseClient.ts";
import { loginUrl, type LoginReason } from "./redirect.ts";

function currentPath(): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

/** 第一次導向為準：401 處理時主動登出會再觸發 SIGNED_OUT，不能讓「已登出」蓋掉「已過期」。 */
let redirecting = false;

export function redirectToLogin(reason?: LoginReason): void {
  if (redirecting) return;
  redirecting = true;
  window.location.replace(loginUrl(currentPath(), reason));
}

/** 取得有效 session；沒有就導向登入頁並回傳 null（呼叫端應停止初始化）。 */
export async function requireSession(): Promise<Session | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    redirectToLogin(error ? "expired" : undefined);
    return null;
  }
  // 其他分頁登出、或 refresh token 失效時，這個分頁也跟著回到登入頁
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session) redirectToLogin("signed_out");
  });
  return data.session;
}

/** 每次呼叫 API 前取 token；supabase-js 會在快到期時自動換新。 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

/** 後端判定 token 無效（401）：清掉本機 session，帶著「已過期」提示回登入頁。 */
export async function handleUnauthorized(): Promise<void> {
  const target = loginUrl(currentPath(), "expired");
  redirecting = true;
  await getSupabase().auth.signOut({ scope: "local" });
  window.location.replace(target);
}

export async function signOut(): Promise<void> {
  // 只登出這個瀏覽器；onAuthStateChange 會負責導向
  await getSupabase().auth.signOut({ scope: "local" });
}
