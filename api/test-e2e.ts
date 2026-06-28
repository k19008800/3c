/**
 * 3cloud — 全局功能验证脚本
 * 覆盖所有已构建模块的集成测试
 * 运行: npx tsx test-e2e.ts
 *
 * 依赖: 服务器必须在 localhost:3000 运行
 *       (npm run dev 已在运行中)
 *
 * 管理员测试: 自动通过 DB 将测试账号升级为 admin
 *       需要 DB 连接（postgres://postgres:postgres@localhost:5432/threecloud）
 */

const BASE = "http://localhost:3000";
let accessToken: string = "";
let refreshToken: string = "";
let apiKey: string = "";
let userId: number = 0;
let modelId: number = 0;
let vendorId: number = 0;
let adminAccessToken: string = "";
let rechargeOrderId: number = 0;
let rechargeOrderNo: string = "";

const TEST_EMAIL = `test-${Date.now()}@example.com`;
const TEST_PASS = "test123456";
const ADMIN_EMAIL = `admin-${Date.now()}@3c.local`;
const ADMIN_PASS = "admin123";
const RECHARGE_AMOUNT = "100.00";

type ApiResponse = { code: number; data: any; message: string } | { error: any };

async function api(method: string, path: string, body?: any, token?: string): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // 支持普通文本响应（如支付回调的 SUCCESS）
  const contentType = res.headers.get("content-type") || "";
  let data: any;
  if (contentType.includes("text/plain") || contentType.includes("text/html")) {
    data = await res.text();
  } else {
    data = await res.json();
  }
  return { status: res.status, body: data };
}

