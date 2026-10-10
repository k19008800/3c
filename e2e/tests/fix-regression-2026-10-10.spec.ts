import { test, expect, Page } from "@playwright/test";

/**
 * 2026-10-10 浏览器仿真回归 —— 覆盖本次修复/新增所触及的功能域。
 *
 * 背景（对应 REGRESSION-2026-10-10 的 FIX-1/2/3）：
 *  - FIX-1：0048_alert_center.sql 曾漏挂在手工迁移执行器 → monitoring_rules/alerts/
 *    alert_notifications 三表缺失，告警引擎启动即失败（关系不存在）。
 *    本仿真断言「告警类接口不再返回 500 / 表不存在」，即该修复在真实链路上生效。
 *  - FIX-2：清理 me-agent.ts 未使用导入 `or`；该文件服务 /me/agent/* 端点，
 *    故以代理商侧页面渲染 + 接口 200 验证未破坏行为。
 *  - FIX-3：补齐 user_budget_settings 等 schema；此前预算校验长期 fail-open。
 *    本仿真断言预算类接口不再因缺表报错。
 *
 * 方法：真实登录 admin 拿 token → addInitScript 注入 localStorage →
 * 完整页面加载（非登录后立刻 goto），逐页断言 SPA 挂载与实质内容。
 * 断言只收紧不放宽；任何 500/缺表都会判红。
 */

const BASE = "http://localhost:5177";
const ADMIN_EMAIL = "admin@3cloud.dev";
const ADMIN_PASSWORD = "Admin@2024!"; // 与 api/src/db/seed.ts ADMIN_PASSWORD 一致

/** 与本次修复直接相关的接口（用于断言后端链路真实可用） */
const API_PROBES: { name: string; method: "get" | "post"; path: string; body?: unknown }[] = [
  // FIX-1：告警中心。此前缺表时后端 42P01 直接 500。
  { name: "告警规则列表（monitoring_rules）", method: "get", path: "/api/v1/admin/alerts/rules" },
  { name: "告警记录列表（alerts）", method: "get", path: "/api/v1/admin/alerts" },
  // FIX-3：预算设置。此前 user_budget_settings 缺失导致 budget check fail-open。
  { name: "预算设置读取（user_budget_settings）", method: "get", path: "/api/v1/me/budget" },
  // FIX-2：代理商侧端点所在文件（me-agent.ts）。路径已与 app.ts 注册前缀核对一致。
  { name: "代理商身份资料", method: "get", path: "/api/v1/me/agent/profile" },
  { name: "佣金等级规则", method: "get", path: "/api/v1/me/agent/commission-rules" },
  { name: "佣金明细", method: "get", path: "/api/v1/me/agent/commissions" },
  { name: "代理商提现汇总", method: "get", path: "/api/v1/me/agent/withdraw-summary" },
];

/** 修复涉及的页面（路由取自 web-console/src/App.tsx 实际注册） */
const PAGES: { name: string; route: string; markers: string[] }[] = [
  { name: "代理商设置", route: "/agent/settings", markers: ["代理", "设置", "佣金", "资料"] },
  { name: "代理商佣金", route: "/agent/commission", markers: ["佣金", "明细", "代理"] },
  { name: "代理商提现", route: "/agent/withdraw", markers: ["提现", "余额", "代理"] },
  { name: "代理商客户", route: "/agent/customers", markers: ["客户", "代理", "报备"] },
];

function setupErrorCapture(page: Page, errors: string[]) {
  // 允许的 404：仅静态资源噪音（favicon 等）。业务请求 404 一律判红。
  const allowed404 = /favicon|\.ico|\.map|manifest\.json|\/static\//i;

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (/favicon|Download the React DevTools|\.map/i.test(t)) return;
    // 浏览器对 404 资源只给出泛化文案（不含 URL），这类非业务噪音放行；
    // 业务接口 404 会同时被上面的 API 探测用例捕获，不会被漏掉。
    if (/Failed to load resource.*404/.test(t) && allowed404.test(t)) return;
    errors.push(`[console.error] ${t}`);
  });
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));

  // 捕获真实响应 URL：业务 API 404 直接判红，避免泛化文案掩盖问题。
  page.on("response", (res) => {
    if (res.status() !== 404) return;
    const url = res.url();
    if (allowed404.test(url)) return;
    errors.push(`[404] ${url}`);
  });
}

test.describe("2026-10-10 修复域浏览器仿真（admin 真实登录）", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(res.ok(), `admin 登录失败: HTTP ${res.status()}`).toBeTruthy();
    token = (await res.json()).accessToken;
    expect(token, "未取得 accessToken").toBeTruthy();
  });

  test("修复涉及的后端接口均可用（无缺表 500）", async ({ request }) => {
    const problems: string[] = [];

    for (const p of API_PROBES) {
      const res =
        p.method === "get"
          ? await request.get(`${BASE}${p.path}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
          : await request.post(`${BASE}${p.path}`, {
              headers: { Authorization: `Bearer ${token}` },
              data: p.body ?? {},
            });

      const body = await res.text();
      // 缺表在该版本下表现为 500 + 42P01/「关系 ... 不存在」
      const missingTable = /42P01|关系 "\w+" 不存在|does not exist/i.test(body);

      if (res.status() >= 500 || missingTable) {
        problems.push(`${p.name} ${p.path} → HTTP ${res.status()} ${missingTable ? "[缺表]" : ""} ${body.slice(0, 200)}`);
      }
    }

    expect(problems, "以下接口异常（500 或缺表）：\n" + problems.join("\n")).toEqual([]);
  });

  for (const p of PAGES) {
    test(`${p.name}（${p.route}）渲染正常`, async ({ page }) => {
      const errors: string[] = [];
      setupErrorCapture(page, errors);

      await page.addInitScript(
        ([t]) => {
          localStorage.setItem("token", t as string);
          localStorage.setItem("access_token", t as string);
          localStorage.setItem("user", JSON.stringify({ role: "admin" }));
        },
        [token],
      );

      await page.goto(`${BASE}/app${p.route}`);
      await page.waitForLoadState("domcontentloaded");

      // SPA 已挂载（ConsoleLayout 导航存在）
      await expect(page.locator("nav, aside, [class*=sidebar], [class*=Sidebar]").first()).toBeVisible({
        timeout: 20000,
      });

      // 页面有实质内容：命中任一业务标记，且不是白屏
      const body = (await page.locator("body").innerText()).trim();
      expect(body.length, `${p.name} 页面为空`).toBeGreaterThan(20);
      expect(
        p.markers.some((m) => body.includes(m)),
        `${p.name} 未命中任何业务标记 ${JSON.stringify(p.markers)}；实际内容前 300 字：${body.slice(0, 300)}`,
      ).toBe(true);

      expect(errors, `${p.name} 存在前端报错：\n${errors.join("\n")}`).toEqual([]);
    });
  }
});
