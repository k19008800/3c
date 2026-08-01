/** 供应商端 API 封装（带 vendor token） */
function vendorToken() {
  return localStorage.getItem("vendor_token") ?? "";
}

async function request<T = any>(method: string, url: string, body?: any): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${vendorToken()}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api/v1${url}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    localStorage.removeItem("vendor_token");
    window.location.href = "/vendor/login";
    throw new Error("登录已失效");
  }
  if (res.status >= 400) {
    throw new Error(data?.message ?? data?.error ?? "请求失败");
  }
  return data.data;
}

export const vendorApi = {
  get: <T,>(url: string): Promise<T> => request<T>("GET", url),
  post: <T,>(url: string, body?: any): Promise<T> => request<T>("POST", url, body),
  put: <T,>(url: string, body?: any): Promise<T> => request<T>("PUT", url, body),
};
