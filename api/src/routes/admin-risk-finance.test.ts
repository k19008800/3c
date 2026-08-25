/**
 * 管理端风控三页 + 财务统计（结算/利润/对账/退款）路由集成测试
 *
 * 覆盖 gap-fix-spec-2026-08-18.md §3 §4 §5 的新端点（真实 PG 冒烟，与 test/*.test.ts 同风格）：
 *   - 权限：未登录 → 401；非 admin → 403
 *   - 风控看板 / 事件列表 / 事件处理（resolve/freeze）/ 规则新增启停
 *   - 结算列表 / 标记结算 / 利润分析 / 对账报表
 *   - 退款列表 / 退款审核 approve（余额增加 + 状态更新 + 流水）
 *
 * 测试数据全部使用独立时间戳（ts）隔离，afterAll 尽力清理。
 *
 * @see docs/gap-fix-spec-2026-08-18.md §3 §4 §5
 * @module routes
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { generateAccessToken } from '../services/auth/jwt';
import { adminRiskRoutes } from './admin-risk';
import { adminFinanceStatsRoutes } from './admin-finance-stats';
import { enableTest2fa, op2faHeaders } from './test-helpers';

// 独立 JWT 密钥（路由内 verifyToken 与测试签发共用同一 process.env 值）
process.env.JWT_SECRET = 'test-admin-risk-finance-secret';

/** 数字型字段 → Number（numeric 列返回 string） */
function toNum(v: unknown): number {
  return Number(v ?? 0);
}

/** 当前月 YYYY-MM（与路由 settle 存储口径一致） */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const ts = Date.now();

// 测试期间共享的数据库行 id
let adminId = 0;
let customerId = 0;
let frozenUserId = 0;
let freezeUserId = 0;
let adminToken = '';
let customerToken = '';
/** R7 资金写端点：操作级 2FA 请求头（退款审核 review） */
let adminOp: Record<string, string> = {};
let ruleId = 0;
let eventId = 0;
let pendingEventId = 0;
let freezeEventId = 0;
let createdRuleId = 0;
let supplierId = 0;
let supplierModelId = 0;
let supplierName = '';
let refundId = 0;

let app: FastifyInstance;

