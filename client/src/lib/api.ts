const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors: Record<string, string[]> = {},
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

// The CSRF token lives in memory only (never localStorage).
let csrfToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const setCsrfToken = (token: string | null) => { csrfToken = token; };
export const setUnauthorizedHandler = (handler: (() => void) | null) => { onUnauthorized = handler; };

type Options = { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown; query?: Record<string, string | number | boolean | undefined | null> };

async function ensureCsrf() {
  if (csrfToken) return csrfToken;
  const res = await fetch(`${apiUrl}/auth/csrf`, { credentials: "include" });
  const json = await res.json();
  csrfToken = json.data.csrfToken as string;
  return csrfToken;
}

export async function api<T>(path: string, { method = "GET", body, query }: Options = {}): Promise<T> {
  const url = new URL(`${apiUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRF-Token"] = await ensureCsrf();

  let res: Response;
  try {
    res = await fetch(url, { method, headers, credentials: "include", body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach the server. Check your connection and that the API is running.");
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const error = json?.error ?? {};
    if (res.status === 401 && path !== "/auth/login" && path !== "/auth/me") onUnauthorized?.();
    if (error.code === "CSRF_FAILED") csrfToken = null;
    throw new ApiError(res.status, error.code ?? "INTERNAL", error.message ?? "Something went wrong. Try again.", error.fieldErrors, error.details);
  }
  return json as T;
}

export const isApiError = (error: unknown, ...codes: string[]): error is ApiError =>
  error instanceof ApiError && (codes.length === 0 || codes.includes(error.code));
