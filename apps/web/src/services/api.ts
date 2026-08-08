/**
 * 3Cloud API 工具 — 统一 fetch 封装
 *
 * 用法 1（信封式，portal 页面使用）：
 *       import api from "@/services/api";
 *       const { data, error } = await api.get<MyType>("/me/stats");
 *       const { data, error } = await api.post<MyType>("/me/recharge", { amount: 100 });
 *
 * 用法 2（函数式，admin 页面使用）：
 *       import { api } from "@/services/api";
 *       const data = await api<MyType>("/admin/endpoint");
 *
 * 用法 3（便捷命名导出）：
 *       import { apiGet, apiPost, apiPut, apiDelete } from "@/services/api";
 */

const BASE_URL = "/api/v1";

function getToken(): string | null {
  try {
    return localStorage.getItem("3cloud_token");
  } catch {
    return null;
  }
}

export interface PaginatedResponse<T> {
  list: T[];
  pagination: { page: number; page_size: number; total: number };
}

export interface ApiError {
  code: number;
  error: string;
  message: string;
}

/** Envelope returned by api.get/post/put/delete for portal compatibility */
export interface ApiEnvelope<T> {
  data: T | null;
  error: string | null;
}

/** Raw fetch wrapper, returns full JSON response body */
async function _fetch<T = unknown>(
  path: string,
  options?: Omit<RequestInit, "body"> & { body?: unknown },
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string> | undefined) },
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  // SSE/text responses are not JSON
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
    return (await res.text()) as unknown as T;
  }

  const json = await res.json();
  if (!res.ok || (json.code !== undefined && json.code !== 0)) {
    const err = new Error(json.message ?? `API error: ${res.status}`) as Error & { code: number };
    (err as any).code = json.code ?? res.status;
    throw err;
  }
  return json.data as T;
}

/** Unwrapped callable — throws on error, returns data directly (for admin pages) */
export const api: typeof _fetch & {
  get: <T = unknown>(path: string, query?: Record<string, string | number | undefined>) => Promise<T>;
  post: <T = unknown>(path: string, body?: unknown) => Promise<T>;
  put: <T = unknown>(path: string, body?: unknown) => Promise<T>;
  patch: <T = unknown>(path: string, body?: unknown) => Promise<T>;
  delete: <T = unknown>(path: string) => Promise<T>;
} = Object.assign(_fetch, {
  get: <T = unknown>(path: string, query?: Record<string, string | number | undefined>) => {
    const qs = query
      ? "?" +
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
          .join("&")
      : "";
    return _fetch<T>(`${path}${qs}`);
  },
  post: <T = unknown>(path: string, body?: unknown) =>
    _fetch<T>(path, { method: "POST", body }),
  put: <T = unknown>(path: string, body?: unknown) =>
    _fetch<T>(path, { method: "PUT", body }),
  patch: <T = unknown>(path: string, body?: unknown) =>
    _fetch<T>(path, { method: "PATCH", body }),
  delete: <T = unknown>(path: string) =>
    _fetch<T>(path, { method: "DELETE" }),
});

/** 
 * Envelope-style API client for portal pages.
 * Returns { data, error } where error is null on success.
 */
function createEnvelopeApi(): {
  get: <T>(path: string, query?: Record<string, string | number | undefined>) => Promise<ApiEnvelope<T>>;
  post: <T>(path: string, body?: unknown) => Promise<ApiEnvelope<T>>;
  put: <T>(path: string, body?: unknown) => Promise<ApiEnvelope<T>>;
  patch: <T>(path: string, body?: unknown) => Promise<ApiEnvelope<T>>;
  delete: <T>(path: string) => Promise<ApiEnvelope<T>>;
} {
  async function envGet<T>(path: string, query?: Record<string, string | number | undefined>) {
    try { return { data: await api.get<T>(path, query), error: null }; }
    catch (e: any) { return { data: null as T | null, error: e.message ?? "Unknown error" }; }
  }
  async function envPost<T>(path: string, body?: unknown) {
    try { return { data: await api.post<T>(path, body), error: null }; }
    catch (e: any) { return { data: null as T | null, error: e.message ?? "Unknown error" }; }
  }
  async function envPut<T>(path: string, body?: unknown) {
    try { return { data: await api.put<T>(path, body), error: null }; }
    catch (e: any) { return { data: null as T | null, error: e.message ?? "Unknown error" }; }
  }
  async function envPatch<T>(path: string, body?: unknown) {
    try { return { data: await api.patch<T>(path, body), error: null }; }
    catch (e: any) { return { data: null as T | null, error: e.message ?? "Unknown error" }; }
  }
  async function envDelete<T>(path: string) {
    try { return { data: await api.delete<T>(path), error: null }; }
    catch (e: any) { return { data: null as T | null, error: e.message ?? "Unknown error" }; }
  }
  return { get: envGet, post: envPost, put: envPut, patch: envPatch, delete: envDelete };
}

/** Default export: envelope-style api for portal pages */
const envelopeApi = createEnvelopeApi();
export default envelopeApi;

/** Named convenience exports — unwrapped (admin-style), re-exported */
export const apiGet = api.get;
export const apiPost = api.post;
export const apiPut = api.put;
export const apiDelete = api.delete;
