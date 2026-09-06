/**
 * 用户端充值记录 / 兑换历史 集成测试（真实 PG + Redis）— /me/recharge/records + /me/redemption/history
 *
 * 覆盖：
 *   A. GET /me/recharge/records：
 *      - 仅返回当前用户的订单；字段映射 + 状态标签正确
 *      - total 正确；金额为元（不复乘 100）
 *      - ?days=7 时间过滤、?start_date/end_date 自定义范围过滤生效
 *   B. GET /me/redemption/history：
 *      - 返回已兑换码（batch_name + 元金额），按 usedAt 倒序
 *      - 空列表当无兑换记录；用户间隔离
 *
 * @module routes/me-recharge-endpoints.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { inArray } from 'drizzle-orm';
import { generateAccessToken } from '../services/auth/jwt.js';
import { rechargeRoutes } from './recharge.js';

process.env.JWT_SECRET = 'test-me-recharge-endpoints-secret';

const ts = Date.now();

let userAId = 0; // 主测用户（充值记录 + 兑换历史）
let userBId = 0; // 隔离用另一用户
let tokenA = '';
let tokenB = '';

// coupon_codes 批次模板（兑换历史 join 用）
let batchId1 = 0;
let batchId2 = 0;

let app: FastifyInstance;

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

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

/** 落一条充值订单（元金额 / 状态 / 可选 metadata / 可选 createdAt） */
async function insertRechargeOrder(
  userId: number,
  orderNo: string,
  amount: string,
  status: string,
  opts: { method?: string; metadata?: Record<string, unknown>; paidAt?: Date; note?: string; createdAt?: Date } = {},
) {
  await db.insert(schema.rechargeOrders).values({
    userId,
    orderNo,
    amount,
    currency: 'CNY',
    method: opts.method ?? 'bank_transfer',
    status: status as any,
    paidAt: opts.paidAt ?? null,
    note: opts.note ?? null,
    metadata: opts.metadata ?? {},
    createdAt: opts.createdAt ?? new Date(),
  });
}

