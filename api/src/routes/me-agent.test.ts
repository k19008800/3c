/**
 * 代理商设置端点集成测试 — /api/v1/me/agent/* + /agent/reports
 *
 * 真实 PG（threecloud_v3）+ 独立 JWT 密钥，afterAll 清理。风格对齐 agent-console.test.ts。
 *
 * 覆盖 AgentSettingsPage 全部 10 个调用点的 smoke（200 + 字段契约）：
 *   profile（非代理 is_agent=false / 代理 commission_rate 小数化）
 *   commission-rules / withdraw-summary / notif-prefs(GET+PUT)
 *   commissions / withdrawals / withdraw(POST 校验)
 *   reports(GET+POST 报备)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, inArray } from 'drizzle-orm';
import { generateAccessToken } from '../services/auth/jwt.js';
import { meAgentRoutes } from './me-agent.js';

process.env.JWT_SECRET = 'test-me-agent-secret';

const ts = Date.now();

let agentUserId = 0;
let agentId = 0;
let customerId = 0;   // 报备/佣金客户
let plainUserId = 0;  // 非代理用户

let agentToken = '';
let plainToken = '';

let app: FastifyInstance;

function buildTestApp(): FastifyInstance {
  const instance = Fastify({ logger: false });
  instance.setErrorHandler((err: any, _request, reply) => {
    const status = Number(err?.statusCode) || 500;
    reply.code(status).send({ code: status, message: err?.message ?? 'Internal Server Error', errorCode: err?.code });
  });
  meAgentRoutes(instance);
  return instance;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  app = buildTestApp();

  const [agentU] = await db.insert(schema.users).values({
    email: `mea-agent-${ts}@test.com`, passwordHash: 'x', name: 'MeAgent', role: 'agent', status: 'active',
  }).returning({ id: schema.users.id });
  agentUserId = agentU!.id;
  const [aRec] = await db.insert(schema.agents).values({
    userId: agentUserId, level: 'junior', commissionRate: '10.00', status: 'active', inviteCode: 'TESTINVITE',
  }).returning({ id: schema.agents.id });
  agentId = aRec!.id;

  const [cU] = await db.insert(schema.users).values({
    email: `mea-cust-${ts}@test.com`, passwordHash: 'x', name: 'MeCustomer', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  customerId = cU!.id;

  const [plainU] = await db.insert(schema.users).values({
    email: `mea-plain-${ts}@test.com`, passwordHash: 'x', name: 'MePlain', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  plainUserId = plainU!.id;

  // 一笔已结算佣金 ¥50
  await db.insert(schema.agentCommissions).values({
    agentId, customerUserId: customerId, amount: '50.0000', rate: '10.00', status: 'settled', settledAt: new Date(), createdAt: new Date(),
  });

  agentToken = generateAccessToken({ userId: agentUserId, email: `mea-agent-${ts}@test.com`, role: 'agent' } as any);
  plainToken = generateAccessToken({ userId: plainUserId, email: `mea-plain-${ts}@test.com`, role: 'customer' } as any);
});

afterAll(async () => {
  // agent 行 FK 级联删除 agents/notif_prefs；佣金/提现/报备手动清
  await db.delete(schema.agentCommissions).where(eq(schema.agentCommissions.agentId, agentId));
  await db.delete(schema.agentWithdrawals).where(eq(schema.agentWithdrawals.agentId, agentId));
  await db.delete(schema.agentApprovals).where(eq(schema.agentApprovals.agentId, agentId));
  await db.delete(schema.agents).where(eq(schema.agents.userId, agentUserId));
  await db.delete(schema.users).where(inArray(schema.users.id, [agentUserId, customerId, plainUserId]));
  await app?.close();
});

describe('GET /me/agent/profile', () => {
  it('未登录 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/agent/profile' });
    expect(res.statusCode).toBe(401);
  });

  it('非代理用户 → is_agent=false', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/agent/profile', headers: auth(plainToken) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.is_agent).toBe(false);
    expect(body.data.level).toBeNull();
  });

  it('代理用户 → 资料完整、commission_rate 小数化（0.1）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/agent/profile', headers: auth(agentToken) });
    expect(res.statusCode).toBe(200);
    const p = res.json().data;
    expect(p.is_agent).toBe(true);
    expect(p.level).toBe('junior');
    expect(p.level_label).toBe('初级代理');
    expect(p.commission_rate).toBeCloseTo(0.1);
    expect(p.referral_code).toBe('TESTINVITE');
  });
});

describe('GET /me/agent/commission-rules', () => {
  it('返回三级规则，当前等级标记 current=true', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/agent/commission-rules', headers: auth(agentToken) });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.current_level).toBe('junior');
    expect(d.rules).toHaveLength(3);
    const junior = d.rules.find((r: any) => r.level === 'junior');
    expect(junior.current).toBe(true);
    expect(junior.rate).toBeCloseTo(0.1);
    expect(d.rules.find((r: any) => r.level === 'senior').current).toBe(false);
  });
});

describe('GET /me/agent/withdraw-summary', () => {
  it('汇总字段齐全，可提现=已结算佣金 ¥50', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/agent/withdraw-summary', headers: auth(agentToken) });
    expect(res.statusCode).toBe(200);
    const s = res.json().data;
    expect(s.withdrawable).toBeCloseTo(50);
    expect(s.commission_total).toBeCloseTo(50);
    expect(s.min_withdraw).toBe(100);
    expect(s).toHaveProperty('customer_count');
    expect(s).toHaveProperty('month_consumption');
  });
});

describe('notif-prefs', () => {
  it('GET 返回默认偏好', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/agent/notif-prefs', headers: auth(agentToken) });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.customer_alert).toBe(true);
  });

  it('PUT 保存后 GET 读到新值', async () => {
    const put = await app.inject({
      method: 'PUT', url: '/api/v1/me/agent/notif-prefs', headers: auth(agentToken),
      payload: { customer_alert: false, commission_notify: true, audit_notify: false },
    });
    expect(put.statusCode).toBe(200);
    const get = await app.inject({ method: 'GET', url: '/api/v1/me/agent/notif-prefs', headers: auth(agentToken) });
    expect(get.json().data.customer_alert).toBe(false);
    expect(get.json().data.audit_notify).toBe(false);
  });

  it('混合类型/未知键被过滤：仅持久化布尔值，非布尔一律不落库（G11）', async () => {
    const put = await app.inject({
      method: 'PUT', url: '/api/v1/me/agent/notif-prefs', headers: auth(agentToken),
      payload: { commission_notify: false, bogus: 'x', audit_notify: 'yes' },
    });
    expect(put.statusCode).toBe(200);

    const get = await app.inject({ method: 'GET', url: '/api/v1/me/agent/notif-prefs', headers: auth(agentToken) });
    expect(get.statusCode).toBe(200);
    const d = get.json().data;
    // 唯一被接受的布尔值落库（commission_notify:false 不被当作假值丢弃）
    expect(d.commission_notify).toBe(false);
    // 整体替换 + 过滤：未提交的 customer_alert 回落默认 true，不残留前序用例值
    expect(d.customer_alert).toBe(true);
    // 字符串 "yes" 非布尔 → 过滤，回落默认 true，不被污染
    expect(d.audit_notify).toBe(true);
    // 未知键 bogus 非布尔 → 不入库，GET 中不出现
    expect(d.bogus).toBeUndefined();
  });
});

describe('GET /me/agent/commissions', () => {
  it('返回佣金明细，rate 小数化、user_email 解析', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/agent/commissions?page_size=20', headers: auth(agentToken) });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.total).toBe(1);
    const row = d.list[0];
    expect(row.commission_amount).toBeCloseTo(50);
    expect(row.rate).toBeCloseTo(0.1);
    expect(row.user_email).toContain('mea-cust');
    expect(row.status).toBe('settled');
  });
});

describe('withdrawals + withdraw', () => {
  it('初始提现记录为空', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/agent/withdrawals?page_size=20', headers: auth(agentToken) });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.list).toHaveLength(0);
  });

  it('金额低于最低提现 → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/me/agent/withdraw', headers: auth(agentToken),
      payload: { amount: 50, bank: '中国银行', account: '6222', name: '张三' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('金额超出可提现 → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/me/agent/withdraw', headers: auth(agentToken),
      payload: { amount: 9999, bank: '中国银行', account: '6222', name: '张三' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('合法提现 → 200 且进入提现记录', async () => {
    // 可提现 ¥50 不足以覆盖 ¥100 最低额：补一笔结算佣金到 ¥200 再提
    await db.insert(schema.agentCommissions).values({
      agentId, customerUserId: customerId, amount: '150.0000', rate: '10.00', status: 'settled', settledAt: new Date(), createdAt: new Date(),
    });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/me/agent/withdraw', headers: auth(agentToken),
      payload: { amount: 100, bank: '中国银行 深圳分行', account: '62220000', name: '张三' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.ok).toBe(true);

    const list = await app.inject({ method: 'GET', url: '/api/v1/me/agent/withdrawals?page_size=20', headers: auth(agentToken) });
    expect(list.statusCode).toBe(200);
    const rows = list.json().data.list;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].withdrawal_no).toMatch(/^WD\d+$/);
    expect(rows[0].status_label).toBe('待审核');
  });
});

describe('agent/reports 报备', () => {
  it('按邮箱报备客户 → 200', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/agent/reports', headers: auth(agentToken),
      payload: { target_email: `mea-cust-${ts}@test.com`, note: '测试报备' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('pending');
  });

  it('重复报备同一客户 → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/agent/reports', headers: auth(agentToken),
      payload: { target_email: `mea-cust-${ts}@test.com` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET 报备列表 → 包含已报备客户', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/reports', headers: auth(agentToken) });
    expect(res.statusCode).toBe(200);
    const list = res.json().data.list;
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].target_email_resolved).toContain('mea-cust');
    expect(list[0].status).toBe('pending');
  });
});
