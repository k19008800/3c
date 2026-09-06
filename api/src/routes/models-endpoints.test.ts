/**
 * G. GET /api/v1/admin/models              — 平台模型列表（跨供应商聚合）
 * F. GET /api/v1/models/:name/channels     — 单模型渠道定价
 *
 * 覆盖：
 *   G: vendor_count 聚合 / pagination.total / keyword 过滤 / status & context_length 映射 /
 *      排除 R8 测试模型 / adminAuth 权限
 *   F: 返回渠道行（channel_code/status/价格/health 等）/ 未知模型 → channels:[] / R8 排除
 *
 * 运行：cd 3cloud/api && npx vitest run src/routes/models-endpoints.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-jwt-secret-models-endpoints',
  PORT: '3041',
};

describe('models endpoints (G admin/models + F models/:name/channels)', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let customerToken: string;

  let supplier1Id: number;
  let supplier2Id: number;
  let sharedModelName: string;
  let offlineModelName: string;
  let r8ModelName: string;
  let unknownModelName: string;

  const sup1Code = `msup1-${Date.now()}`;
  const sup2Code = `msup2-${Date.now()}`;
  const sup1Name = `MSup1-${Date.now()}`;
  const sup2Name = `MSup2-${Date.now()}`;
  const ts = Date.now();
  const adminEmail = `me-admin-${ts}@test.com`;
  const customerEmail = `me-cust-${ts}@test.com`;

  beforeAll(async () => {
    app = await buildApp({ envOverrides: testEnv });
    await app.ready();

    const { db, schema } = await import('../db/index.js');
    const { eq } = await import('drizzle-orm');

    // ── 操作员（admin）──
    const adminRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: adminEmail, password: 'Admin12345', name: 'Models Admin' },
    });
    expect(adminRes.statusCode).toBe(201);
    await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.email, adminEmail));
    const adminLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: 'Admin12345' },
    });
    expect(adminLogin.statusCode).toBe(200);
    adminToken = JSON.parse(adminLogin.payload).accessToken;

    // ── 普通客户（非 admin）──
    const custRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: customerEmail, password: 'Cust12345', name: 'Models Customer' },
    });
    expect(custRes.statusCode).toBe(201);
    const custLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: customerEmail, password: 'Cust12345' },
    });
    customerToken = JSON.parse(custLogin.payload).accessToken;

    // ── 供应商 ──
    const sup1Res = await app.inject({
      method: 'POST', url: '/api/v1/admin/suppliers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: sup1Name, code: sup1Code, baseUrl: 'https://api.msup1.test.com', apiType: 'openai' },
    });
    expect(sup1Res.statusCode).toBe(201);
    supplier1Id = JSON.parse(sup1Res.payload).supplier.id as number;

    const sup2Res = await app.inject({
      method: 'POST', url: '/api/v1/admin/suppliers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: sup2Name, code: sup2Code, baseUrl: 'https://api.msup2.test.com', apiType: 'openai' },
    });
    expect(sup2Res.statusCode).toBe(201);
    supplier2Id = JSON.parse(sup2Res.payload).supplier.id as number;

    // ── 共享模型（跨越 2 家供应商；vendor_count 应 = 2）──
    sharedModelName = `shared-${ts}`;
    for (const [supId, platform] of [[supplier1Id, `shared-up-${ts}`], [supplier2Id, `shared-up-${ts}`]] as [number, string][]) {
      const mRes = await app.inject({
        method: 'POST', url: `/api/v1/admin/suppliers/${supId}/models`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { modelName: sharedModelName, platformModel: platform, inputPrice: '0.001', outputPrice: '0.002' },
      });
      expect(mRes.statusCode).toBe(201);
    }
    // 给两家供应商的行设 maxTokens（supplier1 更大，聚合应取 max = 12288 → 12K）
    await db.update(schema.supplierModels)
      .set({ maxTokens: 4096 })
      .where(eq(schema.supplierModels.supplierId, supplier1Id));
    await db.update(schema.supplierModels)
      .set({ maxTokens: 12288 })
      .where(eq(schema.supplierModels.supplierId, supplier2Id));

    // ── 下线模型（唯一供应商行 inactive → status 'offline'）──
    offlineModelName = `off-${ts}`;
    const offRes = await app.inject({
      method: 'POST', url: `/api/v1/admin/suppliers/${supplier1Id}/models`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { modelName: offlineModelName, platformModel: `off-up-${ts}`, inputPrice: '0.004', outputPrice: '0.008' },
    });
    expect(offRes.statusCode).toBe(201);
    await db.update(schema.supplierModels)
      .set({ status: 'inactive', maxTokens: 2048 })
      .where(eq(schema.supplierModels.modelName, offlineModelName));

    // ── R8 测试模型（应被目录/渠道过滤）──
    r8ModelName = `market-test-${ts}`;
    const r8Res = await app.inject({
      method: 'POST', url: `/api/v1/admin/suppliers/${supplier1Id}/models`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { modelName: r8ModelName, platformModel: `mt-up-${ts}`, inputPrice: '0.01', outputPrice: '0.02' },
    });
    expect(r8Res.statusCode).toBe(201);

    unknownModelName = `no-such-model-${ts}`;
  });

  afterAll(async () => {
    const { db, schema } = await import('../db/index.js');
    const { inArray } = await import('drizzle-orm');
    // 删除测试供应商（级联删 supplier_models）与测试用户
    await db.delete(schema.suppliers)
      .where(inArray(schema.suppliers.code, [sup1Code, sup2Code]))
      .catch(() => {});
    await db.delete(schema.users)
      .where(inArray(schema.users.email, [adminEmail, customerEmail]))
      .catch(() => {});
    await app.close();
  });

  // ═══════════════════════
  // G. GET /api/v1/admin/models
  // ═══════════════════════

  describe('G /admin/models', () => {
    it('未登录 → 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/models' });
      expect(res.statusCode).toBe(401);
    });

    it('非 admin → 403', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/models',
        headers: { authorization: `Bearer ${customerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('返回聚合列表，共享模型 vendor_count=2 且 pagination.total 正确', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/admin/models?keyword=${encodeURIComponent(ts)}&page_size=50`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      const list = body.data.list as any[];
      expect(Array.isArray(list)).toBe(true);
      // keyword=ts 命中 shared + off 两个模型（market-test 被 R8 过滤）
      expect(body.data.pagination.total).toBe(2);
      expect(body.data.pagination.page_size).toBe(50);
      expect(body.data.pagination.page).toBe(1);

      const shared = list.find((m: any) => m.name === sharedModelName);
      expect(shared).toBeDefined();
      expect(shared.display_name).toBe(`shared-up-${ts}`);
      expect(shared.category).toBe('chat');
      expect(shared.vendor_count).toBe(2);
      expect(shared.status).toBe('active');
      expect(shared.context_length).toBe(12); // max(12288)/1024=12
      expect(typeof shared.id).toBe('number');

      const off = list.find((m: any) => m.name === offlineModelName);
      expect(off).toBeDefined();
      expect(off.status).toBe('offline');
      expect(off.vendor_count).toBe(1);
      expect(off.context_length).toBe(2); // 2048/1024=2

      // R8 测试模型不应出现在列表
      expect(list.some((m: any) => m.name === r8ModelName)).toBe(false);
    });

    it('排除 R8 测试模型（不传 keyword 也过滤）', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/admin/models?page_size=50`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const list = JSON.parse(res.payload).data.list as any[];
      expect(list.some((m: any) => m.name === r8ModelName)).toBe(false);
    });

    it('keyword 过滤只返回匹配模型（modelName ILIKE）', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/admin/models?keyword=${encodeURIComponent('shared-')}&page_size=50`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      const list = body.data.list as any[];
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.every((m: any) => m.name === sharedModelName)).toBe(true);
      expect(body.data.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it('分页：page_size=1 返回 1 条且 total 仍为 2', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/admin/models?keyword=${encodeURIComponent(ts)}&page_size=1&page=1`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.list.length).toBe(1);
      expect(body.data.pagination.total).toBe(2);
    });
  });

  // ═══════════════════════
  // F. GET /api/v1/models/:name/channels
  // ═══════════════════════

  describe('F /models/:name/channels', () => {
    it('返回共享模型的 2 个渠道，字段映射正确', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/models/${encodeURIComponent(sharedModelName)}/channels`,
        headers: { authorization: `Bearer ${adminToken}` }, // 登录态也可访问（public 域）
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.model).toBe(sharedModelName);
      expect(Array.isArray(body.data.channels)).toBe(true);
      expect(body.data.channels.length).toBe(2);

      const byCode = new Map<string, any>(body.data.channels.map((c: any) => [c.channel_code, c]));
      expect(byCode.has(sup1Code)).toBe(true);
      expect(byCode.has(sup2Code)).toBe(true);
      const ch1 = byCode.get(sup1Code);
      expect(ch1.channel_name).toBe(sup1Name);
      expect(ch1.input_price).toBe(0.001);
      expect(ch1.output_price).toBe(0.002);
      expect(ch1.status).toBe('active');
      expect(ch1.maintenance).toBe(false);
      expect(ch1.pricing_group).toBeNull();
      expect(ch1.latency_ms).toBeNull();
      expect(ch1.recommended).toBeNull();
      expect(ch1.credit).toBeNull();
      // suppliers.healthStatus 默认 'unknown' → health null
      expect(ch1.health).toBeNull();
    });

    it('inactive 模型的渠道 status=offline 且 maintenance=false', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/models/${encodeURIComponent(offlineModelName)}/channels`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.channels.length).toBe(1);
      expect(body.data.channels[0].status).toBe('offline');
      expect(body.data.channels[0].maintenance).toBe(false);
      expect(body.data.channels[0].channel_code).toBe(sup1Code);
    });

    it('未知模型 → 200 且 channels=[]', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/models/${encodeURIComponent(unknownModelName)}/channels`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.model).toBe(unknownModelName);
      expect(body.data.channels).toEqual([]);
    });

    it('R8 测试模型被过滤 → channels=[]', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/models/${encodeURIComponent(r8ModelName)}/channels`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.channels).toEqual([]);
    });
  });
});