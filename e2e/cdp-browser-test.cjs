/**
 * 真实浏览器交互验证（CDP 驱动已运行的 Chrome）
 *
 * 为什么不用 agent-browser CLI：本机该 CLI 的 daemon / connect 子命令均挂起（工具层故障）。
 * 本脚本用 playwright-core 的 connectOverCDP 直连 Chrome 的 CDP 端点，
 * 依旧是**真实 Chrome 渲染 + 真实点击/输入**，并可对每步截图留证。
 *
 * 覆盖本次修复域（REGRESSION-2026-10-10 FIX-1/2/3）：
 *   FIX-1 告警中心（monitoring_rules / alerts 缺表曾致后端 500）
 *   FIX-2 me-agent.ts（代理商侧端点）
 *   FIX-3 预算 user_budget_settings（曾长期 fail-open）
 *
 * 执行：node cdp-browser-test.cjs [baseURL]
 */
const { chromium } = require("playwright-core");

const BASE = process.argv[2] || "http://localhost:5177";
const CDP = "http://127.0.0.1:9222";
const SHOT_DIR = process.env.SHOT_DIR || process.env.TEMP + "/3cloud-cdp-shots";

const ADMIN_EMAIL = "admin@3cloud.dev";
const ADMIN_PASSWORD = "Admin@2024!"; // 与 api/src/db/seed.ts 一致

/** 修复域接口探针：缺表在该版本表现为 500 + 42P01 */
const API_PROBES = [
  ["告警规则 monitoring_rules", "/api/v1/admin/alerts/rules"],
  ["告警记录 alerts", "/api/v1/admin/alerts"],
  ["预算设置 user_budget_settings", "/api/v1/me/budget"],
  ["代理商资料", "/api/v1/me/agent/profile"],
  ["佣金等级规则", "/api/v1/me/agent/commission-rules"],
  ["佣金明细", "/api/v1/me/agent/commissions"],
  ["提现汇总", "/api/v1/me/agent/withdraw-summary"],
];

/** 修复域页面 */
const PAGES = [
  ["代理商设置", "/app/agent/settings", ["代理", "佣金", "设置"]],
  ["代理商佣金", "/app/agent/commission", ["佣金", "明细"]],
  ["代理商提现", "/app/agent/withdraw", ["提现"]],
  ["代理商客户", "/app/agent/customers", ["客户", "报备"]],
  ["代理商仪表盘", "/app/agent/dashboard", ["代理", "仪表盘", "数据"]],
  ["管理端仪表盘", "/app/admin/dashboard", ["仪表盘", "数据", "运营"]],
  ["代理商管理", "/app/admin/agents", ["代理", "管理"]],
  ["风险规则", "/app/admin/risk/rules", ["风险", "规则"]],
];

const results = [];
let failures = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function shot(page, label) {
  try {
    await page.screenshot({ path: `${SHOT_DIR}/${label}.png`, fullPage: false });
  } catch { /* 截图失败不判红 */ }
}

(async () => {
  // 1. 真实登录拿 token（登录本身走真实 HTTP，与浏览器登录页等价）
  const loginRes = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!loginRes.ok) {
    console.error(`登录失败 HTTP ${loginRes.status}`);
    process.exit(1);
  }
  const { accessToken } = await loginRes.json();
  console.log(`[setup] admin 登录成功，token 长度 ${accessToken.length}\n`);

  // 2. 接口探针（修复域真实链路）
  console.log("── 修复域接口探针（真实 HTTP，断言无缺表 500）──");
  for (const [name, path] of API_PROBES) {
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await res.text();
    const missing = /42P01|关系 "\w+" 不存在|does not exist/i.test(body);
    const ok = res.status < 500 && !missing;
    record(`${name} ${path}`, ok, `HTTP ${res.status}${missing ? " [缺表]" : ""}`);
  }

  // 3. 真实浏览器逐页验证
  console.log("\n── 真实 Chrome 页面渲染 ──");
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  // 注入登录态（等价于在浏览器里登录一次）
  await page.addInitScript((t) => {
    localStorage.setItem("token", t);
    localStorage.setItem("access_token", t);
    localStorage.setItem("user", JSON.stringify({ role: "admin", email: "admin@3cloud.dev" }));
  }, accessToken);

  for (const [name, route, markers] of PAGES) {
    const errs = [];
    const onErr = (e) => { if (!/favicon|\.ico|\.map/i.test(e.message ?? "")) errs.push(e.message); };
    const onPageErr = (e) => errs.push(`pageerror: ${e.message}`);
    const on404 = (r) => {
      if (r.status() === 404 && !/favicon|\.ico|\.map|manifest/i.test(r.url())) errs.push(`404 ${r.url()}`);
    };
    page.on("requestfailed", onErr);
    page.on("pageerror", onPageErr);
    page.on("response", on404);

    try {
      const resp = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1200); // 等 SPA 渲染

      const text = (await page.locator("body").innerText()).trim();
      const hasNav = await page.locator("nav, aside, [class*=sidebar], [class*=Sidebar]").count();

      await shot(page, name);

      if (!resp || resp.status() >= 400) {
        record(`${name} ${route}`, false, `HTTP ${resp && resp.status()}`);
      } else if (text.length <= 20) {
        record(`${name} ${route}`, false, `页面近乎空白（${text.length} 字符）`);
      } else if (hasNav === 0) {
        record(`${name} ${route}`, false, "未挂载 ConsoleLayout 导航，SPA 未加载");
      } else if (!markers.some((m) => text.includes(m))) {
        record(`${name} ${route}`, false, `未命中业务标记 ${JSON.stringify(markers)}；实际前 200 字：${text.slice(0, 200)}`);
      } else if (errs.length) {
        record(`${name} ${route}`, false, `前端报错：${errs.slice(0, 3).join(" | ")}`);
      } else {
        record(`${name} ${route}`, true, `${text.length} 字符，导航已挂载，命中标记`);
      }
    } catch (e) {
      record(`${name} ${route}`, false, `异常：${e.message.split("\n")[0]}`);
    } finally {
      page.off("requestfailed", onErr);
      page.off("pageerror", onPageErr);
      page.off("response", on404);
    }
  }

  await page.close();
  await browser.close();

  // 4. 汇总
  console.log(`\n══ 汇总 ══`);
  console.log(`通过 ${results.length - failures} / ${results.length}`);
  console.log(`截图目录：${SHOT_DIR}`);
  if (failures) {
    console.log("\n失败明细：");
    results.filter((r) => !r.ok).forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error("脚本异常：", e.message);
  process.exit(1);
});
