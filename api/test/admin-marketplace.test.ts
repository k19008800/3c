import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../src/db';
import { eq, like } from 'drizzle-orm';
import { aggregateBucket, bucketStartFrom } from '../src/services/marketplace/model-health-aggregator';
import { histogramPercentile } from '../src/lib/latency';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-jwt-secret-marketplace',
  PORT: '3034',
};

describe('Model Marketplace API', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let customerToken: string;

  // 测试数据
  const ts = Date.now();
  const adminEmail = `admin-mkt-${ts}@test.com`;
  const customerEmail = `cust-mkt-${ts}@test.com`;
  const MODEL = `market-test-${ts}`;
  let supplierAId = 0;
  let supplierBId = 0;
  let userCustomerId = 0;

  beforeAll(async () => {
    app = await buildApp({ envOverrides: testEnv });
    await app.ready();

    // 管理员 + 客户
    await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: adminEmail, password: 'Admin12345', name: 'Admin Mkt' },
    });
    await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.email, adminEmail));
    const loginRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: 'Admin12345' },
    });
    adminToken = JSON.parse(loginRes.payload).accessToken;

    const custRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: customerEmail, password: 'Cust12345', name: 'Customer Mkt' },
    });
    customerToken = JSON.parse(custRes.payload).accessToken;
    const custRow = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.email, customerEmail));
    userCustomerId = custRow[0]!.id;

    // 供应商 A / B（价格不同，A 更贵）
    const inserted = await db.insert(schema.suppliers).values([
      { name: `MktSupA-${ts}`, code: `mkta-${ts}`, baseUrl: 'https://a.example.com', apiType: 'openai', status: 'active' },
      { name: `MktSupB-${ts}`, code: `mktb-${ts}`, baseUrl: 'https://b.example.com', apiType: 'openai', status: 'active' },
    ]).returning({ id: schema.suppliers.id });
    supplierAId = inserted[0]!.id;

    const [sb] = await db.select({ id: schema.suppliers.id }).from(schema.suppliers)
      .where(eq(schema.suppliers.code, `mktb-${ts}`));
    supplierBId = sb!.id;

    // 两个供应商的模型（同 platform_model 名 = MODEL），带 active 售价
    const insertedModels = await db.insert(schema.supplierModels).values([
      { supplierId: supplierAId, modelName: MODEL, platformModel: MODEL, inputPrice: '0.10', outputPrice: '0.30', status: 'active' },
      { supplierId: supplierBId, modelName: MODEL, platformModel: MODEL, inputPrice: '0.08', outputPrice: '0.24', status: 'active' },
    ]).returning({ id: schema.supplierModels.id });
    await db.insert(schema.vendorPricing).values([
      { supplierModelId: insertedModels[0]!.id, pricingGroup: 'default', inputPrice: '0.10', outputPrice: '0.30', status: 'active' },
      { supplierModelId: insertedModels[1]!.id, pricingGroup: 'default', inputPrice: '0.08', outputPrice: '0.24', status: 'active' },
    ]);

    // 对话留痕：A 20 成功(200ms) + 2 失败(1 个 500 / 1 个 429, 150ms)；B 10 成功(300ms)
    const now = Date.now();
    const t0 = new Date(now - 60_000);
    const rows: Array<Record<string, unknown>> = [];
    let i = 0;
    const push = (supplierId: number, supplierModelId: number, status: string, latencyMs: number, errorCode: string | null) => {
      rows.push({
        requestId: `mkt-req-${ts}-${i++}`,
        userId: userCustomerId,
        apiKeyId: null,
        clientKeyHash: 'testhash',
        requestedModel: MODEL,
        routedModel: MODEL,
        supplierId,
        supplierModelId,
        supplierKeyFp: 'fp',
        messages: [],
        responseText: 'ok',
        finishReason: status === 'succeeded' ? 'stop' : null,
        status,
        errorCode,
        inputTokens: 10,
        outputTokens: 5,
        cost: '0.001',
        clientIp: '127.0.0.1',
        occurredAt: t0,
        completedAt: new Date(t0.getTime() + latencyMs),
        createdAt: t0,
      });
    };
    for (let k = 0; k < 20; k++) push(supplierAId, insertedModels[0]!.id, 'succeeded', 200, null);
    push(supplierAId, insertedModels[0]!.id, 'failed', 150, '500');
    push(supplierAId, insertedModels[0]!.id, 'failed', 150, '429');
    for (let k = 0; k < 10; k++) push(supplierBId, insertedModels[1]!.id, 'succeeded', 300, null);
    await db.insert(schema.conversationContextRecords).values(rows as any);

    // 直接跑聚合（写入该桶）
    await aggregateBucket(bucketStartFrom(t0.getTime()), now);
  });

  afterAll(async () => {
    // 清理测试数据
    await db.delete(schema.conversationContextRecords)
      .where(like(schema.conversationContextRecords.requestedModel, `market-test-${ts}%`));
    await db.delete(schema.modelHealthStats)
      .where(like(schema.modelHealthStats.platformModel, `market-test-${ts}%`));
    await app.close();
  });

  // ════════════════════════
  // 列表接口
  // ════════════════════════

  it('GET /admin/models/marketplace — 返回聚合健康数据', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/admin/models/marketplace?window=5m',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    const item = body.data.items.find((it: any) => it.model === MODEL);
    expect(item).toBeDefined();
    // 32 请求，30 成功 → 93.8% → degraded
    expect(item.success_rate).toBe(93.8);
    expect(item.status).toBe('degraded');
    expect(item.traffic_volume).toBe(32);
    expect(item.supplier_count).toBe(2);
    expect(item.min_price).toBe(0.08);
    expect(item.p50_ms).toBeGreaterThan(0);
    expect(item.p99_ms).toBeGreaterThanOrEqual(item.p50_ms);
  });

  it('GET /admin/models/marketplace — keyword 过滤', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/admin/models/marketplace?keyword=${MODEL}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(res.payload);
    expect(body.data.items.every((it: any) => it.model.includes(MODEL))).toBe(true);
  });

  it('GET /admin/models/marketplace — status 过滤 degraded', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/admin/models/marketplace?status=degraded`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(res.payload);
    const item = body.data.items.find((it: any) => it.model === MODEL);
    expect(item).toBeDefined();
    expect(body.data.items.every((it: any) => it.status === 'degraded')).toBe(true);
  });

  // ════════════════════════
  // 供应商详情接口
  // ════════════════════════

  it('GET /admin/models/marketplace/:model/suppliers — 供应商明细', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/admin/models/marketplace/${encodeURIComponent(MODEL)}/suppliers?window=5m`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.suppliers.length).toBe(2);

    const a = body.data.suppliers.find((s: any) => s.id === supplierAId);
    const b = body.data.suppliers.find((s: any) => s.id === supplierBId);
    expect(a.traffic_volume).toBe(22);
    expect(a.error_rate).toBeCloseTo(9.1, 0); // 2/22 ≈ 9.09%
    expect(a.price_input).toBe(0.10);
    expect(a.status).toBe('active');
    expect(b.traffic_volume).toBe(10);
    expect(b.error_rate).toBe(0);
    expect(b.price_input).toBe(0.08);
  });

  // ════════════════════════
  // 权限
  // ════════════════════════

  it('customer 访问 admin marketplace → 403', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/admin/models/marketplace',
      headers: { authorization: `Bearer ${customerToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('无 token → 401', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/admin/models/marketplace',
    });
    expect(res.statusCode).toBe(401);
  });

  // ════════════════════════
  // Portal 公开接口
  // ════════════════════════

  it('GET /public/models/health — 免鉴权，仅暴露健康/价格', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/public/models/health?window=5m',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    const item = body.data.items.find((it: any) => it.model === MODEL);
    expect(item).toBeDefined();
    expect(item.min_price).toBe(0.08);
    expect(item).not.toHaveProperty('suppliers');
    expect(item).not.toHaveProperty('error_rate');
  });
});

describe('latency 分位数（直方图）', () => {
  it('P50 / P99 线性插值', () => {
    // 4 个样本：100,200,300,500（桶为 [key, nextBoundary) 区间）
    const hist = { 100: 1, 200: 1, 300: 1, 500: 1 };
    // P50 目标序号 2.0 → 200 桶占满 → 上界 300
    expect(histogramPercentile(hist, 0.5)).toBe(300);
    // P99 目标序号 3.96 → 落在 500 桶 [500,750) 的 96% 处 → 740
    expect(histogramPercentile(hist, 0.99)).toBe(740);
  });

  it('末桶（5000-inf）取上界', () => {
    // 3 个样本：100,500,5000
    const hist = { 100: 1, 500: 1, 5000: 1 };
    // P50 目标 1.5 → 500 桶 [500,750) 的 50% 处 → 625
    expect(histogramPercentile(hist, 0.5)).toBe(625);
    // P99 目标 2.97 → 末桶 5000-inf → 5000
    expect(histogramPercentile(hist, 0.99)).toBe(5000);
  });

  it('空直方图 → 0', () => {
    expect(histogramPercentile({}, 0.5)).toBe(0);
  });
});
