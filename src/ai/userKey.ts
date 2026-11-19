/**
 * 使用者在網頁輸入的 Anthropic API 金鑰。
 *
 * 只存在 sessionStorage（關閉分頁即清除），不用 localStorage，降低長期外洩風險。
 * 儲存空間不可用（無痕模式、被封鎖）時退回只存在記憶體，功能照常。
 */

export const STORAGE_KEY = "threadsinsight.anthropicKey";
const KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{20,200}$/;
const VISIBLE_SUFFIX = 4;

let memoryKey: string | null = null;

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function isValidKeyFormat(value: string): boolean {
  return KEY_PATTERN.test(value.trim());
}

/** 只顯示前綴與最後 4 碼，例如 sk-ant-…a1b2。 */
export function maskKey(key: string): string {
  return `sk-ant-…${key.slice(-VISIBLE_SUFFIX)}`;
}

export function getUserKey(): string | null {
  try {
    return storage()?.getItem(STORAGE_KEY) ?? memoryKey;
  } catch {
    return memoryKey;
  }
}

/** 格式不符時丟出錯誤，不儲存。 */
export function saveUserKey(value: string): string {
  const key = value.trim();
  if (!isValidKeyFormat(key)) throw new Error("Invalid Anthropic API key format");
  memoryKey = key;
  try {
    storage()?.setItem(STORAGE_KEY, key);
  } catch {
    // 儲存空間不可用：只保留在記憶體
  }
  return key;
}

export function clearUserKey(): void {
  memoryKey = null;
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // 儲存空間不可用：記憶體已清除即可
  }
}
