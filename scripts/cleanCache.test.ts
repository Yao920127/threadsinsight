import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { cleanCache, findCacheTargets } from "./cleanCache.ts";

let root: string;

function touch(path: string): void {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), "x");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "clean-cache-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("cleanCache", () => {
  test("removes fixed caches and nested __pycache__ but keeps dependencies and source", () => {
    touch("node_modules/.vite/deps.js");
    touch("node_modules/react/index.js");
    touch("dist/index.html");
    touch(".pytest_cache/v");
    touch("api/threadsinsightapi/__pycache__/app.pyc");
    touch("api/threadsinsightapi/app.py");
    touch(".venv/lib/__pycache__/x.pyc");

    const result = cleanCache(root);

    expect(result.failed).toEqual([]);
    expect([...result.removed].sort()).toEqual(
      [".pytest_cache", "api/threadsinsightapi/__pycache__", "dist", "node_modules/.vite"].sort(),
    );
    expect(existsSync(join(root, "node_modules/react/index.js"))).toBe(true);
    expect(existsSync(join(root, "api/threadsinsightapi/app.py"))).toBe(true);
    expect(existsSync(join(root, ".venv/lib/__pycache__/x.pyc"))).toBe(true);
    expect(existsSync(join(root, "dist"))).toBe(false);
  });

  test("dry run lists targets without deleting", () => {
    touch("coverage/index.html");

    const result = cleanCache(root, { dryRun: true });

    expect(result.removed).toEqual(["coverage"]);
    expect(existsSync(join(root, "coverage/index.html"))).toBe(true);
  });

  test("returns nothing when no cache exists", () => {
    expect(findCacheTargets(root)).toEqual([]);
    expect(cleanCache(root)).toEqual({ removed: [], failed: [] });
  });

  test("skips a cache path that is a symlink instead of following it", () => {
    const outside = mkdtempSync(join(tmpdir(), "clean-cache-outside-"));
    writeFileSync(join(outside, "keep.txt"), "x");
    symlinkSync(outside, join(root, "dist"));

    const result = cleanCache(root);

    expect(result.removed).toEqual([]);
    expect(result.failed.map((f) => f.path)).toEqual(["dist"]);
    expect(existsSync(join(outside, "keep.txt"))).toBe(true);
    rmSync(outside, { recursive: true, force: true });
  });
});
