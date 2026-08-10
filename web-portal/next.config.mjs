import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // monorepo 工作区根（消除多 lockfile warning）
  outputFileTracingRoot: path.join(__dirname, "../"),
  // Portal 前端 dev 端口 5177，API 后端端口 3030
  env: {
    API_BASE_URL: process.env.API_BASE_URL ?? "http://localhost:3030",
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 旧入口 URL → /app/*（收敛前 portal 自带的控制台/认证页已删除，
  // 这些路径 308 永久重定向到唯一控制台 web-console）
  async redirects() {
    const map = [
      // 认证
      ["/login", "/app/login"],
      ["/register", "/app/register"],
      ["/forgot-password", "/app/forgot-password"],
      ["/2fa", "/app/security"],
      // 旧 mock 控制台页
      ["/dashboard", "/app/"],
      ["/apikey", "/app/api-keys"],
      ["/recharge", "/app/recharge"],
      ["/invoice", "/app/invoices"],
      ["/statistics", "/app/statistics"],
      ["/security", "/app/security"],
      ["/ticket", "/app/tickets"],
      ["/chat", "/app/chat"],
      ["/notifications", "/app/notification"],
      ["/notification-settings", "/app/settings/notifications"],
      ["/announcements", "/app/announcements"],
      ["/help", "/app/help"],
      ["/webhooks", "/app/webhooks"],
      ["/realname", "/app/real-name"],
      ["/consent", "/app/data-export"],
      ["/deletion", "/app/account-deletion"],
      ["/redemption", "/app/redemption"],
      // 裸路径防御（console 内硬编码裸跳转，统一收敛到 /app/）
      ["/logs", "/app/logs"],
      ["/billing", "/app/billing"],
      ["/playground", "/app/playground"],
      ["/user-groups", "/app/user-groups"],
      ["/vendor-selector", "/app/vendor-selector"],
      ["/recharge-records", "/app/topup-records"],
      ["/vendor/login", "/app/vendor/login"],
      ["/vendor/register", "/app/vendor/register"],
      ["/vendor", "/app/vendor"],
    ];
    return map.map(([source, destination]) => ({ source, destination, permanent: true }));
  },
  // 路由代理
  async rewrites() {
    return [
      // 将 API 请求代理到后端
      {
        source: "/api/:path*",
        destination: "http://localhost:3030/api/:path*",
      },
      // 将 /health 代理到后端
      {
        source: "/health",
        destination: "http://localhost:3030/health",
      },
      // 将 OpenAI 兼容 /v1/* 代理到后端（SDK / curl 直连统一入口）
      {
        source: "/v1/:path*",
        destination: "http://localhost:3030/v1/:path*",
      },
      // 将 /app/* 路由代理到 web-console Vite dev server
      // 裸 /app 也转发（Vite base=/app/，不带尾斜杠会 404；Next 会把 /app/ 归一化为 /app）
      {
        source: "/app",
        destination: "http://localhost:5175/app/",
      },
      {
        source: "/app/",
        destination: "http://localhost:5175/app/",
      },
      {
        source: "/app/:path*",
        destination: "http://localhost:5175/app/:path*",
      },
      // 同时代理 Vite 的 HMR 资源请求
      {
        source: "/@vite/:path*",
        destination: "http://localhost:5175/@vite/:path*",
      },
      {
        source: "/@react-refresh",
        destination: "http://localhost:5175/@react-refresh",
      },
      {
        source: "/src/:path*",
        destination: "http://localhost:5175/src/:path*",
      },
      {
        source: "/node_modules/:path*",
        destination: "http://localhost:5175/node_modules/:path*",
      },
    ];
  },
};

export default nextConfig;
