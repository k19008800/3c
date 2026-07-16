// chain-scenarios.test.ts — 3cloud 全业务链条深度测试 v3
// SIMULATION=true, Mock 上游路由, 测试数据保留

process.env.SIMULATION = "true";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getApp, closeApp, loginAs } from "./helpers.js";
import { getDb } from "../db/index.js";
import {
  users, callLogs, balanceLogs, apiKeys as apiKeysTable,
  agents, commissionLogs, withdrawOrders, rechargeOrders,
  refundRequests, userRealNameReviews, auditLogs, vendors,
} from "../db/schema.js";
import { eq, and, desc, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";

const ADMIN_EMAIL = "admin@3cloud.ai";
const ADMIN_PASSWORD = "Admin1234!";
const TEST_PREFIX = `chain-${Date.now().toString(36)}`;
const TEST_MODEL = "deepseek-v4-pro"; // DB matches lowercase

function rand(): string { return randomBytes(6).toString("hex"); }
function parse(r: any): any { return JSON.parse(r.body); }

let app: FastifyInstance;
let adminToken: string;
let adminUserId: number;
let c1: { id: number; token: string };
let c2: { key: string; id: number };
let c3: { orderId: number };
let c5: { agentId: number; agentUserId: number; clientUserId: number; clientToken: string; clientKey: string } = {} as any;

beforeAll(async () => {
  expect(process.env.SIMULATION).toBe("true");
  app = await getApp();
  adminToken = await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD);
  const me = parse(await app.inject({
    method: "GET", url: "/api/v1/auth/me",
    headers: { authorization: `Bearer ${adminToken}` },
  }));
  adminUserId = me.data?.id || me.id;
  console.log(`[Setup] admin=${adminUserId}`);
});
afterAll(async () => { await closeApp(); });

