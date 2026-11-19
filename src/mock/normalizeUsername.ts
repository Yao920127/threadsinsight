const USERNAME_PATTERN = /^[a-z0-9._]{1,30}$/;
const THREADS_HOSTS = new Set(["threads.com", "www.threads.com", "threads.net", "www.threads.net"]);

function looksLikeUrl(input: string): boolean {
  return input.includes("/") || input.includes("://") || input.startsWith("www.");
}

function extractFromUrl(input: string): string {
  const withScheme = input.includes("://") ? input : `https://${input}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`Invalid Threads username or URL: ${input}`);
  }
  if (!THREADS_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`Invalid Threads username URL host: ${url.hostname}`);
  }
  const firstSegment = url.pathname.split("/").find((segment) => segment.length > 0) ?? "";
  if (!firstSegment.startsWith("@")) {
    throw new Error(`Threads URL does not contain a username: ${input}`);
  }
  return firstSegment.slice(1);
}

/**
 * 將 `demo_user`、`@demo_user` 或 `https://www.threads.com/@demo_user` 正規化為小寫 username。
 * @throws Error 輸入不是合法的 Threads username 或帳號 URL 時
 */
export function normalizeUsername(input: string): string {
  const trimmed = input.trim();
  const raw = looksLikeUrl(trimmed) ? extractFromUrl(trimmed) : trimmed.replace(/^@/, "");
  const username = raw.toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error(`Invalid Threads username: ${JSON.stringify(input)}`);
  }
  return username;
}
