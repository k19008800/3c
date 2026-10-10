/** 诊断：编辑规则保存时页面到底发生了什么 */
const { chromium } = require("playwright-core");
const path = require("path");
const BASE = "http://127.0.0.1:5175";
const API = "http://127.0.0.1:3000";
const SHOT = path.join(process.env.TEMP, "c3-alert-shots");

(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  const reqs = [];
  page.on("request", (r) => { if (r.url().includes("/admin/alerts")) reqs.push(`${r.method()} ${r.url()}`); });
  page.on("response", async (r) => {
    if (r.url().includes("/admin/alerts")) {
      let b = ""; try { b = (await r.text()).slice(0, 200); } catch {}
      console.log(`  RESP ${r.status()} ${r.request().method()} ${r.url()} :: ${b}`);
    }
  });
  page.on("console", (m) => { if (m.type() === "error") console.log("  CONSOLE-ERR:", m.text().slice(0, 200)); });
  page.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 300)));

  const lr = await page.request.post(`${API}/api/v1/auth/login`, {
    data: { email: "admin@3cloud.dev", password: "Admin@2024!" },
  });
  const lj = await lr.json();
  const token = lj.accessToken, user = lj.user;
  await page.addInitScript(([t, u]) => {
    localStorage.setItem("token", t); localStorage.setItem("user", JSON.stringify(u));
  }, [token, user]);

  await page.goto(`${BASE}/app/admin/alerts`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "告警规则", exact: false }).first().click();
  await page.waitForTimeout(1200);

  // 建一条规则
  const NAME = `DIAG_${Date.now()}`;
  await page.getByRole("button", { name: /新建规则/ }).first().click();
  await page.waitForTimeout(500);
  await page.locator(".c3-form-group input").first().fill(NAME);
  console.log("form-group input count =", await page.locator(".c3-form-group input").count());
  await page.getByRole("button", { name: /^保存$/ }).first().click();
  await page.waitForTimeout(1800);
  console.log("created:", NAME);

  // 编辑
  const row = page.locator("tr", { hasText: NAME }).first();
  console.log("row count =", await page.locator("tr", { hasText: NAME }).count());
  await row.getByRole("button", { name: "编辑" }).first().click();
  await page.waitForTimeout(900);

  console.log("--- 编辑 Modal DOM ---");
  const modal = page.locator(".c3-modal, [role=dialog]").last();
  console.log((await modal.innerText().catch(() => "(no modal el)")).slice(0, 400));
  console.log("modal input count =", await modal.locator("input").count());
  console.log("modal buttons:", await modal.locator("button").allInnerTexts().catch(() => []));

  await modal.locator("input").first().fill(NAME + "_EDIT");
  console.log(">>> 点击保存");
  await modal.getByRole("button", { name: /^保存$/ }).first().click();
  await page.waitForTimeout(2500);

  console.log("--- 页面 toast / 提示 ---");
  console.log((await page.locator("body").innerText()).slice(0, 600));
  await page.screenshot({ path: path.join(SHOT, "diag-edit.png"), fullPage: true });

  console.log("--- alert 相关请求 ---");
  reqs.forEach((r) => console.log("  " + r));

  await browser.close();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });