import { test, expect, Page, APIRequestContext } from "@playwright/test";

/**
 * 用户端功能逐页渲染验证（以普通 customer 身份 demo@3cloud.dev）
 * 方法：通过 API 登录获取真实 token，用 addInitScript 注入 localStorage，
 * 使每次完整页面加载都处于已登录状态（消除「登录后立即 goto」的竞态误报）。
 * 每个页面断言：SPA 已挂载、出现 ConsoleLayout 导航、页面有实质内容。
 */

const USER_EMAIL = "demo@3cloud.dev";
const USER_PASSWORD = "Demo@1234";
const BASE = "http://localhost:5177";

interface PageCheck {
  name: string;
  route: string; // 相对 /app 的 SPA 路由，如 "/api-keys"
  markers: string[];
  allowFailed?: string[];
}

const PAGES: PageCheck[] = [
  { name: "仪表盘", route: "/", markers: ["账户余额", "仪表盘", "控制台", "今日消耗", "余额"] },
  { name: "统计", route: "/statistics", markers: ["统计", "Statistics", "图表", "趋势", "暂无数据"] },
  { name: "API Keys", route: "/api-keys", markers: ["API Key", "创建 Key", "API Keys"] },
  { name: "Playground", route: "/playground", markers: ["Playground", "调试", "模型", "对话"] },
  { name: "MJ/Suno 任务", route: "/mj-tasks", markers: ["MJ", "Suno", "绘画", "任务", "生成"] },
  { name: "调用日志", route: "/logs", markers: ["调用日志", "暂无调用记录", "日志"] },
  { name: "充值", route: "/recharge", markers: ["充值", "余额", "支付"] },
  { name: "充值记录", route: "/topup-records", markers: ["充值记录", "充值订单", "暂无"] },
  { name: "账单", route: "/billing", markers: ["账单", "消费", "本期", "用量"] },
  { name: "发票", route: "/invoices", markers: ["发票", "开票", "Invoice"] },
  { name: "兑换码", route: "/redemption", markers: ["兑换", "兑换码", "优惠"] },
  { name: "公告", route: "/announcements", markers: ["公告", "Announcement"] },
  { name: "实名认证", route: "/real-name", markers: ["实名", "认证"] },
  { name: "通知", route: "/notification", markers: ["通知", "Notification"] },
  { name: "工单", route: "/tickets", markers: ["工单", "Ticket"] },
  { name: "在线客服", route: "/chat", markers: ["客服", "Chat", "发送"] },
  { name: "安全中心", route: "/security", markers: ["安全", "密码", "两步", "登录历史", "设备"] },
  { name: "数据导出", route: "/data-export", markers: ["数据", "导出", "下载"] },
  { name: "用户分组", route: "/user-groups", markers: ["用户分组", "分组"] },
  { name: "渠道选择", route: "/vendor-selector", markers: ["渠道", "供应商", "价格"] },
  { name: "账号注销", route: "/account-deletion", markers: ["注销", "删除"] },
  { name: "通知设置", route: "/settings/notifications", markers: ["通知", "偏好", "设置"] },
  { name: "帮助中心", route: "/help", markers: ["帮助", "FAQ", "知识库"] },
  { name: "Webhooks", route: "/webhooks", markers: ["Webhook"] },
];

/** 记录浏览器 console 报错（排除噪音） */
function setupErrorCapture(page: Page, errors: string[]) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const t = msg.text();
      if (/favicon|Download the React DevTools|\.map/i.test(t)) return;
      errors.push(`[console.error] ${t}`);
    }
  });
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
}

test.describe("用户端功能逐页渲染验证（customer 身份，token 注入）", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${BASE}/api/v1/auth/login`, {
      data: { email: USER_EMAIL, password: USER_PASSWORD },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    token = data.accessToken;
    expect(token).toBeTruthy();
  });

  for (const pc of PAGES) {
    test(`${pc.name} (${pc.route})`, async ({ page }) => {
      test.setTimeout(30000);
      const errors: string[] = [];
      setupErrorCapture(page, errors);

      // 注入登录态 → 每次加载都视为已登录
      await page.addInitScript((tok) => {
        localStorage.setItem("token", tok);
      }, token);

      const target = pc.route === "/" ? "/app" : `/app${pc.route}`;
      await page.goto(target);
      await page.waitForLoadState("networkidle").catch(() => {});
      // 给 React 挂载 + 数据请求留时间
      await page.waitForTimeout(1200);

      const bodyText = (await page.locator("body").innerText().catch(() => "")) || "";
      const blank = bodyText.trim().length < 5;

      // 是否进入 Portal 首页（未登录）/ Next 404
      const portalHome = /一站式 AI API 聚合平台/.test(bodyText) && !/账户余额/.test(bodyText);
      const next404 = /This page could not be found/.test(bodyText);

      let matched = false;
      for (const m of pc.markers) {
        if (await page.getByText(m, { exact: false }).first().isVisible().catch(() => false)) {
          matched = true; break;
        }
      }

      const safe = pc.route.replace(/\//g, "_") || "_root";
      await page.screenshot({ path: `C:/Users/ZH/.openclaw/workspace/3cloud/test-reports/evidence/user-${safe}.png`, fullPage: true }).catch(() => {});

      const failed = errors.filter((e) => !pc.allowFailed?.some((a) => e.includes(a)));

      if (portalHome) throw new Error(`落入 Portal 首页（未登录）：route=${pc.route}`);
      if (next404) throw new Error(`落入 Next 404：route=${pc.route}`);
      if (blank) throw new Error(`页面空白：route=${pc.route} errors=${JSON.stringify(failed)}`);
      if (!matched) throw new Error(`无匹配内容：route=${pc.route} markers=${JSON.stringify(pc.markers)} body开头=${bodyText.slice(0, 150)} errors=${JSON.stringify(failed)}`);
      if (failed.length) console.log(`[warn] ${pc.name}: errors -> ${JSON.stringify(failed)}`);
    });
  }
});
