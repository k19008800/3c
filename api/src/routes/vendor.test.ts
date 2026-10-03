/**
 * 渠道自助门户端点集成测试 — /api/v1/vendor/*（SPEC §25）
 *
 * 真实 PG（threecloud_v3）+ 独立 vendor 令牌（purpose='vendor'），afterAll 清理。
 * 风格对齐 me-agent.test.ts。
 *
 * 覆盖主流程：登录 → 仪表盘 → 查看结算 → 发起结算申请 → 重复申请 409 → 公告 → 模型列表。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { vendorRoutes } from './vendor.js';

process.env.JWT_SECRET = 'test-vendor-secret';

const ts = Date.now();

let supplierId = 0;
let vendorAccountId = 0;
let settlementId = 0;
let token = '';

let app: FastifyInstance;

function buildTestApp(): FastifyInstance {
  const instance = Fastify({ logger: false });
  instance.setErrorHandler((err: any, _request, reply) => {
    const status = Number(err?.statusCode) || 500;
    reply.code(status).send({ code: status, message: err?.message ?? 'Internal Server Error', errorCode: err?.code });
  });
  vendorRoutes(instance);
  return instance;
}

function auth(t: string) {
  return { authorization: `Bearer ${t}` };
}

beforeAll(async () => {
  app = buildTestApp();

  // 1) 供应商
  const [sup] = await db.insert(schema.suppliers).values({
    name: `VendorTest-${ts}`, code: `VT${ts}`, baseUrl: 'https://vendor.test', status: 'active',
  }).returning({ id: schema.suppliers.id });
  supplierId = sup!.id;

  // 2) 渠道登录账号（密码 password123）
  const [acc] = await db.insert(schema.vendorAccounts).values({
    supplierId, email: `vendor-${ts}@test.com`, passwordHash: bcrypt.hashSync('password123', 12), status: 'active',
  }).returning({ id: schema.vendorAccounts.id });
  vendorAccountId = acc!.id;

  // 3) 一张待结算单 ¥600（generated = 未打款，计入 pending）
  const [sett] = await db.insert(schema.vendorSettlements).values({
    supplierId, period: '2099-01', totalAmount: '600.0000', itemCount: 1, status: 'generated',
  }).returning({ id: schema.vendorSettlements.id });
  settlementId = sett!.id;

  // 4) 一条广播公告 + 一条本渠道专属公告
  await db.insert(schema.vendorNotifications).values([
    { supplierId: null, title: '平台维护通知', content: '本周六凌晨维护', category: 'maintenance', priority: 'high', isPinned: true },
    { supplierId, title: '专属结算提醒', content: '您本期待结算 ¥600', category: 'general', priority: 'normal' },
  ]);

  // 5) 一个本渠道模型
  await db.insert(schema.supplierModels).values({
    supplierId, modelName: 'test-model', platformModel: 'test-model', status: 'active',
  });
});

afterAll(async () => {
  await db.delete(schema.vendorSettlementRequests).where(eq(schema.vendorSettlementRequests.supplierId, supplierId));
  await db.delete(schema.vendorNotifications).where(eq(schema.vendorNotifications.supplierId, supplierId));
  await db.delete(schema.vendorNotifications).where(eq(schema.vendorNotifications.title, '平台维护通知'));
  await db.delete(schema.vendorSettlementItems).where(eq(schema.vendorSettlementItems.settlementId, settlementId));
  await db.delete(schema.vendorSettlements).where(eq(schema.vendorSettlements.id, settlementId));
  await db.delete(schema.supplierModels).where(eq(schema.supplierModels.supplierId, supplierId));
  await db.delete(schema.vendorAccounts).where(eq(schema.vendorAccounts.id, vendorAccountId));
  await db.delete(schema.suppliers).where(eq(schema.suppliers.id, supplierId));
  await app?.close();
});

describe('POST /vendor/auth/login', () => {
  it('密码错误 → 401', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/vendor/auth/login',
      payload: { email: `vendor-${ts}@test.com`, password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('正确凭据 → 200 + vendor token', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/vendor/auth/login',
      payload: { email: `vendor-${ts}@test.com`, password: 'password123' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.token).toBeTruthy();
    expect(body.data.vendor.supplier_id).toBe(supplierId);
    expect(body.data.vendor.email).toBe(`vendor-${ts}@test.com`);
    token = body.data.token;
  });
});

describe('vendor 鉴权隔离', () => {
  it('无 token 访问受保护端点 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/vendor/dashboard' });
    expect(res.statusCode).toBe(401);
  });

  it('用户 JWT（无 purpose=vendor）访问 vendor 端点 → 401', async () => {
    // 模拟一个普通用户令牌（无 purpose 字段）
    const jwt = await import('jsonwebtoken');
    const userToken = jwt.default.sign({ userId: 1, email: 'u@test.com', role: 'customer' }, process.env.JWT_SECRET!, { expiresIn: '5m' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/vendor/dashboard', headers: auth(userToken) });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /vendor/dashboard', () => {
  it('返回仪表盘字段，pending=¥600', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/vendor/dashboard', headers: auth(token) });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.supplier_name).toContain('VendorTest');
    expect(d.pending_settlement).toBeCloseTo(600);
    expect(d.min_settlement_amount).toBe(500);
    expect(d.model_count).toBeGreaterThanOrEqual(1);
    expect(d).toHaveProperty('this_month_consumption');
  });
});

describe('GET /vendor/settlements', () => {
  it('仅返回本渠道结算单，含 ¥600 那张', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/vendor/settlements?page=1&pageSize=20', headers: auth(token) });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.total).toBeGreaterThanOrEqual(1);
    const row = d.items.find((r: any) => r.id === settlementId);
    expect(row).toBeTruthy();
    expect(row.total_amount).toBeCloseTo(600);
    expect(row.status).toBe('generated');
  });
});

describe('POST /vendor/settlements/request（自助结算申请）', () => {
  it('首次申请 → 200，状态 pending', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/vendor/settlements/request', headers: auth(token), payload: {} });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.status).toBe('pending');
    expect(d.estimated_amount).toBeCloseTo(600);
  });

  it('重复申请（已有 pending）→ 409', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/vendor/settlements/request', headers: auth(token), payload: {} });
    expect(res.statusCode).toBe(409);
  });
});

describe('GET /vendor/notifications', () => {
  it('返回广播 + 专属公告，置顶优先', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/vendor/notifications?page=1&pageSize=20', headers: auth(token) });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.total).toBeGreaterThanOrEqual(2);
    const titles = d.items.map((n: any) => n.title);
    expect(titles).toContain('平台维护通知');
    expect(titles).toContain('专属结算提醒');
    // 置顶公告排最前
    expect(d.items[0].is_pinned).toBe(true);
  });
});

describe('GET /vendor/models', () => {
  it('返回本渠道模型列表', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/vendor/models', headers: auth(token) });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.total).toBeGreaterThanOrEqual(1);
    expect(d.items[0].model_name).toBe('test-model');
  });
});
