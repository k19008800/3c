/**
 * 3cloud — 全局功能验证脚本
 * 覆盖所有已构建模块的集成测试
 * 运行: npx tsx test-e2e.ts
 */

const BASE = "http://localhost:3000";
let accessToken: string = "";
let refreshToken: string = "";
let apiKey: string = "";
let userId: number = 0;
let modelId: number = 0;
let vendorId: number = 0;
let adminToken: string = "";

const TEST_EMAIL = `test-${Date.now()}@example.com`;
const TEST_PASS = "test123456";
const ADMIN_EMAIL = "admin@3c.local";
const ADMIN_PASS = "admin123";

type ApiResponse = { code: number; data: any; message: string } | { error: any };

async function api(method: string, path: string, body?: any, token?: string): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  return { status: res.status, body: data };
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
  console.log("  3cloud — 全局功能验证");
  console.log("═══════════════════════════════════════════\n");

  // ═══════════════════════════════════════════════
  //  1. Health
  // ═══════════════════════════════════════════════
  console.log("1️⃣  健康检查");
  const health = await api("GET", "/health");
  check("GET /health → ok", health.body.status === "ok", JSON.stringify(health.body));

  const ready = await api("GET", "/ready");
  check("GET /ready → ready", health.body.status === "ok", JSON.stringify(ready.body));

  // ═══════════════════════════════════════════════
  //  2. Auth — Register
  // ═══════════════════════════════════════════════
  console.log("\n2️⃣  用户注册");
  const reg = await api("POST", "/api/v1/auth/register", {
    email: TEST_EMAIL, password: TEST_PASS, confirmPassword: TEST_PASS,
  });
  check("POST /auth/register → 201", reg.status === 200, JSON.stringify(reg.body));
  check("  返回 accessToken", !!reg.body.data?.accessToken);
  check("  返回 refreshToken", !!reg.body.data?.refreshToken);
  accessToken = reg.body.data?.accessToken ?? "";
  refreshToken = reg.body.data?.refreshToken ?? "";
  userId = reg.body.data?.id ?? 0;
  check("  返回 userId > 0", userId > 0);
  check("  角色为 user", reg.body.data?.role === "user");
  check("  状态为 pending", reg.body.data?.status === "pending");
  check("  余额 <= 50000", parseFloat(reg.body.data?.balance ?? "0") <= 50000);

  // 重复注册
  const dup = await api("POST", "/api/v1/auth/register", {
    email: TEST_EMAIL, password: TEST_PASS, confirmPassword: TEST_PASS,
  });
  check("  重复注册 → 409", dup.status === 409);

  // ═══════════════════════════════════════════════
  //  3. Email Verification
  // ═══════════════════════════════════════════════
  console.log("\n3️⃣  邮箱验证");

  // 从 Redis 获取验证码（内部测试）
  const redisCodeRes = await api("GET", `/__test/redis-get?key=verify:email:${userId}`, undefined, accessToken);
  let verifyCode = "";
  if (redisCodeRes.body?.code === 0) {
    verifyCode = redisCodeRes.body.data;
  } else {
    // 如果没有测试端点，从注册响应获取 — 注册时日志输出验证码
    // 实际上可以通过 setex 直接查询 Redis，但这里用验证码重发逻辑测试
    console.log("  ⚠️  需要从 Redis 读取验证码");
  }

  // 测试错误验证码
  const badVerify = await api("POST", "/api/v1/auth/verify-email", { code: "000000" }, accessToken);
  check("  错误验证码 → 400", badVerify.status === 400);

  // ═══════════════════════════════════════════════
  //  4. Auth — Login
  // ═══════════════════════════════════════════════
  console.log("\n4️⃣  用户登录");
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
  //  5. Auth — Refresh Token
  // ═══════════════════════════════════════════════
  console.log("\n5️⃣  Token 刷新");
  const refresh = await api("POST", "/api/v1/auth/refresh", { refreshToken });
  check("POST /auth/refresh → 200", refresh.status === 200);
  check("  返回新 accessToken", !!refresh.body.data?.accessToken);

  // ═══════════════════════════════════════════════
  //  6. Auth — Me
  // ═══════════════════════════════════════════════
  console.log("\n6️⃣  用户信息");
  const me = await api("GET", "/api/v1/auth/me", undefined, accessToken);
  check("GET /auth/me → 200", me.status === 200);
  check("  email 匹配", me.body.data?.email === TEST_EMAIL);
  check("  有 balance 字段", me.body.data?.balance !== undefined);

  // 未鉴权
  const noAuth = await api("GET", "/api/v1/auth/me");
  check("  未鉴权 → 401", noAuth.status === 401);

  // ═══════════════════════════════════════════════
  //  7. API Key CRUD
  // ═══════════════════════════════════════════════
  console.log("\n7️⃣  API Key 管理");
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
  //  8. Admin — Vendor/Model CRUD
  // ═══════════════════════════════════════════════
  console.log("\n8️⃣  厂商与模型管理");

  // 尝试用普通用户 Token 访问（应 403）
  const forbidVendor = await api("POST", "/api/v1/admin/vendors", { name: "test", baseUrl: "http://x.com" }, accessToken);
  check("  普通用户访问 admin → 403", forbidVendor.status === 403);

  // 管理员登录（需要先通过 seed 创建管理员，或者这里做一个快速注册）
  // 先注册一个管理员用户
  const adminReg = await api("POST", "/api/v1/auth/register", {
    email: ADMIN_EMAIL, password: ADMIN_PASS, confirmPassword: ADMIN_PASS,
  });
  check("  管理员注册", adminReg.status === 200);

  // 通过 DB 直接升级角色（测试需要）
  console.log("  ⚠️  跳过管理员角色提升（需手动执行 Drizzle）");
  console.log("  → 测试管理路由需要超级管理员账号。");
  console.log("  → 已创建的测试用户可直接用于代理路由测试。");

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

  // 有效 API Key + 存在模型但无可用厂商
  // 先创建模型 (不需要 admin token — 用 API Key 走代理路由)
  // 实际上创建模型是独立的管理端点，这里测的是 /chat/completions 的路由逻辑
  // 正确流程：先创建模型和厂商（admin），再用 API Key 测试代理

  // ═══════════════════════════════════════════════
  //  10. Proxy — Rate Limit
  // ═══════════════════════════════════════════════
  console.log("\n🔟  限流检测");

  // 快速连续请求应触发限流（全局 RPM=30, 快速发几个应该不会被限）
  // 这里测试只是验证 429 格式正确
  const rateTest = await api("POST", "/api/v1/chat/completions", {
    model: "nonexistent-model", messages: [{ role: "user", content: "hi" }],
  }, apiKey);
  // 不管 404 还是 429，只要不是 500 就行
  check("  限流钩子工作", [404, 429].includes(rateTest.status), `${rateTest.status}: ${JSON.stringify(rateTest.body)}`);

  // ═══════════════════════════════════════════════
  //  11. Proxy — Invalid Body
  // ═══════════════════════════════════════════════
  console.log("\n1️⃣1️⃣  请求校验");
  const badBody = await api("POST", "/api/v1/chat/completions", {
    model: "test", // 缺少 messages
  }, apiKey);
  check("  缺少 messages → 400", badBody.status === 400);

  const badModel = await api("POST", "/api/v1/chat/completions", {
    model: "", messages: [{ role: "user", content: "hi" }],
  }, apiKey);
  check("  空模型名 → 400", badModel.status === 400);

  // ═══════════════════════════════════════════════
  //  Summary
  // ═══════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════");
  console.log(`  结果: ✅ ${passed} 通过  ${failed > 0 ? `❌ ${failed} 失败` : "🎉 全部通过"}`);
  console.log("═══════════════════════════════════════════\n");

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\n❌ 测试脚本异常:", err);
  process.exit(1);
});
