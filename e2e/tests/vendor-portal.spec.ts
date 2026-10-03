import { test, expect } from "@playwright/test";

/**
 * G9 供应商（渠道）自助门户可达性 — 对齐 PRD-§25.2.1 vendor 自助门户
 *
 * 运行时路由事实（实测确认，2026-10-03）：
 *  - /vendor/login 经 next.config.mjs redirects 308 收敛到 /app/vendor/login，
 *    由 web-console SPA 渲染供应商登录表单（VendorLoginPage）。
 *  - /vendor/dashboard 无重定向，直接由 web-portal Next 页面 SSR 200；
 *    前端路由守卫读 localStorage.vendor_token，无 token 时 router.replace('/vendor/login')
 *    → 再经 308 收敛到 SPA 登录页。
 * 本 spec 为黑盒可达性测试：只断言浏览器可观察结果，不依赖 chat 调用、不依赖 /vendor-selector。
 *
 * 反例（唯一错误实现）：
 *  - G9-1：/vendor/login 不再收敛到登录路由或登录表单（邮箱/密码/提交按钮缺失）→ 变红。
 *  - G9-2：未登录访问 /vendor/dashboard 不再收敛到登录页（守卫被删，停在加载中/仪表盘）→ 变红。
 */

test.describe("G9 供应商自助门户可达性", () => {
  test("访问 /vendor/login → 收敛到供应商登录页并渲染登录表单", async ({ page }) => {
    // goto 跟随 308：/vendor/login → /app/vendor/login
    const res = await page.goto("/vendor/login");
    // 最终链路落到 200（SPA 登录页 shell）
    expect(res?.ok()).toBeTruthy();

    // 收敛到供应商登录路由（/vendor/login 或其 308 目标 /app/vendor/login）
    await expect(page).toHaveURL(/\/vendor\/login\/?$/, { timeout: 15000 });

    // 登录表单关键元素（结构断言，跨 i18n 语言稳定）
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("未登录直接访问 /vendor/dashboard → 收敛/跳转到登录页", async ({ page }) => {
    // 全新上下文：localStorage 无 vendor_token
    await page.goto("/vendor/dashboard");

    // dashboard 守卫：无 token → /vendor/login → 308 → SPA 登录页。
    // 最终应出现登录表单（密码框可见即代表收敛到登录页），且 URL 落在登录路由。
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/vendor\/login\/?$/);
  });
});
