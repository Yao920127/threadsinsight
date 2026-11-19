/** 刪除這次測試建立的 e2e 帳號（任務、貼文會隨帳號連帶刪除）。只對本機 Supabase 執行。 */
import { E2E_EMAIL_PREFIX, E2E_EMAIL_DOMAIN } from "./fixtures.ts";
import { isLocalUrl, localSupabase } from "./supabaseLocal.ts";

interface AdminUser {
  readonly id: string;
  readonly email?: string;
}

export default async function globalTeardown(): Promise<void> {
  const { apiUrl, secretKey } = localSupabase();
  if (!secretKey || !isLocalUrl(apiUrl)) return;
  const headers = { apikey: secretKey, Authorization: `Bearer ${secretKey}` };
  const response = await fetch(`${apiUrl}/auth/v1/admin/users?per_page=1000`, { headers });
  if (!response.ok) return;
  const { users } = (await response.json()) as { users: AdminUser[] };
  const targets = users.filter(
    (u) => u.email?.startsWith(E2E_EMAIL_PREFIX) && u.email.endsWith(`@${E2E_EMAIL_DOMAIN}`),
  );
  await Promise.all(
    targets.map((u) =>
      fetch(`${apiUrl}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers }),
    ),
  );
}
