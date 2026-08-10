import { defineConfig } from "@playwright/test";

const isCI = process.env.CI === "true";

/**
 * Playwright E2E 配置
 * 前置：`pnpm dev` 一键栈已启动（api@3000 + web-portal@5177，静态托管 web-console 于 /app/）
 * CI 用 chromium（自动下载浏览器），本地用 msedge（复用系统浏览器免下载）
 */
export default defineConfig({
  testDir: "./tests",
  timeout: isCI ? 60000 : 30000,
  retries: isCI ? 1 : 0,
  use: {
    baseURL: "http://localhost:5177/app",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    locale: "zh-CN",
  },
  projects: [
    {
      name: isCI ? "chromium-ci" : "msedge",
      use: {
        browserName: "chromium",
        ...(isCI ? {} : { channel: "msedge" }),
      },
    },
  ],
  reporter: [["list"], ...(isCI ? [["github"]] : [])],
});
