/**
 * 客服辅助 + 业务员支撑 路由测试（admin-support-extra.ts / me-sales.ts）
 *
 * 覆盖 gap-fix-spec-2026-08-18 §8/§9 与任务清单：
 *   - 未登录 → 401；非 sales/admin → 403
 *   - 业务员客户列表 / 详情 / 写联系记录 / 改标签 / 改状态
 *   - 跟进提醒 CRUD（新增 / complete / ignore）
 *   - 业绩看板（customers / revenue / rank）
 *   - 客服诊断（user / recent_calls / errors / key_status / balance_alert）
 *   - 意图识别（intent / confidence / suggested_reply）
 *   - 测试 Key 生成 / 撤销（+ 写操作 audit 留痕）
 *
 * 策略：mock ../db（内存假 DB，见 helpers/fake-db.ts）+ mock jwt verifyToken，
 * 用 Fastify app.inject 冒烟，无需真实 PG。
 *
 * @module routes/sales-support.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import Fastify from 'fastify';

vi.mock('../services/auth/jwt', () => ({
  verifyToken: (token: string) => {
    if (!token) return null;
    try {
      return JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  },
}));

vi.mock('../db', async () => {
  const schemaModule = await import('../db/schema/index');
  const { createFakeDb } = await import('./helpers/fake-db');
  const db = createFakeDb(schemaModule);
  return { db, schema: schemaModule };
});

import { db, schema } from '../db';
import { adminSupportExtraRoutes } from './admin-support-extra';
import { meSalesRoutes } from './me-sales';

/**
 * 测试用假 DB 的辅助方法（运行时由 vi.mock 注入；类型上绕过真实 drizzle 实例，
 * 仅测试文件使用 __seed/__rows/__reset）。
 */
const fakeDb = db as unknown as {
  __seed: (table: any, rows: Record<string, any>[]) => void;
  __rows: (table: any) => Record<string, any>[];
  __reset: () => void;
};

/* ───────── 工具 ───────── */

/** 生成测试 JWT（payload 直接 base64url 编码，verifyToken mock 原样解析） */
const token = (payload: Record<string, unknown>) => Buffer.from(JSON.stringify(payload)).toString('base64url');
const authHeader = (t: string) => ({ authorization: `Bearer ${t}` });

/** 角色令牌 */
const adminToken = token({ userId: 9, email: 'admin@3cloud.dev', role: 'admin' });
const superAdminToken = token({ userId: 99, email: 'root@3cloud.dev', role: 'super_admin' });
const salesToken = token({ userId: 1, email: 'sales@3cloud.dev', role: 'sales' });
const customerToken = token({ userId: 10, email: 'customer@test.com', role: 'customer' });

const now = new Date();
const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, 15, 10, 0, 0);
const remindAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 9, 0, 0);

