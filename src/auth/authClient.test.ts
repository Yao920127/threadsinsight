import { describe, expect, test, vi } from "vite-plus/test";
import { ApiError } from "../api/envelope.ts";
import {
  deleteAccount,
  fetchCurrentAccount,
  isAccount,
  signIn,
  signOutRequest,
  signUp,
} from "./authClient.ts";

const ACCOUNT = { id: "11111111-1111-1111-1111-111111111111", email: "user_a@example.com" };

function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data, error: null }), { status });
}

function calls(fetchImpl: { mock: { calls: [string, RequestInit?][] } }) {
  return fetchImpl.mock.calls.map(([url, init]) => [url, init?.method]);
}

describe("auth client", () => {
  test("sign up and sign in post credentials as JSON", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => ok(ACCOUNT, 201));
    const credentials = { email: "user_a@example.com", password: "correct-horse-1" };

    const options = { fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "" };
    expect(await signUp(credentials, options)).toEqual(ACCOUNT);
    expect(await signIn(credentials, options)).toEqual(ACCOUNT);

    expect(calls(fetchImpl)).toEqual([
      ["/api/auth/signup", "POST"],
      ["/api/auth/login", "POST"],
    ]);
    const init = fetchImpl.mock.calls[0][1] ?? {};
    expect(JSON.parse(init.body as string)).toEqual(credentials);
    expect(init.credentials).toBe("same-origin");
  });

  test("current account, sign out and delete use their paths", async () => {
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) =>
      ok(url.endsWith("/me") ? ACCOUNT : { signed_out: true }),
    );
    const options = { fetchImpl: fetchImpl as unknown as typeof fetch, baseUrl: "" };

    expect(await fetchCurrentAccount(options)).toEqual(ACCOUNT);
    await signOutRequest(options);
    await deleteAccount(options);

    expect(calls(fetchImpl)).toEqual([
      ["/api/auth/me", "GET"],
      ["/api/auth/logout", "POST"],
      ["/api/auth/me", "DELETE"],
    ]);
  });

  test("401 surfaces as ApiError", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ success: false, data: null, error: "Authentication required" }),
          { status: 401 },
        ),
    );
    const error = await fetchCurrentAccount({ fetchImpl }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });

  test("isAccount", () => {
    expect(isAccount(ACCOUNT)).toBe(true);
    expect(isAccount({ id: 1, email: "x" })).toBe(false);
    expect(isAccount(null)).toBe(false);
  });
});