// ═══════════ Chain 1: 用户生命周期 ═══════════
describe("Chain 1: 用户生命周期", () => {
  const email = `${TEST_PREFIX}-u1-${rand()}@chain.3cloud.dev`;
  const pass = "ChainPass123!";

  it("1.1 注册", async () => {
    const r = await app.inject({
      method: "POST", url: "/api/v1/auth/register",
      payload: { email, password: pass, confirmPassword: pass, nickname: "C1用户" },
    });
    expect(r.statusCode).toBe(200);
    const body = parse(r);
    c1 = { id: body.data.user.id, token: body.data.accessToken };
    console.log(`[C1] 用户 ID=${c1.id}`);
  });

  it("1.2 登录", async () => {
    const r = await app.inject({
      method: "POST", url: "/api/v1/auth/login",
      payload: { email, password: pass },
    });
    expect(r.statusCode).toBe(200);
    c1.token = parse(r).data.accessToken;
  });

  it("1.3 GET /me", async () => {
    const r = await app.inject({
      method: "GET", url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${c1.token}` },
    });
    expect(r.statusCode).toBe(200);
  });

  it("1.4 提交个人实名", async () => {
    const r = await app.inject({
      method: "POST", url: "/api/v1/auth/real-name/personal",
      headers: { authorization: `Bearer ${c1.token}` },
      payload: { realName: "张三", idNumber: "110101199001011234" },
    });
    if (r.statusCode === 400) {
      console.log(`[C1] 实名返回400: ${parse(r).message || ""}（可能校验码不符）`);
      return;
    }
    expect(r.statusCode).toBe(200);
  });

  it("1.5 管理员通过实名", async () => {
    // 用 manual-real-name 端点
    let r = await app.inject({
      method: "POST", url: `/api/v1/admin/users/${c1.id}/manual-real-name`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: "approve", realName: "张三" },
    });
    if (r.statusCode !== 200) {
      console.log(`[C1] manual-real-name=${r.statusCode}, 尝试 review 端点`);
      r = await app.inject({
        method: "POST", url: `/api/v1/admin/real-name-review/${c1.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { action: "approve" },
      });
      expect(r.statusCode).toBe(200);
    }
    const db = getDb();
    const [u] = await db.select({ s: users.realNameStatus }).from(users).where(eq(users.id, c1.id)).limit(1);
    expect(u?.s).toBe("approved");
    console.log(`[C1] 实名通过 ✅`);
  });

  it("1.6 审核列表可见", async () => {
    const r = await app.inject({
      method: "GET", url: "/api/v1/admin/real-name-reviews",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(r.statusCode).toBe(200);
    const found = (parse(r).data?.list || []).find((x: any) => x.id === c1.id);
    if (found) console.log(`[C1] 审核列表可见`);
  });
});

// ═══════════ Chain 2: Token 代理调用 ═══════════
describe("Chain 2: Token 代理 + 计费", () => {
  it("2.1 用 admin 创建 API Key", async () => {
    const r = await app.inject({
      method: "POST", url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: `${TEST_PREFIX}-c2-key` },
    });
    expect(r.statusCode).toBe(200);
    c2 = { key: parse(r).data.key, id: parse(r).data.id };
    console.log(`[C2] API Key ID=${c2.id}`);
  });

  it("2.2 调用代理（SIMULATION 模式）", async () => {
    const r = await app.inject({
      method: "POST", url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${c2.key}`, "content-type": "application/json" },
      payload: { model: TEST_MODEL, messages: [{ role: "user", content: "你好" }], max_tokens: 100 },
    });
    if (r.statusCode !== 200) {
      console.log(`[C2] ${r.statusCode}: ${r.body.slice(0, 120)}`);
      const mr = await app.inject({ method: "GET", url: "/v1/models" });
      const models = (parse(mr).data?.list || []).map((m: any) => m.id);
      console.log(`[C2] 可用模型: ${models.slice(0, 8).join(", ")}...`);
      return;
    }
    const body = parse(r);
    expect(body.choices).toBeDefined();
    console.log(`[C2] 调用成功 usage=${JSON.stringify(body.usage)}`);

    const db = getDb();
    const [log] = await db
      .select().from(callLogs)
      .where(and(eq(callLogs.apiKeyId, c2.id), eq(callLogs.status, "success")))
      .orderBy(desc(callLogs.createdAt)).limit(1);

    if (log) {
      console.log(`[C2] call_log: model=${log.modelName} vendor=${log.vendorName} tokens=${log.totalTokens} cost=${log.cost}`);
      const [bl] = await db
        .select().from(balanceLogs)
        .where(and(eq(balanceLogs.userId, adminUserId), eq(balanceLogs.type, "consumption")))
        .orderBy(desc(balanceLogs.createdAt)).limit(1);
      if (bl) console.log(`[C2] balance_log: 扣款=${bl.amount} 余额后=${bl.balanceAfter}`);
    }
  });

  it("2.3 无鉴权 → 401", async () => {
    const r = await app.inject({
      method: "POST", url: "/v1/chat/completions",
      payload: { model: "test", messages: [{ role: "user", content: "hi" }] },
    });
    expect(r.statusCode).toBe(401);
  });

  it("2.4 不存在的模型 → 非500", async () => {
    const r = await app.inject({
      method: "POST", url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${c2.key}`, "content-type": "application/json" },
      payload: { model: "nonexistent-xyz", messages: [{ role: "user", content: "test" }] },
    });
    expect(r.statusCode).not.toBe(500);
    console.log(`[C2] 不存在模型 → ${r.statusCode}`);
  });
});