/** 组装仅含本模块路由的最小 Fastify 实例（不依赖 app.ts，无需修改注册） */
function buildTestApp(): FastifyInstance {
  const instance = Fastify({ logger: false });
  adminRiskRoutes(instance);
  adminFinanceStatsRoutes(instance);
  return instance;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  // ── 用户：admin（审计归属）/ customer（消费与退款）/ frozen（看板计数）/ freeze 专用 ──
  const [admin] = await db.insert(schema.users).values({
    email: `risk-admin-${ts}@test.com`,
    passwordHash: 'x',
    name: 'RiskAdmin',
    role: 'admin',
    status: 'active',
  }).returning({ id: schema.users.id });
  adminId = admin!.id;

  const [cust] = await db.insert(schema.users).values({
    email: `risk-cust-${ts}@test.com`,
    passwordHash: 'x',
    name: 'RiskCust',
    role: 'customer',
    status: 'active',
  }).returning({ id: schema.users.id });
  customerId = cust!.id;

  const [frozen] = await db.insert(schema.users).values({
    email: `risk-frozen-${ts}@test.com`,
    passwordHash: 'x',
    name: 'FrozenUser',
    role: 'customer',
    status: 'frozen',
  }).returning({ id: schema.users.id });
  frozenUserId = frozen!.id;

  const [freezeUser] = await db.insert(schema.users).values({
    email: `risk-freeze-${ts}@test.com`,
    passwordHash: 'x',
    name: 'FreezeUser',
    role: 'customer',
    status: 'active',
  }).returning({ id: schema.users.id });
  freezeUserId = freezeUser!.id;

  adminToken = generateAccessToken({ userId: adminId, email: `risk-admin-${ts}@test.com`, role: 'admin' });
  customerToken = generateAccessToken({ userId: customerId, email: `risk-cust-${ts}@test.com`, role: 'customer' });
  // R7：退款审核为资金写端点（requireOperation2fa），操作员需启用 2FA 并携带操作令牌
  await enableTest2fa(adminId);
  adminOp = op2faHeaders(adminToken, adminId, `risk-admin-${ts}@test.com`, 'admin');

  // ── 风控：规则 + 3 个事件（resolve 用 / 保持 pending 用 / freeze 用）──
  const [rule] = await db.insert(schema.riskRules).values({
    name: `RF-${ts}`,
    ruleType: 'frequency',
    description: 'test rule',
    config: { threshold: 100, action: 'block' },
    enabled: true,
  }).returning({ id: schema.riskRules.id });
  ruleId = rule!.id;

  const [ev] = await db.insert(schema.riskEvents).values({
    ruleId,
    userId: customerId,
    eventType: 'block',
    severity: 'high',
    details: { description: `resolve-block-${ts}` },
    resolved: '0',
  }).returning({ id: schema.riskEvents.id });
  eventId = ev!.id;

  const [pendingEv] = await db.insert(schema.riskEvents).values({
    ruleId,
    userId: customerId,
    eventType: 'block',
    severity: 'medium',
    details: { description: `pending-block-${ts} event` },
    resolved: '0',
  }).returning({ id: schema.riskEvents.id });
  pendingEventId = pendingEv!.id;

  const [freezeEv] = await db.insert(schema.riskEvents).values({
    ruleId,
    userId: freezeUserId,
    eventType: 'warn',
    severity: 'low',
    details: { description: `freeze-event-${ts}` },
    resolved: '0',
  }).returning({ id: schema.riskEvents.id });
  freezeEventId = freezeEv!.id;

  // ── 财务：供应商 + 模型定价 + 一条消费记录（1M input tokens × ¥0.10/1M = 收入 ¥0.10，成本 ¥0.05）──
  supplierName = `Sup-${ts}`;
  const [sup] = await db.insert(schema.suppliers).values({
    name: supplierName,
    code: `sup-${ts}`,
    baseUrl: 'https://vendor.example.com',
    apiType: 'openai',
    status: 'active',
  }).returning({ id: schema.suppliers.id });
  supplierId = sup!.id;

  const [sm] = await db.insert(schema.supplierModels).values({
    supplierId,
    modelName: `m-${ts}`,
    platformModel: `pm-${ts}`,
    inputPrice: '0.10',
    outputPrice: '0.30',
    status: 'active',
  }).returning({ id: schema.supplierModels.id });
  supplierModelId = sm!.id;

  await db.insert(schema.consumptionRecords).values({
    userId: customerId,
    requestId: `req-${ts}-1`,
    model: `m-${ts}`,
    supplierId,
    supplierModelId,
    inputTokens: 1000000,
    outputTokens: 0,
    cost: '0.05',
  });

  // ── 财务：客户余额 + 一条退款申请（¥10）──
  await db.insert(schema.customerBalances).values({
    userId: customerId,
    totalBalance: '100',
    availableBalance: '100',
    frozenBalance: '0',
    currency: 'CNY',
  });
  const [refund] = await db.insert(schema.refundRequests).values({
    userId: customerId,
    amount: '10.00',
    reason: 'test refund',
    orderNo: `ORD-${ts}`,
    status: 'pending',
  }).returning({ id: schema.refundRequests.id });
  refundId = refund!.id;

  app = buildTestApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  // 尽力清理本测试写入的数据（不因清理失败导致测试报错）
  try {
    await db.delete(schema.riskEvents).where(inArray(schema.riskEvents.id, [eventId, pendingEventId, freezeEventId].filter((x) => x > 0)));
    await db.delete(schema.riskRules).where(inArray(schema.riskRules.id, [ruleId, createdRuleId].filter((x) => x > 0)));
    await db.delete(schema.refundRequests).where(eq(schema.refundRequests.id, refundId));
    if (supplierId > 0) {
      await db.delete(schema.vendorSettlements).where(eq(schema.vendorSettlements.supplierId, supplierId));
      await db.delete(schema.supplierModels).where(eq(schema.supplierModels.id, supplierModelId));
      await db.delete(schema.suppliers).where(eq(schema.suppliers.id, supplierId));
    }
    await db.delete(schema.consumptionRecords).where(eq(schema.consumptionRecords.userId, customerId));
    await db.delete(schema.balanceTransactions).where(eq(schema.balanceTransactions.userId, customerId));
    await db.delete(schema.customerBalances).where(eq(schema.customerBalances.userId, customerId));
    await db.delete(schema.auditLogs).where(eq(schema.auditLogs.userId, adminId));
    // R7：操作员 2FA 行（user_2fa FK 依赖 users，须先删）
    await db.delete(schema.user2fa).where(eq(schema.user2fa.userId, adminId));
    await db.delete(schema.users).where(inArray(schema.users.id, [adminId, customerId, frozenUserId, freezeUserId].filter((x) => x > 0)));
  } catch (err) {
    console.error('[admin-risk-finance.test] cleanup failed:', err);
  }
});

