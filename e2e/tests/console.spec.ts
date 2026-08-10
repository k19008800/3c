import { test, expect } from "@playwright/test";

/**
 * Console 核心链路 E2E — 对齐单入口架构（api@3000 / portal@5177 托管 /app/）
 * 前置：`pnpm dev` 一键栈已启动；seed 已跑（admin@3cloud.dev）
 * 用户流采用「注册 → 登录」真实链路，每轮用随机邮箱，测试数据留存 DB
 * 路由带 /app basename（web-console BrowserRouter basename="/app"）
 */

const PASSWORD = "Test1234!";
const email = (prefix: string) => `${prefix}-${Date.now()}@e2e.test`;

/** 走完注册流程并跳转登录页 */
async function registerAndToLogin(page: import("@playwright/test").Page, mail: string) {
  await page.goto("/register");
  await page.getByPlaceholder("your@email.com").fill(mail);
  await page.getByPlaceholder("≥8位，字母+数字+特殊字符").fill(PASSWORD);
  await page.getByPlaceholder("再次输入密码").fill(PASSWORD);
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await expect(page.getByText("注册成功！")).toBeVisible();
  await page.getByRole("link", { name: "前往登录" }).click();
  await expect(page).toHaveURL(/\/app\/login/);
}

/** 在登录页完成登录，落仪表盘 */
async function loginToDash(page: import("@playwright/test").Page, cred: { email: string; password: string }) {
  await page.getByPlaceholder("your@email.com").fill(cred.email);
  await page.getByPlaceholder("请输入密码").fill(cred.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(page.getByRole("heading", { name: /仪表盘|控制台/ })).toBeVisible();
}

test.describe("3Cloud Console 核心链路", () => {
  test("注册 → 登录 → 仪表盘（余额可见）", async ({ page }) => {
    const mail = email("reg");
    await registerAndToLogin(page, mail);
    await loginToDash(page, { email: mail, password: PASSWORD });

    await expect(page.getByText("账户余额")).toBeVisible();
    await expect(page.getByText("¥10.00").first()).toBeVisible(); // 注册赠金
  });

  test("创建 API Key 并显示明文（3c_ 前缀）", async ({ page }) => {
    const mail = email("key");
    await registerAndToLogin(page, mail);
    await loginToDash(page, { email: mail, password: PASSWORD });

    await page.getByRole("link", { name: "API Keys" }).first().click();
    await expect(page.getByRole("heading", { name: "API Key 管理" })).toBeVisible();

    const name = `e2e-key-${Date.now()}`;
    await page.getByRole("button", { name: "+ 创建 Key" }).click();
    await page.getByPlaceholder("例如：生产环境").fill(name);
    await page.getByRole("button", { name: "确认创建" }).click();

    await expect(page.getByText("✅ API Key 创建成功")).toBeVisible();
    const secret = await page.locator("code").first().textContent();
    expect(secret).toMatch(/^3c_/);
    await page.getByRole("button", { name: "返回列表" }).click();
    await expect(page.getByText(name)).toBeVisible();
  });

  test("API Key 可禁用 / 启用", async ({ page }) => {
    const mail = email("op");
    await registerAndToLogin(page, mail);
    await loginToDash(page, { email: mail, password: PASSWORD });

    await page.getByRole("link", { name: "API Keys" }).first().click();
    await expect(page.getByRole("heading", { name: "API Key 管理" })).toBeVisible();

    const name = `e2e-op-${Date.now()}`;
    await page.getByRole("button", { name: "+ 创建 Key" }).click();
    await page.getByPlaceholder("例如：生产环境").fill(name);
    await page.getByRole("button", { name: "确认创建" }).click();
    await expect(page.getByText("✅ API Key 创建成功")).toBeVisible();
    await page.getByRole("button", { name: "返回列表" }).click();

    const row = page.getByRole("row", { name: new RegExp(name) });
    await row.getByRole("button", { name: "禁用" }).click();
    await expect(row.getByText("已禁用")).toBeVisible();
    await row.getByRole("button", { name: "启用" }).click();
    await expect(row.getByText("启用")).toBeVisible();
  });

  test("调用日志页：无记录时展示空态与筛选", async ({ page }) => {
    const mail = email("logs");
    await registerAndToLogin(page, mail);
    await loginToDash(page, { email: mail, password: PASSWORD });

    await page.getByRole("link", { name: "调用日志" }).click();
    await expect(page.getByRole("heading", { name: "调用日志" })).toBeVisible();
    // 新用户无调用记录 → Table 走空态分支（不渲染表头），断言空态提示
    await expect(page.getByText(/暂无调用记录/)).toBeVisible();
    await expect(page.getByRole("button", { name: "搜索" })).toBeVisible();
  });

  test("未登录访问受保护页 → 落在 Portal 入口，不进入业务控制台", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => localStorage.removeItem("token"));
    await page.goto("/");
    // /app 根由 web-portal 静态托管，未登录直接渲染 Portal 首页而非业务登录
    await expect(page).toHaveURL(/5177\/$/);
  });
});
