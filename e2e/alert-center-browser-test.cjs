/**
 * 告警中心页 — 真实浏览器验证（CDP + playwright-core connectOverCDP）
 *
 * 覆盖：
 *   1. 登录 admin（super_admin）拿 token
 *   2. /app/admin/alerts 渲染（标题/概览/Tab/表格）
 *   3. 导航侧栏「告警中心」入口可见
 *   4. Tab 切换：事件 ↔ 规则
 *   5. 规则 CRUD：新建 → 编辑 → 启停 → 删除（真实点击 + 网络响应校验）
 *   6. 控制台错误 / 页面异常 / 失败请求收集
 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const BASE = "http://127.0.0.1:5175";
const API = "http://127.0.0.1:3000";
const SHOT_DIR = process.env.SHOT_DIR || path.join(process.env.TEMP, "c3-alert-shots");

const ADMIN = { email: "admin@3cloud.dev", password: "Admin@2024!" };

const results = [];
const consoleErrors = [];
const pageErrors = [];
const failedReqs = [];

/**
 * 确保存在至少一条 firing 告警。
 * 若已有 → 直接返回；否则建一条 error_rate=10% 的低阈值规则，
 * 等alert-engine 自然 tick 产生告警（引擎聚合真实流量，不伪造 alerts 行）。
 */
async function ensureFiringAlert(page) {
  const hasFiring = async () => {
    const r = await page.request.get(`${API}/api/v1/admin/alerts?status=firing&page=1&page_size=5`, {
      headers: { Authorization: `Bearer ${page.__token}` },
    });
    if (!r.ok()) return false;
    const j = await r.json();
    return (j?.data?.total ?? 0) > 0;
  };

  if (await hasFiring()) { console.log("  （已有 firing 告警，跳过造数）"); return; }

  console.log("  无 firing 告警 → 建低阈值规则，等引擎 tick…");
  await page.request.post(`${API}/api/v1/admin/alerts/rules`, {
    headers: { Authorization: `Bearer ${page.__token}` },
    data: { name: `E2E_自动告警_${Date.now()}`, metric: "error_rate", threshold: 0.01, window_sec: 300 },
  }).catch(() => {});

  for (let i = 1; i <= 8; i++) {
    await page.waitForTimeout(10000);
    if (await hasFiring()) { console.log(`  引擎已在第 ${i * 10}s 产生 firing 告警`); return; }
  }
  console.log("  等待超时：引擎未产生告警（可能窗口内无真实流量）");
}

