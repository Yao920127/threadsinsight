import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import html from "../../index.html?raw";
import {
  clearUserKey,
  getUserKey,
  isValidKeyFormat,
  maskKey,
  saveUserKey,
  STORAGE_KEY,
} from "./userKey.ts";

const VALID = `sk-ant-api03-${"a".repeat(36)}wxyz`;

class MemoryStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

function withStorage(storage: unknown): void {
  vi.stubGlobal("window", {
    get sessionStorage() {
      if (storage instanceof Error) throw storage;
      return storage;
    },
  });
}

afterEach(() => {
  clearUserKey();
  vi.unstubAllGlobals();
});

describe("isValidKeyFormat / maskKey", () => {
  test.each([
    [VALID, true],
    [`  ${VALID}  `, true],
    ["sk-ant-short", false],
    [`sk-proj-${"a".repeat(40)}`, false],
    ["", false],
  ])("%j → %s", (value, valid) => {
    expect(isValidKeyFormat(value)).toBe(valid);
  });

  test("masks all but the last four characters", () => {
    expect(maskKey(VALID)).toBe("sk-ant-…wxyz");
    expect(maskKey(VALID)).not.toContain("aaaa");
  });
});

describe("session storage", () => {
  test("saves the trimmed key to sessionStorage and clears it", () => {
    const storage = new MemoryStorage();
    withStorage(storage);

    saveUserKey(`  ${VALID} `);

    expect(storage.items.get(STORAGE_KEY)).toBe(VALID);
    expect(getUserKey()).toBe(VALID);
    clearUserKey();
    expect(storage.items.has(STORAGE_KEY)).toBe(false);
    expect(getUserKey()).toBeNull();
  });

  test("rejects malformed keys without storing them", () => {
    const storage = new MemoryStorage();
    withStorage(storage);

    expect(() => saveUserKey("not-a-key")).toThrow();
    expect(storage.items.size).toBe(0);
  });

  test("falls back to memory when storage is blocked", () => {
    withStorage(new Error("SecurityError"));

    saveUserKey(VALID);

    expect(getUserKey()).toBe(VALID);
    clearUserKey();
    expect(getUserKey()).toBeNull();
  });
});

describe("index.html key input", () => {
  const pattern = html.match(/id="ai-key"[\s\S]*?pattern="([^"]+)"/)?.[1] ?? "";
  const compile = () => new RegExp(`^(?:${pattern})$`, "v");

  test("is a password field whose pattern compiles under the v flag", () => {
    expect(html).toMatch(/id="ai-key"[\s\S]*?type="password"/);
    expect(compile).not.toThrow();
  });

  test.each([
    [VALID, true],
    ["sk-ant-short", false],
  ])("pattern accepts %j: %s", (value, accepted) => {
    expect(compile().test(value)).toBe(accepted);
  });
});
