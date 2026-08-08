import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // monorepo 工作区根（消除多 lockfile warning）
  outputFileTracingRoot: path.join(__dirname, "../"),
  // Portal 前端 dev 端口 3100，SSR 端 fetch 后端 API (localhost:3000)
  env: {
    API_BASE_URL: process.env.API_BASE_URL ?? "http://localhost:3000",
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
