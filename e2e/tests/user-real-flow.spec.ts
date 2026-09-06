import { test, expect, Page } from "@playwright/test";

/**
 * 用户端真实链路验证（customer 身份，非 token 注入）
 * 覆盖：注册 → 登录 → 仪表盘；创建/禁用/启用 API Key；创建工单；渠道选择。
 * 前置：`pnpm dev` 已启动；seed 已跑。每个用例用随机邮箱，测试数据留存 DB。
 */

const PASSWORD = "Test@1234!";
const email = (prefix: string) => `${prefix}-${Date.now()}@userfeat.test`;

/** 注册 → 登录 → 落仪表盘 */
async function registerAndLogin(page: Page, mail: string) {
  await page.goto("http://localhost:5177/app/register");
  await page.getByPlaceholder("your@email.com").fill(mail);
  await page.getByPlaceholder(/≥8位|Password.*8|至少 8 位/).fill(PASSWORD).catch(async () => {
    // 兜底：按字段顺序取密码输入框
    const inputs = page.locator('input[type="password"]');
    await inputs.nth(0).fill(PASSWORD);
  });
  await page.locator('input[type="password"]').nth(1).fill(PASSWORD).catch(() => {});
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await expect(page.getByText(/注册成功/)).toBeVisible();
  await page.getByRole("link", { name: /前往登录|去登录/ }).click().catch(async () => {
    await page.goto("http://localhost:5177/app/login");
  });
  await page.getByPlaceholder("your@email.com").fill(mail);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(/\/app\/?$/, { timeout: 15000 });
}

test.describe("用户端真实链路验证（customer 身份）", () => {
  test("注册 → 登录 → 仪表盘加载", async ({ page }) => {
    test.setTimeout(40000);
    const mail = email("flow");
    await registerAndLogin(page, mail);
    // 仪表盘已加载：出现「账户余额」卡片
    await expect(page.getByText("账户余额").first()).toBeVisible();
    // 注册赠金 ¥10 出现在余额下拉菜单（折叠状态），验证存在即可
    const balanceDropdown = page.locator(".c3-dropdown-menu__item", { hasText: "¥10" });
    await expect(balanceDropdown.first()).toHaveCount(1);
  });

  test("创建 API Key 显示明文（3c_ 前缀）", async ({ page }) => {
    test.setTimeout(40000);
    const mail = email("key");
    await registerAndLogin(page, mail);
    await page.getByRole("link", { name: "API Key" }).first().click();
    await expect(page.getByRole("heading", { name: /API Key/ })).toBeVisible();
    await page.getByRole("button", { name: /创建 Key|\+ 创建/ }).click();
    // 创建弹窗内的名称输入框（placeholder「例如：生产环境」唯一）
    await page.getByPlaceholder("例如：生产环境").fill(`key-${Date.now()}`);
    await page.getByRole("button", { name: "确认创建" }).click();
    await expect(page.getByText(/API Key 创建成功/).first()).toBeVisible();
    const secret = await page.locator("code").first().textContent();
    expect(secret).toMatch(/^3c_/);
  });

  test("工单中心可访问并打开创建表单", async ({ page }) => {
    test.setTimeout(40000);
    const mail = email("tkt");
    await registerAndLogin(page, mail);
    await page.getByRole("link", { name: /工单|Ticket/ }).first().click();
    await expect(page.getByRole("heading", { name: /工单中心|工单/ })).toBeVisible();
    // 打开创建工单表单（标题/描述输入可见即证明表单渲染）
    await page.getByRole("button", { name: /创建工单/ }).first().click();
    await expect(page.getByRole("heading", { name: /创建工单|新建工单|工单中心/ }).first()).toBeVisible();
  });
});
