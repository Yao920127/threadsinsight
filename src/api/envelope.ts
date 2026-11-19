/** 呼叫 Python API 的共用流程：送出 token、信封格式檢查、錯誤分類，最後驗證 data。 */
import { isRecord } from "./validators.ts";

export type ApiErrorKind = "network" | "http" | "invalid_response";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;

  constructor(kind: ApiErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export interface RequestOptions {
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
  /** 預設為空字串（同源）。開發時由 Vite 把 /api 代理到 Python 服務。 */
  readonly baseUrl?: string;
  /** Supabase access token；以 Authorization: Bearer 送出，後端驗證後才回資料。 */
  readonly accessToken?: string | null;
}

export interface EnvelopeRequest<T> {
  readonly method?: "GET" | "POST" | "DELETE";
  /** 含查詢字串的路徑，例如 `/api/tasks/{id}`。 */
  readonly path: string;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  readonly validate: (data: unknown) => data is T;
  readonly invalidMessage: string;
}

const DEFAULT_BASE_URL: string = import.meta.env?.VITE_API_BASE_URL ?? "";

function isAbortOrTimeout(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function buildHeaders(request: EnvelopeRequest<unknown>, options: RequestOptions) {
  return {
    Accept: "application/json",
    ...(request.body === undefined ? {} : { "Content-Type": "application/json" }),
    ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    ...request.headers,
  };
}

export async function requestEnvelope<T>(
  request: EnvelopeRequest<T>,
  options: RequestOptions = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${options.baseUrl ?? DEFAULT_BASE_URL}${request.path}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: request.method ?? "GET",
      signal: options.signal,
      headers: buildHeaders(request, options),
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    });
  } catch (error) {
    if (isAbortOrTimeout(error)) throw error;
    throw new ApiError("network", "Network request failed");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("invalid_response", "Response is not JSON", response.status);
  }

  if (!isRecord(body) || typeof body.success !== "boolean") {
    throw new ApiError("invalid_response", "Unexpected response envelope", response.status);
  }
  if (!response.ok || !body.success) {
    const message = typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
    throw new ApiError("http", message, response.status);
  }
  if (!request.validate(body.data)) {
    throw new ApiError("invalid_response", request.invalidMessage, response.status);
  }
  return body.data;
}