describe('权限：未登录 / 非 admin', () => {
  it('未登录访问风控/财务端点 → 401', async () => {
    const urls = [
      { method: 'GET', url: '/api/v1/admin/risk/dashboard' },
      { method: 'GET', url: '/api/v1/admin/risk/events' },
      { method: 'GET', url: '/api/v1/admin/risk/rules' },
      { method: 'GET', url: '/api/v1/admin/settlements' },
      { method: 'GET', url: '/api/v1/admin/profit' },
      { method: 'GET', url: '/api/v1/admin/reconciliation' },
      { method: 'GET', url: '/api/v1/admin/refunds' },
      { method: 'POST', url: '/api/v1/admin/refunds/1/review', payload: { action: 'approve', note: '' } },
      { method: 'POST', url: '/api/v1/admin/risk/events/1/resolve', payload: {} },
    ];
    for (const r of urls) {
      const res = await app.inject(r as any);
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(401);
    }
  });

  it('非 admin 访问 → 403', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/admin/risk/dashboard', headers: auth(customerToken),
    });
    expect(res.statusCode).toBe(403);
    const res2 = await app.inject({
      method: 'GET', url: '/api/v1/admin/settlements', headers: auth(customerToken),
    });
    expect(res2.statusCode).toBe(403);
  });
});

describe('风控三页', () => {
  it('风控 dashboard → 200 且结构含 unhandled_events/events', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/admin/risk/dashboard?period=month', headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(typeof data.unhandled_events).toBe('number');
    expect(typeof data.frozen_accounts).toBe('number');
    expect(typeof data.active_rules).toBe('number');
    expect(typeof data.today_blocks).toBe('number');
    expect(typeof data.pending_incidents).toBe('number');
    expect(Array.isArray(data.events)).toBe(true);
    // 计数由本测试种子数据保证（不受并发测试影响）
    expect(data.unhandled_events).toBeGreaterThanOrEqual(1);
    expect(data.frozen_accounts).toBeGreaterThanOrEqual(1);
    expect(data.active_rules).toBeGreaterThanOrEqual(1);
    expect(data.today_blocks).toBeGreaterThanOrEqual(1);
    // 事件行字段契约
    for (const e of data.events) {
      expect(typeof e.id).toBe('number');
      expect(typeof e.created_at).toBe('string');
      expect(e.status).toMatch(/^(pending|handled|blocked)$/);
    }
  });

  it('风控事件列表 → 200 且 status/severity 映射正确（pending 过滤 + keyword 搜索）', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/admin/risk/events?status=pending&page_size=50', headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const list = res.json().data.list;
    expect(Array.isArray(list)).toBe(true);
    const ev = list.find((e: any) => e.id === pendingEventId);
    expect(ev).toBeDefined();
    expect(ev.status).toBe('pending');
    expect(typeof ev.severity).toBe('string');
    expect(typeof ev.user_email).toBe('string');
    expect(typeof ev.rule_name).toBe('string');
    expect(typeof ev.detail).toBe('string');

    const kw = await app.inject({
      method: 'GET', url: `/api/v1/admin/risk/events?keyword=${encodeURIComponent(`pending-block-${ts}`)}`, headers: auth(adminToken),
    });
    expect(kw.statusCode).toBe(200);
    expect(kw.json().data.list.some((e: any) => e.id === pendingEventId)).toBe(true);
  });

  it('风控事件处理 resolve → 200 且 risk_events.resolved="1" + 审计留痕', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/risk/events/${eventId}/resolve`, headers: auth(adminToken),
      payload: { reason: '测试处理' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('resolved');

    const [row] = await db
      .select({ resolved: schema.riskEvents.resolved, resolvedBy: schema.riskEvents.resolvedBy, resolvedAt: schema.riskEvents.resolvedAt })
      .from(schema.riskEvents).where(eq(schema.riskEvents.id, eventId)).limit(1);
    expect(row!.resolved).toBe('1');
    expect(row!.resolvedBy).toBe(adminId);
    expect(row!.resolvedAt).not.toBeNull();

    const [log] = await db.select({ action: schema.auditLogs.action }).from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.resource, 'risk_event'), eq(schema.auditLogs.resourceId, String(eventId))))
      .orderBy(desc(schema.auditLogs.id)).limit(1);
    expect(log).toBeDefined();
    expect(log!.action).toBe('risk.event.resolve');
  });

  it('风控事件处理 freeze → 200 且对应用户 status=frozen', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/risk/events/${freezeEventId}/freeze`, headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);

    const [u] = await db.select({ status: schema.users.status }).from(schema.users)
      .where(eq(schema.users.id, freezeUserId)).limit(1);
    expect(u!.status).toBe('frozen');

    const [ev] = await db.select({ resolved: schema.riskEvents.resolved }).from(schema.riskEvents)
      .where(eq(schema.riskEvents.id, freezeEventId)).limit(1);
    expect(ev!.resolved).toBe('1');
  });

  it('风控规则新增/启停 → 200 且落库生效', async () => {
    const create = await app.inject({
      method: 'POST', url: '/api/v1/admin/risk/rules', headers: auth(adminToken),
      payload: { name: `NewRule-${ts}`, description: 'new rule', type: 'ip_anomaly', threshold: 50, action: 'warn' },
    });
    expect(create.statusCode).toBe(200);
    const created = create.json().data;
    expect(created.id).toBeGreaterThan(0);
    expect(created.type).toBe('ip_anomaly');
    expect(created.threshold).toBe(50);
    expect(created.action).toBe('warn');
    expect(created.is_enabled).toBe(true);
    createdRuleId = created.id;

    const toggle = await app.inject({
      method: 'PUT', url: `/api/v1/admin/risk/rules/${createdRuleId}`, headers: auth(adminToken),
      payload: { is_enabled: false },
    });
    expect(toggle.statusCode).toBe(200);
    expect(toggle.json().data.is_enabled).toBe(false);

    const [row] = await db.select({ enabled: schema.riskRules.enabled }).from(schema.riskRules)
      .where(eq(schema.riskRules.id, createdRuleId)).limit(1);
    expect(row!.enabled).toBe(false);

    // 规则列表契约
    const list = await app.inject({ method: 'GET', url: '/api/v1/admin/risk/rules', headers: auth(adminToken) });
    expect(list.statusCode).toBe(200);
    expect(Array.isArray(list.json().data.list)).toBe(true);
  });
});

