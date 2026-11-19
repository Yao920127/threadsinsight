/** 登入前後的導向：只接受站內路徑，避免 ?next= 被拿來把使用者導到外部網站（open redirect）。 */

export const LOGIN_PATH = "/login";
export const HOME_PATH = "/";

/** 為什麼被送到登入頁；登入頁依此顯示提示。 */
export type LoginReason = "expired" | "signed_out";

const LOGIN_REASONS: readonly LoginReason[] = ["expired", "signed_out"];

/** 只允許同源的絕對路徑；`//evil.com`、`/\evil.com`、`https://…` 與登入頁本身都退回首頁。 */
export function safeNextPath(raw: string | null | undefined, origin: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return HOME_PATH;
  }
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin || url.pathname === LOGIN_PATH) return HOME_PATH;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return HOME_PATH;
  }
}

export function loginUrl(next: string, reason?: LoginReason): string {
  const params = new URLSearchParams();
  if (next !== HOME_PATH) params.set("next", next);
  if (reason) params.set("reason", reason);
  const query = params.toString();
  return query ? `${LOGIN_PATH}?${query}` : LOGIN_PATH;
}

export function parseLoginReason(raw: string | null): LoginReason | null {
  return LOGIN_REASONS.find((reason) => reason === raw) ?? null;
}