function ok(name, detail = "") { results.push({ status: "PASS", name, detail }); console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
function fail(name, detail = "") { results.push({ status: "FAIL", name, detail }); console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0] || (await browser.newContext());
  const page = await ctx.newPage();

  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("requestfailed", (r) => failedReqs.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && (r.url().includes("/api/") || r.url().includes(":3000"))) {
      failedReqs.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
    }
  });

  // ── 1. 登录取 token ──
  console.log("\n[1] 登录");
  const loginResp = await page.request.post(`${API}/api/v1/auth/login`, { data: ADMIN });
  if (!loginResp.ok()) { fail("登录", `HTTP ${loginResp.status()}`); await browser.close(); return finish(); }
  const loginJson = await loginResp.json();
  const token = loginJson?.accessToken ?? loginJson?.token ?? loginJson?.data?.token ?? loginJson?.data?.accessToken;
  const user = loginJson?.user ?? loginJson?.data?.user;
  if (!token) { fail("登录", "响应中无 token: " + JSON.stringify(loginJson).slice(0, 200)); await browser.close(); return finish(); }
  ok("登录", `role=${user?.role}`);
  page.__token = token;

  // 注入登录态
  await page.addInitScript(
    ([tk, usr]) => {
      localStorage.setItem("token", tk);
      localStorage.setItem("user", JSON.stringify(usr));
    },
    [token, user ?? { role: "admin" }],
  );

  // ── 2. 打开告警中心页 ──
  console.log("\n[2] 渲染 /app/admin/alerts");
  await page.goto(`${BASE}/app/admin/alerts`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);

  const title = await page.title();
  const bodyText = await page.locator("body").innerText();

  if (bodyText.includes("告警中心")) ok("页面标题/顶栏", "含「告警中心」");
  else fail("页面标题/顶栏", "未找到「告警中心」文本");

  // 概览三卡
  for (const label of ["告警总数", "触发中", "规则总数"]) {
    if (bodyText.includes(label)) ok(`概览卡片「${label}」`);
    else fail(`概览卡片「${label}」`, "未渲染");
  }

  // Tab
  const eventsTab = page.getByRole("button", { name: "告警事件", exact: false }).first();
  const rulesTab = page.getByRole("button", { name: "告警规则", exact: false }).first();
  if (await eventsTab.count()) ok("Tab「告警事件」存在"); else fail("Tab「告警事件」缺失");
  if (await rulesTab.count()) ok("Tab「告警规则」存在"); else fail("Tab「告警规则」缺失");

  await page.screenshot({ path: path.join(SHOT_DIR, "01-alerts-events.png"), fullPage: true });

  // ── 3. 侧栏导航入口 ──
  console.log("\n[3] 侧栏导航入口");
  const navLink = page.locator('a[href="/app/admin/alerts"]');
  if (await navLink.count()) ok("侧栏「告警中心」入口", `可见=${await navLink.first().isVisible()}`);
  else fail("侧栏「告警中心」入口", "未找到导航链接");

  // ── 4. 切到规则 Tab ──
  console.log("\n[4] Tab 切换");
  await rulesTab.first().click();
  await page.waitForTimeout(1200);
  const rulesText = await page.locator("body").innerText();
  if (rulesText.includes("新建规则")) ok("规则 Tab 内容渲染", "含「新建规则」按钮");
  else fail("规则 Tab 内容渲染", "未见「新建规则」");
  if (rulesText.includes("监控指标") || rulesText.includes("规则名称")) ok("规则表头渲染");
  else fail("规则表头渲染", "未见表头");
  await page.screenshot({ path: path.join(SHOT_DIR, "02-alerts-rules.png"), fullPage: true });

  // ── 5. 规则 CRUD ──
  console.log("\n[5] 规则 CRUD（真实点击）");
  const newBtn = page.getByRole("button", { name: /新建规则/ }).first();
  if (!(await newBtn.count())) {
    fail("新建规则按钮", "未找到（可能当前角色非 super_admin）");
  } else {
    await newBtn.click();
    await page.waitForTimeout(600);
    const modalVisible = await page.locator("text=新建告警规则").first().isVisible().catch(() => false);
    if (modalVisible) ok("新建规则 Modal 打开"); else fail("新建规则 Modal 打开");

    const RULE_NAME = `E2E告警规则_${Date.now()}`;
    const inputs = page.locator(".c3-form-group input");
    await inputs.first().fill(RULE_NAME);
    const metricSel = page.locator(".c3-form-group select").first();
    await metricSel.selectOption("error_rate");
    // 阈值 + 窗口
    await page.locator('.c3-form-group input[type="number"]').nth(0).fill("7");
    await page.locator('.c3-form-group input[type="number"]').nth(1).fill("600");
    await page.screenshot({ path: path.join(SHOT_DIR, "03-rule-create-modal.png"), fullPage: true });

    const [createResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/admin/alerts/rules") && r.request().method() === "POST", { timeout: 15000 }).catch(() => null),
      page.getByRole("button", { name: /^保存$/ }).first().click(),
    ]);
    if (createResp && createResp.status() < 400) ok("创建规则", `HTTP ${createResp.status()}`);
    else fail("创建规则", createResp ? `HTTP ${createResp.status()}` : "无响应（接口未发出）");

    await page.waitForTimeout(1500);

    // 规则出现在表中
    const tableText = await page.locator("body").innerText();
    if (tableText.includes(RULE_NAME)) ok("新规则出现在列表", RULE_NAME);
    else fail("新规则出现在列表", "列表中未找到 " + RULE_NAME);

    // 停用
    const row = page.locator("tr", { hasText: RULE_NAME }).first();
    const wasEnabled = (await row.innerText()).includes("启用");
    await row.getByRole("button", { name: wasEnabled ? "停用" : "启用" }).first().click();
    await page.waitForTimeout(1500);
    ok("启停切换", `点击「${wasEnabled ? "停用" : "启用"}」成功`);

    // 编辑
    await row.getByRole("button", { name: "编辑" }).first().click();
    await page.waitForTimeout(700);
    const editOk = await page.locator("text=编辑规则").first().isVisible().catch(() => false);
    if (editOk) ok("编辑 Modal 打开");
    else fail("编辑 Modal 打开", "未打开");
    await page.locator(".c3-form-group input").first().fill(RULE_NAME + "_已编辑");
    const [editResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/admin/alerts/rules/") && r.request().method() === "PUT", { timeout: 15000 }).catch(() => null),
      page.getByRole("button", { name: /^保存$/ }).first().click(),
    ]);
    if (editResp && editResp.status() < 400) ok("保存编辑", `HTTP ${editResp.status()}`);
    else fail("保存编辑", editResp ? `HTTP ${editResp.status()}` : "无响应");

    await page.waitForTimeout(1500);

    // 删除
    const row2 = page.locator("tr", { hasText: RULE_NAME }).first();
    await row2.getByRole("button", { name: "删除" }).first().click();
    await page.waitForTimeout(700);
    const delConfirmVisible = await page.locator("text=确认删除规则").first().isVisible().catch(() => false)
      || await page.locator("text=删除告警规则").first().isVisible().catch(() => false);
    if (delConfirmVisible) ok("删除确认 Modal 打开"); else fail("删除确认 Modal 打开");
    await page.screenshot({ path: path.join(SHOT_DIR, "04-rule-delete-modal.png"), fullPage: true });

    const [delResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/admin/alerts/rules/") && r.request().method() === "DELETE", { timeout: 15000 }).catch(() => null),
      page.getByRole("button", { name: /确认删除/ }).first().click(),
    ]);
    if (delResp && delResp.status() < 400) ok("删除规则", `HTTP ${delResp.status()}`);
    else fail("删除规则", delResp ? `HTTP ${delResp.status()}` : "无响应");

    await page.waitForTimeout(1500);
    const after = await page.locator("body").innerText();
    if (!after.includes(RULE_NAME)) ok("删除后列表已移除");
    else fail("删除后列表已移除", "规则仍在列表中");
  }

  // ── 6. 告警事件：真实数据渲染 + 确认交互 ──
  console.log("\n[6] 告警事件渲染与确认（真实点击）");

  // 前置：若当前无 firing 告警（上一轮已 ack），用一条低阈值规则让引擎自然产生，
  // 保证脚本可重复运行。引擎每 60s tick 一次，最多等 ~70s。
  await ensureFiringAlert(page);

  // 引擎新产生的告警需刷新才可见（页面 30s 轮询，这里主动 reload 等价于运营按 F5）
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  await page.getByRole("button", { name: "告警事件", exact: false }).first().click();
  await page.waitForTimeout(1200);

  const evText = await page.locator("body").innerText();
  if (evText.includes("触发中")) ok("告警状态标签渲染", "见「触发中」");
  else fail("告警状态标签渲染", "未见 firing 告警行（可能无数据）");

  if (/当前\s*[\d.]+/.test(evText)) ok("告警内容含实际指标值");
  else fail("告警内容含实际指标值", "未见「当前 xx%」文案");

  // 触发中计数应 ≥ 1
  const statText = await page.locator(".c3-stat-card").allInnerTexts().catch(() => []);
  const firingCard = statText.find((t) => t.includes("触发中"));
  if (firingCard && !/触发中[\s\S]*?value[^\d]*0/.test(firingCard) && /[1-9]/.test(firingCard.split("\n")[1] ?? "")) {
    ok("概览「触发中」计数 > 0", firingCard.replace(/\n/g, " ").slice(0, 60));
  } else if (firingCard) {
    fail("概览「触发中」计数 > 0", firingCard.replace(/\n/g, " ").slice(0, 60));
  } else {
    fail("概览「触发中」卡片", "未找到");
  }

  await page.screenshot({ path: path.join(SHOT_DIR, "05-alerts-events-live.png"), fullPage: true });

  // 确认告警（ack）
  const ackBtn = page.getByRole("button", { name: /^确认$/ }).first();
  if (!(await ackBtn.count())) {
    fail("确认按钮", "未找到（可能无 firing 告警）");
  } else {
    const [ackResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/ack") && r.request().method() === "POST", { timeout: 15000 }).catch(() => null),
      ackBtn.click(),
    ]);
    if (ackResp && ackResp.status() < 400) ok("确认告警", `HTTP ${ackResp.status()}`);
    else fail("确认告警", ackResp ? `HTTP ${ackResp.status()}` : "无响应");
    await page.waitForTimeout(1800);
    const afterAck = await page.locator("body").innerText();
    if (afterAck.includes("已确认")) ok("确认后状态变为「已确认」");
    else fail("确认后状态变为「已确认」", "状态未更新");
    await page.screenshot({ path: path.join(SHOT_DIR, "06-alerts-after-ack.png"), fullPage: true });
  }

  // 状态筛选
  const filterSel = page.locator("select").first();
  if (await filterSel.count()) {
    await filterSel.selectOption("resolved");
    await page.waitForTimeout(1200);
    ok("状态筛选切换", "筛选 resolved 无报错");
    await filterSel.selectOption("");
    await page.waitForTimeout(800);
  }

  // ── 7. 错误汇总 ──
  console.log("\n[6] 错误汇总");
  const realErrors = consoleErrors.filter((t) => !/favicon|DevTools|Download the React/i.test(t));
  if (realErrors.length === 0) ok("无控制台错误");
  else fail("控制台错误", `${realErrors.length} 条: ${realErrors.slice(0, 3).join(" | ").slice(0, 300)}`);

  if (pageErrors.length === 0) ok("无未捕获异常");
  else fail("未捕获异常", pageErrors.slice(0, 3).join(" | ").slice(0, 300));

  const realFailed = failedReqs.filter((r) => !/favicon/.test(r));
  if (realFailed.length === 0) ok("无失败请求");
  else fail("失败请求", `${realFailed.length} 条: ${realFailed.slice(0, 5).join(" | ").slice(0, 400)}`);

  await browser.close();
  finish();
})().catch(async (e) => { fail("脚本异常", String(e).slice(0, 400)); finish(); });

function finish() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const failN = results.filter((r) => r.status === "FAIL").length;
  console.log(`\n═══ 告警中心页浏览器验证：${pass} 通过 / ${failN} 失败 ═══`);
  console.log(`截图目录: ${SHOT_DIR}`);
  process.exit(failN > 0 ? 1 : 0);
}