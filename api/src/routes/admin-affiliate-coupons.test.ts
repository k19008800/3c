/**
 * Admin 推广返利（A3）+ 兑换码（A6）路由集成测试 — 真实 PG + Redis
 *
 * 覆盖：
 *   - GET /admin/affiliate/config  默认值
 *   - PUT /admin/affiliate/config  持久化 + 校验 + 审计；impersonation 令牌 → 403
 *   - GET /admin/affiliate/records 邀请记录（返佣金额/状态）
 *   - GET /admin/coupons           批次列表（search 过滤、字段齐全）
 *   - POST /admin/coupons/generate 创建批次并生成 total_count 个码（201 + 审计）
 *   - 权限：非 admin → 403；无 token → 401
 *
 * @module routes/admin-affiliate-coupons.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, like, and, inArray } from 'drizzle-orm';
import { generateAccessToken } from '../services/auth/jwt.js';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-jwt-secret-affiliate-coupons',
  PORT: '3038',
  REDIS_URL: 'redis://localhost:6379',
};

const COUPON_TYPE_LABEL: Record<string, string> = {
  flat: '直减',
  threshold: '满减',
  percent: '折扣',
};

describe('Admin 推广返利 + 兑换码 API', () => {
  const ts = Date.now();
  let app: FastifyInstance;
  let adminToken: string;
  let adminId = 0;
  let customerToken: string;
  let adminEmail = '';
  let agentUserId = 0;
  let agencyId = 0;

  beforeAll(async () => {
    app = await buildApp({ envOverrides: testEnv });
    await app.ready();

    // 管理员
    adminEmail = `aac-admin-${ts}@test.com`;
    await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: adminEmail, password: 'Admin12345', name: 'AacAdmin' },
    });
    await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.email, adminEmail));
    const adminRow = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.email, adminEmail));
    adminId = adminRow[0]!.id;
    adminToken = generateAccessToken({ userId: adminId, email: adminEmail, role: 'admin' });

    // 普通客户（403 权限用例）
    const custEmail = `aac-cust-${ts}@test.com`;
    await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: custEmail, password: 'Cust12345', name: 'AacCust' },
    });
    const custRow = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.email, custEmail));
    customerToken = generateAccessToken({ userId: custRow[0]!.id, email: custEmail, role: 'customer' });

    // 邀请人（agent）与被邀请人（普通用户），用于 records 用例
    const inviterEmail = `aac-inviter-${ts}@test.com`;
    const inviteeEmail = `aac-invitee-${ts}@test.com`;
    await db.insert(schema.users).values([
      { email: inviterEmail, passwordHash: 'x', name: '邀请人甲', role: 'agent', status: 'active' },
      { email: inviteeEmail, passwordHash: 'x', name: '被邀乙', role: 'customer', status: 'active' },
    ]).returning({ id: schema.users.id });
    const inviterRow = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.email, inviterEmail));
    const inviteeRow = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.email, inviteeEmail));
    agentUserId = inviterRow[0]!.id;

    // 创建代理（agent_id），并建立邀请码 → usedBy=invitee
    const [agent] = await db.insert(schema.agents).values({
      userId: agentUserId, level: 'junior', commissionRate: '10.00', status: 'active',
    }).returning({ id: schema.agents.id });
    agencyId = agent!.id;
    await db.insert(schema.agentInvitations).values({ agentId: agencyId, code: `AAC-${ts}`, status: 'active' })
      .returning({ id: schema.agentInvitations.id });
    const invRow = await db.select({ id: schema.agentInvitations.id }).from(schema.agentInvitations)
      .where(eq(schema.agentInvitations.agentId, agencyId));
    await db.update(schema.agentInvitations)
      .set({ usedBy: inviteeRow[0]!.id, status: 'disabled', usedAt: new Date() })
      .where(eq(schema.agentInvitations.id, invRow[0]!.id));
    // 一笔 settled 返佣（金额 12.34 元；agent_commissions.agentId=agencyId, customer=invitee）
    await db.insert(schema.agentCommissions).values({
      agentId: agencyId, customerUserId: inviteeRow[0]!.id, amount: '12.34', rate: '10.00', status: 'settled', settledAt: new Date(),
    });
  });

  afterAll(async () => {
    await app.close();
    // 清理
    const usersToDelete = await db.select({ id: schema.users.id }).from(schema.users)
      .where(and(
        like(schema.users.email, `aac-%${ts}@test.com`),
        // 仅本测试创建的
        eq(schema.users.id, schema.users.id),
      ));
    const ids = usersToDelete.map((u) => u.id);
    if (ids.length > 0) {
      await db.delete(schema.auditLogs).where(and(
        eq(schema.auditLogs.userId, adminId),
      ));
      await db.delete(schema.couponCodes).where(like(schema.couponCodes.batchName, `批次-${ts}%`));
      await db.delete(schema.agentCommissions).where(eq(schema.agentCommissions.agentId, agencyId));
      await db.delete(schema.agentInvitations).where(eq(schema.agentInvitations.agentId, agencyId));
      await db.delete(schema.agents).where(eq(schema.agents.id, agencyId));
      await db.delete(schema.users).where(inArray(schema.users.id, ids));
    }
    // 清理配置键
    await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, 'affiliate_config'));
  });

  function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  describe('A3 affiliate config', () => {
    it('GET /admin/affiliate/config — 无配置返回默认值', async () => {
      await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, 'affiliate_config'));
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/affiliate/config', headers: auth(adminToken) });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({
        enabled: false, reward_type: 'fixed', reward_value: 10, reward_cap: 0, cookie_days: 30,
      });
    });

    it('PUT /admin/affiliate/config — 持久化 + 写审计 + 回读生效', async () => {
      const payload = { enabled: true, reward_type: 'percentage', reward_value: 5, reward_cap: 1000, cookie_days: 45 };
      const res = await app.inject({ method: 'PUT', url: '/api/v1/admin/affiliate/config', headers: auth(adminToken), payload });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual(payload);

      // 回读
      const get = await app.inject({ method: 'GET', url: '/api/v1/admin/affiliate/config', headers: auth(adminToken) });
      expect(get.json().data).toEqual(payload);

      // 审计写入
      const audit = await db.select({ id: schema.auditLogs.id }).from(schema.auditLogs)
        .where(and(eq(schema.auditLogs.action, 'affiliate.config.update'), eq(schema.auditLogs.userId, adminId)));
      expect(audit.length).toBeGreaterThan(0);
    });

    it('PUT /admin/affiliate/config — 非法 reward_type → 400', async () => {
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/admin/affiliate/config', headers: auth(adminToken),
        payload: { enabled: true, reward_type: 'bogus', reward_value: 1 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('PUT /admin/affiliate/config — 模拟身份令牌 → 403 (requireNotImpersonated)', async () => {
      const impToken = generateAccessToken({
        userId: adminId, email: adminEmail, role: 'admin',
        impersonateBy: { adminId, adminEmail },
      });
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/admin/affiliate/config', headers: auth(impToken),
        payload: { enabled: true, reward_type: 'fixed', reward_value: 10 },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('A3 affiliate records', () => {
    it('GET /admin/affiliate/records — 返回邀请/返佣记录', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/affiliate/records', headers: auth(adminToken) });
      expect(res.statusCode).toBe(200);
      const { list } = res.json().data;
      // 我们的测试邀请（有被邀请人）应在其中
      const item = list.find((r: any) => r.inviter_id === agentUserId);
      expect(item).toBeDefined();
      expect(item.inviter_name).toBe('邀请人甲');
      expect(item.invitee_name).toBe('被邀乙');
      expect(item.reward_amount).toBe(1234); // 12.34 元 × 100
      expect(item.status).toBe('credited');   // settled → credited
    });
  });

  describe('A6 coupons', () => {
    it('GET /admin/coupons — 空库返回空列表', async () => {
      // 清理本测试历史批次 + 其他测试（me-endpoints P1-1 test batch / drill-batch / 批次-*）遗留，
      // 保证全局 coupon_codes 列表为空，断言不依赖测试执行顺序
      await db.delete(schema.campaignCouponCodes).where(inArray(
        schema.campaignCouponCodes.campaignId,
        (await db.select({ id: schema.couponCodes.id }).from(schema.couponCodes)
          .where(like(schema.couponCodes.batchName, `批次-${ts}%`))).map((r) => r.id),
      ));
      await db.delete(schema.campaignCouponCodes).where(inArray(
        schema.campaignCouponCodes.campaignId,
        (await db.select({ id: schema.couponCodes.id }).from(schema.couponCodes)
          .where(inArray(schema.couponCodes.batchName, ['P1-1 test batch']))).map((r) => r.id),
      ));
      await db.delete(schema.couponCodes).where(like(schema.couponCodes.batchName, `批次-${ts}%`));
      await db.delete(schema.couponCodes).where(inArray(schema.couponCodes.batchName, ['P1-1 test batch']));
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/coupons', headers: auth(adminToken) });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.list).toEqual([]);
    });

    it('POST /admin/coupons/generate — 创建批次 + 生成码 + 写入审计', async () => {
      const payload = { batch_name: `批次-${ts}`, type: 'percent', value: 8, total_count: 10, expires_at: null };
      const res = await app.inject({ method: 'POST', url: '/api/v1/admin/coupons/generate', headers: auth(adminToken), payload });
      expect(res.statusCode).toBe(201);
      const data = res.json().data;
      expect(data.batch.batch_name).toBe(`批次-${ts}`);
      expect(data.batch.type).toBe('percent');
      expect(data.batch.type_label).toBe('折扣');
      expect(data.batch.value).toBe(8);
      expect(data.batch.total_count).toBe(10);
      expect(data.batch.redeemed_count).toBe(0);

      // 确认生成的码数量
      const batchRow = await db.select({ id: schema.couponCodes.id }).from(schema.couponCodes)
        .where(eq(schema.couponCodes.batchName, `批次-${ts}`));
      expect(batchRow.length).toBe(1);
      const codes = await db.select({ id: schema.campaignCouponCodes.id }).from(schema.campaignCouponCodes)
        .where(eq(schema.campaignCouponCodes.campaignId, batchRow[0]!.id));
      expect(codes.length).toBe(10);

      // 审计
      const audit = await db.select({ id: schema.auditLogs.id }).from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, 'coupon.batch.create'));
      expect(audit.length).toBeGreaterThan(0);
    });

    it('GET /admin/coupons — 列表含生成批次 + search 过滤', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/admin/coupons?search=${encodeURIComponent(`批次-${ts}`)}`, headers: auth(adminToken) });
      expect(res.statusCode).toBe(200);
      const { list } = res.json().data;
      expect(list.length).toBeGreaterThan(0);
      expect(list[0].batch_name).toBe(`批次-${ts}`);
      expect(list[0].type_label).toBe(COUPON_TYPE_LABEL['percent']);
      expect(typeof list[0].batch_code).toBe('string');

      const miss = await app.inject({ method: 'GET', url: `/api/v1/admin/coupons?search=nonexistent-${ts}`, headers: auth(adminToken) });
      expect(miss.json().data.list).toEqual([]);
    });

    it('POST /admin/coupons/generate — 无名称 → 400', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/coupons/generate', headers: auth(adminToken),
        payload: { batch_name: '', type: 'flat', value: 1, total_count: 1 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('权限', () => {
    it('customer 访问 affiliate/coupons → 403', async () => {
      for (const url of ['/api/v1/admin/affiliate/config', '/api/v1/admin/coupons']) {
        const res = await app.inject({ method: 'GET', url, headers: auth(customerToken) });
        expect(res.statusCode).toBe(403);
      }
    });
    it('无 token → 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/coupons' });
      expect(res.statusCode).toBe(401);
    });
  });
});