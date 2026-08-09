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
