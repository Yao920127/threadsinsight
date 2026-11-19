/**
 * 清除專案快取與建置產物。
 *
 *   vp run clean              # 實際刪除
 *   vp run clean --dry-run    # 只列出會刪除的項目
 *
 * 不會動到 node_modules、.venv 與任何原始碼。
 */
import { fileURLToPath } from "node:url";
import { cleanCache } from "./cleanCache.ts";

const KNOWN_FLAGS = new Set(["--dry-run"]);

// vp run 可能原樣傳入 "--" 分隔符，直接忽略
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const unknown = args.filter((arg) => !KNOWN_FLAGS.has(arg));
if (unknown.length > 0) {
  process.stderr.write(`未知參數：${unknown.join(" ")}\n用法：vp run clean [--dry-run]\n`);
  process.exit(2);
}

const dryRun = args.includes("--dry-run");
const root = fileURLToPath(new URL("..", import.meta.url));
const { removed, failed } = cleanCache(root, { dryRun });

const verb = dryRun ? "將刪除" : "已刪除";
if (removed.length === 0 && failed.length === 0) {
  process.stdout.write("沒有需要清除的快取。\n");
}
for (const path of removed) process.stdout.write(`${verb}  ${path}\n`);
for (const { path, reason } of failed) process.stderr.write(`失敗    ${path}：${reason}\n`);
if (removed.length > 0)
  process.stdout.write(`共 ${removed.length} 項${dryRun ? "（試跑，未刪除）" : ""}。\n`);

process.exit(failed.length > 0 ? 1 : 0);
