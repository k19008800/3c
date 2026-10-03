import { test, expect } from "@playwright/test";

/**
 * G10 合规页与开发者文档页可达性 — 对齐 PRD-§21.9（/privacy /terms Footer 死链 P0 修复）
 * 与 PRD-§21.3（/docs 开发者文档页 P0）。
 *
 * 运行时路由事实（实测确认，2026-10-03）：
 *  - /privacy、/terms、/docs 均由 web-portal Next SSR 直接返回 200，
 *    不发生 308 跳转到 /app/*（区别于 /login、/vendor/login 等旧入口）。
 * 断言：主文档响应 200、最终 URL 仍为该路径、页面 h1 正文标题可见（非 404、非空壳）。
 *
 * 反例（唯一错误实现）：
 *  - 任一页面被删/改成 404/改成 308 跳 /app/* → 对应标题不可见或 URL 偏移 → 变红。
 */

interface PageCase {
  path: string;
  heading: RegExp;
}

const PAGES: PageCase[] = [
  { path: "/privacy", heading: /隐私政策/ },
  { path: "/terms", heading: /服务条款/ },
  { path: "/docs", heading: /开发者文档/ },
];

test.describe("G10 合规与开发者文档页可达性", () => {
  for (const c of PAGES) {
    test(`${c.path} 返回 200 且渲染正文标题（不 308 跳 /app/*）`, async ({ page }) => {
      const res = await page.goto(c.path);

      // 主文档响应 200（非 404）
      expect(res?.status()).toBe(200);

      // 未发生跳转到 /app/*：最终 URL 仍以该路径结尾
      await expect(page).toHaveURL(new RegExp(c.path.replace("/", "\\/") + "/?$"));

      // 页面渲染正文 h1（非空壳、非 Next 404）
      await expect(page.getByRole("heading", { name: c.heading })).toBeVisible();
    });
  }
});