/** 种子：销售 + 2 个客户 + 归属 + 余额 + 标签 + 消费 + 充值 + 提醒 + 工单 + 联系记录 */
function seedSalesScenario() {
  fakeDb.__seed(schema.users, [
    { id: 1, email: 'sales@3cloud.dev', name: '业务员张三', role: 'sales', status: 'active', customerType: 'personal', realNameStatus: 'verified', createdAt: now, updatedAt: now },
    { id: 10, email: 'c10@test.com', name: '客户十', role: 'customer', status: 'active', customerType: 'enterprise', realNameStatus: 'verified', createdAt: now, updatedAt: now, lastLoginAt: now },
    { id: 11, email: 'c11@test.com', name: '客户十一', role: 'customer', status: 'active', customerType: 'personal', realNameStatus: 'unverified', createdAt: now, updatedAt: now },
    { id: 12, email: 'c12@test.com', name: '待认领客户', role: 'customer', status: 'active', customerType: 'personal', realNameStatus: 'unverified', createdAt: now, updatedAt: now },
  ]);
  fakeDb.__seed(schema.agents, [
    { id: 5, userId: 1, level: 'junior', commissionRate: '0', status: 'active', createdAt: now, updatedAt: now },
  ]);
  fakeDb.__seed(schema.agentCustomers, [
    { id: 1, agentId: 5, customerUserId: 10, status: 'active', source: 'sales', createdAt: now },
    { id: 2, agentId: 5, customerUserId: 11, status: 'active', source: 'sales', createdAt: now },
  ]);
  fakeDb.__seed(schema.customerBalances, [
    { id: 1, userId: 10, totalBalance: '50', availableBalance: '50', frozenBalance: '0', createdAt: now, updatedAt: now },
    { id: 2, userId: 11, totalBalance: '5', availableBalance: '5', frozenBalance: '0', createdAt: now, updatedAt: now },
  ]);
  fakeDb.__seed(schema.customerTags, [
    { id: 1, salesUserId: 1, customerUserId: 10, tag: '高价值', createdAt: now },
    { id: 2, salesUserId: 1, customerUserId: 11, tag: '开发者', createdAt: now },
  ]);
  fakeDb.__seed(schema.consumptionRecords, [
    { id: 1, userId: 10, requestId: 'req-10-1', model: 'gpt-4o', inputTokens: 10, outputTokens: 20, totalTokens: 30, cost: '12.50', errorCode: null, createdAt: now },
    { id: 2, userId: 10, requestId: 'req-10-2', model: 'gpt-4o', inputTokens: 5, outputTokens: 10, totalTokens: 15, cost: '7.50', errorCode: 'rate_limit', createdAt: monthAgo },
    { id: 3, userId: 11, requestId: 'req-11-1', model: 'claude-3.5', inputTokens: 10, outputTokens: 10, totalTokens: 20, cost: '5.00', errorCode: null, createdAt: now },
  ]);
  fakeDb.__seed(schema.rechargeOrders, [
    { id: 1, userId: 10, orderNo: 'RO20260818001', amount: '100.00', method: 'alipay', status: 'paid', createdAt: now, updatedAt: now },
    { id: 2, userId: 11, orderNo: 'RO20260818002', amount: '50.00', method: 'wechat', status: 'pending', createdAt: now, updatedAt: now },
  ]);
  fakeDb.__seed(schema.followReminders, [
    { id: 1, salesUserId: 1, customerUserId: 10, content: '本周完成续费沟通', remindAt, status: 'completed', completedAt: now, createdAt: now },
    { id: 2, salesUserId: 1, customerUserId: 11, content: '确认试用反馈', remindAt, status: 'pending', completedAt: null, createdAt: now },
  ]);
  fakeDb.__seed(schema.tickets, [
    { id: 1, userId: 10, type: 'general', title: '咨询模型价格', content: 'xxx', status: 'open', priority: 'normal', createdAt: now, updatedAt: now },
    { id: 2, userId: 10, type: 'general', title: '余额疑问', content: 'yyy', status: 'resolved', priority: 'normal', createdAt: now, updatedAt: now },
  ]);
  fakeDb.__seed(schema.customerNotes, [
    { id: 1, salesUserId: 1, customerUserId: 10, channel: 'phone', content: '首次电话沟通，客户关注价格', nextFollowAt: remindAt, createdAt: now },
  ]);
}

/** 种子：诊断对象用户（消费/Key/余额） */
function seedDiagnoseUser() {
  fakeDb.__seed(schema.users, [
    { id: 50, email: 'diag@test.com', name: '诊断用户', role: 'customer', status: 'active', customerType: 'personal', realNameStatus: 'verified', createdAt: now, updatedAt: now },
  ]);
  fakeDb.__seed(schema.suppliers, [{ id: 7, name: 'OpenAI', status: 'active', createdAt: now, updatedAt: now }]);
  fakeDb.__seed(schema.customerBalances, [
    { id: 50, userId: 50, totalBalance: '50', availableBalance: '50', frozenBalance: '0', createdAt: now, updatedAt: now },
  ]);
  fakeDb.__seed(schema.apiKeys, [
    { id: 50, userId: 50, keyHash: 'h1', keyPrefix: 'sk_diag_', name: '诊断Key', status: 'active', lastUsedAt: now, createdAt: now, updatedAt: now },
  ]);
  fakeDb.__seed(schema.consumptionRecords, [
    { id: 100, userId: 50, requestId: 'req-d1', model: 'gpt-4o', inputTokens: 1, outputTokens: 1, totalTokens: 2, cost: '1.00', errorCode: '429', createdAt: now },
    { id: 101, userId: 50, requestId: 'req-d2', model: 'gpt-4o', inputTokens: 1, outputTokens: 1, totalTokens: 2, cost: '1.00', errorCode: '429', createdAt: now },
    { id: 102, userId: 50, requestId: 'req-d3', model: 'claude-3.5', inputTokens: 1, outputTokens: 1, totalTokens: 2, cost: '2.00', errorCode: null, createdAt: now },
  ]);
}

