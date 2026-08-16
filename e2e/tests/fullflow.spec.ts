import { test, expect } from "@playwright/test";

/**
 * 3cloud 三角色全流程浏览器验证 — 真实后端（api@3000）+ 真实数据库（threecloud_v3）
 *
 * 角色代入：
 *   ① 普通用户 verify-user@3cloud.dev  — 登录 → 对公打款下单 → 审核中
 *   ② 后台管理员 admin@3cloud.dev       — 充值订单审核通过 → 余额到账 → 财务报表
 *   ③ 普通用户再入                      — 余额 ¥510 → 建 Key → 真实调度 → 消费核对
 *   ④ 后台管理员再入                    — 财务工作台 + 消费追踪
 *   ⑤ 代理商 verify-agent@3cloud.dev   — 代理工作台
 *
 * 前置：
 *   - `pnpm dev` 一键栈已启动（api@3000 / portal@5177 托管 /app/）
 *   - 三角色账号已留存 DB（scripts/prepare-verify-accounts.cjs 生成）
 *   - 用 serial 模式保证「下单 → 审核 → 到账 → 调度 → 消费」时序
 */

const USER = { email: "verify-user@3cloud.dev", password: "Verify@2026!" };
const AGENT = { email: "verify-agent@3cloud.dev", password: "Verify@2026!" };
const ADMIN = { email: "admin@3cloud.dev", password: "Admin@2024!" };

let orderNo = "";
let rawKey = "";

async function login(page: import("@playwright/test").Page, email: string, password: string, expected = /\/app\/?$/) {
  await page.goto("/app/login");
  await page.getByPlaceholder("your@email.com").fill(email);
  await page.getByPlaceholder("请输入密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(expected);
}

test.describe.configure({ mode: "serial" });

test.describe("3cloud 三角色全流程（浏览器）", () => {
  test("① 普通用户：对公打款下单 ¥500 → 审核中", async ({ page }) => {
    await login(page, USER.email, USER.password);
    await page.goto("/app/recharge");

    // 初始余额（注册赠金 ¥10）
    await expect(page.getByText("¥10.00").first()).toBeVisible();

    // 选择「对公转账」
    await page.locator("label").filter({ hasText: "对公转账" }).click();
    // 输入金额并提交审核
    await page.getByPlaceholder("输入充值金额").fill("500");
    await page.getByRole("button", { name: "提交审核" }).click();

    // 审核中状态 + 最近充值记录出现该订单（RC 单号 + 待处理）
    await expect(page.getByText("对公转账审核中")).toBeVisible();
    await expect(page.getByText(/RC\d{18}/).first()).toBeVisible();

    orderNo = (await page.getByText(/RC\d{18}/).first().textContent())!.trim();
    console.log(`[①] 用户已提交对公打款订单 ${orderNo}`);
  });

  test("② 后台管理员：充值订单审核通过 → 余额到账", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password, /\/app\/admin\//);
    await page.goto("/app/admin/finance/orders");

    // 搜索该用户的对公打款订单
    await page.getByPlaceholder("搜索订单号/客户...").fill(USER.email);
    await expect(page.getByText(orderNo)).toBeVisible();

    // 点击审核通过
    const row = page.getByRole("row", { name: new RegExp(orderNo) });
    await row.getByRole("button", { name: "审核通过" }).click();

    // 成功后 toast + 状态变为已完成
    await expect(page.getByText("操作成功，余额已更新")).toBeVisible();
    await expect(page.getByText("已完成").first()).toBeVisible();
    console.log(`[②] 管理员已审核通过 ${orderNo}`);
  });

  test("③ 普通用户：余额到账 ¥510 → 建 Key → 真实调度 → 消费核对", async ({ page, request }) => {
    // 用全新浏览器上下文重新登录用户（角色代入）
    await login(page, USER.email, USER.password);
    await page.goto("/app/recharge");
    await expect(page.getByText("¥510.00").first()).toBeVisible();
    console.log("[③] 用户余额已到账 ¥510.00");

    // 创建 API Key
    await page.goto("/app/api-keys");
    await expect(page.getByRole("heading", { name: "API Key 管理" })).toBeVisible();
    await page.getByRole("button", { name: "+ 创建 Key" }).click();
    await page.getByPlaceholder("例如：生产环境").fill(`fullflow-${Date.now()}`);
    await page.getByRole("button", { name: "确认创建" }).click();
    await expect(page.getByText("✅ API Key 创建成功")).toBeVisible();
    rawKey = (await page.locator("code").first().textContent())!.trim();
    expect(rawKey).toMatch(/^3c_/);
    console.log(`[③] 已创建 API Key ${rawKey.slice(0, 12)}...`);

    // 真实调度：走 portal 统一入口 → /v1/chat/completions → 真实记账
    const chat = await request.post("/v1/chat/completions", {
      headers: { Authorization: `Bearer ${rawKey}` },
      data: {
        model: "deepseek-chat",
        messages: [{ role: "user", content: "请用一句话介绍 3cloud" }],
        stream: false,
      },
    });
    const chatBody = await chat.json();
    expect(chat.status()).toBe(200);
    expect(chatBody?.usage?.total_tokens).toBeGreaterThan(0);
    console.log(`[③] 真实调度成功 total_tokens=${chatBody?.usage?.total_tokens}`);

    // 消费核对：调用日志出现该次调度
    await page.goto("/app/logs");
    await expect(page.getByRole("heading", { name: "调用日志" })).toBeVisible();
    await expect(page.getByText("deepseek-chat").first()).toBeVisible();
    console.log("[③] 调用日志已出现调度记录");
  });

  test("④ 后台管理员：财务工作台 + 消费追踪", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password, /\/app\/admin\//);

    // 财务工作台（页面标题 h2，含 [?] 帮助按钮 → 用 heading role 避免与侧栏链接歧义）
    await page.goto("/app/admin/finance/dashboard");
    await expect(page.getByRole("heading", { name: /财务工作台/ })).toBeVisible();
    console.log("[④] 财务工作台可访问");

    // 消费追踪（用户调度产生的消费）
    await page.goto("/app/admin/consumption/tracking");
    await expect(page.getByRole("heading", { name: /消费追踪/ })).toBeVisible();
    console.log("[④] 消费追踪页可访问");
  });

  test("⑤ 代理商：代理工作台", async ({ page }) => {
    await login(page, AGENT.email, AGENT.password);
    await page.goto("/app/agent/dashboard");
    await expect(page.getByText("代理商控制台")).toBeVisible();
    console.log("[⑤] 代理商工作台可访问");
  });
});
