/**
 * 供应商结算自动对账集成测试 — P1-3（真实 PG，buildApp + app.inject）
 *
 * 覆盖：
 *   - generate：无数据期返回空数组 / 按供应商聚合金额正确（独立 sum(cost) 对照）/ 幂等
 *   - 列表：period / supplier_id 过滤 + 分页
 *   - 详情：明细条数/金额正确；不存在 → 404
 *   - download：200 + Content-Disposition 文件名正确；不存在 → 404
 *   - supplier-bill-match：matched / diff + diff_percent / missing
 *   - confirm：draft → confirmed 幂等
 *   - 权限：全部端点 未登录 401 + 非 admin 403
 *   - 金额精度：numeric(18,4)，toBeCloseTo(…, 4)
 *
 * 测试月份用 2099-12（未来月份，避免与并行任务/真实数据交叉）。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../src/db';
import { eq, and, sql, inArray } from 'drizzle-orm';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-jwt-secret-vendor-settlement',
  PORT: '3041',
};

const PERIOD = '2099-12'; // 测试结算月（未来，无真实数据）
const EMPTY_PERIOD = '2098-01'; // 完全无数据期

describe('Vendor Settlement API (P1-3)', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let customerToken: string;

  const ts = Date.now();
  const adminEmail = `vs-admin-${ts}@test.com`;
  const customerEmail = `vs-cust-${ts}@test.com`;
  const prefix = `vs-${ts}`;

  let userCustomerId = 0;
  let supA = 0; // 结算总金额 8.00（明细 2 个模型）
  let supB = 0; // 15.00
  let supC = 0; // 0.10
  let supMiss = 0; // 无消费（missing 用例）
  let settlementA = 0;
  let settlementC = 0;

  beforeAll(async () => {
    app = await buildApp({ envOverrides: testEnv });
    await app.ready();

    // ── 管理员 + 普通客户 ──
    await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: adminEmail, password: 'Admin12345', name: 'VS Admin' },
    });
    await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.email, adminEmail));
    const loginRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: 'Admin12345' },
    });
    adminToken = JSON.parse(loginRes.payload).accessToken;

    const custRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: customerEmail, password: 'Cust12345', name: 'VS Customer' },
    });
    customerToken = JSON.parse(custRes.payload).accessToken;
    const [custRow] = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.email, customerEmail));
    userCustomerId = custRow!.id;

    // ── 供应商 ──
    const insertedSuppliers = await db.insert(schema.suppliers).values([
      { name: `VS SupA ${prefix}`, code: `vsa-${ts}`, baseUrl: 'https://a.example.com', apiType: 'openai', status: 'active' },
      { name: `VS SupB ${prefix}`, code: `vsb-${ts}`, baseUrl: 'https://b.example.com', apiType: 'openai', status: 'active' },
      { name: `VS SupC ${prefix}`, code: `vsc-${ts}`, baseUrl: 'https://c.example.com', apiType: 'openai', status: 'active' },
      { name: `VS SupMiss ${prefix}`, code: `vsm-${ts}`, baseUrl: 'https://m.example.com', apiType: 'openai', status: 'active' },
    ]).returning({ id: schema.suppliers.id });
    [supA, supB, supC, supMiss] = insertedSuppliers.map((r) => r.id);

    // ── 供应商模型（SupA 两个模型，SupB/SupC 各一个）──
    const insertedModels = await db.insert(schema.supplierModels).values([
      { supplierId: supA, modelName: 'vs-a1', platformModel: 'vs-a1', inputPrice: '0', outputPrice: '0', status: 'active' },
      { supplierId: supA, modelName: 'vs-a2', platformModel: 'vs-a2', inputPrice: '0', outputPrice: '0', status: 'active' },
      { supplierId: supB, modelName: 'vs-b1', platformModel: 'vs-b1', inputPrice: '0', outputPrice: '0', status: 'active' },
      { supplierId: supC, modelName: 'vs-c1', platformModel: 'vs-c1', inputPrice: '0', outputPrice: '0', status: 'active' },
    ]).returning({ id: schema.supplierModels.id });
    const [ma1, ma2, mb1, mc1] = insertedModels.map((r) => r.id);

    // ── 消费记录（2099-12 月中；cost ≤ 4 位小数，保证聚合精确）──
    const t = new Date('2099-12-15T12:00:00Z');
    const recs = [
      // SupA：1.25 + 2.50（vs-a1）+ 3.75（vs-a2）+ 0.50（仅 supplier_id，无 model 关联） = 8.00
      { userId: userCustomerId, requestId: `${prefix}-r1`, model: 'vs-a1', supplierId: null, supplierModelId: ma1, cost: '1.25' },
      { userId: userCustomerId, requestId: `${prefix}-r2`, model: 'vs-a1', supplierId: null, supplierModelId: ma1, cost: '2.50' },
      { userId: userCustomerId, requestId: `${prefix}-r3`, model: 'vs-a2', supplierId: null, supplierModelId: ma2, cost: '3.75' },
      { userId: userCustomerId, requestId: `${prefix}-r4`, model: 'vs-a1', supplierId: supA, supplierModelId: null, cost: '0.50' },
      // SupB：10.00 + 5.00 = 15.00
      { userId: userCustomerId, requestId: `${prefix}-r5`, model: 'vs-b1', supplierId: null, supplierModelId: mb1, cost: '10.00' },
      { userId: userCustomerId, requestId: `${prefix}-r6`, model: 'vs-b1', supplierId: null, supplierModelId: mb1, cost: '5.00' },
      // SupC：0.10
      { userId: userCustomerId, requestId: `${prefix}-r7`, model: 'vs-c1', supplierId: null, supplierModelId: mc1, cost: '0.10' },
    ];
    await db.insert(schema.consumptionRecords).values(
      recs.map((r) => ({
        userId: r.userId,
        requestId: r.requestId,
        model: r.model,
        supplierId: r.supplierId,
        supplierModelId: r.supplierModelId,
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        cost: r.cost,
        trustUpstream: true,
        fallback: false,
        streamed: false,
        createdAt: t,
      })),
    );
  });

  afterAll(async () => {
    // 清理（items 随 settlement 级联删除）
    await db.delete(schema.vendorSettlements).where(eq(schema.vendorSettlements.period, PERIOD));
    await db.delete(schema.consumptionRecords).where(sql`request_id like ${`${prefix}-%`}`);
    await db.delete(schema.supplierModels).where(inArray(schema.supplierModels.supplierId, [supA, supB, supC]));
    await db.delete(schema.suppliers).where(sql`code like ${`vs%-${ts}`}`);
    await db.delete(schema.users).where(sql`email in (${adminEmail}, ${customerEmail})`);
    await app.close();
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  /* ═══════════════ 权限（全部端点） ═══════════════ */

  it('generate：未登录 → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/vendor-settlements/generate', payload: { period: PERIOD } });
    expect(res.statusCode).toBe(401);
  });
  it('generate：customer → 403', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/vendor-settlements/generate',
      headers: auth(customerToken), payload: { period: PERIOD },
    });
    expect(res.statusCode).toBe(403);
  });
  it('list：未登录 → 401 / customer → 403', async () => {
    const res1 = await app.inject({ method: 'GET', url: '/api/v1/admin/vendor-settlements' });
    expect(res1.statusCode).toBe(401);
    const res2 = await app.inject({ method: 'GET', url: '/api/v1/admin/vendor-settlements', headers: auth(customerToken) });
    expect(res2.statusCode).toBe(403);
  });
  it('detail：未登录 → 401 / customer → 403', async () => {
    const res1 = await app.inject({ method: 'GET', url: '/api/v1/admin/vendor-settlements/1' });
    expect(res1.statusCode).toBe(401);
    const res2 = await app.inject({ method: 'GET', url: '/api/v1/admin/vendor-settlements/1', headers: auth(customerToken) });
    expect(res2.statusCode).toBe(403);
  });
  it('download：未登录 → 401 / customer → 403', async () => {
    const res1 = await app.inject({ method: 'GET', url: '/api/v1/admin/vendor-settlements/1/download' });
    expect(res1.statusCode).toBe(401);
    const res2 = await app.inject({ method: 'GET', url: '/api/v1/admin/vendor-settlements/1/download', headers: auth(customerToken) });
    expect(res2.statusCode).toBe(403);
  });
  it('confirm：未登录 → 401 / customer → 403', async () => {
    const res1 = await app.inject({ method: 'POST', url: '/api/v1/admin/vendor-settlements/1/confirm' });
    expect(res1.statusCode).toBe(401);
    const res2 = await app.inject({ method: 'POST', url: '/api/v1/admin/vendor-settlements/1/confirm', headers: auth(customerToken) });
    expect(res2.statusCode).toBe(403);
  });
  it('supplier-bill-match：未登录 → 401 / customer → 403', async () => {
    const qs = `period=${PERIOD}&supplier_id=${supA}&bill_amount=8`;
    const res1 = await app.inject({ method: 'GET', url: `/api/v1/admin/supplier-bill-match?${qs}` });
    expect(res1.statusCode).toBe(401);
    const res2 = await app.inject({ method: 'GET', url: `/api/v1/admin/supplier-bill-match?${qs}`, headers: auth(customerToken) });
    expect(res2.statusCode).toBe(403);
  });

  /* ═══════════════ generate ═══════════════ */

  it('generate：无数据期 → 200 + 空数组', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/vendor-settlements/generate',
      headers: auth(adminToken), payload: { period: EMPTY_PERIOD },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });

  it('generate：按供应商聚合金额正确（sum(cost) 对照）', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/vendor-settlements/generate',
      headers: auth(adminToken), payload: { period: PERIOD },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(3);

    const bySupplier = new Map(data.map((s) => [s.supplier_id, s]));
    const a = bySupplier.get(supA)!;
    const b = bySupplier.get(supB)!;
    const c = bySupplier.get(supC)!;

    expect(a.supplier_name).toBe(`VS SupA ${prefix}`);
    expect(a.period).toBe(PERIOD);
    expect(a.status).toBe('draft');
    expect(Number(a.total_amount)).toBeCloseTo(8.0, 4);
    expect(a.item_count).toBe(4); // 4 条消费记录
    expect(Number(b.total_amount)).toBeCloseTo(15.0, 4);
    expect(b.item_count).toBe(2);
    expect(Number(c.total_amount)).toBeCloseTo(0.1, 4);
    expect(c.item_count).toBe(1);

    // 独立 sum(cost) 对照（raw SQL，与服务实现分离）
    const rows = await db.execute(sql`
      SELECT coalesce(sm.supplier_id, cr.supplier_id) AS sid,
             round(coalesce(sum(cr.cost), 0)::numeric, 4) AS total,
             count(*)::int AS cnt
      FROM consumption_records cr
      LEFT JOIN supplier_models sm ON cr.supplier_model_id = sm.id
      WHERE cr.created_at >= '2099-12-01' AND cr.created_at < '2100-01-01'
        AND coalesce(sm.supplier_id, cr.supplier_id) IS NOT NULL
      GROUP BY 1 ORDER BY 1
    `);
    const sqlMap = new Map((rows as any[]).map((r) => [Number(r.sid), { total: Number(r.total), cnt: r.cnt }]));
    for (const sid of [supA, supB, supC]) {
      const s = bySupplier.get(sid)!;
      expect(Number(s.total_amount)).toBeCloseTo(sqlMap.get(sid)!.total, 4);
      expect(s.item_count).toBe(sqlMap.get(sid)!.cnt);
    }

    // 记录本次生成的结算单 id 供后续用例
    settlementA = Number((bySupplier.get(supA) as any).settlement_id);
    settlementC = Number((bySupplier.get(supC) as any).settlement_id);
    expect(settlementA).toBeGreaterThan(0);
  });

  it('generate：幂等 — 同 (supplier, period) 二次生成返回既有结果、不重复落库', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/vendor-settlements/generate',
      headers: auth(adminToken), payload: { period: PERIOD },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data as Array<Record<string, unknown>>;
    const a = data.find((s) => s.supplier_id === supA)!;
    expect(Number(a.settlement_id)).toBe(settlementA);

    const [cnt] = await db.execute(sql`
      SELECT count(*)::int AS c FROM vendor_settlements
      WHERE supplier_id = ${supA} AND period = ${PERIOD}
    `);
    expect(Number((cnt as any).c)).toBe(1);
  });

  /* ═══════════════ 列表 ═══════════════ */

  it('list：period 过滤生效', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/admin/vendor-settlements?period=${PERIOD}`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const { items, total } = res.json().data;
    expect(total).toBe(3);
    expect(items).toHaveLength(3);
    expect(items.every((it: any) => it.period === PERIOD)).toBe(true);
  });

  it('list：supplier_id 过滤生效', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/admin/vendor-settlements?period=${PERIOD}&supplier_id=${supA}`,
      headers: auth(adminToken),
    });
    const { items, total } = res.json().data;
    expect(total).toBe(1);
    expect(items[0].supplier_id).toBe(supA);
    expect(items[0].total_amount).toBeCloseTo(8.0, 4);
  });

  it('list：分页正确（page_size=2）', async () => {
    const p1 = await app.inject({
      method: 'GET', url: `/api/v1/admin/vendor-settlements?period=${PERIOD}&page=1&page_size=2`,
      headers: auth(adminToken),
    });
    const d1 = p1.json().data;
    expect(d1.items).toHaveLength(2);
    expect(d1.total).toBe(3);
    expect(d1.page).toBe(1);
    expect(d1.pageSize).toBe(2);

    const p2 = await app.inject({
      method: 'GET', url: `/api/v1/admin/vendor-settlements?period=${PERIOD}&page=2&page_size=2`,
      headers: auth(adminToken),
    });
    const d2 = p2.json().data;
    expect(d2.items).toHaveLength(1);
    expect(d2.total).toBe(3);
  });

  /* ═══════════════ 详情 ═══════════════ */

  it('detail：明细条数/金额正确', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/admin/vendor-settlements/${settlementA}`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.supplier_id).toBe(supA);
    expect(d.total_amount).toBeCloseTo(8.0, 4);
    expect(d.item_count).toBe(4);
    expect(d.items).toHaveLength(2); // vs-a1 + vs-a2 两个模型

    const m1 = d.items.find((it: any) => it.model_name === 'vs-a1');
    const m2 = d.items.find((it: any) => it.model_name === 'vs-a2');
    expect(m1.call_count).toBe(3); // r1 + r2 + r4
    expect(m1.cost).toBeCloseTo(4.25, 4);
    expect(m2.call_count).toBe(1);
    expect(m2.cost).toBeCloseTo(3.75, 4);
  });

  it('detail：不存在的 id → 404', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/admin/vendor-settlements/999999999',
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(404);
  });

  /* ═══════════════ download ═══════════════ */

  it('download：200 + Content-Disposition 文件名正确 + CSV 内容', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/admin/vendor-settlements/${settlementA}/download`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="vendor-settlement-${PERIOD}-${supA}.csv"`);
    const body = res.body;
    expect(body).toContain('model_name,call_count,cost');
    expect(body).toContain('vs-a1,3,4.2500');
    expect(body).toContain('vs-a2,1,3.7500');
    expect(body).toContain(`TOTAL,4,8.0000`);
  });

  it('download：不存在的 id → 404', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/admin/vendor-settlements/999999999/download',
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(404);
  });

  /* ═══════════════ supplier-bill-match ═══════════════ */

  it('bill-match：platform == bill → matched', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/admin/supplier-bill-match?period=${PERIOD}&supplier_id=${supA}&bill_amount=8.00`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.platform_amount).toBeCloseTo(8.0, 4);
    expect(d.bill_amount).toBe(8.0);
    expect(d.diff).toBeCloseTo(0, 4);
    expect(d.diff_percent).toBeCloseTo(0, 2);
    expect(d.status).toBe('matched');
  });

  it('bill-match：platform != bill → diff + diff_percent 正确', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/admin/supplier-bill-match?period=${PERIOD}&supplier_id=${supB}&bill_amount=20.00`,
      headers: auth(adminToken),
    });
    const d = res.json().data;
    expect(d.platform_amount).toBeCloseTo(15.0, 4);
    expect(d.diff).toBeCloseTo(5.0, 4);
    expect(d.diff_percent).toBeCloseTo(33.33, 2); // 5 / 15 * 100
    expect(d.status).toBe('diff');
  });

  it('bill-match：供应商无平台数据 → missing', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/admin/supplier-bill-match?period=${PERIOD}&supplier_id=${supMiss}&bill_amount=100`,
      headers: auth(adminToken),
    });
    const d = res.json().data;
    expect(d.platform_amount).toBe(0);
    expect(d.bill_amount).toBe(100);
    expect(d.diff).toBeCloseTo(100, 4);
    expect(d.diff_percent).toBeNull();
    expect(d.status).toBe('missing');
  });

  it('bill-match：双方均为 0 → matched', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/admin/supplier-bill-match?period=${PERIOD}&supplier_id=${supMiss}&bill_amount=0`,
      headers: auth(adminToken),
    });
    const d = res.json().data;
    expect(d.status).toBe('matched');
    expect(d.diff).toBeCloseTo(0, 4);
  });

  /* ═══════════════ confirm（状态流转） ═══════════════ */

  it('confirm：draft → confirmed，且幂等（二次 confirm 仍 200）', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/vendor-settlements/${settlementC}/confirm`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('confirmed');

    // 幂等
    const res2 = await app.inject({
      method: 'POST', url: `/api/v1/admin/vendor-settlements/${settlementC}/confirm`,
      headers: auth(adminToken),
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().data.status).toBe('confirmed');

    // 再次 generate：已确认的结算单被原样复用（不重建为 draft）
    const gen = await app.inject({
      method: 'POST', url: '/api/v1/admin/vendor-settlements/generate',
      headers: auth(adminToken), payload: { period: PERIOD },
    });
    const c = gen.json().data.find((s: any) => s.supplier_id === supC);
    expect(Number(c.settlement_id)).toBe(settlementC);
    expect(c.status).toBe('confirmed');
  });

  it('confirm：不存在的 id → 404', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/vendor-settlements/999999999/confirm',
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(404);
  });
});