describe('财务统计（结算 / 利润 / 对账）', () => {
  it('结算列表 → 200 且结构含 summary/list（种子供应商 revenue/cost/profit 正确）', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/admin/settlements?period=month', headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.summary).toBeDefined();
    expect(typeof data.summary.pending_total).toBe('number');
    expect(typeof data.summary.settled_total).toBe('number');
    expect(typeof data.summary.pending_vendors).toBe('number');
    expect(typeof data.summary.disputed).toBe('number');
    expect(Array.isArray(data.list)).toBe(true);

    const item = data.list.find((s: any) => s.id === supplierId);
    expect(item).toBeDefined();
    expect(item.vendor_name).toBe(supplierName);
    expect(item.revenue).toBeCloseTo(0.1, 2);
    expect(item.cost).toBeCloseTo(0.05, 2);
    expect(item.profit).toBeCloseTo(0.05, 2);
    expect(item.status).toBe('pending');
  });

  it('POST /admin/settlements/:id/settle → 200 且 vendor_settlements 持久化、列表转 settled', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/settlements/${supplierId}/settle`, headers: auth(adminToken), payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('settled');

    const [row] = await db.select({
      status: schema.vendorSettlements.status,
      period: schema.vendorSettlements.period,
      totalAmount: schema.vendorSettlements.totalAmount,
    }).from(schema.vendorSettlements)
      .where(and(eq(schema.vendorSettlements.supplierId, supplierId), eq(schema.vendorSettlements.period, currentMonth())))
      .limit(1);
    expect(row).toBeDefined();
    expect(row!.status).toBe('confirmed');
    expect(toNum(row!.totalAmount)).toBeCloseTo(0.05, 4);

    const list = await app.inject({
      method: 'GET', url: '/api/v1/admin/settlements?period=month', headers: auth(adminToken),
    });
    const item = list.json().data.list.find((s: any) => s.id === supplierId);
    expect(item.status).toBe('settled');
  });

  it('利润分析 → 200 且结构含 summary/list（margin/trend 正确）', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/admin/profit?period=month', headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(typeof data.summary.revenue).toBe('number');
    expect(typeof data.summary.cost).toBe('number');
    expect(typeof data.summary.profit).toBe('number');
    expect(typeof data.summary.margin).toBe('number');

    const item = data.list.find((p: any) => p.vendor_name === supplierName);
    expect(item).toBeDefined();
    expect(item.revenue).toBeCloseTo(0.1, 2);
    expect(item.cost).toBeCloseTo(0.05, 2);
    expect(typeof item.commission).toBe('number');
    expect(item.net_profit).toBeCloseTo(0.05, 2);
    expect(item.margin).toBeCloseTo(50, 1);
    expect(['up', 'down', 'flat']).toContain(item.trend);
  });

  it('对账报表 → 200 且结构含 summary/list（本期 diff=0/status=matched）', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/admin/reconciliation?period=month', headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(typeof data.summary.revenue).toBe('number');
    expect(typeof data.summary.cost).toBe('number');
    expect(typeof data.summary.profit).toBe('number');
    expect(typeof data.summary.margin).toBe('number');

    const item = data.list.find((r: any) => r.vendor_name === supplierName);
    expect(item).toBeDefined();
    expect(typeof item.profit).toBe('number');
    expect(typeof item.margin).toBe('number');
    expect(item.diff).toBe(0);
    expect(item.status).toBe('matched');
  });
});

describe('退款审核', () => {
  it('退款列表 → 200 且结构含 list/pagination（status_label 正确）', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/admin/refunds?status=pending&page_size=50', headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(Array.isArray(data.list)).toBe(true);
    expect(typeof data.pagination.total).toBe('number');

    const item = data.list.find((r: any) => r.id === refundId);
    expect(item).toBeDefined();
    expect(item.user_id).toBe(customerId);
    expect(item.amount).toBe(10);
    expect(item.reason).toBe('test refund');
    expect(item.order_no).toBe(`ORD-${ts}`);
    expect(item.status).toBe('pending');
    expect(item.status_label).toBe('待审核');
    expect(typeof item.username).toBe('string');
    expect(typeof item.email).toBe('string');
    expect(typeof item.created_at).toBe('string');
  });

  it('退款审核 approve → 200 且状态更新 + 余额增加 + refund 流水', async () => {
    const before = await db.select({ availableBalance: schema.customerBalances.availableBalance })
      .from(schema.customerBalances).where(eq(schema.customerBalances.userId, customerId)).limit(1);
    const beforeBalance = toNum(before[0]?.availableBalance);

    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/refunds/${refundId}/review`, headers: adminOp,
      payload: { action: 'approve', note: '审核通过' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('approved');

    const [row] = await db.select({
      status: schema.refundRequests.status,
      reviewedBy: schema.refundRequests.reviewedBy,
      reviewNote: schema.refundRequests.reviewNote,
      reviewedAt: schema.refundRequests.reviewedAt,
    }).from(schema.refundRequests).where(eq(schema.refundRequests.id, refundId)).limit(1);
    expect(row!.status).toBe('approved');
    expect(row!.reviewedBy).toBe(adminId);
    expect(row!.reviewNote).toBe('审核通过');
    expect(row!.reviewedAt).not.toBeNull();

    // 余额增加 ¥10
    const after = await db.select({ availableBalance: schema.customerBalances.availableBalance })
      .from(schema.customerBalances).where(eq(schema.customerBalances.userId, customerId)).limit(1);
    expect(toNum(after[0]?.availableBalance)).toBeCloseTo(beforeBalance + 10, 2);

    // balance_transactions 写 refund 流水（addBalance 内部落账）
    const [tx] = await db.select({ type: schema.balanceTransactions.type, referenceId: schema.balanceTransactions.referenceId })
      .from(schema.balanceTransactions)
      .where(and(eq(schema.balanceTransactions.userId, customerId), eq(schema.balanceTransactions.type, 'refund')))
      .orderBy(desc(schema.balanceTransactions.createdAt)).limit(1);
    expect(tx).toBeDefined();
    expect(tx!.type).toBe('refund');
    expect(tx!.referenceId).toBe(String(refundId));
  });

  it('重复审核已处理退款 → 409', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/refunds/${refundId}/review`, headers: adminOp,
      payload: { action: 'reject', note: '重复驳回' },
    });
    expect(res.statusCode).toBe(409);
  });
});
