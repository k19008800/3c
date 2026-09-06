/**
 * Admin 竞品监控（A4）+ 模型市场复数路径（A5）路由集成测试 — 真实 PG + Redis
 *
 * 覆盖：
 *   - GET /admin/competitive/monitor           按模型聚合，展示 our + 竞品价格
 *   - GET /admin/competitive/monitor?model_type= 过滤
 *   - GET /admin/marketplace?keyword=         关键字过滤（模型名/供应商名）
 *   - GET /admin/marketplace?category=         分类过滤
 *   - 权限：customer → 403；无 token → 401
 *
 * @module routes/admin-competitive-marketplace.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, inArray } from 'drizzle-orm';
import { generateAccessToken } from '../services/auth/jwt.js';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-jwt-secret-competitive-marketplace',
  PORT: '3039',
  REDIS_URL: 'redis://localhost:6379',
};

describe('Admin 竞品监控 + 模型市场 API', () => {
  const ts = Date.now();
  let app: FastifyInstance;
  let adminToken: string;
  let customerToken: string;
  const MODEL = `race-${ts}`;
  const MODEL2 = `embed-${ts}`;
  let adminId = 0;
  let adminEmail = '';
  let supplierIds: number[] = [];
  let supplierModelIds: number[] = [];

  beforeAll(async () => {
    app = await buildApp({ envOverrides: testEnv });
    await app.ready();

    adminEmail = `cpt-admin-${ts}@test.com`;
    await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: adminEmail, password: 'Admin12345', name: 'CptAdmin' },
    });
    await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.email, adminEmail));
    const adminRow = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.email, adminEmail));
    adminId = adminRow[0]!.id;
    adminToken = generateAccessToken({ userId: adminId, email: adminEmail, role: 'admin' });

    const custEmail = `cpt-cust-${ts}@test.com`;
    await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: custEmail, password: 'Cust12345', name: 'CptCust' },
    });
    const custRow = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.email, custEmail));
    customerToken = generateAccessToken({ userId: custRow[0]!.id, email: custEmail, role: 'customer' });

    // 供应商 A / B：同模型 MODEL 不同价格（A 便宜 0.10，B 贵 0.20）
    const inserted = await db.insert(schema.suppliers).values([
      { name: `RaceSupA-${ts}`, code: `racea-${ts}`, baseUrl: 'https://a.example.com', apiType: 'openai', status: 'active' },
      { name: `RaceSupB-${ts}`, code: `raceb-${ts}`, baseUrl: 'https://b.example.com', apiType: 'openai', status: 'active' },
    ]).returning({ id: schema.suppliers.id });
    const supAId = inserted[0]!.id;
    const supBId = inserted[1]!.id;
    supplierIds = [supAId, supBId];

    const models = await db.insert(schema.supplierModels).values([
      { supplierId: supAId, modelName: MODEL, platformModel: `Race ${MODEL}`, inputPrice: '0.10', outputPrice: '0.30', status: 'active', capabilities: ['chat', 'text'], maxTokens: 8000, description: 'race model A' },
      { supplierId: supBId, modelName: MODEL, platformModel: `Race ${MODEL}`, inputPrice: '0.20', outputPrice: '0.40', status: 'active', capabilities: ['chat', 'text'], maxTokens: 8000, description: 'race model B' },
      { supplierId: supAId, modelName: MODEL2, platformModel: MODEL2, inputPrice: '0.05', outputPrice: '0.05', status: 'active', capabilities: ['embedding'], maxTokens: 4096, description: 'embedding model' },
    ]).returning({ id: schema.supplierModels.id });
    supplierModelIds = models.map((model) => model.id);
    await db.insert(schema.vendorPricing).values([
      { supplierModelId: models[0]!.id, pricingGroup: 'default', inputPrice: '0.10', outputPrice: '0.30', status: 'active' },
      { supplierModelId: models[1]!.id, pricingGroup: 'default', inputPrice: '0.20', outputPrice: '0.40', status: 'active' },
      { supplierModelId: models[2]!.id, pricingGroup: 'default', inputPrice: '0.05', outputPrice: '0.05', status: 'active' },
    ]);
  });

  afterAll(async () => {
    await app.close();
    const modelIds = supplierModelIds;
    if (modelIds.length > 0) {
      await db.delete(schema.vendorPricing).where(inArray(schema.vendorPricing.supplierModelId, modelIds));
      await db.delete(schema.supplierModels).where(inArray(schema.supplierModels.id, modelIds));
    }
    for (const id of supplierIds) await db.delete(schema.suppliers).where(eq(schema.suppliers.id, id));
    const usersToDelete = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.email, adminEmail));
    for (const u of usersToDelete) await db.delete(schema.users).where(eq(schema.users.id, u.id));
    await db.delete(schema.users).where(eq(schema.users.email, `cpt-cust-${ts}@test.com`));
  });

  function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  describe('A4 competitive monitor', () => {
    it('GET /admin/competitive/monitor — 按模型聚合，our=最低价、竞品价填充', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/competitive/monitor', headers: auth(adminToken) });
      expect(res.statusCode).toBe(200);
      const { list } = res.json().data;
      const item = list.find((r: any) => r.model_name === MODEL);
      expect(item).toBeDefined();
      expect(item.our_price).toBe(0.10);      // 最低价
      expect(item.competitor_lowest).toBe(0.20); // 其余渠道最低
      // A/B 两个价：our=0.10 排除后，竞品应有 0.20
      expect([item.comp_a_price, item.comp_b_price, item.comp_c_price]).toContain(0.20);
      expect(typeof item.id).toBe('number');
      expect(typeof item.model_name).toBe('string');
    });

    it('GET /admin/competitive/monitor?model_type=embedding — 过滤出 embedding 模型', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/admin/competitive/monitor?model_type=embedding`, headers: auth(adminToken) });
      expect(res.statusCode).toBe(200);
      const { list } = res.json().data;
      const embed = list.find((r: any) => r.model_name === MODEL2);
      expect(embed).toBeDefined();
      expect(embed.our_price).toBe(0.05);
    });
  });

  describe('A5 admin/marketplace（复数路径）', () => {
    it('GET /admin/marketplace — 返回卡片列表（含 vendor/sell price）', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/marketplace', headers: auth(adminToken) });
      expect(res.statusCode).toBe(200);
      const { list } = res.json().data;
      const item = list.find((m: any) => m.model_name === MODEL && m.vendor_name === `RaceSupA-${ts}`);
      expect(item).toBeDefined();
      expect(item.display_name).toBe(`Race ${MODEL}`);
      expect(item.vendor_name).toContain('RaceSup');
      expect(item.sell_input_price).toBe(0.10);
      expect(item.sell_output_price).toBe(0.30);
      expect(item.status).toBe('active');
      expect(Array.isArray(item.tags)).toBe(true);
    });

    it('GET /admin/marketplace?keyword= — 按供应商名过滤', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/admin/marketplace?keyword=${encodeURIComponent(`RaceSupA-${ts}`)}`, headers: auth(adminToken) });
      const { list } = res.json().data;
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((m: any) => m.vendor_name === `RaceSupA-${ts}`)).toBe(true);
    });

    it('GET /admin/marketplace?category= — 按分类过滤', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/admin/marketplace?category=embedding`, headers: auth(adminToken) });
      const { list } = res.json().data;
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((m: any) => m.category === 'embedding' || m.model_name === MODEL2)).toBe(true);
    });
  });

  describe('权限', () => {
    it('customer 访问 → 403', async () => {
      for (const url of ['/api/v1/admin/competitive/monitor', '/api/v1/admin/marketplace']) {
        const res = await app.inject({ method: 'GET', url, headers: auth(customerToken) });
        expect(res.statusCode).toBe(403);
      }
    });
    it('无 token → 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/competitive/monitor' });
      expect(res.statusCode).toBe(401);
    });
  });
});