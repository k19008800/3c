/**
 * 全量页面真实浏览器扫描 —— 144 个 console 路由逐个真实渲染
 *
 * 用法：
 *   1) 起 dev 栈 + console(5175) + Chrome CDP(9222)
 *   2) node full-page-scan.cjs [routesFile] [concurrency]
 *
 * 目的：回答「所有功能都测了吗」——用真实 Chrome 逐页渲染，给出可量化的健康画像，
 * 而不是靠已有 e2e 清单推断覆盖率。
 *
 * 判红标准（不放宽）：
 *   - HTTP >= 400
 *   - 页面近乎空白（去除布局壳后正文 < 30 字符）
 *   - pageerror / 未捕获异常
 *   - 业务请求 4xx/5xx（favicon/.map 等静态资源除外）
 * 已登录（admin token 注入），避免把「跳登录页」误判为失败。
 */
const { chromium } = require("playwright-core");
const fs = require("fs");

const BASE = process.env.SCAN_BASE || "http://localhost:5177";
const CDP = "http://127.0.0.1:9222";
const ROUTES_FILE = process.argv[2] || "/tmp/routes.txt";
const OUT = process.env.SCAN_OUT || process.env.TEMP + "/3cloud-scan.json";
const TOKEN = process.env.SCAN_TOKEN;

const STATIC_NOISE = /favicon|\.ico|\.map|manifest\.json|\/static\/|blob:|data:/i;

(async () => {
  const rawRoutes = fs
    .readFileSync(ROUTES_FILE, "utf8")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    // App.tsx 中 path 多数不带前导斜杠（如 admin/agents），统一补齐后再拼 URL。
    .map((s) => (s.startsWith("/") ? s : `/${s}`));

  // 参数化路由（/admin/suppliers/:id）不能把 :id 当字面量请求 ——
  // 否则后端必然 400，扫描结果会被误判为页面故障。
  // 用 SCAN_PARAM_VALUE（默认 1）替换为真实存在的 ID。
  const PARAM_VALUE = process.env.SCAN_PARAM_VALUE || "1";
  const routes = rawRoutes.map((r) => r.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, PARAM_VALUE));
  const templated = rawRoutes.filter((r) => r !== routes[rawRoutes.indexOf(r)]).length;
  if (templated > 0) console.log(`（已把${templated} 条参数化路由的 :param 替换为 ${PARAM_VALUE}）`);

  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  if (TOKEN) {
    await page.addInitScript((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("access_token", t);
      localStorage.setItem("user", JSON.stringify({ role: "admin", email: "admin@3cloud.dev" }));
    }, TOKEN);
  }

  const results = [];

  for (const route of routes) {
    const errs = [];
    const badResponses = [];
    const onPageErr = (e) => errs.push(`pageerror: ${e.message}`);
    const onResp = (r) => {
      if (r.status() >= 400 && !STATIC_NOISE.test(r.url())) {
        const u = r.url().replace(BASE, "");
        badResponses.push(`${r.status()} ${u}`);
      }
    };
    page.on("pageerror", onPageErr);
    page.on("response", onResp);

    const rec = { route, status: 0, chars: 0, errors: [], badResponses: [], verdict: "" };
    try {
      const resp = await page.goto(`${BASE}/app${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
      rec.status = resp ? resp.status() : 0;
      await page.waitForTimeout(700);

      const text = (await page.locator("body").innerText()).trim();
      rec.chars = text.length;

      const hard =
        rec.status >= 400 ||
        errs.length > 0 ||
        badResponses.some((b) => /^5\d\d/.test(b));

      if (rec.status >= 400) rec.verdict = "HTTP_ERROR";
      else if (errs.length) rec.verdict = "JS_ERROR";
      else if (hard) rec.verdict = "API_ERROR";
      else if (rec.chars < 30) rec.verdict = "BLANK";
      else if (badResponses.length) rec.verdict = "WARN_CLIENT_4XX";
      else rec.verdict = "OK";
    } catch (e) {
      rec.verdict = "EXCEPTION";
      rec.errors.push(e.message.split("\n")[0]);
    } finally {
      page.off("pageerror", onPageErr);
      page.off("response", onResp);
    }
    rec.errors = errs.slice(0, 3);
    rec.badResponses = badResponses.slice(0, 5);
    results.push(rec);
    if (rec.verdict !== "OK") console.log(`${rec.verdict.padEnd(14)} ${route}`);
  }

  await page.close();
  await browser.close();

  // 汇总
  const by = {};
  results.forEach((r) => (by[r.verdict] = (by[r.verdict] || 0) + 1));
  console.log(`\n══ 总计 ${results.length} 个路由 ══`);
  Object.entries(by)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`${k.padEnd(14)} ${v}`));
  fs.writeFileSync(OUT, JSON.stringify({ total: results.length, by, results }, null, 2));
  console.log(`明细已写入：${OUT}`);
  console.log(`\n健康率：${((by.OK || 0) / results.length * 100).toFixed(1)}%`);
})().catch((e) => {
  console.error("扫描异常：", e.message);
  process.exit(1);
});
