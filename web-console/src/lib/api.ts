import axios from "axios";

/**
 * API 客户端封装
 * - 自动附加 JWT
 * - 401 拦截：跳转登录
 */
export const api = axios.create({
  baseURL: "/api/v1",
  timeout: 30000,
});

// 请求拦截：附加 token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截：401 → 清除 token 跳登录
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !window.location.pathname.startsWith("/app/login")) {
      localStorage.removeItem("token");
      // basename=/app，登录页在 /app/login；跳到同源绝对路径
      window.location.href = "/app/login";
    }
    return Promise.reject(err);
  },
);

/** 统一错误提取 */
export function extractError(err: any): string {
  return err?.response?.data?.message ?? err?.message ?? "请求失败";
}
