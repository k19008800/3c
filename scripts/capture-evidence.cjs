/**
 * 全流程证据截图 — 三角色代入，对当前留存状态截图（不新增数据）
 * 用法：node scripts/capture-evidence.cjs
 * 输出：test-reports/evidence/*.png
 */
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'e2e', 'node_modules', '@playwright', 'test'));
const fs = require('fs');

const BASE = 'http://localhost:5177/app';
const OUT = path.join(__dirname, '..', 'test-reports', 'evidence');
const USER = { email: 'verify-user@3cloud.dev', password: 'Verify@2026!' };
const AGENT = { email: 'verify-agent@3cloud.dev', password: 'Verify@2026!' };
const ADMIN = { email: 'admin@3cloud.dev', password: 'Admin@2024!' };

async function login(page, { email, password, expected = /\/app\/?$/ }) {
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder('your@email.com').fill(email);
  await page.getByPlaceholder('请输入密码').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(expected);
}

async function shot(page, name) {
  const p = path.join(OUT, name);
  await page.screenshot({ path: p, fullPage: false });
  console.log('  📸', path.relative(path.join(__dirname, '..'), p));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge' });

  // ── 角色 1：普通用户 ──
  const user = await browser.newContext();
  let page = await user.newPage();
  await login(page, USER);
  await page.goto(`${BASE}/recharge`);
  await page.waitForTimeout(1500);
  await shot(page, '01-user-recharge.png'); // 余额 + 充值页
  await page.goto(`${BASE}/logs`);
  await page.waitForTimeout(1500);
  await shot(page, '02-user-logs.png'); // 调用日志（消费核对）

  // ── 角色 2：后台管理员 ──
  const admin = await browser.newContext();
  page = await admin.newPage();
  await login(page, ADMIN, { expected: /\/app\/admin\// });
  await page.goto(`${BASE}/admin/finance/orders`);
  await page.waitForTimeout(1500);
  await shot(page, '03-admin-recharge-orders.png'); // 充值订单（含审核结果）
  await page.goto(`${BASE}/admin/finance/dashboard`);
  await page.waitForTimeout(1500);
  await shot(page, '04-admin-finance-dashboard.png'); // 财务工作台
  await page.goto(`${BASE}/admin/consumption/tracking`);
  await page.waitForTimeout(1500);
  await shot(page, '05-admin-consumption-tracking.png'); // 消费追踪

  // ── 角色 3：代理商 ──
  const agent = await browser.newContext();
  page = await agent.newPage();
  await login(page, AGENT);
  await page.goto(`${BASE}/agent/dashboard`);
  await page.waitForTimeout(1500);
  await shot(page, '06-agent-dashboard.png'); // 代理工作台

  await browser.close();
  console.log('✅ 证据截图完成');
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
