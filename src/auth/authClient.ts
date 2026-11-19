/** 會員 API（/api/auth…）：註冊、登入、登出、目前帳號、刪除帳號。登入狀態放在 httpOnly cookie。 */
import { requestEnvelope, type RequestOptions } from "../api/envelope.ts";
import { isRecord } from "../api/validators.ts";

export interface Account {
  readonly id: string;
  readonly email: string;
}

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

export function isAccount(value: unknown): value is Account {
  return isRecord(value) && typeof value.id === "string" && typeof value.email === "string";
}

function isAcknowledged(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

export function signUp(credentials: Credentials, options: RequestOptions = {}) {
  return requestEnvelope<Account>(
    {
      method: "POST",
      path: "/api/auth/signup",
      body: credentials,
      validate: isAccount,
      invalidMessage: "Unexpected sign-up response",
    },
    options,
  );
}

export function signIn(credentials: Credentials, options: RequestOptions = {}) {
  return requestEnvelope<Account>(
    {
      method: "POST",
      path: "/api/auth/login",
      body: credentials,
      validate: isAccount,
      invalidMessage: "Unexpected sign-in response",
    },
    options,
  );
}

export function fetchCurrentAccount(options: RequestOptions = {}) {
  return requestEnvelope<Account>(
    { path: "/api/auth/me", validate: isAccount, invalidMessage: "Unexpected account response" },
    options,
  );
}

export function signOutRequest(options: RequestOptions = {}) {
  return requestEnvelope(
    {
      method: "POST",
      path: "/api/auth/logout",
      validate: isAcknowledged,
      invalidMessage: "Unexpected sign-out response",
    },
    options,
  );
}

export function deleteAccount(options: RequestOptions = {}) {
  return requestEnvelope(
    {
      method: "DELETE",
      path: "/api/auth/me",
      validate: isAcknowledged,
      invalidMessage: "Unexpected delete response",
    },
    options,
  );
}