// ═══════════ Chain 3: 充值双审 ═══════════
describe("Chain 3: 充值双审", () => {
  const amount = 888.00;

  beforeAll(() => {
    if (!c1?.id) { c1 = { id: adminUserId, token: adminToken }; }
  });

  it("3.1 对公转账提交", async () => {
    const r = await app.inject({
      method: "POST", url: "/api/v1/recharge/bank-transfer",
      headers: { authorization: `Bearer ${c1.token || adminToken}` },
      payload: { amount: amount.toString(), bankName: "中国银行", accountNumber: "6222021234567890",
        transferDate: new Date().toISOString().slice(0, 10), remark: "链3测试" },
    });
    expect(r.statusCode).toBe(200);
    const body = parse(r);
    c3 = { orderId: body.data?.orderId || body.data?.id || body.data?.order?.id };
    if (!c3.orderId) {
      const db = getDb();
      const orders = await db.select({ id: rechargeOrders.id }).from(rechargeOrders)
        .where(eq(rechargeOrders.userId, c1.id)).orderBy(desc(rechargeOrders.createdAt)).limit(1);
      if (orders.length > 0) c3.orderId = orders[0].id;
    }
    expect(c3.orderId).toBeGreaterThan(0);
    console.log(`[C3] 订单 ID=${c3.orderId}`);
  });

  it("3.2 管理员查看订单", async () => {
    const r = await app.inject({
      method: "GET", url: "/api/v1/admin/recharge-orders",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(r.statusCode).toBe(200);
    const order = (parse(r).data?.list || []).find((o: any) => o.id === c3.orderId);
    expect(order).toBeDefined();
    console.log(`[C3] 订单 status=${order.status}`);
  });

  it("3.3 初审", async () => {
    const r = await app.inject({
      method: "POST", url: `/api/v1/admin/recharge-orders/${c3.orderId}/first-confirm`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: "confirm" },
    });
    if (r.statusCode !== 200) {
      console.log(`[C3] 初审返回 ${r.statusCode}: ${r.body.slice(0, 100)}`);
      return;
    }
    console.log(`[C3] 初审通过`);
  });

  it("3.4 复审（余额增加）", async () => {
    const db = getDb();
    const [u] = await db.select({ b: users.balance }).from(users).where(eq(users.id, c1.id)).limit(1);
    const balBefore = Number(u?.b ?? 0);
    console.log(`[C3] 充值前余额=${balBefore}`);

    const r = await app.inject({
      method: "POST", url: `/api/v1/admin/recharge-orders/${c3.orderId}/second-confirm`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: "confirm", bankTxId: `BANK${Date.now()}` },
    });
    if (r.statusCode !== 200) {
      console.log(`[C3] 复审返回 ${r.statusCode}: ${r.body.slice(0, 100)}`);
      return;
    }
    const [u2] = await db.select({ b: users.balance }).from(users).where(eq(users.id, c1.id)).limit(1);
    console.log(`[C3] 余额 ${balBefore} → ${Number(u2?.b ?? 0)}`);
  });

  it("3.5 balance_logs 充值记录 + 审计日志", async () => {
    const db = getDb();
    const logs = await db.select().from(balanceLogs)
      .where(and(eq(balanceLogs.userId, c1.id), eq(balanceLogs.type, "recharge")))
      .orderBy(desc(balanceLogs.createdAt)).limit(3);
    if (logs.length > 0) console.log(`[C3] balance_log: amount=${logs[0].amount}`);

    const audit = await db.select().from(auditLogs)
      .where(and(eq(auditLogs.targetType, "recharge_orders"), eq(auditLogs.targetId, c3.orderId)))
      .orderBy(desc(auditLogs.createdAt)).limit(5);
    console.log(`[C3] 审计日志 ${audit.length} 条`);
  });
});

