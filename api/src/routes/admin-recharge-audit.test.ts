/**
 * 充值订单审核路由集成测试 — audit 走 creditBalance 收口 + 通知 + finance 放行（真实 PG）
 *
 * 覆盖 ARCH §8 用例 12：
 *   充值审核-走收口（R2/R4）：无余额行用户 audit → 自动建行 + 余额正确；
 *   audit 后 notifications 有 recharge_success 记录；audit/reject 挂 finance.topup
 *   放行 finance 角色（裁决 A4）。
 *
 * @see docs/ARCH-整改R1-R4-技术方案.md §5.2 / §8 用例 12
 * @module routes/admin-recharge-audit.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { and, eq, inArray, desc } from 'drizzle-orm';
import { generateAccessToken } from '../services/auth/jwt';
import { rechargeRoutes } from './recharge';
import { enableTest2fa, op2faHeaders, clearCreditCounters } from './test-helpers';

// 独立 JWT 密钥（路由内 verifyToken 与测试签发共用同一 process.env 值）
process.env.JWT_SECRET = 'test-admin-recharge-audit-secret';

const ts = Date.now();

/** 数字型字段 → Number（numeric 列返回 string） */
function toNum(v: unknown): number {
  return Number(v ?? 0);
}

let adminId = 0;
let financeUserId = 0;
let customerId = 0;    // 被充值用户（无余额行，兜底用例）

let adminToken = '';
let financeToken = '';
let adminOp: () => Record<string, string> = () => ({});
let financeOp: () => Record<string, string> = () => ({});

let app: FastifyInstance;