/** 构建带错误处理的测试 App（AppError.statusCode → HTTP 状态） */
async function makeApp() {
  const app = Fastify();
  app.setErrorHandler((err: any, _request, reply) => {
    const status = Number(err?.statusCode) || 500;
    reply.code(status).send({
      code: status,
      message: err?.message ?? 'Internal Server Error',
      error: { message: err?.message ?? 'Internal Server Error', type: err?.name ?? 'Error', code: err?.code ?? 'INTERNAL_ERROR' },
    });
  });
  await app.register(adminSupportExtraRoutes);
  await app.register(meSalesRoutes);
  return app;
}

beforeEach(() => {
  fakeDb.__reset();
});

/* ═══════════ 客服辅助（admin-support-extra.ts） ═══════════ */

describe('客服辅助 admin-support-extra', () => {
  it('未登录访问 admin 端点 → 401', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/support/test-keys' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('非 admin 访问 admin 端点 → 403', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/support/test-keys', headers: authHeader(customerToken) });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('客服诊断 → 200，结构含 user/recent_calls/errors/key_status/balance_alert', async () => {
    seedDiagnoseUser();
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/support/assist/diagnose/50',
      headers: authHeader(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe('diag@test.com');
    expect(data.user.name).toBe('诊断用户');
    expect(data.user.balance).toBe(50);
    expect(data.recent_calls).toHaveLength(3);
    expect(data.recent_calls[0]).toHaveProperty('model');
    expect(data.recent_calls[0]).toHaveProperty('status');
    expect(data.recent_calls[0]).toHaveProperty('cost');
    expect(data.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: '429', count: 2 })]),
    );
    expect(data.key_status).toHaveLength(1);
    expect(data.key_status[0].key_prefix).toBe('sk_diag_');
    expect(data.balance_alert).toBeNull(); // 余额 50 ≥ 阈值 10
    expect(data.analysis.total_calls).toBe(3);
    expect(data.analysis.failed_count).toBe(2);
    await app.close();
  });

  it('客服诊断：低余额 → balance_alert 非空', async () => {
    seedDiagnoseUser();
    fakeDb.__rows(schema.customerBalances)[0]!.availableBalance = '5';
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/support/assist/diagnose/50',
      headers: authHeader(superAdminToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.balance_alert).toBeTruthy();
    expect(res.json().data.balance_warning.note).toBeTruthy();
    await app.close();
  });

  it('意图识别 → 200，结构含 intent/confidence/suggested_reply', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/support/assist/intent',
      headers: authHeader(adminToken),
      payload: { text: '我想充值，余额不够用了' },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).toHaveProperty('intent');
    expect(data).toHaveProperty('confidence');
    expect(data).toHaveProperty('suggested_reply');
    expect(data.intent).toBe('recharge');
    expect(data.confidence).toBeGreaterThan(0.9);
    expect(data.matched_keywords.length).toBeGreaterThan(0);
    expect(data.reply).toBe(data.suggested_reply);
    expect(Array.isArray(data.suggested_actions)).toBe(true);
    await app.close();
  });

  it('意图识别：未命中 → general', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/support/assist/intent',
      headers: authHeader(adminToken),
      payload: { text: '今天天气怎么样' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.intent).toBe('general');
    expect(res.json().data.confidence).toBe(0.5);
    await app.close();
  });

  it('测试 Key 生成/撤销 → 200，且写 audit', async () => {
    seedDiagnoseUser();
    const app = await makeApp();

    const gen = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/support/test-key',
      headers: authHeader(adminToken),
      payload: { name: '排查用Key', associated_user_id: 50 },
    });
    expect(gen.statusCode).toBe(200);
    const data = gen.json().data;
    expect(data.key.startsWith('tst_')).toBe(true);
    expect(data.key_prefix).toBe(data.key.slice(0, 8));
    expect(data.expires_at).toBeTruthy();

    // key_hash = sha256(明文)
    const rows = fakeDb.__rows(schema.supportTestKeys);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.keyHash).toBe(createHash('sha256').update(data.key).digest('hex'));
    expect(rows[0]!.associatedUserId).toBe(50);

    // 列表含该 Key（active）
    const list = await app.inject({ method: 'GET', url: '/api/v1/admin/support/test-keys', headers: authHeader(adminToken) });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.list[0].status).toBe('active');

    // 撤销
    const revoke = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/support/test-key/1/revoke',
      headers: authHeader(adminToken),
      payload: {},
    });
    expect(revoke.statusCode).toBe(200);
    expect(fakeDb.__rows(schema.supportTestKeys)[0]!.revoked).toBe(true);

    // 撤销后列表 status=revoked
    const list2 = await app.inject({ method: 'GET', url: '/api/v1/admin/support/test-keys', headers: authHeader(adminToken) });
    expect(list2.json().data.list[0].status).toBe('revoked');

    // 审计日志包含 support 写操作
    const audit = await app.inject({ method: 'GET', url: '/api/v1/admin/support/audit-logs', headers: authHeader(adminToken) });
    expect(audit.statusCode).toBe(200);
    const actions = audit.json().data.list.map((o: any) => o.action);
    expect(actions).toContain('support_test_key.create');
    expect(actions).toContain('support_test_key.revoke');
    expect(audit.json().data.list[0]).toHaveProperty('operator');
    expect(audit.json().data.list[0]).toHaveProperty('detail');
    await app.close();
  });
});

