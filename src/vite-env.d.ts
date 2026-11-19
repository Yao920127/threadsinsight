/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** 本機 Supabase CLI：http://127.0.0.1:54321（`supabase status` 的 API_URL）。 */
  readonly VITE_SUPABASE_URL?: string;
  /** 可公開的 publishable key（`supabase status` 的 PUBLISHABLE_KEY）；絕不可放 secret／service role key。 */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
