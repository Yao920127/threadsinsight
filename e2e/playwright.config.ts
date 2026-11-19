/**
 * E2E 測試（Playwright）。前提：本機 Supabase 已啟動（supabase start）。
 *
 * - 預設自動啟動 FastAPI（8000）與 vp dev（5173）；已在執行時直接沿用。
 * - E2E_BASE_URL=http://localhost:8080 可改測 docker compose（不啟動伺服器，並檢查 CSP 標頭）。
 * - AI 建議一律關閉（THREADSINSIGHT_AI=off），測試不會產生 API 費用。
 * - 瀏覽器預設用 Playwright 內建 Chromium（vpx playwright install chromium）；
 *   E2E_BROWSER_CHANNEL=chrome 可改用本機 Chrome。
 */
import { defineConfig, devices } from "@playwright/test";
import { localSupabase } from "./supabaseLocal.ts";

const supabase = localSupabase();
const externalBaseUrl = process.env.E2E_BASE_URL;
const baseURL = externalBaseUrl ?? "http://localhost:5173";

// 測試與 webServer 都從這裡讀設定（worker 會繼承 process.env）
process.env.VITE_SUPABASE_URL = supabase.apiUrl;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = supabase.publishableKey;

const serverEnv = {
  ...process.env,
  SUPABASE_URL: supabase.apiUrl,
  SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
  THREADSINSIGHT_AI: "off",
  LOG_FORMAT: "text",
} as Record<string, string>;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.e2e.ts",
  outputDir: "../test-results/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "../playwright-report", open: "never" }]],
  globalTeardown: "./globalTeardown.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: process.env.E2E_BROWSER_CHANNEL },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : [
        {
          command: "uv run uvicorn index:app --app-dir api --port 8000",
          cwd: "..",
          url: "http://127.0.0.1:8000/api/health",
          reuseExistingServer: !process.env.CI,
          env: serverEnv,
          timeout: 60_000,
        },
        {
          command: "vp dev --port 5173 --strictPort",
          cwd: "..",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          env: serverEnv,
          timeout: 60_000,
        },
      ],
});