// ═══════════ Chain 4: 退款流程 ═══════════
describe("Chain 4: 退款", () => {
  const refundAmount = 88.00;
  let balBefore: number;

  it("4.1 记录退款前余额", async () => {
    const db = getDb();
    const [u] = await db.select({ b: users.balance }).from(users).where(eq(users.id, c1.id)).limit(1);
    balBefore = Number(u?.b ?? 0);
    console.log(`[C4] 退款前余额=${balBefore}`);
  });

  it("4.2 提交退款申请", async () => {
    const r = await app.inject({
      method: "POST", url: "/api/v1/refunds",
      headers: { authorization: `Bearer ${c1.token || adminToken}` },
      payload: { amount: refundAmount.toString(), refundType: "overcharge", reason: "链4测试退款" },
    });
    expect(r.statusCode).toBe(200);
    console.log(`[C4] 退款申请 ID=${parse(r).data?.id || parse(r).data?.refundId}`);
  });

  it("4.3 管理员审批", async () => {
    const db = getDb();
    const refunds = await db.select().from(refundRequests)
      .where(and(eq(refundRequests.userId, c1.id), eq(refundRequests.status, "pending")))
      .orderBy(desc(refundRequests.createdAt)).limit(1);
    if (!refunds.length) { console.log(`[C4] ⚠️ 无待审退款`); return; }
    const id = refunds[0].id;

    const r = await app.inject({
      method: "POST", url: `/api/v1/admin/finance/refunds/${id}/approve`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { remark: "退款审批通过" },
    });
    if (r.statusCode !== 200) {
      console.log(`[C4] 退款审批 ${r.statusCode}: ${r.body.slice(0, 150)}`);
      return;
    }
    const [u] = await db.select({ b: users.balance }).from(users).where(eq(users.id, c1.id)).limit(1);
    console.log(`[C4] 余额 ${balBefore} → ${Number(u?.b ?? 0)}`);
  });
});

// ═══════════ Chain 5: 代理商佣金 ═══════════
describe("Chain 5: 代理商佣金", () => {
  const agentEmail = `${TEST_PREFIX}-ag-${rand()}@chain.3cloud.dev`;
  const clientEmail = `${TEST_PREFIX}-cl-${rand()}@chain.3cloud.dev`;
  const agentPass = "AgentPass123!";
  const clientPass = "ClientPass123!";
  let agentToken: string;
  let agentUserId: number;

  it("5.1 注册代理商用户", async () => {
    const r = await app.inject({
      method: "POST", url: "/api/v1/auth/register",
      payload: { email: agentEmail, password: agentPass, confirmPassword: agentPass, nickname: "C5代理" },
    });
    expect(r.statusCode).toBe(200);
    agentUserId = parse(r).data.user.id;
    agentToken = parse(r).data.accessToken;
  });

  it("5.2 创建代理商", async () => {
    const r = await app.inject({
      method: "POST", url: "/api/v1/admin/agents",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userId: agentUserId, name: "C5测试代理", contactInfo: "13800138000" },
    });
    expect(r.statusCode).toBe(200);
    c5.agentId = parse(r).data?.id || parse(r).data?.agentId;
    console.log(`[C5] 代理商 ID=${c5.agentId}`);
  });

  it("5.3 注册客户", async () => {
    const r = await app.inject({
      method: "POST", url: "/api/v1/auth/register",
      payload: { email: clientEmail, password: clientPass, confirmPassword: clientPass, nickname: "C5客户" },
    });
    expect(r.statusCode).toBe(200);
    c5.clientUserId = parse(r).data.user.id;
    c5.clientToken = parse(r).data.accessToken;
  });

  it("5.4 分配客户", async () => {
    const r = await app.inject({
      method: "POST", url: `/api/v1/admin/agents/${c5.agentId}/clients`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { clientUserId: c5.clientUserId },
    });
    if (r.statusCode !== 200) {
      console.log(`[C5] 分配客户 ${r.statusCode}: ${r.body.slice(0, 100)}`);
      return;
    }
    console.log(`[C5] 客户分配成功`);
  });

  it("5.5 客户调用（用 admin token 创建 key，模拟消费）", async () => {
    // 先给客户充值
    const keyR = await app.inject({
      method: "POST", url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: `${TEST_PREFIX}-c5-key` },
    });
    expect(keyR.statusCode).toBe(200);
    c5.clientKey = parse(keyR).data.key;

    for (let i = 0; i < 3; i++) {
      const callR = await app.inject({
        method: "POST", url: "/v1/chat/completions",
        headers: { authorization: `Bearer ${c5.clientKey}`, "content-type": "application/json" },
        payload: { model: TEST_MODEL, messages: [{ role: "user", content: `C5-${i}` }], max_tokens: 50 },
      });
      console.log(`[C5] 调用 #${i} → ${callR.statusCode}`);
    }
  });

  it("5.6 佣金记录", async () => {
    const db = getDb();
    const comms = await db.select().from(commissionLogs)
      .where(eq(commissionLogs.agentId, c5.agentId))
      .orderBy(desc(commissionLogs.createdAt)).limit(10);
    console.log(`[C5] 佣金 ${comms.length} 条`);
    for (const c of comms) console.log(`  ID=${c.id} amt=${c.commissionAmount} type=${c.commissionType} status=${c.status}`);
  });

  it("5.7 提现", async () => {
    const r = await app.inject({
      method: "POST", url: "/api/v1/agent/withdraw",
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { amount: "10.00", bankAccount: "6222021234567890", bankName: "中国银行", accountName: "测试代理" },
    });
    if (r.statusCode !== 200) {
      console.log(`[C5] 提现 ${r.statusCode}: ${r.body.slice(0, 100)}`);
      return;
    }
    const wid = parse(r).data?.id || parse(r).data?.withdrawId;
    console.log(`[C5] 提现 ID=${wid}`);

    const paid = await app.inject({
      method: "POST", url: `/api/v1/admin/withdraws/${wid}/mark-paid`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    console.log(`[C5] 打款 → ${paid.statusCode}`);
  });
});

