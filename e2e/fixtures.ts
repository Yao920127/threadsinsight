/**
 * E2E 共用工具：每個測試一個新帳號（測試結束後由 globalTeardown 刪除），
 * 並自動檢查頁面沒有 JavaScript 錯誤與 CSP 違規。
 */
import { expect, test as base, type Page } from "@playwright/test";
import { localSupabase } from "./supabaseLocal.ts";

export const E2E_EMAIL_PREFIX = "e2e-";
export const E2E_EMAIL_DOMAIN = "example.com";
const PASSWORD = "e2e-password-123";
const CSP_KEY = "__e2e_csp_violations";

export interface TestUser {
  readonly email: string;
  readonly password: string;
  /** 以 API 註冊時取得的 access token，供 API 直接建立測試資料。 */
  readonly accessToken: string;
}

export function uniqueEmail(): string {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${E2E_EMAIL_PREFIX}${id}@${E2E_EMAIL_DOMAIN}`;
}

/** 直接呼叫 Supabase Auth 註冊（本機未開啟信箱驗證，會立即拿到 session）。 */
export async function signUpViaApi(email = uniqueEmail()): Promise<TestUser> {
  const { apiUrl, publishableKey } = localSupabase();
  const response = await fetch(`${apiUrl}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = (await response.json()) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error(`signup failed: ${response.status}`);
  return { email, password: PASSWORD, accessToken: body.access_token };
}

export async function loginViaUi(page: Page, user: TestUser, path = "/login"): Promise<void> {
  await page.goto(path);
  const form = page.getByRole("form", { name: "Email 與密碼" });
  await form.getByLabel("Email", { exact: true }).fill(user.email);
  await form.getByLabel("密碼", { exact: true }).fill(user.password);
  await form.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page.locator("#account")).toBeVisible();
}

/** 以 API 建立已完成的任務（比較頁等測試的前置資料）。 */
export async function createTaskViaApi(
  baseURL: string,
  user: TestUser,
  username: string,
  count: number,
): Promise<string> {
  const response = await fetch(new URL("/api/tasks", baseURL), {
    method: "POST",
    headers: { Authorization: `Bearer ${user.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ username, count, force: true }),
  });
  const body = (await response.json()) as { data?: { task?: { id?: string } } };
  const id = body.data?.task?.id;
  if (!response.ok || !id) throw new Error(`create task failed: ${response.status}`);
  return id;
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow, "頁面不應水平捲動").toBe(false);
}

export const test = base.extend<{ user: TestUser }>({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // CSP 違規記在 sessionStorage，換頁後仍保留
    await page.addInitScript((key) => {
      document.addEventListener("securitypolicyviolation", (event) => {
        const list = JSON.parse(sessionStorage.getItem(key) ?? "[]") as string[];
        list.push(`${event.violatedDirective} ${event.blockedURI}`);
        sessionStorage.setItem(key, JSON.stringify(list));
      });
    }, CSP_KEY);
    await use(page);
    const violations = await page
      .evaluate((key) => JSON.parse(sessionStorage.getItem(key) ?? "[]") as string[], CSP_KEY)
      .catch(() => []);
    expect(errors, "頁面不應有 JavaScript 錯誤").toEqual([]);
    expect(violations, "頁面不應有 CSP 違規").toEqual([]);
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright fixture 需要物件解構
  user: async ({}, use) => {
    await use(await signUpViaApi());
  },
});

export { expect };