beforeAll(async () => {
  const [a] = await db.insert(schema.users).values({
    email: `mer-a-${ts}@test.com`, passwordHash: 'x', name: 'MeRechargeA', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  userAId = a!.id;
  const [b] = await db.insert(schema.users).values({
    email: `mer-b-${ts}@test.com`, passwordHash: 'x', name: 'MeRechargeB', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  userBId = b!.id;

  tokenA = generateAccessToken({ userId: userAId, email: `mer-a-${ts}@test.com`, role: 'customer' });
  tokenB = generateAccessToken({ userId: userBId, email: `mer-b-${ts}@test.com`, role: 'customer' });

  // 批次模板（coupon_codes）
  const [b1] = await db.insert(schema.couponCodes).values({
    batchCode: `MER-B1-${ts}`, batchName: '首批体验券', faceValue: '50.00', totalCount: 100, status: 'active',
  }).returning({ id: schema.couponCodes.id });
  batchId1 = b1!.id;
  const [b2] = await db.insert(schema.couponCodes).values({
    batchCode: `MER-B2-${ts}`, batchName: '周年庆券', faceValue: '200.00', totalCount: 100, status: 'active',
  }).returning({ id: schema.couponCodes.id });
  batchId2 = b2!.id;

  // 充值订单（user A）：completed(paid) / pending / rejected(failed) / cancelled / refunded
  await insertRechargeOrder(userAId, `MER-A-1-${ts}`, '100.00', 'paid', {
    method: 'alipay',
    paidAt: new Date(Date.now() - 1 * 24 * 3600 * 1000),
    metadata: { transfer_no: 'TXN-ALI-001' },
  });
  await insertRechargeOrder(userAId, `MER-A-2-${ts}`, '250.50', 'pending', {
    method: 'wechat',
    createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
  });
  await insertRechargeOrder(userAId, `MER-A-3-${ts}`, '3000.00', 'failed', {
    method: 'bank_transfer',
    metadata: { review_note: '凭证不清晰' },
    createdAt: new Date(Date.now() - 6 * 24 * 3600 * 1000),
  });
  await insertRechargeOrder(userAId, `MER-A-4-${ts}`, '12.34', 'cancelled', {
    method: 'usdt',
    createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000),
  });
  await insertRechargeOrder(userAId, `MER-A-5-${ts}`, '88.88', 'refunded', {
    method: 'bank',
    createdAt: new Date(Date.now() - 45 * 24 * 3600 * 1000),
  });
  // 很旧的一单（超出 90 天）
  await insertRechargeOrder(userAId, `MER-A-OLD-${ts}`, '999.00', 'paid', {
    createdAt: new Date(Date.now() - 200 * 24 * 3600 * 1000),
    paidAt: new Date(Date.now() - 200 * 24 * 3600 * 1000),
  });

  // 用户 B 的充值订单（隔离）
  await insertRechargeOrder(userBId, `MER-B-1-${ts}`, '777.00', 'paid', {
    method: 'wechat', paidAt: new Date(),
  });

  // 兑换历史（user A）：两个已兑码 + 批次未使用码
  await db.insert(schema.campaignCouponCodes).values([
    { campaignId: batchId1, code: `MER-A-CODE-1-${ts}`, status: 'used', usedBy: userAId, usedAt: new Date(Date.now() - 1 * 24 * 3600 * 1000) },
    { campaignId: batchId2, code: `MER-A-CODE-2-${ts}`, status: 'used', usedBy: userAId, usedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000) },
    { campaignId: batchId1, code: `MER-A-CODE-UNUSED-${ts}`, status: 'unused', usedBy: null, usedAt: null },
    // 用户 B 已兑一个码（隔离验证：不出现在 A 的历史里）
    { campaignId: batchId1, code: `MER-B-CODE-1-${ts}`, status: 'used', usedBy: userBId, usedAt: new Date() },
  ]);

  app = buildTestApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  try {
    const ids = [userAId, userBId].filter((x) => x > 0);
    await db.delete(schema.rechargeOrders).where(inArray(schema.rechargeOrders.userId, ids));
    await db.delete(schema.campaignCouponCodes).where(inArray(schema.campaignCouponCodes.usedBy, [userAId, userBId]));
    const batchIds = [batchId1, batchId2].filter((x) => x > 0);
    await db.delete(schema.couponCodes).where(inArray(schema.couponCodes.id, batchIds));
    await db.delete(schema.balanceTransactions).where(inArray(schema.balanceTransactions.userId, ids));
    await db.delete(schema.customerBalances).where(inArray(schema.customerBalances.userId, ids));
    await db.delete(schema.notifications).where(inArray(schema.notifications.userId, ids));
    await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.userId, ids));
    await db.delete(schema.users).where(inArray(schema.users.id, ids));
  } catch (err) {
    console.error('[me-recharge-endpoints.test] cleanup failed:', err);
  }
});

