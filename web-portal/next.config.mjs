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
      // ── /app/* 控制台：静态托管 web-console 构建产物 ──
      // web-console `vite build`（base=/app/）产物拷贝到 web-portal/public/app/，
      // 由 Next 直接静态服务（public/ 里的文件优先于 rewrite 命中）：
      //   /app/                     → public/app/index.html
      //   /app/assets/*             → public/app/assets/*（真实静态文件）
      //   /app/<SPA路由>            → 命中下面 fallback → index.html（SPA 前端路由）
      // 依赖：`node scripts/prepare-app.cjs`（pnpm dev 的 predev 自动执行）构建并拷贝产物。
      // 不再依赖 Vite dev server（5175 已停）；改控制台页面需重新 prepare-app。
      {
        source: "/app/:path*",
        destination: "/app/index.html",
      },
    ];
  },
};

export default nextConfig;
