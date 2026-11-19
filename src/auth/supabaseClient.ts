/** 前端唯一的 Supabase client。只使用 publishable key；資料存取權限由 RLS 決定。 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class AuthConfigError extends Error {
  constructor() {
    super("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
    this.name = "AuthConfigError";
  }
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new AuthConfigError();
  client = createClient(url, key, {
    auth: {
      // PKCE：Magic Link 回來時以一次性 code 換 session，token 不出現在網址上
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}
