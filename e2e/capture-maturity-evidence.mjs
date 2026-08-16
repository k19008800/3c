/**
 * 成熟度验证证据截图 — 三角色关键页面（真实后端 api@3000 + portal@5177）
 * 用法：node capture-maturity-evidence.mjs
 * 前置：全栈已启动；fullflow 已跑（verify-user 余额 ¥509.99x）
 */
import { chromium } from "playwright";

const BASE = "http://localhost:5177";
const OUT_DIR = "../test-reports/evidence-maturity-20260817";
import fs from "node:fs";

const ACCOUNTS = {
  user: { email: "verify-user@3cloud.dev", password: "Verify@2026!" },
  admin: { email: "admin@3cloud.dev", password: "Admin@2024!" },
  agent: { email: "verify-agent@3cloud.dev", password: "Verify@2026!" },
};

async function login(page, cred) {
  await page.goto(`${BASE}/app/login`);
  await page.getByPlaceholder("your@email.com").fill(cred.email);
  await page.getByPlaceholder("请输入密码").fill(cred.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

const shots = [
  { name: "portal-home", url: `${BASE}/`, anon: true, wait: 1500 },
  { name: "portal-pricing", url: `${BASE}/pricing`, anon: true, wait: 1500 },
  { name: "user-recharge", url: `${BASE}/app/recharge`, account: "user", wait: 1200 },
  { name: "user-logs", url: `${BASE}/app/logs`, account: "user", wait: 1200 },
  { name: "admin-finance-dashboard", url: `${BASE}/app/admin/finance/dashboard`, account: "admin", wait: 1500 },
  { name: "admin-consumption-tracking", url: `${BASE}/app/admin/consumption/tracking`, account: "admin", wait: 1500 },
  { name: "agent-dashboard", url: `${BASE}/app/agent/dashboard`, account: "agent", wait: 1500 },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });

// 匿名页（portal）
for (const s of shots.filter((x) => x.anon)) {
  const page = await ctx.newPage();
  await page.goto(s.url, { waitUntil: "networkidle" });
  await page.waitForTimeout(s.wait ?? 800);
  await page.screenshot({ path: `${OUT_DIR}/${s.name}.png`, fullPage: false });
  console.log(`📸 ${s.name}`);
  await page.close();
}

// 登录后页面
for (const s of shots.filter((x) => !x.anon)) {
  const page = await ctx.newPage();
  await login(page, ACCOUNTS[s.account]);
  await page.goto(s.url, { waitUntil: "networkidle" });
  await page.waitForTimeout(s.wait ?? 800);
  await page.screenshot({ path: `${OUT_DIR}/${s.name}.png`, fullPage: false });
  console.log(`📸 ${s.name}`);
  await page.close();
}

await browser.close();
console.log(`✅ 证据截图完成 → ${OUT_DIR}`);
