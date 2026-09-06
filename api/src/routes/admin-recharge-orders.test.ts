/**
 * 充值订单审核路由集成测试 — R5 分级审批（audit 多阶段）+ R7 2FA（真实 PG + Redis）
 *
 * 覆盖 ARCH §6.1 用例 6 / §6.3 用例 21 / 双签 B10/Q8：
 *   - 用户自助单（source='web'，无 created_by）：>1万 → 一审 → 二审 → paid；
 *     created_by 缺失不自审拦截（天然满足，跳过"创建≠审批"校验）
 *   - manual 单（metadata.created_by 存在）：审核人=创建人 → 400
 *   - reject 任意阶段 → failed；列表 status 保持 pending 直至终审
 *   - 充值订单审核完全不计入限额（B10/Q8：操作人/被入账用户维度均不计，无预检/复核/计数）
 *   - R7：audit/reject 强制操作级 2FA
 *
 * @see docs/ARCH-整改R5-R7-资金风控.md §2.5.3 / §6.1 用例 6 / §6.3 用例 21
 * @module routes/admin-recharge-orders.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { generateAccessToken } from '../services/auth/jwt.js';
import { rechargeRoutes } from './recharge.js';
import { enableTest2fa, op2faHeaders, clearCreditCounters } from './test-helpers.js';
import { calcApprovalTier } from '../lib/finance-rules.js';
import { buildApprovalMeta } from '../services/billing/recharge-approval.js';

process.env.JWT_SECRET = 'test-admin-recharge-orders-secret';

const ts = Date.now();

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

let adminId = 0;
let admin2Id = 0;
let financeUserId = 0;
let customerId = 0;      // 被充值用户（用户自助单）
let manualCreatorId = 0; // 人工上账单的创建人（metadata.created_by）

let adminToken = '';
let admin2Token = '';
let adminOp: () => Record<string, string> = () => ({});
let admin2Op: () => Record<string, string> = () => ({});

let app: FastifyInstance;

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

/** 直接落一条待审核充值订单（模拟 /me/recharge：创建时按金额定级固化 metadata.approval，B18） */
async function insertOrder(userId: number, amount: string, orderNo: string, extraMeta: Record<string, unknown> = {}) {
  const level = calcApprovalTier(Number(amount), 'increase');
  const [order] = await db.insert(schema.rechargeOrders).values({
    userId,
    orderNo,
    amount,
    currency: 'CNY',
    method: 'bank_transfer',
    status: 'pending',
    metadata: {
      source: 'web',
      approval: buildApprovalMeta(level, null),
      approval_level: level,
      approval_phase: 'level1_pending',
      limit_escalated: false,
      ...extraMeta,
    },
  }).returning({ id: schema.rechargeOrders.id, orderNo: schema.rechargeOrders.orderNo });
  if (!order) throw new Error('insert recharge order failed');
  return order;
}

