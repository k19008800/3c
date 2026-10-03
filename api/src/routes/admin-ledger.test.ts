/**
 * 平台总账只读路由契约测试 — GET /admin/finance/ledger(+summary)（PRD §29.1，真实 PG）
 *
 * 零覆盖补测（G5）：只读查询接口此前无路由级测试。本文件只经公开 HTTP 入口取证：
 *   - 鉴权：无 token → 401；customer 角色 → 403（admin/super_admin 放行）
 *   - 筛选生效：account / user_id / direction=debit / start_date~end_date（按路由解析方式断言）
 *   - 非法日期串被 parseDate 忽略（不报错、等同无日期筛选）
 *   - summary 按科目返回 debitCents/creditCents/netCents + 会计恒等式字段
 *
 * 隔离策略：用魔法科目名 `__probe_ledger__`（表内唯一）的若干行作为探针，
 * list/summary 均按该科目定位，不受并行测试向 platform_ledger 写入的数据影响。
 *
 * @module routes/admin-ledger.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { generateAccessToken } from '../services/auth/jwt.js';
import { adminLedgerRoutes } from './admin-ledger.js';

process.env.JWT_SECRET = 'test-admin-ledger-secret';

const ts = Date.now();
/** 魔法科目名：本文件探针专用，全表唯一，保证断言确定性 */
const PROBE_ACCOUNT = '__probe_ledger__';

let probeUserId = 0;
let adminToken = '';
let customerToken = '';
let app: FastifyInstance;

function buildTestApp(): FastifyInstance {
  const instance = Fastify({ logger: false });
  instance.setErrorHandler((err: any, _request, reply) => {
    const status = Number(err?.statusCode) || 500;
    reply.code(status).send({ code: status, message: err?.message ?? 'Internal Server Error' });
  });
  adminLedgerRoutes(instance);
  return instance;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  const [admin] = await db.insert(schema.users).values({
    email: `ledger-admin-${ts}@test.com`, passwordHash: 'x', name: 'LedgerAdmin', role: 'admin', status: 'active',
  }).returning({ id: schema.users.id });
  adminToken = generateAccessToken({ userId: admin!.id, email: `ledger-admin-${ts}@test.com`, role: 'admin' });

  const [cust] = await db.insert(schema.users).values({
    email: `ledger-cust-${ts}@test.com`, passwordHash: 'x', name: 'LedgerCust', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  probeUserId = cust!.id;
  customerToken = generateAccessToken({ userId: cust!.id, email: `ledger-cust-${ts}@test.com`, role: 'customer' });

  // 探针分录（4 行，借=贷 平衡）：
  //   P1 debit 1000 / P2 credit 1000 —— entryDate=2026-01-10（1 月窗口）
  //   P3 debit  500 / P4 credit  500 —— entryDate=今天（非 1 月窗口）
  await db.insert(schema.platformLedger).values([
    { account: PROBE_ACCOUNT, direction: 'debit', amountCents: 1000, refType: '__probe_ledger__', userId: probeUserId, entryDate: new Date('2026-01-10T00:00:00.000Z'), description: 'probe-debit-jan' },
    { account: PROBE_ACCOUNT, direction: 'credit', amountCents: 1000, refType: '__probe_ledger__', userId: probeUserId, entryDate: new Date('2026-01-10T00:00:00.000Z'), description: 'probe-credit-jan' },
    { account: PROBE_ACCOUNT, direction: 'debit', amountCents: 500, refType: '__probe_ledger__', userId: probeUserId, entryDate: new Date(), description: 'probe-debit-today' },
    { account: PROBE_ACCOUNT, direction: 'credit', amountCents: 500, refType: '__probe_ledger__', userId: probeUserId, entryDate: new Date(), description: 'probe-credit-today' },
  ]);

  app = buildTestApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  try {
    await db.delete(schema.platformLedger).where(eq(schema.platformLedger.account, PROBE_ACCOUNT));
    await db.delete(schema.users).where(eq(schema.users.id, probeUserId));
  } catch (err) {
    console.error('[admin-ledger.test] cleanup failed:', err);
  }
});

describe('鉴权（PRD §29.1 admin 只读）', () => {
  it('无 token → 401；customer 角色 → 403', async () => {
    const noToken = await app.inject({ method: 'GET', url: '/api/v1/admin/finance/ledger' });
    expect(noToken.statusCode).toBe(401);

    const forbidden = await app.inject({
      method: 'GET', url: '/api/v1/admin/finance/ledger', headers: auth(customerToken),
    });
    expect(forbidden.statusCode).toBe(403);
  });
});

describe('GET /admin/finance/ledger 分页筛选', () => {
  it('account + user_id 筛选生效：仅返回探针科目且 total=4', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/finance/ledger?account=${PROBE_ACCOUNT}&user_id=${probeUserId}&page=1&page_size=50`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.total).toBe(4);
    expect(data.items.length).toBe(4);
    for (const it of data.items) {
      expect(it.account).toBe(PROBE_ACCOUNT);
      expect(Number(it.userId)).toBe(probeUserId);
    }
  });

  it('direction=debit 筛选生效：仅返回借方分录，total=2', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/finance/ledger?account=${PROBE_ACCOUNT}&direction=debit`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.total).toBe(2);
    expect(data.items.length).toBe(2);
    for (const it of data.items) expect(it.direction).toBe('debit');
  });

  it('start_date/end_date 区间筛选生效：2026-01 窗口只命中 1 月的 2 行', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/finance/ledger?account=${PROBE_ACCOUNT}&start_date=2026-01-01&end_date=2026-01-31`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.total).toBe(2);
    for (const it of data.items) {
      const d = new Date(it.entryDate);
      expect(d.getUTCFullYear()).toBe(2026);
      expect(d.getUTCMonth()).toBe(0); // 0=January
    }
  });

  it('非法日期串被忽略（不报错、等同无日期筛选）：total=4', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/finance/ledger?account=${PROBE_ACCOUNT}&start_date=not-a-date`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.total).toBe(4);
  });
});

describe('GET /admin/finance/ledger/summary 科目汇总 + 会计恒等式', () => {
  it('返回各科目 debitCents/creditCents；探针科目借=贷、净额 0', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/admin/finance/ledger/summary', headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(Array.isArray(data.accounts)).toBe(true);

    const probe = data.accounts.find((a: any) => a.account === PROBE_ACCOUNT);
    expect(probe).toBeDefined();
    expect(Number(probe.debitCents)).toBe(1500);   // 1000(Jan) + 500(today)
    expect(Number(probe.creditCents)).toBe(1500);
    expect(Number(probe.netCents)).toBe(0);

    // 恒等式结构字段：totalDebit==totalCredit ↔ balanced
    expect(typeof data.totalDebitCents).toBe('number');
    expect(typeof data.totalCreditCents).toBe('number');
    expect(data.balanced).toBe(data.totalDebitCents === data.totalCreditCents);
  });
});
