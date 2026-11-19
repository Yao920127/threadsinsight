/**
 * 部署環境的安全標頭（docker compose 的 nginx）。只在 E2E_BASE_URL 指向部署環境時執行；
 * 開發伺服器（vp dev）沒有這些標頭。
 */
import { expect, test } from "./fixtures.ts";

test.skip(!process.env.E2E_BASE_URL, "只檢查部署環境（設定 E2E_BASE_URL）");

for (const path of ["/", "/login", "/compare"]) {
  test(`${path} 帶有嚴格 CSP 與安全標頭`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const headers = response.headers();
    const csp = headers["content-security-policy"] ?? "";
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["cache-control"]).toBe("no-cache");
  });
}

test("API 回應不可快取、帶 request id", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["x-request-id"]).toMatch(/^[0-9a-f]{32}$/);
});