beforeAll(async () => {
  const [admin] = await db.insert(schema.users).values({
    email: `rco-admin-${ts}@test.com`, passwordHash: 'x', name: 'RcoAdmin', role: 'admin', status: 'active',
  }).returning({ id: schema.users.id });
  adminId = admin!.id;

  const [admin2] = await db.insert(schema.users).values({
    email: `rco-admin2-${ts}@test.com`, passwordHash: 'x', name: 'RcoAdmin2', role: 'admin', status: 'active',
  }).returning({ id: schema.users.id });
  admin2Id = admin2!.id;

  const [fin] = await db.insert(schema.users).values({
    email: `rco-fin-${ts}@test.com`, passwordHash: 'x', name: 'RcoFinance', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  financeUserId = fin!.id;

  const [cust] = await db.insert(schema.users).values({
    email: `rco-cust-${ts}@test.com`, passwordHash: 'x', name: 'RcoCustomer', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  customerId = cust!.id;

  const [mc] = await db.insert(schema.users).values({
    email: `rco-mc-${ts}@test.com`, passwordHash: 'x', name: 'RcoManualCreator', role: 'admin', status: 'active',
  }).returning({ id: schema.users.id });
  manualCreatorId = mc!.id;

  adminToken = generateAccessToken({ userId: adminId, email: `rco-admin-${ts}@test.com`, role: 'admin' });
  admin2Token = generateAccessToken({ userId: admin2Id, email: `rco-admin2-${ts}@test.com`, role: 'admin' });

  await enableTest2fa(adminId);
  await enableTest2fa(admin2Id);
  await enableTest2fa(financeUserId);
  await enableTest2fa(manualCreatorId);
  adminOp = () => op2faHeaders(adminToken, adminId, `rco-admin-${ts}@test.com`, 'admin');
  admin2Op = () => op2faHeaders(admin2Token, admin2Id, `rco-admin2-${ts}@test.com`, 'admin');

  app = buildTestApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  try {
    const ids = [adminId, admin2Id, financeUserId, customerId, manualCreatorId].filter((x) => x > 0);
    await db.delete(schema.rechargeOrders).where(inArray(schema.rechargeOrders.userId, ids));
    await db.delete(schema.balanceTransactions).where(inArray(schema.balanceTransactions.userId, ids));
    await db.delete(schema.customerBalances).where(inArray(schema.customerBalances.userId, ids));
    await db.delete(schema.notifications).where(inArray(schema.notifications.userId, ids));
    await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.userId, ids));
    await clearCreditCounters(ids);
    await db.delete(schema.user2fa).where(inArray(schema.user2fa.userId, [adminId, admin2Id, financeUserId, manualCreatorId]));
    await db.delete(schema.users).where(inArray(schema.users.id, ids));
  } catch (err) {
    console.error('[admin-recharge-orders.test] cleanup failed:', err);
  }
});

describe('R5 充值订单 audit 分级（用例6）', () => {
  it('用户自助单 >1万：一审 → 仍 pending + phase=level2_pending；二审 → paid + 入账；created_by 缺失不自审拦截', async () => {
    const order = await insertOrder(customerId, '20000.00', `RCO-${ts}-t2`);
    // 一审（admin）
    const r1 = await app.inject({ method: 'POST', url: `/api/v1/admin/recharge-orders/${order.id}/audit`, headers: adminOp(), payload: {} });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().data.status).toBe('pending');
    expect(r1.json().data.approval_level).toBe(2);
    expect(r1.json().data.approval_phase).toBe('level2_pending');
    // 未入账
    const [bal0] = await db.select({ availableBalance: schema.customerBalances.availableBalance })
      .from(schema.customerBalances).where(eq(schema.customerBalances.userId, customerId)).limit(1);
    expect(bal0).toBeUndefined();

    // 列表 status 保持 pending 直至终审（前端待审队列可见）
    const list = await app.inject({ method: 'GET', url: '/api/v1/admin/recharge-orders?status=pending', headers: auth(adminToken) });
    const item = list.json().data.list.find((o: any) => o.order_no === `RCO-${ts}-t2`);
    expect(item).toBeDefined();
    expect(item.status).toBe('pending');
    expect(item.approval_phase).toBe('level2_pending');

    // 二审（≠ 一审 admin）→ paid
    const r2 = await app.inject({ method: 'POST', url: `/api/v1/admin/recharge-orders/${order.id}/audit`, headers: admin2Op(), payload: {} });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().data.status).toBe('paid');
    expect(toNum(r2.json().data.balanceAfter)).toBeCloseTo(20000, 2);
    const [bal] = await db.select({ availableBalance: schema.customerBalances.availableBalance })
      .from(schema.customerBalances).where(eq(schema.customerBalances.userId, customerId)).limit(1);
    expect(toNum(bal!.availableBalance)).toBeCloseTo(20000, 4);
  });

  it('同一人一审后二审 → 400（一审 ≠ 二审，职责分离）', async () => {
    const order = await insertOrder(customerId, '12000.00', `RCO-${ts}-same`);
    const r1 = await app.inject({ method: 'POST', url: `/api/v1/admin/recharge-orders/${order.id}/audit`, headers: adminOp(), payload: {} });
    expect(r1.statusCode).toBe(200);
    const r2 = await app.inject({ method: 'POST', url: `/api/v1/admin/recharge-orders/${order.id}/audit`, headers: adminOp(), payload: {} });
    expect(r2.statusCode).toBe(400);
    expect(r2.json().message).toContain('一级审批人');
  });

  it('manual 单（created_by 存在）审核人=创建人 → 400（B3 职责分离扩展）', async () => {
    const order = await insertOrder(customerId, '5000.00', `RCO-${ts}-manual`, {
      source: 'admin-manual-topup',
      created_by: manualCreatorId,
    });
    // 创建人自审 → 400
    const mcToken = generateAccessToken({ userId: manualCreatorId, email: `rco-mc-${ts}@test.com`, role: 'admin' });
    const mcOp = () => op2faHeaders(mcToken, manualCreatorId, `rco-mc-${ts}@test.com`, 'admin');
    const self = await app.inject({ method: 'POST', url: `/api/v1/admin/recharge-orders/${order.id}/audit`, headers: mcOp(), payload: {} });
    expect(self.statusCode).toBe(400);
    expect(self.json().message).toContain('创建人');

    // 他人审核 → 200（manual 单 tier1 单审）
    const other = await app.inject({ method: 'POST', url: `/api/v1/admin/recharge-orders/${order.id}/audit`, headers: adminOp(), payload: {} });
    expect(other.statusCode).toBe(200);
    expect(other.json().data.status).toBe('paid');
  });

  it('reject 任意阶段 → failed（二审前驳回）', async () => {
    const order = await insertOrder(customerId, '13000.00', `RCO-${ts}-rej`);
    const r1 = await app.inject({ method: 'POST', url: `/api/v1/admin/recharge-orders/${order.id}/audit`, headers: adminOp(), payload: {} });
    expect(r1.statusCode).toBe(200);
    const reject = await app.inject({ method: 'POST', url: `/api/v1/admin/recharge-orders/${order.id}/reject`, headers: admin2Op(), payload: { note: 'reject (R5)' } });
    expect(reject.statusCode).toBe(200);
    expect(reject.json().data.status).toBe('failed');
    const [row] = await db.select({ status: schema.rechargeOrders.status }).from(schema.rechargeOrders)
      .where(eq(schema.rechargeOrders.id, order.id)).limit(1);
    expect(row!.status).toBe('failed');
  });

  it('双签 B10/Q8 充值订单审核完全不计入限额（操作人/被入账用户维度均不计）', async () => {
    // tier1 金额（≤1万）：单次 audit 即生效（paid）
    const order = await insertOrder(customerId, '9000.00', `RCO-${ts}-nocount`);
    const before = await db.select({ count: sql<number>`count(*)::int` }).from(schema.creditLimitEvents)
      .where(and(eq(schema.creditLimitEvents.scope, 'user'), eq(schema.creditLimitEvents.userId, customerId)));
    const res = await app.inject({ method: 'POST', url: `/api/v1/admin/recharge-orders/${order.id}/audit`, headers: adminOp(), payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('paid');
    const after = await db.select({ count: sql<number>`count(*)::int` }).from(schema.creditLimitEvents)
      .where(and(eq(schema.creditLimitEvents.scope, 'user'), eq(schema.creditLimitEvents.userId, customerId)));
    expect(toNum(after[0]?.count)).toBe(toNum(before[0]?.count));   // 无新增事件行
  });
});

describe('用户自助充值创建幂等（T-02）', () => {
  it('同一 Idempotency-Key 重放首次结果且只创建一单；参数变化返回 409', async () => {
    const customerToken = generateAccessToken({ userId: customerId, email: `rco-cust-${ts}@test.com`, role: 'customer' });
    const key = `rco-idem-${ts}`;
    const headers = { ...auth(customerToken), 'idempotency-key': key };
    const first = await app.inject({ method: 'POST', url: '/api/v1/me/recharge', headers, payload: { amount: 321.45, payment_method: 'bank_transfer' } });
    expect(first.statusCode).toBe(201);
    const replay = await app.inject({ method: 'POST', url: '/api/v1/me/recharge', headers, payload: { amount: 321.45, payment_method: 'bank_transfer' } });
    expect([200, 201]).toContain(replay.statusCode);
    expect(replay.headers['x-idempotent-replay']).toBe('true');
    expect(replay.json().data.order_id).toBe(first.json().data.order_id);
    const rows = await db.select({ id: schema.rechargeOrders.id }).from(schema.rechargeOrders)
      .where(and(eq(schema.rechargeOrders.userId, customerId), eq(schema.rechargeOrders.idempotencyKey, key)));
    expect(rows).toHaveLength(1);

    const changed = await app.inject({ method: 'POST', url: '/api/v1/me/recharge', headers, payload: { amount: 321.46, payment_method: 'bank_transfer' } });
    expect(changed.statusCode).toBe(409);
    expect(changed.json().message).toContain('不同充值请求');
  });
});

describe('R7 充值订单端点 2FA（用例21）', () => {
  it('audit/reject 无 X-Operation-Token → 403（避开 401）', async () => {
    const order = await insertOrder(customerId, '1000.00', `RCO-${ts}-nop2fa`);
    const audit = await app.inject({ method: 'POST', url: `/api/v1/admin/recharge-orders/${order.id}/audit`, headers: auth(adminToken), payload: {} });
    expect(audit.statusCode).toBe(403);
    const reject = await app.inject({ method: 'POST', url: `/api/v1/admin/recharge-orders/${order.id}/reject`, headers: auth(adminToken), payload: {} });
    expect(reject.statusCode).toBe(403);
  });
});