/** 组装仅含本模块路由的最小 Fastify 实例 + 错误处理 */
function buildTestApp(): FastifyInstance {
  const instance = Fastify({ logger: false });
  instance.setErrorHandler((err: any, _request, reply) => {
    const status = Number(err?.statusCode) || 500;
    reply.code(status).send({ code: status, message: err?.message ?? 'Internal Server Error' });
  });
  rechargeRoutes(instance);
  return instance;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** 直接落一条待审核充值订单（method=bank_transfer，用户端路径不可建 manual） */
async function insertRechargeOrder(userId: number, amount: string, orderNo: string) {
  const [order] = await db.insert(schema.rechargeOrders).values({
    userId,
    orderNo,
    amount,
    currency: 'CNY',
    method: 'bank_transfer',
    status: 'pending',
    metadata: { source: 'web' },
  }).returning({ id: schema.rechargeOrders.id });
  if (!order) throw new Error('insert recharge order failed');
  return order;
}

beforeAll(async () => {
  const [admin] = await db.insert(schema.users).values({
    email: `rc-admin-${ts}@test.com`, passwordHash: 'x', name: 'RcAdmin', role: 'admin', status: 'active',
  }).returning({ id: schema.users.id });
  adminId = admin!.id;

  const [fin] = await db.insert(schema.users).values({
    email: `rc-fin-${ts}@test.com`, passwordHash: 'x', name: 'RcFinance', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  financeUserId = fin!.id;

  const [cust] = await db.insert(schema.users).values({
    email: `rc-cust-${ts}@test.com`, passwordHash: 'x', name: 'RcCustomer', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  customerId = cust!.id;

  adminToken = generateAccessToken({ userId: adminId, email: `rc-admin-${ts}@test.com`, role: 'admin' });
  financeToken = generateAccessToken({ userId: financeUserId, email: `rc-fin-${ts}@test.com`, role: 'finance' });

  // R7：资金写操作者启用 2FA + 操作令牌
  await enableTest2fa(adminId);
  await enableTest2fa(financeUserId);
  adminOp = () => op2faHeaders(adminToken, adminId, `rc-admin-${ts}@test.com`, 'admin');
  financeOp = () => op2faHeaders(financeToken, financeUserId, `rc-fin-${ts}@test.com`, 'finance');

  app = buildTestApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  try {
    const ids = [adminId, financeUserId, customerId].filter((x) => x > 0);
    await db.delete(schema.rechargeOrders).where(inArray(schema.rechargeOrders.userId, ids));
    await db.delete(schema.balanceTransactions).where(inArray(schema.balanceTransactions.userId, ids));
    await db.delete(schema.customerBalances).where(inArray(schema.customerBalances.userId, ids));
    await db.delete(schema.notifications).where(inArray(schema.notifications.userId, ids));
    await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.userId, ids));
    await clearCreditCounters(ids);
    await db.delete(schema.user2fa).where(inArray(schema.user2fa.userId, [adminId, financeUserId]));
    await db.delete(schema.users).where(inArray(schema.users.id, ids));
  } catch (err) {
    console.error('[admin-recharge-audit.test] cleanup failed:', err);
  }
});

describe('R2 充值审核收口（audit）', () => {
  it('用例12 无余额行用户 audit → 自动建行 + 余额正确 + 流水 + notifications 有 recharge_success', async () => {
    const order = await insertRechargeOrder(customerId, '66.00', `RC-${ts}-audit1`);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/recharge-orders/${order.id}/audit`, headers: adminOp(), payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('paid');

    const [bal] = await db.select({ availableBalance: schema.customerBalances.availableBalance })
      .from(schema.customerBalances).where(eq(schema.customerBalances.userId, customerId)).limit(1);
    expect(bal).toBeDefined();
    expect(toNum(bal!.availableBalance)).toBeCloseTo(66, 4);

    const [txRow] = await db.select({ type: schema.balanceTransactions.type, referenceId: schema.balanceTransactions.referenceId })
      .from(schema.balanceTransactions)
      .where(and(eq(schema.balanceTransactions.userId, customerId), eq(schema.balanceTransactions.referenceId, String(order.id))));
    expect(txRow).toBeDefined();
    expect(txRow!.type).toBe('recharge');

    // R4：通知落库
    const [ntf] = await db.select({ type: schema.notifications.type, title: schema.notifications.title })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, customerId), eq(schema.notifications.type, 'recharge_success')))
      .orderBy(desc(schema.notifications.id)).limit(1);
    expect(ntf).toBeDefined();
    expect(ntf!.type).toBe('recharge_success');
    expect(ntf!.title).toBe('充值到账通知');
  });

  it('用例12 finance 角色可 audit（裁决 A4：audit 挂 finance.topup）→ 200', async () => {
    const order = await insertRechargeOrder(customerId, '33.00', `RC-${ts}-audit2`);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/recharge-orders/${order.id}/audit`, headers: financeOp(), payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(toNum(res.json().data.balanceAfter)).toBeCloseTo(99, 4);
  });

  it('用例12 finance 角色可 reject → 200，且写审计（D-04 补齐）', async () => {
    const order = await insertRechargeOrder(customerId, '11.00', `RC-${ts}-reject1`);
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/recharge-orders/${order.id}/reject`, headers: financeOp(), payload: { note: 'reject by finance (audit)' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('failed');

    // D-04：充值订单驳回写审计（对齐 manual-topup reject）
    const [audit] = await db.select({ action: schema.auditLogs.action, details: schema.auditLogs.details })
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.action, 'recharge_order.reject'), eq(schema.auditLogs.resourceId, String(order.id))))
      .limit(1);
    expect(audit).toBeDefined();
    expect(audit!.action).toBe('recharge_order.reject');
    const ad = audit!.details as Record<string, unknown>;
    // details 键对齐现有 audit 契约（camelCase userId）
    expect(ad.userId).toBe(customerId);
    expect(ad.order_no).toBe(`RC-${ts}-reject1`);
  });

  it('P1-3 finance 角色 GET /admin/recharge-orders 列表 → 200（D2 导航闭环：能看才能审）', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/admin/recharge-orders?page_size=50', headers: auth(financeToken),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(Array.isArray(data.list)).toBe(true);
    expect(typeof data.pagination.total).toBe('number');
    // 列表含本测试创建的订单（只返回订单+用户基本信息，无敏感字段）
    const item = data.list.find((o: any) => o.order_no === `RC-${ts}-reject1`);
    expect(item).toBeDefined();
    expect(item.user_id).toBe(customerId);
  });
});
