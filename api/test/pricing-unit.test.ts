/**
 * P1-4 管理端定价录入单位校验 — 从入口拦截 1000× 计费偏差事故（¥/M 误填 ¥/1K 字段）
 *
 * 背景：2026-08-17 vendor_pricing 把 ¥/M 值（2/8）误填进 ¥/1K 字段 → 计费偏差 1000 倍。
 * 本测试覆盖：
 *   - validatePricingUnit 纯函数全分支（合法 / 任一 >10 疑似 ¥/M / 边界 10 与 10.01 / ≤0 / 非数字）
 *   - POST /api/v1/admin/pricing 创建：合法 201、疑似 ¥/M 400 PRICE_UNIT_SUSPECT、
 *     边界、非数字/负数/0 → 400、未登录 401、非 admin 403
 *   - PUT /api/v1/admin/pricing/:id 更新：合法 200、疑似 ¥/M 400、新字段名同样校验、
 *     非价格更新不受影响、401/403
 *
 * @see docs/iteration-plan-v2.md P1-4
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { validatePricingUnit, PRICE_UNIT_SUSPECT_MESSAGE } from '../src/services/billing/pricing';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-jwt-secret-pricing-unit',
  PORT: '3035',
};

describe('P1-4 定价录入单位校验', () => {
  let app: FastifyInstance;
  let adminToken = '';
  let customerToken = '';
  let modelId = 0;
  let pricingId = 0;

  const ts = Date.now();
  const adminEmail = `admin-pu-${ts}@test.com`;
  const customerEmail = `cust-pu-${ts}@test.com`;
  const supplierCode = `pu-${ts}`;
  const supplierName = `PricingUnit-${ts}`;

  beforeAll(async () => {
    app = await buildApp({ envOverrides: testEnv });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 准备：管理员 / 普通用户 / 供应商 / 模型 ──
  it('setup: 注册管理员与普通用户，建供应商与模型', async () => {
    const adminRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: adminEmail, password: 'Admin12345', name: 'Admin PU' },
    });
    expect(adminRes.statusCode).toBe(201);

    // 提升为 admin（无后台提权端点，直接改库，与 suppliers.test.ts 一致）
    const { db, schema } = await import('../src/db');
    const { eq } = await import('drizzle-orm');
    await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.email, adminEmail));

    const loginRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: 'Admin12345' },
    });
    expect(loginRes.statusCode).toBe(200);
    adminToken = JSON.parse(loginRes.payload).accessToken;

    const custRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: customerEmail, password: 'Cust12345', name: 'Customer PU' },
    });
    expect(custRes.statusCode).toBe(201);
    customerToken = JSON.parse(custRes.payload).accessToken;

    const supRes = await app.inject({
      method: 'POST', url: '/api/v1/admin/suppliers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: supplierName, code: supplierCode, baseUrl: 'https://api.test.com', apiType: 'openai' },
    });
    expect(supRes.statusCode).toBe(201);
    const supplierId = JSON.parse(supRes.payload).supplier.id as number;

    const modelRes = await app.inject({
      method: 'POST', url: `/api/v1/admin/suppliers/${supplierId}/models`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { modelName: `pu-model-${ts}`, platformModel: `pu-model-${ts}`, inputPrice: '0.005', outputPrice: '0.015' },
    });
    expect(modelRes.statusCode).toBe(201);
    modelId = JSON.parse(modelRes.payload).model.id as number;
  });

  // ═══════════════════════════════════════
  // 1. 纯函数 validatePricingUnit 全分支
  // ═══════════════════════════════════════

  describe('纯函数 validatePricingUnit', () => {
    it('合法范围 (0, 10] 通过', () => {
      expect(validatePricingUnit(2, 8)).toEqual({ ok: true });
      expect(validatePricingUnit(10, 10)).toEqual({ ok: true });
      expect(validatePricingUnit(0.001, 0.008)).toEqual({ ok: true });
    });

    it('任一价格 > 10 → 疑似 ¥/M（error = PRICE_UNIT_SUSPECT_MESSAGE）', () => {
      const r1 = validatePricingUnit(2000, 8);
      expect(r1.ok).toBe(false);
      expect(r1.error).toBe(PRICE_UNIT_SUSPECT_MESSAGE);
      const r2 = validatePricingUnit(2, 8000);
      expect(r2.ok).toBe(false);
      expect(r2.error).toBe(PRICE_UNIT_SUSPECT_MESSAGE);
    });

    it('边界：10 通过、10.01 拒绝（规则 >10 拦截）', () => {
      expect(validatePricingUnit(10, 8).ok).toBe(true);
      expect(validatePricingUnit(10.01, 8).ok).toBe(false);
      expect(validatePricingUnit(8, 10.01).ok).toBe(false);
    });

    it('≤ 0（0 / 负数）拒绝', () => {
      expect(validatePricingUnit(0, 8).ok).toBe(false);
      expect(validatePricingUnit(2, 0).ok).toBe(false);
      expect(validatePricingUnit(-1, 8).ok).toBe(false);
      expect(validatePricingUnit(2, -8).ok).toBe(false);
    });

    it('非数字（NaN / Infinity）拒绝', () => {
      expect(validatePricingUnit(NaN, 8).ok).toBe(false);
      expect(validatePricingUnit(2, NaN).ok).toBe(false);
      expect(validatePricingUnit(Infinity, 8).ok).toBe(false);
    });
  });

  // ═══════════════════════════════════════
  // 2. POST 创建单位校验
  // ═══════════════════════════════════════

  describe('POST /api/v1/admin/pricing — 创建单位校验', () => {
    it('未登录 → 401', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/pricing',
        payload: { supplierModelId: modelId, inputPrice: '2', outputPrice: '8' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('非 admin（customer）→ 403', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/pricing',
        headers: { authorization: `Bearer ${customerToken}` },
        payload: { supplierModelId: modelId, inputPrice: '2', outputPrice: '8' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('合法单价（input=2, output=8）→ 201', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/pricing',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { supplierModelId: modelId, inputPrice: '2', outputPrice: '8' },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.pricing.inputPrice).toBe('2');
      expect(body.pricing.outputPrice).toBe('8');
      pricingId = body.pricing.id as number;
    });

    it('疑似 ¥/M（input=2000, output=8000）→ 400 PRICE_UNIT_SUSPECT', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/pricing',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { supplierModelId: modelId, inputPrice: '2000', outputPrice: '8000' },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('PRICE_UNIT_SUSPECT');
      expect(body.message).toContain('¥/M');
      expect(body.message).toContain('¥/1K');
    });

    it('仅 output 疑似 ¥/M（output=8000）→ 400 PRICE_UNIT_SUSPECT', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/pricing',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { supplierModelId: modelId, inputPrice: '2', outputPrice: '8000' },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).code).toBe('PRICE_UNIT_SUSPECT');
    });

    it('边界：10 通过（201）、10.01 → 400 PRICE_UNIT_SUSPECT', async () => {
      const okRes = await app.inject({
        method: 'POST', url: '/api/v1/admin/pricing',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { supplierModelId: modelId, inputPrice: '10', outputPrice: '8' },
      });
      expect(okRes.statusCode).toBe(201);

      const badRes = await app.inject({
        method: 'POST', url: '/api/v1/admin/pricing',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { supplierModelId: modelId, inputPrice: '10.01', outputPrice: '8' },
      });
      expect(badRes.statusCode).toBe(400);
      expect(JSON.parse(badRes.payload).code).toBe('PRICE_UNIT_SUSPECT');
    });

    it('非数字（"abc"）→ 400 参数非法（非 PRICE_UNIT_SUSPECT）', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/pricing',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { supplierModelId: modelId, inputPrice: 'abc', outputPrice: '8' },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.code).not.toBe('PRICE_UNIT_SUSPECT');
      expect(body.message).toContain('数字');
    });

    it('负数 → 400 参数非法', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/pricing',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { supplierModelId: modelId, inputPrice: '-2', outputPrice: '8' },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).code).not.toBe('PRICE_UNIT_SUSPECT');
    });

    it('0 → 400 参数非法', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/pricing',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { supplierModelId: modelId, inputPrice: '0', outputPrice: '8' },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).code).not.toBe('PRICE_UNIT_SUSPECT');
    });
  });

  // ═══════════════════════════════════════
  // 3. PUT 更新单位校验
  // ═══════════════════════════════════════

  describe('PUT /api/v1/admin/pricing/:id — 更新单位校验', () => {
    it('未登录 → 401', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/pricing/${pricingId}`,
        payload: { inputPrice: '2', outputPrice: '8' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('非 admin（customer）→ 403', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/pricing/${pricingId}`,
        headers: { authorization: `Bearer ${customerToken}` },
        payload: { inputPrice: '2', outputPrice: '8' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('合法单价（input=2, output=8）→ 200', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/pricing/${pricingId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { inputPrice: '2', outputPrice: '8' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.pricing.inputPrice).toBe('2');
      expect(body.pricing.outputPrice).toBe('8');
    });

    it('疑似 ¥/M（input=2000, output=8000）→ 400 PRICE_UNIT_SUSPECT', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/pricing/${pricingId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { inputPrice: '2000', outputPrice: '8000' },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('PRICE_UNIT_SUSPECT');
      expect(body.message).toContain('¥/M');
    });

    it('新字段名 input_price_per_1k 疑似 ¥/M（2000）→ 400 PRICE_UNIT_SUSPECT', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/pricing/${pricingId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { input_price_per_1k: '2000', output_price_per_1k: '8000' },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).code).toBe('PRICE_UNIT_SUSPECT');
    });

    it('边界：10 → 200、10.01 → 400 PRICE_UNIT_SUSPECT', async () => {
      const okRes = await app.inject({
        method: 'PUT', url: `/api/v1/admin/pricing/${pricingId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { input_price_per_1k: '10', output_price_per_1k: '8' },
      });
      expect(okRes.statusCode).toBe(200);

      const badRes = await app.inject({
        method: 'PUT', url: `/api/v1/admin/pricing/${pricingId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { input_price_per_1k: '10.01', output_price_per_1k: '8' },
      });
      expect(badRes.statusCode).toBe(400);
      expect(JSON.parse(badRes.payload).code).toBe('PRICE_UNIT_SUSPECT');
    });

    it('非数字 / 负数 / 0 → 400 参数非法', async () => {
      for (const bad of [
        { inputPrice: 'abc', outputPrice: '8' },
        { inputPrice: '-2', outputPrice: '8' },
        { inputPrice: '2', outputPrice: '0' },
      ]) {
        const res = await app.inject({
          method: 'PUT', url: `/api/v1/admin/pricing/${pricingId}`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: bad,
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.payload).code).not.toBe('PRICE_UNIT_SUSPECT');
      }
    });

    it('只改 status（不动价格）→ 200，价格字段不受校验影响', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/pricing/${pricingId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'active' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.pricing.status).toBe('active');
      expect(body.pricing.inputPrice).toBe('10'); // 上一步边界用例写入的值未被破坏
    });
  });
});