/* ═══════════ 业务员支撑（me-sales.ts） ═══════════ */

describe('业务员支撑 me-sales', () => {
  it('未登录访问业务员端点 → 401', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/customers' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('非 sales/admin 访问业务员端点 → 403', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/customers', headers: authHeader(customerToken) });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('admin 访问业务员端点 → 200（跨客户可用）', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/follow-reminders', headers: authHeader(adminToken) });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data.list)).toBe(true);
    await app.close();
  });

  it('业务员客户列表 → 200，结构含 list/tags', async () => {
    seedSalesScenario();
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/customers', headers: authHeader(salesToken) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(Array.isArray(data.list)).toBe(true);
    expect(data.list).toHaveLength(2);
    const c10 = data.list.find((c: any) => c.user_id === 10);
    expect(c10.email).toBe('c10@test.com');
    expect(c10.username).toBe('客户十');
    expect(c10.tags).toContain('高价值');
    expect(c10.balance).toBe(50);
    expect(c10.total_spend).toBe(20); // 12.5 + 7.5
    expect(c10.month_consumption).toBe(12.5);
    expect(data.pagination.total).toBe(2);
    await app.close();
  });

  it('客户列表筛选：keyword / status / tag', async () => {
    seedSalesScenario();
    const app = await makeApp();

    const byKeyword = await app.inject({ method: 'GET', url: '/api/v1/me/customers?keyword=c10%40test.com', headers: authHeader(salesToken) });
    expect(byKeyword.json().data.list).toHaveLength(1);
    expect(byKeyword.json().data.list[0].email).toBe('c10@test.com');

    const byTag = await app.inject({ method: 'GET', url: '/api/v1/me/customers?tag=开发者', headers: authHeader(salesToken) });
    expect(byTag.json().data.list).toHaveLength(1);
    expect(byTag.json().data.list[0].user_id).toBe(11);

    const byStatus = await app.inject({ method: 'GET', url: '/api/v1/me/customers?status=silent', headers: authHeader(salesToken) });
    expect(byStatus.json().data.list).toHaveLength(0);
    await app.close();
  });

  it('认领客户 → 200，建立 agent_customers（source=sales）', async () => {
    seedSalesScenario();
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/me/customers/12/assign', headers: authHeader(salesToken) });
    expect(res.statusCode).toBe(200);
    const rel = fakeDb.__rows(schema.agentCustomers).find((r: any) => r.customerUserId === 12);
    expect(rel).toBeDefined();
    expect(rel!.agentId).toBe(5);
    expect(rel!.source).toBe('sales');
    expect(res.json().data.ok).toBe(true);
    await app.close();
  });

  it('客户详情 → 200，结构含 notes/recent_consumption/tickets_count/balance', async () => {
    seedSalesScenario();
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/customers/10', headers: authHeader(salesToken) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.customer.email).toBe('c10@test.com');
    expect(data.customer.username).toBe('客户十');
    expect(data.customer.status).toBe('active');
    expect(Array.isArray(data.notes)).toBe(true);
    expect(data.notes.length).toBeGreaterThanOrEqual(1);
    expect(data.notes[0]).toHaveProperty('channel');
    expect(data.notes[0]).toHaveProperty('content');
    expect(data.notes[0]).toHaveProperty('created_at');
    expect(data.contacts).toHaveLength(data.notes.length);
    expect(data.recent_consumption.length).toBeGreaterThanOrEqual(1);
    expect(data.recent_consumption[0]).toHaveProperty('model');
    expect(data.recent_consumption[0]).toHaveProperty('cost');
    expect(data.tickets_count).toBe(2);
    expect(data.balance).toBe(50);
    expect(data.tags.some((t: any) => t.name === '高价值')).toBe(true);
    await app.close();
  });

  it('sales 无权访问非名下客户详情 → 403', async () => {
    seedSalesScenario();
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/customers/12', headers: authHeader(salesToken) });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('写联系记录 → 200 且落库', async () => {
    seedSalesScenario();
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/customers/10/contacts',
      headers: authHeader(salesToken),
      payload: { channel: 'phone', content: '电话确认续费意向', next_follow_at: '2026-08-20' },
    });
    expect(res.statusCode).toBe(200);
    const note = fakeDb.__rows(schema.customerNotes).find((r: any) => r.content === '电话确认续费意向');
    expect(note).toBeDefined();
    expect(note!.salesUserId).toBe(1);
    expect(note!.channel).toBe('phone');

    // 前端命名兼容（method/summary/next_follow_up）
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/me/customers/10/contacts',
      headers: authHeader(salesToken),
      payload: { method: 'wechat', summary: '微信沟通', next_follow_up: '2026-08-25' },
    });
    expect(res2.statusCode).toBe(200);
    await app.close();
  });

  it('改标签 → 200，全量替换 customerTags', async () => {
    seedSalesScenario();
    const app = await makeApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/me/customers/10/tags',
      headers: authHeader(salesToken),
      payload: { tags: ['企业客户', '已签约'] },
    });
    expect(res.statusCode).toBe(200);
    const tags = fakeDb.__rows(schema.customerTags).filter((r: any) => r.customerUserId === 10);
    expect(tags).toHaveLength(2);
    expect(tags.map((t: any) => t.tag)).toEqual(expect.arrayContaining(['企业客户', '已签约']));
    expect(tags.some((t: any) => t.tag === '高价值')).toBe(false); // 旧标签已删除
    await app.close();
  });

  it('改状态 → 200，支持中文/英文，更新 agent_customers.status', async () => {
    seedSalesScenario();
    const app = await makeApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/me/customers/10/status',
      headers: authHeader(salesToken),
      payload: { status: 'silent', reason: '客户暂时无需求' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('silent');
    const rel = fakeDb.__rows(schema.agentCustomers).find((r: any) => r.customerUserId === 10);
    expect(rel!.status).toBe('silent');

    // 中文状态映射
    const res2 = await app.inject({
      method: 'PUT',
      url: '/api/v1/me/customers/10/status',
      headers: authHeader(salesToken),
      payload: { status: '活跃' },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().data.status).toBe('active');

    // 非法状态 → 400
    const res3 = await app.inject({
      method: 'PUT',
      url: '/api/v1/me/customers/10/status',
      headers: authHeader(salesToken),
      payload: { status: 'whatever' },
    });
    expect(res3.statusCode).toBe(400);
    await app.close();
  });

  it('消费聚合（period=month）→ list 含 date/cost/calls', async () => {
    seedSalesScenario();
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/customers/10/consumption?period=month',
      headers: authHeader(salesToken),
    });
    expect(res.statusCode).toBe(200);
    const list = res.json().data.list;
    expect(Array.isArray(list)).toBe(true);
    // 本月仅 12.5 一条
    const today = list.find((d: any) => d.calls > 0);
    expect(today.cost).toBe(12.5);
    expect(today.calls).toBe(1);
    expect(today.date).toBeDefined();
    await app.close();
  });

  it('消费明细（分页模式）→ list + pagination', async () => {
    seedSalesScenario();
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/customers/10/consumption?time_range=all&page=1&page_size=10',
      headers: authHeader(salesToken),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.list).toHaveLength(2); // 12.5 + 7.5
    expect(data.pagination.total).toBe(2);
    expect(data.list[0]).toHaveProperty('time');
    expect(data.list[0]).toHaveProperty('amount');
    expect(data.list[0]).toHaveProperty('model');
    await app.close();
  });

  it('充值记录 → 200', async () => {
    seedSalesScenario();
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/customers/10/recharges?page_size=10', headers: authHeader(salesToken) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.list).toHaveLength(1);
    expect(data.list[0]).toHaveProperty('amount');
    expect(data.list[0]).toHaveProperty('status');
    expect(data.list[0]).toHaveProperty('method');
    expect(data.list[0].amount).toBe(100);
    expect(data.pagination.total).toBe(1);
    await app.close();
  });

  it('跟进提醒：新增 / complete / ignore → 200', async () => {
    seedSalesScenario();
    const app = await makeApp();

    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/me/follow-reminders',
      headers: authHeader(salesToken),
      payload: { customer_user_id: 10, content: '跟进报价', remind_at: '2026-08-28T10:00:00.000Z' },
    });
    expect(create.statusCode).toBe(200);
    const id = create.json().data.id;

    const complete = await app.inject({ method: 'POST', url: `/api/v1/me/follow-reminders/${id}/complete`, headers: authHeader(salesToken) });
    expect(complete.statusCode).toBe(200);
    expect(complete.json().data.status).toBe('completed');
    const row = fakeDb.__rows(schema.followReminders).find((r: any) => r.id === id);
    expect(row!.status).toBe('completed');
    expect(row!.completedAt).toBeTruthy();

    const create2 = await app.inject({
      method: 'POST',
      url: '/api/v1/me/follow-reminders',
      headers: authHeader(salesToken),
      payload: { user_id: 11, title: '确认需求', due_at: '2026-08-29' },
    });
    expect(create2.statusCode).toBe(200);
    const id2 = create2.json().data.id;
    const ignore = await app.inject({ method: 'POST', url: `/api/v1/me/follow-reminders/${id2}/ignore`, headers: authHeader(salesToken) });
    expect(ignore.statusCode).toBe(200);
    expect(fakeDb.__rows(schema.followReminders).find((r: any) => r.id === id2)!.status).toBe('ignored');

    // 列表 + 状态筛选
    const list = await app.inject({ method: 'GET', url: '/api/v1/me/follow-reminders?status=completed', headers: authHeader(salesToken) });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.list.every((r: any) => r.status === 'completed')).toBe(true);
    const completed = list.json().data.list.find((r: any) => r.id === id);
    expect(completed).toBeDefined();
    expect(completed.customer_email).toBe('c10@test.com');

    // 无权操作他人提醒 → 404
    const other = await app.inject({ method: 'POST', url: '/api/v1/me/follow-reminders/999/complete', headers: authHeader(salesToken) });
    expect(other.statusCode).toBe(404);
    await app.close();
  });

  it('业绩看板 → 200，结构含 customers/revenue/rank', async () => {
    seedSalesScenario();
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/sales-performance?period=month', headers: authHeader(salesToken) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.customers).toBe(2);
    expect(data.new_customers).toBe(2);
    expect(data.reminders_done).toBe(1); // 种子中 1 条 completed
    expect(data.total_spend).toBe(17.5); // 10:12.5 + 11:5
    expect(data.revenue).toBe(100); // 仅 status=paid 的充值
    expect(data.rank).toBe(1);
    expect(data.stats.customer_count).toBe(2);
    expect(data.stats.active_count).toBe(2);
    expect(data.performance).toBeDefined();
    await app.close();
  });
});
