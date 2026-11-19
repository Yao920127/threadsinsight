/** 登入流程（PRD F1、AC-1、例外情境 1）。 */
import { localSupabase } from "./supabaseLocal.ts";
import { expect, expectNoHorizontalScroll, loginViaUi, test, uniqueEmail } from "./fixtures.ts";

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

test("密碼錯誤顯示中文訊息", async ({ page, user }) => {
  await page.goto("/login");
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill("wrong-password-1");
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page.locator("#login-status")).toHaveText(/帳號或密碼錯誤/);
  await expect(page.locator("#password")).toHaveValue("");
});

test("建立帳號後進入儀表板，登出後回到登入頁", async ({ page }) => {
  const email = uniqueEmail();
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("e2e-password-123");
  await page.getByRole("button", { name: "建立帳號" }).click();
  await expect(page.locator("#account-email")).toHaveText(email);

  await page.getByRole("button", { name: "登出" }).click();
  await expect(page).toHaveURL(/\/login\?reason=signed_out/);
  await expect(page.locator("#login-status")).toHaveText("已登出。");
});

test("登入後回到原本要去的頁面", async ({ page, user }) => {
  await page.goto("/compare");
  await expect(page).toHaveURL(/\/login\?next=%2Fcompare/);
  await loginViaUi(page, user, page.url());
  await expect(page).toHaveURL(/\/compare$/);
});

test("不會被導向外部網站", async ({ page, user }) => {
  await page.goto("/");
  const origin = new URL(page.url()).origin;
  await loginViaUi(page, user, "/login?next=//evil.example/");
  expect(page.url()).toBe(`${origin}/`);
});

test("登入憑證失效時回到登入頁並提示已過期", async ({ page, user }) => {
  await loginViaUi(page, user);
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!key.includes("auth-token")) continue;
      const session = JSON.parse(localStorage.getItem(key) ?? "{}") as { access_token: string };
      session.access_token += "x";
      localStorage.setItem(key, JSON.stringify(session));
    }
  });
  // 頁面一載入就會讀取任務列表，後端回 401 → 清除 session 並導回登入頁
  await page.reload();
  await expect(page).toHaveURL(/reason=expired/);
  await expect(page.locator("#login-status")).toHaveText(/登入階段已過期/);
});

test("Magic Link：收信後點連結即登入", async ({ page, user }) => {
  await page.goto("/login");
  await page.locator("#magic-email").fill(user.email);
  await page.getByRole("button", { name: "寄送登入連結" }).click();
  await expect(page.locator("#login-status")).toHaveAttribute("data-tone", "success");

  await expect.poll(() => latestMagicLink(user.email), { timeout: 10_000 }).toMatch(/verify/);
  await page.goto(await latestMagicLink(user.email));
  await expect(page.locator("#account-email")).toHaveText(user.email);
});

test("登入頁在 320px 寬度不會水平捲動", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/login");
  await expectNoHorizontalScroll(page);
});

async function latestMagicLink(email: string): Promise<string> {
  const { mailpitUrl } = localSupabase();
  const search = await fetch(
    `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
  );
  const { messages } = (await search.json()) as { messages: { ID: string }[] };
  if (messages.length === 0) return "";
  const message = await fetch(`${mailpitUrl}/api/v1/message/${messages[0].ID}`);
  const { HTML } = (await message.json()) as { HTML: string };
  return /href="([^"]+verify[^"]+)"/.exec(HTML)?.[1]?.replaceAll("&amp;", "&") ?? "";
}
