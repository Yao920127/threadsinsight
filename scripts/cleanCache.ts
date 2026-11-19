/**
 * 清除快取與建置產物的核心邏輯（CLI 入口在 clean-cache.ts）。
 * 只刪除可重新產生的檔案；node_modules 與 .venv 等相依套件不在清單內。
 */
import { existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";

/** 相對於專案根目錄、固定位置的快取。 */
export const CACHE_PATHS: readonly string[] = [
  "node_modules/.vite", // Vite 相依預打包
  "node_modules/.vite-temp", // Vite 設定檔暫存
  "node_modules/.vitest-cache", // Vitest 結果快取
  "dist", // 前端建置產物
  "coverage", // TS 覆蓋率報告
  ".coverage", // Python 覆蓋率資料
  ".pytest_cache",
  ".ruff_cache",
];

/** 在這些目錄底下遞迴尋找 __pycache__（刻意不掃 .venv 與 node_modules）。 */
export const PYCACHE_ROOTS: readonly string[] = ["api", "scripts"];

const PYCACHE_DIR = "__pycache__";

function findPycacheDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.name === PYCACHE_DIR ? [path] : findPycacheDirs(path);
    });
}

/** 回傳專案中實際存在的快取路徑（絕對路徑）。 */
export function findCacheTargets(root: string): string[] {
  const fixed = CACHE_PATHS.map((path) => join(root, path)).filter((path) => existsSync(path));
  const pycache = PYCACHE_ROOTS.flatMap((dir) => findPycacheDirs(join(root, dir)));
  return [...fixed, ...pycache];
}

export interface CleanResult {
  readonly removed: readonly string[];
  readonly failed: readonly { readonly path: string; readonly reason: string }[];
}

/** 刪除快取；dryRun 時只列出不刪除。回傳的路徑皆為相對於 root。 */
export function cleanCache(root: string, options: { dryRun?: boolean } = {}): CleanResult {
  const targets = findCacheTargets(root);
  const removed: string[] = [];
  const failed: { path: string; reason: string }[] = [];

  for (const target of targets) {
    const path = relative(root, target);
    // 防呆：拒絕刪除專案根目錄以外的東西（例如被換成符號連結的目錄）
    if (path.startsWith("..") || lstatSync(target).isSymbolicLink()) {
      failed.push({ path, reason: "不在專案目錄內或為符號連結，已略過" });
      continue;
    }
    try {
      if (!options.dryRun) rmSync(target, { recursive: true, force: true });
      removed.push(path);
    } catch (error) {
      failed.push({ path, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  return { removed, failed };
}
