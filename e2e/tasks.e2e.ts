/** 分析任務（PRD F2、AC-1、AC-2、例外情境 7）。 */
import {
  createTaskViaApi,
  deleteAccount,
  expect,
  expectNoHorizontalScroll,
  signUpViaApi,
  test,
  useSession,
} from "./fixtures.ts";

test.beforeEach(async ({ page, user }) => {
  await useSession(page, user);
  await page.goto("/");
  await expect(page.locator("#account")).toBeVisible();
  await expect(page.locator("#task-list")).toHaveAttribute("aria-busy", "false");
});

async function analyze(page: import("@playwright/test").Page, username: string, count: number) {
  await page.locator("#username").fill(username);
  await page.locator("#count").fill(String(count));
  await page.getByRole("button", { name: "開始分析" }).click();
}

test("建立任務後顯示報告、任務卡片與合成資料標示", async ({ page }) => {
  await analyze(page, "@Demo_User", 12);

  await expect(page.locator("#status")).toHaveText("已生成並清理 12/12 篇 @demo_user 的合成貼文。");
  await expect(page.locator(".mock-banner")).toContainText("非 @demo_user 的真實貼文");
  await expect(page.locator(".post-card")).toHaveCount(12);
  await expect(page).toHaveURL(/\?task=[0-9a-f-]{36}$/);

  const card = page.locator(".task-card[aria-current=true]");
  await expect(card).toContainText("@demo_user");
  await expect(card).toContainText("已完成");
  await expect(card).toContainText("Mock Dataset 合成資料");
});

test("24 小時內同帳號同篇數載入快取，勾選強制重新分析則建立新任務", async ({ page }) => {
  await analyze(page, "demo_user", 10);
  await expect(page.locator(".task-card")).toHaveCount(1);

  await analyze(page, "demo_user", 10);
  await expect(page.locator("#cache-notice")).toBeVisible();
  await expect(page.locator("#cache-notice-text")).toHaveText(
    /已為您載入 24 小時內的最新分析快取（更新時間：\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}）/,
  );
  await expect(page.locator(".task-card")).toHaveCount(1);

  await page.getByLabel("強制重新分析").check();
  await analyze(page, "demo_user", 10);
  await expect(page.locator(".task-card")).toHaveCount(2);
  await expect(page.locator("#cache-notice")).toBeHidden();
  await expect(page.getByLabel("強制重新分析")).not.toBeChecked();
});

test("同一帳號每次生成的貼文完全相同", async ({ page }) => {
  await analyze(page, "demo_user", 8);
  await expect(page.locator(".post-card")).toHaveCount(8);
  const first = await page.locator(".post-card").allInnerTexts();
  await page.getByLabel("強制重新分析").check();
  await analyze(page, "demo_user", 8);
  await expect(page.locator(".task-card")).toHaveCount(2);
  expect(await page.locator(".post-card").allInnerTexts()).toEqual(first);
});

test("檢視舊任務、重新整理後仍顯示同一份報告", async ({ page }) => {
  await analyze(page, "demo_user", 10);
  await analyze(page, "another_demo", 6);
  await expect(page.locator(".task-card")).toHaveCount(2);

  const older = page.locator(".task-card").nth(1);
  await older.getByRole("button", { name: /檢視/ }).click();
  await expect(page.locator(".report-title")).toHaveText("@demo_user 的互動概況");
  await expect(page.locator("#status")).toHaveText(/已載入 @demo_user 的報告/);

  await page.reload();
  await expect(page.locator(".report-title")).toHaveText("@demo_user 的互動概況");
});

test("重新執行保留同一個任務", async ({ page }) => {
  await analyze(page, "demo_user", 10);
  await expect(page).toHaveURL(/\?task=/);
  const url = page.url();
  await page
    .locator(".task-card")
    .first()
    .getByRole("button", { name: /重新執行/ })
    .click();
  await expect(page.locator("#status")).toHaveText(/已生成並清理 10\/10 篇/);
  await expect(page.locator(".task-card")).toHaveCount(1);
  expect(page.url()).toBe(url);
});

test("刪除前需確認；取消不刪、確認後刪除並清空報告", async ({ page }) => {
  await analyze(page, "demo_user", 5);
  const deleteButton = page.locator(".task-card").first().getByRole("button", { name: /刪除/ });

  await deleteButton.click();
  const dialog = page.getByRole("dialog", { name: "刪除分析任務？" });
  await expect(dialog).toContainText("@demo_user（5 篇）");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(deleteButton).toBeFocused();
  await expect(page.locator(".task-card")).toHaveCount(1);

  await deleteButton.click();
  await dialog.getByRole("button", { name: "刪除" }).click();
  await expect(page.locator(".task-empty")).toBeVisible();
  await expect(page.locator("#report")).toBeHidden();
  expect(new URL(page.url()).search).toBe("");
});

test("無法開啟其他使用者的任務（RLS）", async ({ page, baseURL }) => {
  const other = await signUpViaApi(baseURL ?? "");
  try {
    const taskId = await createTaskViaApi(other, "demo_user", 5);
    await page.goto(`/?task=${taskId}`);
    await expect(page.locator("#status")).toHaveText(/找不到這個分析任務/);
    await expect(page.locator("#report")).toBeHidden();
    await expect(page.locator(".task-empty")).toBeVisible();
  } finally {
    await deleteAccount(other.api);
  }
});

test("不合法的帳號格式不會建立任務", async ({ page }) => {
  await page.locator("#username").fill("bad name!");
  await page.getByRole("button", { name: "開始分析" }).click();
  await expect(page.locator("#username")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".task-empty")).toBeVisible();
});

test("儀表板在 320px 寬度不會水平捲動", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await analyze(page, "demo_user", 10);
  await expect(page.locator("#report")).toBeVisible();
  await expectNoHorizontalScroll(page);
});
