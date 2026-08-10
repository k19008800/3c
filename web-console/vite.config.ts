import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/app/",
  server: {
    port: 5175,
    // 只绑 loopback：5175 是内部 dev 服务，仅由 web-portal(5177) 的 rewrites 同机代理，
    // 不再作为对外入口直连（对外唯一入口是 5177）
    host: "127.0.0.1",
    proxy: {
      // 只匹配 /api/xxx，避免拦截 /api-keys 等 SPA 路由
      "/api/": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
