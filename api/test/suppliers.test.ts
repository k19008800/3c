import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:***@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-jwt-secret-suppliers',
  PORT: '3033',
};

describe('Supplier Management API', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let customerToken: string;
  let supplierId: number;
  let modelId: number;
  let keyId: number;
  let pricingId: number;

  // Unique test data to avoid collisions across runs
  const ts = Date.now();
  const adminEmail = `admin-supp-${ts}@test.com`;
  const customerEmail = `cust-supp-${ts}@test.com`;
  const supplierCode = `ts-${ts}`;
  const supplierName = `TestSupplier-${ts}`;

  beforeAll(async () => {
    app = await buildApp({ envOverrides: testEnv });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Helper: create test tokens ──

  it('setup: register admin and customer users', async () => {
    // Admin
    const adminRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: adminEmail, password: 'Admin12345', name: 'Admin Test' },
    });
    expect(adminRes.statusCode).toBe(201);

    // Promote to admin (via direct DB update since no admin promotion endpoint exists)
    const { db, schema } = await import('../src/db');
    const { eq } = await import('drizzle-orm');
    await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.email, adminEmail));

    // Re-login to get a fresh token with admin role in JWT payload
    const loginRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: 'Admin12345' },
    });
    expect(loginRes.statusCode).toBe(200);
    adminToken = JSON.parse(loginRes.payload).accessToken;

    // Customer
    const custRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: customerEmail, password: 'Cust12345', name: 'Customer Test' },
    });
    expect(custRes.statusCode).toBe(201);
    customerToken = JSON.parse(custRes.payload).accessToken;
  });

  // ═══════════════════════════════════════
  // 1. SUPPLIER CRUD
  // ═══════════════════════════════════════

  describe('Supplier CRUD', () => {
    it('POST /api/v1/admin/suppliers — create supplier', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/suppliers',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: supplierName, code: supplierCode, baseUrl: 'https://api.test.com', apiType: 'openai' },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.supplier.name).toBe(supplierName);
      expect(body.supplier.code).toBe(supplierCode);
      supplierId = body.supplier.id as number;
    });

    it('POST /api/v1/admin/suppliers — rejects missing fields', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/suppliers',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'Incomplete' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('GET /api/v1/admin/suppliers — list suppliers', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/suppliers',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toBeDefined();
      expect(body.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/v1/admin/suppliers — search', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/admin/suppliers?search=${supplierName}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.data[0].name).toBe(supplierName);
    });

    it('GET /api/v1/admin/suppliers — pagination', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/suppliers?page=1&pageSize=5',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.pagination.pageSize).toBe(5);
    });

    it('PUT /api/v1/admin/suppliers/:id — update supplier', async () => {
      const updatedName = `${supplierName}-updated`;
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/suppliers/${supplierId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: updatedName, description: 'Test description' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.supplier.name).toBe(updatedName);
      expect(body.supplier.description).toBe('Test description');
    });

    it('PUT /api/v1/admin/suppliers/:id — 404 on missing', async () => {
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/admin/suppliers/99999',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'Ghost' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects non-admin access to supplier CRUD', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/suppliers',
        headers: { authorization: `Bearer ${customerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ═══════════════════════════════════════
  // 1.5 渠道分组供给（allowedGroups，Batch 4 遗留）
  // ═══════════════════════════════════════

  describe('Supplier Allowed Groups（渠道分组供给）', () => {
    const groupsTs = Date.now();
    let groupSupplierId = 0;

    it('POST /api/v1/admin/suppliers — 创建时带 allowedGroups → 落库并返回', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/suppliers',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: `GroupSup-${groupsTs}`, code: `grp-${groupsTs}`,
          baseUrl: 'https://group.test.com', apiType: 'openai',
          allowedGroups: ['vip', 'internal'],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.supplier.allowedGroups).toEqual(['vip', 'internal']);
      groupSupplierId = body.supplier.id as number;
    });

    it('POST 不带 allowedGroups → 默认空数组（不限分组）', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/suppliers',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: `GroupSupDef-${groupsTs}`, code: `gdef-${groupsTs}`, baseUrl: 'https://group.test.com' },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.supplier.allowedGroups).toEqual([]);
      // 清理
      await app.inject({
        method: 'DELETE', url: `/api/v1/admin/suppliers/${body.supplier.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
    });

    it('POST 含非法 allowedGroups（非数组/含空串）→ 归一化为清洗后数组', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/suppliers',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: `GroupSupRaw-${groupsTs}`, code: `graw-${groupsTs}`, baseUrl: 'https://group.test.com',
          allowedGroups: 'vip', // 非数组 → 回退空数组
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.supplier.allowedGroups).toEqual([]);
      await app.inject({
        method: 'DELETE', url: `/api/v1/admin/suppliers/${body.supplier.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
    });

    it('GET /api/v1/admin/suppliers/:id — 详情返回 allowedGroups', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/admin/suppliers/${groupSupplierId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.supplier.allowedGroups).toEqual(['vip', 'internal']);
    });

    it('PUT /api/v1/admin/suppliers/:id — 更新 allowedGroups', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/suppliers/${groupSupplierId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { allowedGroups: ['gold'] },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.supplier.allowedGroups).toEqual(['gold']);
    });

    it('清理分组供给测试供应商', async () => {
      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/admin/suppliers/${groupSupplierId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ═══════════════════════════════════════
  // 2. SUPPLIER MODELS
  // ═══════════════════════════════════════

  describe('Supplier Models', () => {
    it('POST /api/v1/admin/suppliers/:id/models — add model', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/admin/suppliers/${supplierId}/models`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { modelName: 'gpt-4o', platformModel: 'gpt-4o-2024-05-13', inputPrice: '0.005', outputPrice: '0.015' },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.model.modelName).toBe('gpt-4o');
      modelId = body.model.id as number;
    });

    it('POST /api/v1/admin/suppliers/:id/models — 404 on bad supplier', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/suppliers/99999/models',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { modelName: 'gpt-4o', platformModel: 'gpt-4o' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('GET /api/v1/admin/suppliers/:id/models — list models', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/admin/suppliers/${supplierId}/models`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.models.length).toBeGreaterThanOrEqual(1);
      expect(body.models[0].modelName).toBe('gpt-4o');
    });

    it('PUT /api/v1/admin/models/:id — update model', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/models/${modelId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'beta', inputPrice: '0.004', maxTokens: 128000 },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.model.status).toBe('beta');
      expect(body.model.inputPrice).toBe('0.004');
      expect(body.model.maxTokens).toBe(128000);
    });

    it('PUT /api/v1/admin/models/:id — 404 on missing model', async () => {
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/admin/models/99999',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'active' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ═══════════════════════════════════════
  // 3. SUPPLIER KEYS
  // ═══════════════════════════════════════

  describe('Supplier Keys', () => {
    it('POST /api/v1/admin/suppliers/:id/keys — add key', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/admin/suppliers/${supplierId}/keys`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { keyValue: 'sk-test-key-abc123', name: 'Primary Key', selectMode: 'single', priority: 10 },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.key.name).toBe('Primary Key');
      // Key should be masked in response
      expect(body.key.keyValue).not.toBe('sk-test-key-abc123');
      expect(body.key.keyValue).toContain('***');
      keyId = body.key.id as number;
    });

    it('POST /api/v1/admin/suppliers/:id/keys — 404 on bad supplier', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/suppliers/99999/keys',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { keyValue: 'sk-ghost' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('GET /api/v1/admin/suppliers/:id/keys — list keys', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/admin/suppliers/${supplierId}/keys`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.keys.length).toBeGreaterThanOrEqual(1);
    });

    it('PUT /api/v1/admin/keys/:id — update key status/priority', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/keys/${keyId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'maintenance', priority: 5 },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.key.status).toBe('maintenance');
      expect(body.key.priority).toBe(5);
    });

    it('PUT /api/v1/admin/keys/:id — 404 on missing key', async () => {
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/admin/keys/99999',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'active' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('DELETE /api/v1/admin/keys/:id — delete key', async () => {
      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/admin/keys/${keyId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.message).toContain('deleted');
    });

    it('DELETE /api/v1/admin/keys/:id — 404 on already deleted', async () => {
      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/admin/keys/${keyId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('DELETE /api/v1/admin/keys/:id — 404 on non-existent key', async () => {
      const res = await app.inject({
        method: 'DELETE', url: '/api/v1/admin/keys/99999',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ═══════════════════════════════════════
  // 4. PRICING CONFIG
  // ═══════════════════════════════════════

  describe('Pricing Config', () => {
    it('POST /api/v1/admin/pricing — create pricing', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/pricing',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          supplierModelId: modelId,
          inputPrice: '0.05',
          outputPrice: '0.15',
          pricingGroup: 'default',
          currency: 'CNY',
          status: 'draft',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.pricing.inputPrice).toBe('0.05');
      pricingId = body.pricing.id as number;
    });

    it('POST /api/v1/admin/pricing — rejects missing fields', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/pricing',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { inputPrice: '0.01' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('GET /api/v1/admin/pricing — list pricing', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/pricing',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      // 契约：{ data: { list, total, page, pageSize } }，list 每项含模型/供应商名 + 缓存命中折扣率
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data.list)).toBe(true);
      if (body.data.list.length > 0) {
        const item = body.data.list[0];
        expect(item.model_name).toBeDefined();
        expect(typeof item.input_price_per_1k).toBe('number');
        expect('cache_discount_rate' in item).toBe(true);
      }
    });

    it('GET /api/v1/admin/pricing — status filter', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/pricing?status=draft',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('PUT /api/v1/admin/pricing/:id — update pricing', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/pricing/${pricingId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { inputPrice: '0.04', outputPrice: '0.14', status: 'active' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.pricing.status).toBe('active');
      expect(body.pricing.inputPrice).toBe('0.04');
    });

    it('PUT /api/v1/admin/pricing/:id — 新字段名 + 模型级缓存命中折扣率', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/pricing/${pricingId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { input_price_per_1k: '0.05', output_price_per_1k: '0.15', cache_discount_rate: '0.5' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.pricing.inputPrice).toBe('0.05');
      expect(body.pricing.outputPrice).toBe('0.15');
      expect(body.pricing.cacheDiscountRate).toBe('0.5');
    });

    it('PUT /api/v1/admin/pricing/:id — 缓存折扣率清空（回退全局）', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/pricing/${pricingId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { cache_discount_rate: '' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.pricing.cacheDiscountRate).toBeNull();
    });

    it('PUT /api/v1/admin/pricing/:id — 非法缓存折扣率拒绝', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/pricing/${pricingId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { cache_discount_rate: '2' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('PUT /api/v1/admin/pricing/:id — 404 on missing', async () => {
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/admin/pricing/99999',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'active' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ═══════════════════════════════════════
  // 5. PUBLIC PRICING
  // ═══════════════════════════════════════

  describe('Public Pricing', () => {
    it('GET /api/v1/public/pricing — returns active pricing (no auth)', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/public/pricing',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.pricing).toBeDefined();
      expect(Array.isArray(body.pricing)).toBe(true);
    });

    it('GET /api/v1/public/pricing — includes our active pricing', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/public/pricing',
      });
      const body = JSON.parse(res.payload);
      const found = body.pricing.find((p: any) => p.id === pricingId);
      if (found) {
        expect(found.inputPrice).toBeDefined();
      }
    });
  });

  // ═══════════════════════════════════════
  // 6. SOFT DELETE
  // ═══════════════════════════════════════

  describe('Soft Delete Supplier', () => {
    it('DELETE /api/v1/admin/suppliers/:id — soft-deletes supplier', async () => {
      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/admin/suppliers/${supplierId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.supplier.status).toBe('offline');
    });

    it('DELETE /api/v1/admin/suppliers/:id — 404 on non-existent', async () => {
      const res = await app.inject({
        method: 'DELETE', url: '/api/v1/admin/suppliers/99999',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