describe('A. GET /api/v1/me/recharge/records', () => {
  it('返回当前用户订单，字段映射 + 状态/方式标签正确，金额为元（不复乘 100），total 正确', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/recharge/records?page_size=100', headers: auth(tokenA) });
    expect(res.statusCode).toBe(200);
    const { list, total } = res.json().data;
    expect(total).toBe(6); // 5 + 1 极旧单（无时间过滤应全列出）

    const paid = list.find((o: any) => o.order_id === `MER-A-1-${ts}`);
    expect(paid).toBeDefined();
    expect(paid.amount).toBeCloseTo(100, 2); // 元
    expect(paid.payment_method).toBe('alipay');
    expect(paid.method_label).toBe('支付宝');
    expect(paid.status).toBe('completed');
    expect(paid.status_label).toBe('充值成功');
    expect(paid.trade_no).toBe('TXN-ALI-001');
    expect(paid.reject_reason).toBeNull();
    expect(paid.complete_time).toBeTruthy();
    expect(paid.payer).toBeNull();
    expect(paid.voucher).toBeNull();

    const pending = list.find((o: any) => o.order_id === `MER-A-2-${ts}`);
    expect(pending.status).toBe('pending');
    expect(pending.status_label).toBe('待审核');
    expect(pending.method_label).toBe('微信支付');
    expect(pending.complete_time).toBeNull();

    const rejected = list.find((o: any) => o.order_id === `MER-A-3-${ts}`);
    expect(rejected.status).toBe('rejected');
    expect(rejected.status_label).toBe('已驳回');
    expect(rejected.amount).toBeCloseTo(3000, 2);
    expect(rejected.reject_reason).toBe('凭证不清晰');

    const cancelled = list.find((o: any) => o.order_id === `MER-A-4-${ts}`);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.method_label).toBe('USDT');

    const refunded = list.find((o: any) => o.order_id === `MER-A-5-${ts}`);
    expect(refunded.status).toBe('refunded');
    expect(refunded.status_label).toBe('已退款');
  });

  it('未授权（无 token）→ 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/recharge/records' });
    expect(res.statusCode).toBe(401);
  });

  it('用户间隔离：B 看不到 A 的订单，total 为 B 自己的', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/recharge/records', headers: auth(tokenB) });
    expect(res.statusCode).toBe(200);
    const { list, total } = res.json().data;
    expect(total).toBe(1);
    expect(list[0].order_id).toBe(`MER-B-1-${ts}`);
  });

  it('?days=7 过滤有效期内的订单', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/recharge/records?days=7', headers: auth(tokenA) });
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.list.map((o: any) => o.order_id).sort();
    // 近 7 天内：A-1(1d) A-2(2d) A-3(6d)；排除 A-4(14d) A-5(45d) old(200d)
    expect(ids).toEqual([`MER-A-1-${ts}`, `MER-A-2-${ts}`, `MER-A-3-${ts}`].sort());
    expect(res.json().data.total).toBe(3);
  });

  it('?start_date/end_date 自定义范围过滤生效', async () => {
    const start = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const end = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/me/recharge/records?start_date=${start}&end_date=${end}`,
      headers: auth(tokenA),
    });
    expect(res.statusCode).toBe(200);
    // 区间内：A-3(6d) A-4(14d? no, 14 > 10) —— 10 天前 ~ 3 天前：仅 A-3(6d)
    const ids = res.json().data.list.map((o: any) => o.order_id);
    expect(ids).toEqual([`MER-A-3-${ts}`]);
    expect(res.json().data.total).toBe(1);
  });

  it('金额为元：单条查询不缩放（250.50 元显示为 250.5 而非 2.505）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/recharge/records?days=7', headers: auth(tokenA) });
    const pending = res.json().data.list.find((o: any) => o.order_id === `MER-A-2-${ts}`);
    expect(toNum(pending.amount)).toBeCloseTo(250.5, 2);
    expect(toNum(pending.amount)).toBeGreaterThan(3); // 绝非 2.505
  });
});

describe('B. GET /api/v1/me/redemption/history', () => {
  it('返回已兑换码，含 batch_name + 元金额，按 usedAt 倒序', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/redemption/history?page_size=50', headers: auth(tokenA) });
    expect(res.statusCode).toBe(200);
    const { list } = res.json().data;
    expect(list).toHaveLength(2);

    // usedAt 新的在前
    expect(list[0].code).toBe(`MER-A-CODE-1-${ts}`);
    expect(list[0].batch_name).toBe('首批体验券');
    expect(toNum(list[0].amount)).toBeCloseTo(50, 2); // 元
    expect(list[1].code).toBe(`MER-A-CODE-2-${ts}`);
    expect(list[1].batch_name).toBe('周年庆券');
    expect(toNum(list[1].amount)).toBeCloseTo(200, 2);

    // ISO 时间串 + id
    expect(list[0].id).toBeGreaterThan(0);
    expect(new Date(list[0].created_at).getTime()).toBeGreaterThan(0);
  });

  it('page_size 上限 100（>100 被 clamp）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/redemption/history?page_size=9999', headers: auth(tokenA) });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.list.length).toBeLessThanOrEqual(100);
  });

  it('无兑换记录的用户 → 空 list', async () => {
    // userB 也兑换了一个码，但为了空列表测试用一个全新用户
    const [c] = await db.insert(schema.users).values({
      email: `mer-c-${ts}@test.com`, passwordHash: 'x', name: 'MeRechargeC', role: 'customer', status: 'active',
    }).returning({ id: schema.users.id });
    const tokenC = generateAccessToken({ userId: c!.id, email: `mer-c-${ts}@test.com`, role: 'customer' });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/me/redemption/history', headers: auth(tokenC) });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.list).toEqual([]);
    } finally {
      await db.delete(schema.users).where(inArray(schema.users.id, [c!.id]));
    }
  });

  it('用户间隔离：B 的历史不包含 A 的兑换码', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/redemption/history?page_size=50', headers: auth(tokenB) });
    expect(res.statusCode).toBe(200);
    const codes = res.json().data.list.map((o: any) => o.code);
    expect(codes).toEqual([`MER-B-CODE-1-${ts}`]);
  });
});