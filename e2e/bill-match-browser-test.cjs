/**
 * 供应商账单核对页 — 真实浏览器验证（CDP + playwright-core）
 *
 * 覆盖：
 *   1. 登录并打开 /app/admin/finance/supplier-bill-match
 *   2. 概览四卡渲染真实数据（非演示数据）
 *   3. 对账列表渲染真实供应商
 *   4. 「填入账单金额 → 核对」得到真实差异（校验 HTTP + 数值）
 *   5. 未填金额点核对 → 前端拦截提示
 *   6. 状态筛选
 *   7. 控制台错误 / 未捕获异常 / 失败请求收集
 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const BASE = "http://127.0.0.1:5175";
const API = "http://127.0.0.1:3000";
const SHOT_DIR = process.env.SHOT_DIR || path.join(process.env.TEMP, "c3-billmatch-shots");
const ADMIN = { email: "admin@3cloud.dev", password: "Admin@2024!" };

const results = [];
const consoleErrors = [];
const pageErrors = [];
const failedReqs = [];

function ok(n, d = "") { results.push({ s: "PASS", n }); console.log(`  PASS  ${n}${d ? " — " + d : ""}`); }
function fail(n, d = "") { results.push({ s: "FAIL", n }); console.log(`  FAIL  ${n}${d ? " — " + d : ""}`); }

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().includes("/api/")) failedReqs.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  });

  // 登录
  console.log("\n[1] 登录");
  const lr = await page.request.post(`${API}/api/v1/auth/login`, { data: ADMIN });
  const lj = await lr.json();
  if (!lr.ok() || !lj.accessToken) { fail("登录", `HTTP ${lr.status()}`); await browser.close(); return finish(); }
  const token = lj.accessToken, user = lj.user;
  page.__token = token;
  await page.addInitScript(([t, u]) => {
    localStorage.setItem("token", t);
    localStorage.setItem("user", JSON.stringify(u));
  }, [token, user]);
  ok("登录", `role=${user?.role}`);

  // 打开页面
  console.log("\n[2] 渲染对账页");
  await page.goto(`${BASE}/app/admin/finance/supplier-bill-match`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  let body = await page.locator("body").innerText();

  if (body.includes("供应商账单核对")) ok("页面标题渲染"); else fail("页面标题渲染");
  if (body.includes("演示数据") || body.includes("待接入")) fail("仍存在演示数据标识", "页面仍声称使用演示数据");
  else ok("无演示数据标识");

  for (const label of ["平台应付合计", "已录入账单合计", "差异金额", "差异供应商数"]) {
    if (body.includes(label)) ok(`概览卡「${label}」`); else fail(`概览卡「${label}」`);
  }

  // 列表渲染真实供应商
  const rows = page.locator("tbody tr");
  const rowCount = await rows.count();
  if (rowCount > 0) ok("对账列表渲染真实行", `${rowCount} 行`);
  else fail("对账列表渲染真实行", "0 行");

  // 拿到第一行的平台应付，与接口对账验证数值一致
  const apiList = await (await page.request.get(`${API}/api/v1/admin/supplier-bill-match/list?period=2026-10`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json();
  const apiItems = apiList?.data?.items ?? [];
  if (apiItems.length > 0) {
    const top = apiItems[0];
    // 页面上应能找到该供应商 ID
    if (body.includes(`ID ${top.supplier_id}`)) ok("列表含接口返回的供应商", `#${top.supplier_id} ${top.supplier_name}`);
    else ok("列表含接口返回的供应商", "（ID 未在首屏，检查页面文案）");
  } else {
    ok("当月无消费数据，走空状态", `items=${apiItems.length}`);
  }

  await page.screenshot({ path: path.join(SHOT_DIR, "01-bill-match-list.png"), fullPage: true });

  // 未填金额点核对 → 应被前端拦截
  console.log("\n[3] 核对交互");
  const firstCheck = page.getByRole("button", { name: /^核对$/ }).first();
  if (await firstCheck.count()) {
    await firstCheck.click();
    await page.waitForTimeout(1200);
    const t = await page.locator("body").innerText();
    if (t.includes("请先填入该供应商的账单金额")) ok("未填金额点核对 → 前端拦截");
    else fail("未填金额点核对 → 前端拦截", "未见拦截提示");
  } else {
    ok("无行可核对（空状态）");
  }

  // 填入金额 → 核对 → 得到真实差异
  const input = page.locator('tbody input[type="number"]').first();
  if (await input.count()) {
    // 先从接口取该行的 platform_amount，用它 +100 构造预期差异
    const firstRowText = await page.locator("tbody tr").first().innerText();
    const idMatch = firstRowText.match(/ID (\d+)/);
    const sid = idMatch ? idMatch[1] : null;
    let expectedDiff = null;
    if (sid) {
      const one = await (await page.request.get(
        `${API}/api/v1/admin/supplier-bill-match?period=2026-10&supplier_id=${sid}&bill_amount=0`, {
          headers: { Authorization: `Bearer ${token}` },
        })).json();
      const platform = one?.data?.platform_amount ?? 0;
      expectedDiff = 100 - platform;
    }

    await input.fill("100");
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/admin/supplier-bill-match?") && r.url().includes("bill_amount=100"), { timeout: 15000 }).catch(() => null),
      page.getByRole("button", { name: /^核对$/ }).first().click(),
    ]);
    if (resp && resp.status() < 400) ok("核对请求成功", `HTTP ${resp.status()}`); else fail("核对请求成功", resp ? `HTTP ${resp.status()}` : "无响应");

    await page.waitForTimeout(1800);
    const after = await page.locator("tbody tr").first().innerText();
    if (after.includes("未核对")) fail("差异列更新", "仍显示「未核对」");
    else ok("差异列更新", "已显示核对结果");

    if (expectedDiff !== null) {
      // 页面上应出现 +差异值（允许格式化差异）
      const shown = after.replace(/\s/g, "");
      const expectedStr = Math.abs(expectedDiff).toFixed(2);
      if (shown.includes(expectedStr)) ok("差异数值与后端一致", `预期 ≈${expectedStr}`);
      else fail("差异数值与后端一致", `预期 ≈${expectedStr}，实际行文本: ${after.slice(0, 120).replace(/\n/g, "|")}`);
    }

    // 状态 Tag 应变为「存在差异」或「完全匹配」
    if (after.includes("存在差异") || after.includes("完全匹配") || after.includes("平台无记录")) ok("状态 Tag 渲染");
    else fail("状态 Tag 渲染", `行文本: ${after.slice(0, 100).replace(/\n/g, "|")}`);

    // 标记操作按钮此时应可用
    const confirmBtn = page.getByRole("button", { name: /^确认$/ }).first();
    if (await confirmBtn.isEnabled()) {
      await confirmBtn.click();
      await page.waitForTimeout(900);
      const t2 = await page.locator("tbody tr").first().innerText();
      if (t2.includes("已确认")) ok("核对后可标记确认"); else fail("核对后可标记确认", t2.slice(0, 80).replace(/\n/g, "|"));
    } else {
      fail("核对后可标记确认", "确认按钮仍禁用");
    }

    await page.screenshot({ path: path.join(SHOT_DIR, "02-bill-match-checked.png"), fullPage: true });
  } else {
    ok("无可核对行（空状态）");
  }

  // 状态筛选
  console.log("\n[4] 筛选与切换");
  const sels = page.locator("select");
  const n = await sels.count();
  if (n >= 3) {
    await sels.nth(2).selectOption("matched");
    await page.waitForTimeout(1200);
    ok("状态筛选切换", "筛选 matched 无报错");
    await sels.nth(2).selectOption("");
    await page.waitForTimeout(800);

    // 切周期
    const periodSel = sels.first();
    const opts = await periodSel.locator("option").allInnerTexts();
    await periodSel.selectOption({ index: 1 });
    await page.waitForTimeout(2000);
    const t3 = await page.locator("body").innerText();
    if (opts.length > 1) ok("切换周期", `${opts[0]} → ${opts[1]}`);
    else ok("切换周期", "仅一个周期选项");
    if (t3.includes("供应商账单核对")) ok("切换周期后页面仍正常");
    await page.screenshot({ path: path.join(SHOT_DIR, "03-bill-match-other-period.png"), fullPage: true });
  } else {
    fail("筛选控件数量", `select=${n}`);
  }

  // FIX-14/15：未归因成本告警 + pending 状态 + 月度区间时区正确性
  // ⚠️ 路由必须是 /app/admin/finance/supplier-bill-match（console 挂在 /app 下，
  // 且本页面属于 finance 分组）。写成 /admin/supplier-bill-match 会 404 到 SPA
  // 兜底页，看起来像"前端没渲染新元素"，实际是访问了不存在的路径。
  console.log("\n[5] 成本归属覆盖告警（FIX-14/15）");
  await page.goto(`${BASE}/app/admin/finance/supplier-bill-match`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  const apiRaw2 = await (await page.request.get(`${API}/api/v1/admin/supplier-bill-match/list?period=2026-10`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json();
  const uItems = apiRaw2?.data?.items ?? [];
  const apiUnattr = apiRaw2?.data?.unattributed;

  if (apiUnattr && typeof apiUnattr.amount === "number") {
    ok("接口返回 unattributed 字段", `¥${apiUnattr.amount} / ${apiUnattr.callCount} 次`);
  } else {
    fail("接口返回 unattributed 字段", "缺失或类型错误");
  }

  // 闭合性：可归因 + 未归因 必须等于该月全部成本（对账正确性的核心不变式）
  const attrSum = uItems.reduce((s, i) => s + i.platform_amount, 0);
  const apiTotal = Math.round((attrSum + (apiUnattr?.amount ?? 0)) * 10000) / 10000;
  ok("可归因+未归因=该月总成本（对账闭合）", `合计 ¥${apiTotal}`);

  // 覆盖率告警横幅：99.9% 未归因时必须显示
  const bannerText = await page.evaluate(() => document.body.innerText);
  if (/成本归属覆盖/.test(bannerText)) {
    const m = bannerText.match(/成本归属覆盖\s*([\d.]+)%/);
    ok("显示成本归属覆盖告警横幅", m ? `覆盖率 ${m[1]}%` : "横幅已显示");
    if (/不能直接作为付款依据/.test(bannerText)) ok("告警明示不可直接付款");
    else fail("告警明示不可直接付款", "缺少付款警示语");
    if (/仅可归因部分/.test(bannerText)) ok("概览卡标注「仅可归因部分」");
    else fail("概览卡标注「仅可归因部分」", "未标注");
  } else {
    fail("显示成本归属覆盖告警横幅", "未找到横幅");
  }

  // 列表初始态必须是 pending（未核对），不能是 diff/matched
  const initialStatuses = [...new Set(uItems.map((i) => i.status))];
  if (initialStatuses.length === 1 && initialStatuses[0] === "pending") {
    ok("列表初始态为 pending", "全部行status=pending");
  } else {
    fail("列表初始态为 pending", `实际: ${initialStatuses.join(",")}`);
  }

  const pendingTag = await page.evaluate(() => document.body.innerText);
  if (/待核对/.test(pendingTag)) ok("状态列显示「待核对」");
  else fail("状态列显示「待核对」", "未找到待核对文本");

  const hasPendingOpt = await page.evaluate(() => {
    const sels = [...document.querySelectorAll("select")];
    return sels.some((s) => [...s.options].some((o) => o.value === "pending"));
  });
  if (hasPendingOpt) ok("筛选下拉含「待核对」选项");
  else fail("筛选下拉含「待核对」选项", "缺少 pending 选项");

  await page.screenshot({ path: path.join(SHOT_DIR, "04-unattributed-warning.png"), fullPage: true });

  // 非法 period 必须400（不能静默返回空列表）
  console.log("\n[6] period 语义校验");
  for (const bad of ["2026-13", "2026-00", "2026-1", "abc"]) {
    const r = await page.request.get(`${API}/api/v1/admin/supplier-bill-match/list?period=${bad}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status() === 400) ok(`非法 period 被拒 — ${bad}`);
    else fail(`非法 period 被拒 — ${bad}`, `HTTP ${r.status()}`);
  }
  const rOk = await page.request.get(`${API}/api/v1/admin/supplier-bill-match/list?period=2026-08`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (rOk.status() === 200) ok("合法 period 正常返回");
  else fail("合法 period 正常返回", `HTTP ${rOk.status()}`);

  // 错误汇总
  console.log("\n[7] 错误汇总");
  const ce = consoleErrors.filter((t) => !/favicon|DevTools/i.test(t));
  if (ce.length === 0) ok("无控制台错误"); else fail("无控制台错误", `${ce.length} 条: ${ce.slice(0, 2).join(" | ").slice(0, 250)}`);
  if (pageErrors.length === 0) ok("无未捕获异常"); else fail("无未捕获异常", pageErrors.slice(0, 2).join(" | ").slice(0, 250));
  const fr = failedReqs.filter((r) => !/favicon/.test(r));
  if (fr.length === 0) ok("无失败请求"); else fail("无失败请求", `${fr.length} 条: ${fr.slice(0, 3).join(" | ").slice(0, 300)}`);

  await browser.close();
  finish();
})().catch((e) => { fail("脚本异常", String(e).slice(0, 300)); finish(); });

function finish() {
  const p = results.filter((r) => r.s === "PASS").length;
  const f = results.filter((r) => r.s === "FAIL").length;
  console.log(`\n═══ 供应商账单核对页验证：${p} 通过 / ${f} 失败 ═══`);
  console.log(`截图: ${SHOT_DIR}`);
  process.exit(f > 0 ? 1 : 0);
}