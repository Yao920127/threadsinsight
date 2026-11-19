/**
 * E2E 共用工具：每個測試一個新帳號（測試結束時刪除），並自動檢查頁面沒有 JavaScript 錯誤與 CSP 違規。
 *
 * 帳號一律透過 API 建立，再把登入 cookie 放進瀏覽器，避免每個測試都走登入畫面而用光
 * 登入次數上限；登入畫面本身由 auth.e2e.ts 測試。
 */
import {
  expect,
  request as playwrightRequest,
  test as base,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

export const E2E_EMAIL_PREFIX = "e2e-";
export const E2E_EMAIL_DOMAIN = "example.com";
export const PASSWORD = "e2e-password-123";
const CSP_KEY = "__e2e_csp_violations";
const RATE_LIMIT_WAIT_MS = 15_000;
const RATE_LIMIT_RETRIES = 8;

export interface TestUser {
  readonly email: string;
  readonly password: string;
  /** 帶著這個帳號登入 cookie 的 API 連線，可直接建立測試資料或刪除帳號。 */
  readonly api: APIRequestContext;
}

export function uniqueEmail(): string {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${E2E_EMAIL_PREFIX}${id}@${E2E_EMAIL_DOMAIN}`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** 呼叫登入或註冊；遇到次數上限（429）就等一下再試。 */
async function authPost(api: APIRequestContext, path: string, email: string, password: string) {
  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt += 1) {
    const response = await api.post(path, { data: { email, password } });
    if (response.status() !== 429) return response;
    await sleep(RATE_LIMIT_WAIT_MS);
  }
  throw new Error(`${path} kept hitting the rate limit`);
}

/** 以 API 註冊並登入，回傳帶著登入 cookie 的連線。 */
export async function signUpViaApi(baseURL: string, email = uniqueEmail()): Promise<TestUser> {
  const api = await playwrightRequest.newContext({ baseURL });
  const response = await authPost(api, "/api/auth/signup", email, PASSWORD);
  if (response.status() !== 201) throw new Error(`signup failed: ${response.status()}`);
  return { email, password: PASSWORD, api };
}

/** 用帳號密碼登入取得連線（給在畫面上建立、需要事後刪除的帳號使用）。 */
export async function signInViaApi(baseURL: string, email: string): Promise<APIRequestContext> {
  const api = await playwrightRequest.newContext({ baseURL });
  const response = await authPost(api, "/api/auth/login", email, PASSWORD);
  if (response.status() !== 200) throw new Error(`login failed: ${response.status()}`);
  return api;
}

export async function deleteAccount(api: APIRequestContext): Promise<void> {
  await api.delete("/api/auth/me");
  await api.dispose();
}

/** 把 API 連線的登入 cookie 放進瀏覽器，直接以該帳號開頁面。 */
export async function useSession(page: Page, user: TestUser): Promise<void> {
  const { cookies } = await user.api.storageState();
  await page.context().addCookies(cookies);
}

export async function loginViaUi(page: Page, email: string, path = "/login"): Promise<void> {
  await page.goto(path);
  const form = page.getByRole("form", { name: "Email 與密碼" });
  await form.getByLabel("Email", { exact: true }).fill(email);
  await form.getByLabel("密碼", { exact: true }).fill(PASSWORD);
  await form.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page.locator("#account")).toBeVisible();
}

/** 以 API 建立已完成的任務（比較頁等測試的前置資料）。 */
export async function createTaskViaApi(
  user: TestUser,
  username: string,
  count: number,
): Promise<string> {
  const response = await user.api.post("/api/tasks", { data: { username, count, force: true } });
  const body = (await response.json()) as { data?: { task?: { id?: string } } };
  const id = body.data?.task?.id;
  if (!response.ok() || !id) throw new Error(`create task failed: ${response.status()}`);
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
  user: async ({ baseURL }, use) => {
    const user = await signUpViaApi(baseURL ?? "");
    await use(user);
    await deleteAccount(user.api);
  },
});

export { expect };