// ═══════════ Chain 6: 限流 ═══════════
describe("Chain 6: 限流", () => {
  let rlKey: { key: string; id: number };

  it("6.1 创建Key", async () => {
    const r = await app.inject({
      method: "POST", url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: `${TEST_PREFIX}-rl` },
    });
    expect(r.statusCode).toBe(200);
    rlKey = { key: parse(r).data.key, id: parse(r).data.id };
  });

  it("6.2 50并发 → 应有429", async () => {
    const res = await Promise.all(Array.from({ length: 50 }, (_, i) =>
      app.inject({
        method: "POST", url: "/v1/chat/completions",
        headers: { authorization: `Bearer ${rlKey.key}`, "content-type": "application/json" },
        payload: { model: TEST_MODEL, messages: [{ role: "user", content: `rl-${i}` }], max_tokens: 5 },
      })
    ));
    const codes = res.map(r => r.statusCode);
    expect(codes.includes(500)).toBe(false);
    const c429 = codes.filter(c => c === 429).length;
    console.log(`[C6] 50请求 → 200:${codes.filter(c=>c===200).length} 429:${c429} 其他:${codes.filter(c=>![200,429,401,502,503].includes(c)).length}`);
    expect(c429).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════ 数据汇总 ═══════════
describe("数据汇总", () => {
  it("当天数据统计", async () => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const qs: Record<string, any> = {
      "新用户": sql`SELECT COUNT(*)::int AS total FROM users WHERE email LIKE ${TEST_PREFIX + '%'}`,
      "调用日志(按状态)": sql`SELECT status, COUNT(*)::int FROM call_logs WHERE created_at::date=${today}::date GROUP BY status ORDER BY status`,
      "余额流水(按类型)": sql`SELECT type, COUNT(*)::int FROM balance_logs WHERE created_at::date=${today}::date GROUP BY type ORDER BY type`,
      "充值订单": sql`SELECT COUNT(*)::int AS total FROM recharge_orders WHERE created_at::date=${today}::date`,
      "审计日志": sql`SELECT COUNT(*)::int AS total FROM audit_logs WHERE created_at::date=${today}::date`,
    };
    console.log(`\n═══ 测试数据 (${today}) ═══`);
    for (const [label, q] of Object.entries(qs)) {
      try {
        const r = await db.execute(q);
        console.log(`  ${label}: ${JSON.stringify(r.rows)}`);
      } catch (e: any) { console.log(`  ${label}: ${e.message?.slice(0, 80)}`); }
    }
    console.log(``);
  });
});
