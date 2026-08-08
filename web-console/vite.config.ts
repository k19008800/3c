import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/app/",
  server: {
    port: 5175,
    proxy: {
      // 只匹配 /api/xxx，避免拦截 /api-keys 等 SPA 路由
      "/api/": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
