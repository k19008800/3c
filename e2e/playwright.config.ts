import { defineConfig } from "@playwright/test";

const isCI = process.env.CI === "true";

/**
 * Playwright E2E 配置
 * 前置：本地 API (localhost:3000) + Console (localhost:5175) 已启动
 * CI 用 chromium（自动下载浏览器），本地用 msedge（复用系统浏览器免下载）
 */
export default defineConfig({
  testDir: "./tests",
  timeout: isCI ? 60000 : 30000,
  retries: isCI ? 1 : 0,
  use: {
    baseURL: "http://localhost:5175",
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
