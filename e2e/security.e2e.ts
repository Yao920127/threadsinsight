/** 部署環境的安全標頭（nginx 與 API）。開發伺服器（vp dev）沒有這些標頭，E2E 只對部署環境執行。 */
import { expect, test } from "./fixtures.ts";

for (const path of ["/", "/login", "/compare"]) {
  test(`${path} 帶有嚴格 CSP 與安全標頭`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const headers = response.headers();
    const csp = headers["content-security-policy"] ?? "";
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self';");
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
