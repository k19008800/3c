import { test, expect } from "@playwright/test";

/**
 * Console 核心链路 E2E
 * 前置：seed 已跑（admin@3cloud.io / seed-admin）+ 前后端运行
 * 流程：登录 → 仪表盘 → API Key 创建 → 调用日志
 */

test.describe("3Cloud Console 核心链路", () => {
  test("登录 → 仪表盘", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("密码").fill("seed-admin");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "仪表盘" })).toBeVisible();
    await expect(page.getByText(/余额:/)).toBeVisible();
    await expect(page.getByRole("link", { name: "API Keys" }).first()).toBeVisible();
  });

  test("仪表盘展示统计卡片", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("密码").fill("seed-admin");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page.getByRole("heading", { name: "仪表盘" })).toBeVisible();
    await expect(page.getByText("当前余额")).toBeVisible();
    await expect(page.getByText("累计调用")).toBeVisible();
    await expect(page.getByText("累计 Tokens")).toBeVisible();
  });

  test("创建 API Key 并显示明文", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("密码").fill("seed-admin");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page.getByRole("heading", { name: "仪表盘" })).toBeVisible();

    await page.getByRole("link", { name: "API Keys" }).first().click();
    await expect(page.getByRole("heading", { name: "API Keys" })).toBeVisible();

    const name = `e2e-key-${Date.now()}`;
    await page.getByPlaceholder("Key 名称").fill(name);
    await page.getByRole("button", { name: "创建 Key" }).click();

    await expect(page.getByText(/Key 创建成功/)).toBeVisible();
    const secret = await page.locator("code").first().textContent();
    expect(secret).toMatch(/^sk-/);
    await expect(page.getByText(name)).toBeVisible();
  });

  test("API Key 创建后可操作（禁用/删除）", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("密码").fill("seed-admin");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page.getByRole("heading", { name: "仪表盘" })).toBeVisible();

    await page.getByRole("link", { name: "API Keys" }).first().click();
    await expect(page.getByRole("heading", { name: "API Keys" })).toBeVisible();

    const name = `e2e-op-${Date.now()}`;
    await page.getByPlaceholder("Key 名称").fill(name);
    await page.getByRole("button", { name: "创建 Key" }).click();
    await expect(page.getByText(/Key 创建成功/)).toBeVisible();
    await page.getByRole("button", { name: "关闭" }).click();
    await expect(page.getByText(name)).toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(name) });
    await row.getByRole("button", { name: "禁用" }).click();
    await expect(row.getByText("disabled")).toBeVisible();
  });

  test("调用日志页展示记录", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("密码").fill("seed-admin");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page.getByRole("heading", { name: "仪表盘" })).toBeVisible();

    await page.getByRole("link", { name: "调用日志" }).click();
    await expect(page.getByRole("heading", { name: "调用日志" })).toBeVisible();
    await expect(page.getByText("供应商")).toBeVisible();
    await expect(page.getByText("模型")).toBeVisible();
    await expect(page.getByText("状态")).toBeVisible();
  });

  test("未登录访问受保护页 → 跳转登录", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => localStorage.removeItem("token"));
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "3Cloud 控制台" })).toBeVisible();
  });
});
