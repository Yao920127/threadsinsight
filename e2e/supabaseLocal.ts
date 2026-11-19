/**
 * E2E 用的本機 Supabase 設定。優先讀環境變數，否則向 `supabase status` 查詢（不寫入任何檔案）。
 * secret key 只用於測試結束後刪除 e2e 帳號，且只允許本機網址。
 */
import { execFileSync } from "node:child_process";

export interface LocalSupabase {
  readonly apiUrl: string;
  readonly publishableKey: string;
  readonly mailpitUrl: string;
  readonly secretKey: string | null;
}

interface StatusJson {
  readonly API_URL?: string;
  readonly PUBLISHABLE_KEY?: string;
  readonly MAILPIT_URL?: string;
  readonly SECRET_KEY?: string;
}

function readStatus(): StatusJson {
  try {
    const output = execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(output) as StatusJson;
  } catch {
    return {};
  }
}

let cached: LocalSupabase | null = null;

export function localSupabase(): LocalSupabase {
  if (cached) return cached;
  const env = process.env;
  const needsStatus = !env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const status = needsStatus || !env.E2E_SUPABASE_SECRET_KEY ? readStatus() : {};
  const apiUrl = env.VITE_SUPABASE_URL ?? status.API_URL;
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? status.PUBLISHABLE_KEY;
  if (!apiUrl || !publishableKey) {
    throw new Error("找不到本機 Supabase：請先執行 supabase start（見 README）");
  }
  cached = {
    apiUrl,
    publishableKey,
    mailpitUrl: env.E2E_MAILPIT_URL ?? status.MAILPIT_URL ?? "http://127.0.0.1:54324",
    secretKey: env.E2E_SUPABASE_SECRET_KEY ?? status.SECRET_KEY ?? null,
  };
  return cached;
}

export function isLocalUrl(url: string): boolean {
  const { hostname } = new URL(url);
  return hostname === "127.0.0.1" || hostname === "localhost";
}
