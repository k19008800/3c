import { defineConfig } from "@playwright/test";

/**
 * Playwright E2E 配置
 * 前置：本地 API (localhost:3000) + Console (localhost:5175) 已启动
 * 运行：pnpm --filter e2e test
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: "http://localhost:5175",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    locale: "zh-CN",
  },
  projects: [
    // 使用系统 Edge，避免下载 Playwright chromium（复用已安装浏览器）
    { name: "msedge", use: { browserName: "chromium", channel: "msedge" } },
  ],
  reporter: [["list"]],
});
