/** 多帳號比較（PRD F5、AC-5）。前置任務以 API 建立，加快測試。 */
import { readFile } from "node:fs/promises";
import {
  createTaskViaApi,
  expect,
  expectNoHorizontalScroll,
  loginViaUi,
  test,
} from "./fixtures.ts";

const ACCOUNTS: readonly [string, number][] = [
  ["demo_user", 30],
  ["another_demo", 12],
  ["demo.user_01", 20],
  ["demo_user_02", 10],
  ["demo_user_03", 8],
];

test.beforeEach(async ({ page, user, baseURL }) => {
  for (const [username, count] of ACCOUNTS) {
    await createTaskViaApi(baseURL ?? "", user, username, count);
  }
  await loginViaUi(page, user, "/login?next=%2Fcompare");
  await expect(page.locator("#compare-picker input")).toHaveCount(ACCOUNTS.length);
});

test("勾選 2 個任務並排比較 AC-5 指標", async ({ page }) => {
  const submit = page.getByRole("button", { name: "開始比較" });
  await expect(submit).toBeDisabled();
  await page.getByLabel(/@demo_user\s+30 篇/).check();
  await expect(submit).toBeDisabled();
  await page.getByLabel(/@another_demo\s+12 篇/).check();
  await submit.click();

  const table = page.locator(".compare-table");
  await expect(table.locator("thead th")).toHaveText([
    "@demo_user（30 篇）",
    "@another_demo（12 篇）",
  ]);
  for (const label of ["平均按讚", "平均回覆", "平均轉發", "平均字數", "最佳貼文類型"]) {
    await expect(table.getByRole("rowheader", { name: new RegExp(label) })).toBeVisible();
  }
  await expect(page.locator(".mock-banner")).toContainText("示範資料（Mock Dataset）");
  await expect(page.getByRole("heading", { name: "比較結果" })).toBeFocused();
  await expect(page).toHaveURL(/\?tasks=[0-9a-f-]{36},[0-9a-f-]{36}$/);
});

test("匯出的 CSV 每列都標示合成資料", async ({ page }) => {
  await page.getByLabel(/@demo_user\s+30 篇/).check();
  await page.getByLabel(/@another_demo\s+12 篇/).check();
  await page.getByRole("button", { name: "開始比較" }).click();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "匯出 CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(
    "threadsinsight-mock-compare-demo_user-vs-another_demo.csv",
  );
  const lines = (await readFile(await file.path(), "utf8")).replace(/^﻿/, "").trim().split(/\r\n/);
  expect(lines).toHaveLength(3);
  expect(lines.slice(1).every((line) => line.startsWith("mock_dataset,true,"))).toBe(true);
});

test("最多 4 個；網址記住選擇", async ({ page }) => {
  const options = page.locator("#compare-picker input");
  for (const index of [0, 1, 2, 3]) await options.nth(index).check();
  await expect(options.nth(4)).toBeDisabled();
  await expect(page.locator("#compare-count")).toHaveText(/已選 4／4 個/);

  await page.getByRole("button", { name: "開始比較" }).click();
  await expect(page.locator(".compare-table thead th")).toHaveCount(4);

  await page.reload();
  await expect(page.locator("#compare-picker input:checked")).toHaveCount(4);
  await expect(page.locator(".compare-table thead th")).toHaveCount(4);
});

test("手機寬度下表格在框內捲動，頁面不水平捲動", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  for (const index of [0, 1, 2, 3]) await page.locator("#compare-picker input").nth(index).check();
  await page.getByRole("button", { name: "開始比較" }).click();
  await expect(page.locator(".compare-table")).toBeVisible();
  await expectNoHorizontalScroll(page);
  const scrolls = await page
    .locator(".compare-scroll")
    .evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(scrolls).toBe(true);
});