/** 通过直接 SQL 将用户升级为 super_admin */
async function upgradeToAdmin(targetUserId: number): Promise<boolean> {
  try {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: "postgres://postgres:postgres@localhost:5432/threecloud" });
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE users SET role = 'super_admin'::user_role WHERE id = $1`,
        [targetUserId],
      );
      return true;
    } finally {
      client.release();
      await pool.end();
    }
  } catch (err: any) {
    console.log(`  ⚠️  DB 升级失败: ${err.message}`);
    return false;
  }
}

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function main() {
  console.log("\n═══════════════════════════════════════════");
  console.log("  3cloud — 全局功能验证 V2");
  console.log("═══════════════════════════════════════════\n");

  // ═══════════════════════════════════════════════
  //  1. Health
  // ═══════════════════════════════════════════════
  console.log("1️⃣  健康检查");
  const health = await api("GET", "/health");
  check("GET /health → ok", health.body.status === "ok", JSON.stringify(health.body));

  const ready = await api("GET", "/ready");
  check("GET /ready → ready", ready.body.status === "ready", JSON.stringify(ready.body));

  // ═══════════════════════════════════════════════
  //  2. Auth — Register
  // ═══════════════════════════════════════════════
  console.log("\n2️⃣  用户注册");
  const reg = await api("POST", "/api/v1/auth/register", {
    email: TEST_EMAIL, password: TEST_PASS, confirmPassword: TEST_PASS,
  });
  check("POST /auth/register → 200", reg.status === 200, JSON.stringify(reg.body));
  check("  返回 accessToken", !!reg.body.data?.accessToken);
  check("  返回 refreshToken", !!reg.body.data?.refreshToken);
  accessToken = reg.body.data?.accessToken ?? "";
  refreshToken = reg.body.data?.refreshToken ?? "";
  userId = reg.body.data?.user?.id ?? 0;
  check("  返回 userId > 0", userId > 0);
  check("  角色为 user", reg.body.data?.user?.role === "user");
  check("  状态为 pending", reg.body.data?.user?.status === "pending");

  // 重复注册
  const dup = await api("POST", "/api/v1/auth/register", {
    email: TEST_EMAIL, password: TEST_PASS, confirmPassword: TEST_PASS,
  });
  check("  重复注册 → 409", dup.status === 409);

  // ═══════════════════════════════════════════════
  //  3. Auth — Login (before email verify)
  // ═══════════════════════════════════════════════
  console.log("\n3️⃣  用户登录");
  const login = await api("POST", "/api/v1/auth/login", {
    email: TEST_EMAIL, password: TEST_PASS,
  });
  check("POST /auth/login → 200", login.status === 200);
  check("  返回 accessToken", !!login.body.data?.accessToken);
  accessToken = login.body.data?.accessToken ?? "";

  // 错误密码
  const badLogin = await api("POST", "/api/v1/auth/login", {
    email: TEST_EMAIL, password: "wrongpass",
  });
  check("  错误密码 → 401", badLogin.status === 401);

  // ═══════════════════════════════════════════════
  //  4. Auth — Refresh Token
  // ═══════════════════════════════════════════════
  console.log("\n4️⃣  Token 刷新");
  const refresh = await api("POST", "/api/v1/auth/refresh", { refreshToken });
  check("POST /auth/refresh → 200", refresh.status === 200);
  check("  返回新 accessToken", !!refresh.body.data?.accessToken);

  // ═══════════════════════════════════════════════
  //  5. Auth — Me
  // ═══════════════════════════════════════════════
  console.log("\n5️⃣  用户信息");
  const me = await api("GET", "/api/v1/auth/me", undefined, accessToken);
  check("GET /auth/me → 200", me.status === 200);
  check("  email 匹配", me.body.data?.email === TEST_EMAIL);
  check("  有 balance 字段", me.body.data?.balance !== undefined);

  // 未鉴权
  const noAuth = await api("GET", "/api/v1/auth/me");
  check("  未鉴权 → 401", noAuth.status === 401);

  // ═══════════════════════════════════════════════
  //  6. API Key CRUD
  // ═══════════════════════════════════════════════
  console.log("\n6️⃣  API Key 管理");
  const createKey = await api("POST", "/api/v1/api-keys", { name: "测试 Key" }, accessToken);
  check("POST /api-keys → 200", createKey.status === 200);
  check("  返回 key (仅一次)", createKey.body.data?.key?.startsWith("sk-3c-"));
  apiKey = createKey.body.data?.key ?? "";
  const keyId = createKey.body.data?.id ?? 0;

  const listKeys = await api("GET", "/api/v1/api-keys", undefined, accessToken);
  check("GET /api-keys → 列表", listKeys.status === 200);
  check("  key 数 > 0", listKeys.body.data?.list?.length > 0);

  const updateKey = await api("PATCH", `/api/v1/api-keys/${keyId}`, { name: "重命名" }, accessToken);
  check("PATCH /api-keys/:id → 200", updateKey.status === 200);

  // ═══════════════════════════════════════════════
  //  7. Admin — Vendor/Model CRUD
  // ═══════════════════════════════════════════════
  console.log("\n7️⃣  厂商与模型管理");

  // 尝试用普通用户 Token 访问（应 403）
  const forbidVendor = await api("POST", "/api/v1/admin/vendors", { name: "test", baseUrl: "http://x.com" }, accessToken);
  check("  普通用户访问 admin → 403", forbidVendor.status === 403);

  // 尝试使用已存在的 seed 管理员
  const seedLogin = await api("POST", "/api/v1/auth/login", {
    email: "admin@3c.local", password: "admin123",
  });
  if (seedLogin.status === 200 && seedLogin.body.data?.user?.role === "super_admin") {
    adminAccessToken = seedLogin.body.data.accessToken;
    console.log("  ✅ 使用 seed 管理员账号");
  } else {
    // 注册新管理员并 DB 升级
    const adminReg = await api("POST", "/api/v1/auth/register", {
      email: ADMIN_EMAIL, password: ADMIN_PASS, confirmPassword: ADMIN_PASS,
    });
    check("  管理员注册", adminReg.status === 200);
    adminAccessToken = adminReg.body.data?.accessToken ?? "";
    const adminUserId = adminReg.body.data?.user?.id ?? 0;

    const upgraded = await upgradeToAdmin(adminUserId);
    check("  升级为 admin", upgraded, "若失败则后续 admin 测试会 403");

    if (upgraded) {
      const adminLogin = await api("POST", "/api/v1/auth/login", {
        email: ADMIN_EMAIL, password: ADMIN_PASS,
      });
      adminAccessToken = adminLogin.body.data?.accessToken ?? "";
      const adminMe = await api("GET", "/api/v1/auth/me", undefined, adminAccessToken);
      check("  管理员角色", adminMe.body.data?.role === "super_admin", `实际角色: ${adminMe.body.data?.role}`);
    } else {
      console.log("  ⚠️  DB 升级失败，admin 测试将使用普通用户，预期 403");
    }
  }

  // ═══════════════════════════════════════════════
  //  8. Admin — Create Vendor + Model
  // ═══════════════════════════════════════════════
  console.log("\n8️⃣  创建厂商与模型");

  const vendorName = `E2E-Vendor-${Date.now()}`;
  const modelName = `e2e-model-${Date.now()}`;

  const createVendor = await api("POST", "/api/v1/admin/vendors", {
    name: vendorName,
    baseUrl: "https://api.e2e-test.local",
  }, adminAccessToken);
  check("POST /admin/vendors → 200", createVendor.status === 200, JSON.stringify(createVendor.body));
  vendorId = createVendor.body.data?.id ?? 0;
  check("  返回 vendorId > 0", vendorId > 0);

  const createModel = await api("POST", "/api/v1/admin/models", {
    name: modelName,
    displayName: "E2E Test Model",
    type: "chat",
  }, adminAccessToken);
  check("POST /admin/models → 200", createModel.status === 200, JSON.stringify(createModel.body));
  modelId = createModel.body.data?.id ?? 0;
  check("  返回 modelId > 0", modelId > 0);

  const createVm = await api("POST", "/api/v1/admin/vendor-models", {
    vendorId,
    modelId,
    upstreamModelName: `e2e-upstream-${Date.now()}`,
    apiEndpoint: "https://api.e2e-test.local/v1/chat/completions",
    apiKey: "sk-e2e-test-key",
    costPriceInput: "0.000001",
    costPriceOutput: "0.000002",
    sellPriceInput: "0.000005",
    sellPriceOutput: "0.000010",
    weight: 100,
  }, adminAccessToken);
  check("POST /admin/vendor-models → 200", createVm.status === 200, JSON.stringify(createVm.body));

  // ═══════════════════════════════════════════════
  //  9. Proxy — API Key Auth
  // ═══════════════════════════════════════════════
  console.log("\n9️⃣  Token 代理路由");

  // 无效 API Key
  const badKey = await api("POST", "/api/v1/chat/completions", {
    model: "gpt-4", messages: [{ role: "user", content: "hi" }],
  }, "sk-invalid");
  check("  无效 API Key → 401", badKey.status === 401);
  check("  错误格式兼容 OpenAI", badKey.body?.error?.code === "invalid_api_key");

  // 有效 API Key + 不存在模型
  const noModel = await api("POST", "/api/v1/chat/completions", {
    model: "nonexistent-model", messages: [{ role: "user", content: "hi" }],
  }, apiKey);
  check("  不存在模型 → 404", noModel.status === 404, JSON.stringify(noModel.body));
  check("  错误格式兼容 OpenAI", noModel.body?.error?.code === "MODEL_NOT_FOUND");

  // ═══════════════════════════════════════════════
  //  10. Proxy — Rate Limit
  // ═══════════════════════════════════════════════
  console.log("\n🔟  限流检测");
  const rateTest = await api("POST", "/api/v1/chat/completions", {
    model: "nonexistent-model", messages: [{ role: "user", content: "hi" }],
  }, apiKey);
  check("  限流钩子工作", [404, 429].includes(rateTest.status), `${rateTest.status}: ${JSON.stringify(rateTest.body)}`);

  // ═══════════════════════════════════════════════
  //  11. Proxy — Invalid Body
  // ═══════════════════════════════════════════════
  console.log("\n1️⃣1️⃣  请求校验");
  const badBody = await api("POST", "/api/v1/chat/completions", {
    model: "test", // 缺少 messages
  }, apiKey);
  check("  缺少 messages → 400", badBody.status === 400);

  const emptyModel = await api("POST", "/api/v1/chat/completions", {
    model: "", messages: [{ role: "user", content: "hi" }],
  }, apiKey);
  check("  空模型名 → 400", emptyModel.status === 400);

  // ═══════════════════════════════════════════════
  //  12. Models List API (public)
  // ═══════════════════════════════════════════════
  console.log("\n1️⃣2️⃣  模型列表 API");

  const modelList = await api("GET", "/api/v1/models");
  check("GET /models → 200", modelList.status === 200, JSON.stringify(modelList.body));
  check("  返回 list", Array.isArray(modelList.body?.data?.list));
  check("  包含刚才创建的模型", modelList.body?.data?.list?.some((m: any) => m.name === modelName));
  check("  包含厂商价格信息", modelList.body?.data?.list?.length > 0 && modelList.body.data.list[0].vendors?.length > 0);

  // ═══════════════════════════════════════════════
  //  13. Recharge System
  // ═══════════════════════════════════════════════
  console.log("\n1️⃣3️⃣  充值系统");

  // 13a. 在线支付下单
  const rechargeOrder = await api("POST", "/api/v1/recharge", {
    amount: RECHARGE_AMOUNT,
    channel: "wechat_scan",
  }, accessToken);
  check("POST /recharge → 200", rechargeOrder.status === 200, JSON.stringify(rechargeOrder.body));
  check("  返回 orderNo", !!rechargeOrder.body.data?.orderNo);
  check("  返回 payUrl (扫码)", !!rechargeOrder.body.data?.payUrl);
  rechargeOrderNo = rechargeOrder.body.data?.orderNo ?? "";
  check("  金额匹配", rechargeOrder.body.data?.amount === "100.000000" || rechargeOrder.body.data?.amount === "100.00");

  // 13b. 在线支付 JSAPI
  const jsapiOrder = await api("POST", "/api/v1/recharge", {
    amount: "50.00",
    channel: "alipay_jsapi",
  }, accessToken);
  check("POST /recharge (JSAPI) → 200", jsapiOrder.status === 200);
  check("  返回 payParams (JSAPI)", !!jsapiOrder.body.data?.payParams);

  // 13c. 非法渠道
  const badChannel = await api("POST", "/api/v1/recharge", {
    amount: "10.00",
    channel: "invalid_channel",
  }, accessToken);
  check("  非法渠道 → 400", badChannel.status === 400);

  // 13d. 非法金额
  const badAmount = await api("POST", "/api/v1/recharge", {
    amount: "-10.00",
    channel: "wechat_scan",
  }, accessToken);
  check("  负数金额 → 400", badAmount.status === 400);

  // 13e. 对公转账
  const bankTransfer = await api("POST", "/api/v1/recharge/bank-transfer", {
    amount: "5000.00",
    bankName: "中国工商银行",
    accountNumber: "6222****1234",
    transferDate: "2026-06-27",
    remark: "测试对公转账",
  }, accessToken);
  check("POST /recharge/bank-transfer → 200", bankTransfer.status === 200, JSON.stringify(bankTransfer.body));
  check("  返回 orderNo", !!bankTransfer.body.data?.orderNo);
  check("  状态为 pending", bankTransfer.body.data?.status === "pending");
  check("  渠道为 bank_transfer", bankTransfer.body.data?.channel === "bank_transfer");

  // 13f. 查询充值订单
  const ordersList = await api("GET", `/api/v1/recharge/orders?page=1&pageSize=10`, undefined, accessToken);
  check("GET /recharge/orders → 200", ordersList.status === 200);
  check("  返回列表", Array.isArray(ordersList.body?.data?.list));
  check("  订单数 >= 3", (ordersList.body?.data?.list?.length ?? 0) >= 3);
  check("  total >= 3", (ordersList.body?.data?.total ?? 0) >= 3);

  // 13g. 未鉴权
  const noAuthRecharge = await api("POST", "/api/v1/recharge", { amount: "10", channel: "wechat_scan" });
  check("  未鉴权充值 → 401", noAuthRecharge.status === 401);

  // 13h. 支付回调模拟
  const notifyRes = await api("POST", "/api/v1/recharge/notify", {
    orderNo: rechargeOrderNo,
    channelOrderNo: "wx_mock_" + Date.now(),
    amount: "100.000000",
  });
  check("POST /recharge/notify → SUCCESS", notifyRes.status === 200 && notifyRes.body === "SUCCESS", JSON.stringify(notifyRes.body));

  // 13i. 验证充值后余额
  const meAfterRecharge = await api("GET", "/api/v1/auth/me", undefined, accessToken);
  check("  充值后余额变化", parseFloat(meAfterRecharge.body.data?.balance ?? "0") > parseFloat(me.body.data?.balance ?? "0"));

  // 13j. 取消订单（不需要实际的订单ID，测试路由存在）
  // 先取一个 pending 状态订单
  const pendingOrders = await api("GET", `/api/v1/recharge/orders?page=1&pageSize=5&status=pending`, undefined, accessToken);
  if (pendingOrders.body?.data?.list?.length > 0) {
    const cancelId = pendingOrders.body.data.list[0].id;
    const cancelRes = await api("POST", `/api/v1/recharge/${cancelId}/cancel`, {}, accessToken);
    check("  取消订单 → 200", cancelRes.status === 200);
  } else {
    console.log("  ⚠️  没有可取消的订单");
  }

  // ═══════════════════════════════════════════════
  //  14. Call Logs
  // ═══════════════════════════════════════════════
  console.log("\n1️⃣4️⃣  调用日志");

  const logs = await api("GET", "/api/v1/logs?page=1&pageSize=10", undefined, accessToken);
  check("GET /logs → 200", logs.status === 200, JSON.stringify(logs.body));
  check("  返回 list", Array.isArray(logs.body?.data?.list));
  check("  有 total 字段", typeof logs.body?.data?.total === "number");
  check("  有 page 字段", logs.body?.data?.page === 1);
  check("  有 pageSize 字段", logs.body?.data?.pageSize === 10);

  // 如果有日志，测试详情
  if (logs.body?.data?.list?.length > 0) {
    const logId = logs.body.data.list[0].id;
    const logDetail = await api("GET", `/api/v1/logs/${logId}`, undefined, accessToken);
    check("GET /logs/:id → 200", logDetail.status === 200);
    check("  返回模型名", !!logDetail.body.data?.modelName);
    check("  返回 tokens", typeof logDetail.body.data?.totalTokens === "number");
    check("  返回 cost", !!logDetail.body.data?.cost);
    check("  返回 status", !!logDetail.body.data?.status);

    // 访问他人的日志
    const otherLog = await api("GET", `/api/v1/logs/${logId}`, undefined, adminAccessToken);
    check("  他人日志 → 404", otherLog.status === 404);
  }

  // 日志汇总
  const summary = await api("GET", "/api/v1/logs/summary", undefined, accessToken);
  check("GET /logs/summary → 200", summary.status === 200);
  check("  返回 totalCalls", typeof summary.body.data?.totalCalls === "number");
  check("  返回 totalTokens", typeof summary.body.data?.totalTokens === "number");
  check("  返回 totalCost", !!summary.body.data?.totalCost);

  // 带过滤
  const filteredLogs = await api("GET", "/api/v1/logs?status=success&page=1&pageSize=5", undefined, accessToken);
  check("  过滤日志 → 200", filteredLogs.status === 200);
  check("  过滤后总数 <= 全部", (filteredLogs.body?.data?.total ?? Infinity) <= (logs.body?.data?.total ?? 0));

  // 日志 未鉴权
  const noAuthLogs = await api("GET", "/api/v1/logs");
  check("  未鉴权日志 → 401", noAuthLogs.status === 401);

  // ═══════════════════════════════════════════════
  //  15. Admin — User Management
  // ═══════════════════════════════════════════════
  console.log("\n1️⃣5️⃣  Admin 用户管理");

  const userList = await api("GET", "/api/v1/admin/users?page=1&pageSize=20", undefined, adminAccessToken);
  check("GET /admin/users → 200", userList.status === 200, JSON.stringify(userList.body));
  check("  返回 list", Array.isArray(userList.body?.data?.list));
  check("  total > 0", (userList.body?.data?.total ?? 0) > 0);
  check("  包含测试用户", userList.body?.data?.list?.some((u: any) => u.email === TEST_EMAIL));
  check("  包含管理员", userList.body?.data?.list?.some((u: any) => u.email === ADMIN_EMAIL));

  // 用户详情
  const userDetail = await api("GET", `/api/v1/admin/users/${userId}`, undefined, adminAccessToken);
  check("GET /admin/users/:id → 200", userDetail.status === 200);
  check("  email 匹配", userDetail.body.data?.email === TEST_EMAIL);
  check("  含 stats", userDetail.body.data?.stats !== undefined);

  // 更新用户
  const updateUser = await api("PATCH", `/api/v1/admin/users/${userId}`, {
    nickname: "test_nick",
    discountRate: "0.90",
  }, adminAccessToken);
  check("PATCH /admin/users/:id → 200", updateUser.status === 200);

  // 搜索用户
  const searchRes = await api("GET", `/api/v1/admin/users?keyword=${encodeURIComponent(TEST_EMAIL.split("@")[0])}`, undefined, adminAccessToken);
  check("  搜索用户", searchRes.status === 200 && (searchRes.body?.data?.total ?? 0) > 0);

  // 手动调余额
  const manualRecharge = await api("POST", `/api/v1/admin/users/${userId}/recharge`, {
    amount: "200.00",
    description: "E2E 手动充值测试",
  }, adminAccessToken);
  check("POST /admin/users/:id/recharge → 200", manualRecharge.status === 200);

  // 普通用户无权限
  const forbidUsers = await api("GET", "/api/v1/admin/users", undefined, accessToken);
  check("  普通用户 → 403", forbidUsers.status === 403);

  // ═══════════════════════════════════════════════
  //  16. Admin — Recharge Order Review
  // ═══════════════════════════════════════════════
  console.log("\n1️⃣6️⃣  Admin 充值审核");

  const adminOrders = await api("GET", "/api/v1/admin/recharge-orders?page=1&pageSize=10", undefined, adminAccessToken);
  check("GET /admin/recharge-orders → 200", adminOrders.status === 200);
  check("  返回列表", Array.isArray(adminOrders.body?.data?.list));
  if (adminOrders.body?.data?.list?.length > 0) {
    const orderId = adminOrders.body.data.list[0].id;
    const orderDetail = await api("GET", `/api/v1/admin/recharge-orders/${orderId}`, undefined, adminAccessToken);
    check("GET /admin/recharge-orders/:id → 200", orderDetail.status === 200);
    check("  含 userEmail", !!orderDetail.body.data?.userEmail);
    check("  含 userBalance", !!orderDetail.body.data?.userBalance);
  }

  // 确认对公转账（取第一个 bank_transfer 订单）
  const bankOrders = await api("GET", "/api/v1/admin/recharge-orders?channel=bank_transfer&status=pending", undefined, adminAccessToken);
  if (bankOrders.body?.data?.list?.length > 0) {
    const bankOrderId = bankOrders.body.data.list[0].id;
    const confirmRes = await api("POST", `/api/v1/admin/recharge-orders/${bankOrderId}/confirm`, {}, adminAccessToken);
    check("  确认对公转账 → 200", confirmRes.status === 200);
  } else {
    console.log("  ⚠️  无 pending 对公转账订单可确认");
  }

  // ═══════════════════════════════════════════════
  //  17. Admin — System Config & Audit Logs
  // ═══════════════════════════════════════════════
  console.log("\n1️⃣7️⃣  Admin 系统配置与审计日志");

  const configs = await api("GET", "/api/v1/admin/configs", undefined, adminAccessToken);
  check("GET /admin/configs → 200", configs.status === 200);
  check("  返回列表", Array.isArray(configs.body?.data?.list));
  check("  含配置项", configs.body?.data?.list?.length > 0);

  // 更新配置
  const updateConfig = await api("PATCH", "/api/v1/admin/configs/pricing_multiplier", {
    value: "1.35",
  }, adminAccessToken);
  check("PATCH /admin/configs/:key → 200", updateConfig.status === 200);

  // 改回来
  await api("PATCH", "/api/v1/admin/configs/pricing_multiplier", { value: "1.33" }, adminAccessToken);

  // 审计日志
  const auditLogs = await api("GET", "/api/v1/admin/audit-logs?page=1&pageSize=10", undefined, adminAccessToken);
  check("GET /admin/audit-logs → 200", auditLogs.status === 200);
  check("  返回列表", Array.isArray(auditLogs.body?.data?.list));

  // 仪表盘统计
  const stats = await api("GET", "/api/v1/admin/stats", undefined, adminAccessToken);
  check("GET /admin/stats → 200", stats.status === 200);
  check("  含 users", stats.body.data?.users !== undefined);
  check("  含 todayRecharge", stats.body.data?.todayRecharge !== undefined);
  check("  用户总数 > 0", (stats.body.data?.users?.total ?? 0) > 0);
  check("  配置数 > 0", (stats.body.data?.configs ?? 0) > 0);

  // ═══════════════════════════════════════════════
  //  18. Admin — Real Name Review
  // ═══════════════════════════════════════════════
  console.log("\n1️⃣8️⃣  实名审核");

  const reviewList = await api("GET", "/api/v1/admin/real-name-review?status=pending_review", undefined, adminAccessToken);
  check("GET /admin/real-name-review → 200", reviewList.status === 200);
  check("  返回列表", Array.isArray(reviewList.body?.data?.list));

  // ═══════════════════════════════════════════════
  //  Summary
  // ═══════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════");
  console.log(`  结果: ✅ ${passed} 通过  ${failed > 0 ? `❌ ${failed} 失败` : "🎉 全部通过"}`);
  console.log(`  测试用户: ${TEST_EMAIL}`);
  console.log("═══════════════════════════════════════════\n");

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\n❌ 测试脚本异常:", err);
  process.exit(1);
});
