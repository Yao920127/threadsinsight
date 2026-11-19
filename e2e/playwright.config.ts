/**
 * E2E 測試（Playwright）。預設對線上版執行；E2E_BASE_URL 可改成其他部署，
 * 例如本機 docker compose（http://localhost:8080）。
 *
 * - 每個測試自建一個 e2e-…@example.com 帳號，結束時透過「刪除自己的帳號」清掉，不留資料。
 * - 線上版不設定伺服器端的 AI 金鑰，測試也不輸入金鑰，因此不會產生 AI 費用。
 * - 瀏覽器預設用 Playwright 內建 Chromium（vpx playwright install chromium）；
 *   E2E_BROWSER_CHANNEL=chrome 可改用本機 Chrome。
 */
import { defineConfig, devices } from "@playwright/test";

export const PRODUCTION_URL = "https://web-production-b6984bbe.up.railway.app";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.e2e.ts",
  outputDir: "../test-results/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // 線上版共用登入次數上限（每個 IP 每分鐘 30 次），平行數量不宜太高
  workers: 3,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "../playwright-report", open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? PRODUCTION_URL,
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
});
