/** 登入流程（PRD F1、AC-1、例外情境 1）。 */
import { request as playwrightRequest } from "@playwright/test";
import {
  PASSWORD,
  deleteAccount,
  expect,
  expectNoHorizontalScroll,
  loginViaUi,
  signInViaApi,
  test,
  uniqueEmail,
} from "./fixtures.ts";

test.describe("未登入", () => {
  for (const path of ["/", "/compare", "/?task=aaaaaaaa-0000-0000-0000-000000000001"]) {
    test(`${path} 導向登入頁並保留原網址`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      const next = new URL(page.url()).searchParams.get("next") ?? "/";
      expect(next).toBe(path);
    });
  }

  test("API 回 401", async ({ request }) => {
    const response = await request.get("/api/tasks");
    expect(response.status()).toBe(401);
  });
});

test("密碼錯誤顯示中文訊息，且不透露帳號是否存在", async ({ page, user }) => {
  for (const email of [user.email, uniqueEmail()]) {
    await page.goto("/login");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill("wrong-password-1");
    await page.getByRole("button", { name: "登入", exact: true }).click();
    await expect(page.locator("#login-status")).toHaveText(/帳號或密碼錯誤/);
    await expect(page.locator("#password")).toHaveValue("");
  }
});

test("建立帳號後進入儀表板，登出後回到登入頁", async ({ page, baseURL }) => {
  const email = uniqueEmail();
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "建立帳號" }).click();
  await expect(page.locator("#account-email")).toHaveText(email);

  await page.getByRole("button", { name: "登出" }).click();
  await expect(page).toHaveURL(/\/login\?reason=signed_out/);
  await expect(page.locator("#login-status")).toHaveText("已登出。");

  await deleteAccount(await signInViaApi(baseURL ?? "", email));
});

test("同一個 Email 不能重複註冊", async ({ page, user }) => {
  await page.goto("/login");
  await page.locator("#email").fill(user.email.toUpperCase());
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "建立帳號" }).click();
  await expect(page.locator("#login-status")).toHaveText(/已經註冊/);
});

test("登入後回到原本要去的頁面", async ({ page, user }) => {
  await page.goto("/compare");
  await expect(page).toHaveURL(/\/login\?next=%2Fcompare/);
  await loginViaUi(page, user.email, page.url());
  await expect(page).toHaveURL(/\/compare$/);
});

test("不會被導向外部網站", async ({ page, user }) => {
  await page.goto("/");
  const origin = new URL(page.url()).origin;
  await loginViaUi(page, user.email, "/login?next=//evil.example/");
  expect(page.url()).toBe(`${origin}/`);
});

test("登入狀態在伺服器端失效後，操作時回到登入頁並提示已過期", async ({ page, user, baseURL }) => {
  await loginViaUi(page, user.email);
  // 用另一個連線帶著同一個 cookie 登出：伺服器作廢登入狀態，但瀏覽器裡的 cookie 還在
  const cookies = await page.context().cookies();
  const other = await playwrightRequest.newContext({
    baseURL,
    storageState: { cookies, origins: [] },
  });
  await other.post("/api/auth/logout");
  await other.dispose();

  await page.locator("#username").fill("demo_user");
  await page.getByRole("button", { name: "開始分析" }).click();
  await expect(page).toHaveURL(/reason=expired/);
  await expect(page.locator("#login-status")).toHaveText(/登入階段已過期/);
});

test("登入 cookie 是 HttpOnly，網頁程式讀不到", async ({ page, user }) => {
  await loginViaUi(page, user.email);
  const cookie = (await page.context().cookies()).find((c) => c.name === "ti_session");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  expect(await page.evaluate(() => document.cookie)).not.toContain("ti_session");
});

test("登入頁在 320px 寬度不會水平捲動", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/login");
  await expectNoHorizontalScroll(page);
});
