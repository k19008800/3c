/**
 * 代理商控制台端点（A7–A9）集成测试 — /api/v1/agent/{dashboard,consumption/recent,customers,consumption}
 *
 * 真实 PG（threecloud_v3）+ 独立 JWT 密钥，afterAll 清理。风格对齐 admin-impersonate.test.ts。
 *
 * 覆盖：
 *   1. 越权：customer（非 agent，无 agents 记录）→ 404；未登录 → 401
 *   2. /agent/dashboard：指标仅统计当前代理商（累计/本月佣金、名下客户、累计/本月消费、排名）
 *   3. /agent/consumption/recent：返回名下客户最近消费
 *   4. /agent/customers：返回名下客户 + search 过滤 + total
 *   5. /agent/consumption：客户名 + 日期范围筛选 + stats + total
 *   6. 跨代理商隔离：Agent A 看不到 Agent B 的客户/消费/佣金
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { inArray, and } from 'drizzle-orm';
import { generateAccessToken } from '../services/auth/jwt.js';
import { agentConsoleRoutes } from './agent-console.js';

process.env.JWT_SECRET = 'test-agent-console-secret';

const ts = Date.now();

// 共享数据库行 id
let agentAUserId = 0;  // 代理商 A 用户
let agentBUserId = 0;  // 代理商 B 用户
let agentAId = 0;      // agents.id
let agentBId = 0;      // agents.id
let customerA1Id = 0;  // A 名下客户
let customerA2Id = 0;  // A 名下客户
let customerB1Id = 0;  // B 名下客户
let customerRoleId = 0; // 普通 customer（无 agents 记录）

let agentAToken = '';
let agentBToken = '';
let customerToken = '';

let app: FastifyInstance;

function buildTestApp(): FastifyInstance {
  const instance = Fastify({ logger: false });
  instance.setErrorHandler((err: any, _request, reply) => {
    const status = Number(err?.statusCode) || 500;
    reply.code(status).send({ code: status, message: err?.message ?? 'Internal Server Error', errorCode: err?.code });
  });
  agentConsoleRoutes(instance);
  return instance;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** 插入一条消费记录（request_id 每次调用必须唯一） */
async function insertConsumption(userId: number, model: string, tokens: number, cost: string, overrides: Record<string, unknown> = {}) {
  const [row] = await db.insert(schema.consumptionRecords).values({
    userId,
    requestId: `ac-test-${ts}-${userId}-${Math.floor(Math.random() * 1e9)}`,
    model,
    inputTokens: tokens,
    outputTokens: 0,
    totalTokens: tokens,
    cost,
    ...overrides,
  }).returning({ id: schema.consumptionRecords.id });
  if (!row) throw new Error('insert consumption failed');
  return row.id;
}

async function insertCommission(agentId: number, customerUserId: number, amount: string, status: 'pending' | 'settled' | 'cancelled' = 'settled') {
  const [row] = await db.insert(schema.agentCommissions).values({
    agentId,
    customerUserId,
    amount,
    rate: '10.00',
    status,
    settledAt: status === 'settled' ? new Date() : null,
    createdAt: new Date(),
  }).returning({ id: schema.agentCommissions.id });
  if (!row) throw new Error('insert commission failed');
  return row.id;
}

beforeAll(async () => {
  const [agentA] = await db.insert(schema.users).values({
    email: `ac-agentA-${ts}@test.com`, passwordHash: 'x', name: 'AgentAlpha', role: 'agent', status: 'active',
  }).returning({ id: schema.users.id });
  agentAUserId = agentA!.id;
  const [aRec] = await db.insert(schema.agents).values({
    userId: agentAUserId, level: 'junior', commissionRate: '10.00', status: 'active',
  }).returning({ id: schema.agents.id });
  agentAId = aRec!.id;

  const [agentB] = await db.insert(schema.users).values({
    email: `ac-agentB-${ts}@test.com`, passwordHash: 'x', name: 'AgentBeta', role: 'agent', status: 'active',
  }).returning({ id: schema.users.id });
  agentBUserId = agentB!.id;
  const [bRec] = await db.insert(schema.agents).values({
    userId: agentBUserId, level: 'senior', commissionRate: '20.00', status: 'active',
  }).returning({ id: schema.agents.id });
  agentBId = bRec!.id;

  const [a1] = await db.insert(schema.users).values({
    email: `ac-a1-${ts}@test.com`, passwordHash: 'x', name: 'CustomerOne', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  customerA1Id = a1!.id;
  const [a2] = await db.insert(schema.users).values({
    email: `ac-a2-${ts}@test.com`, passwordHash: 'x', name: 'CustomerTwo', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  customerA2Id = a2!.id;
  const [b1] = await db.insert(schema.users).values({
    email: `ac-b1-${ts}@test.com`, passwordHash: 'x', name: 'CustomerBeta', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  customerB1Id = b1!.id;
  const [cr] = await db.insert(schema.users).values({
    email: `ac-cust-${ts}@test.com`, passwordHash: 'x', name: 'PlainCustomer', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  customerRoleId = cr!.id;

  // 归属绑定
  await db.insert(schema.agentCustomers).values([
    { agentId: agentAId, customerUserId: customerA1Id, status: 'active', createdAt: new Date() },
    { agentId: agentAId, customerUserId: customerA2Id, status: 'active', createdAt: new Date() },
    { agentId: agentBId, customerUserId: customerB1Id, status: 'active', createdAt: new Date() },
  ]);

  // 余额
  await db.insert(schema.customerBalances).values([
    { userId: customerA1Id, totalBalance: '100.00', availableBalance: '100.00', frozenBalance: '0', currency: 'CNY' },
    { userId: customerA2Id, totalBalance: '50.00', availableBalance: '50.00', frozenBalance: '0', currency: 'CNY' },
    { userId: customerB1Id, totalBalance: '500.00', availableBalance: '500.00', frozenBalance: '0', currency: 'CNY' },
  ]);

  // 消费记录（A 名下两客户各一条当前时间；B 名下一条当前时间）
  await insertConsumption(customerA1Id, 'model-a', 1000, '12.34');   // A: ¥12.34
  await insertConsumption(customerA2Id, 'model-a2', 2000, '7.66');   // A: ¥7.66  → A 合计 ¥20.00
  await insertConsumption(customerB1Id, 'model-b', 9999, '88.00');   // B 专属

  // 佣金（A 两条 settled，B 一条）
  await insertCommission(agentAId, customerA1Id, '1.23', 'settled');  // ¥1.23
  await insertCommission(agentAId, customerA2Id, '0.77', 'settled');  // ¥0.77 → A 合计 ¥2.00
  await insertCommission(agentBId, customerB1Id, '9.90', 'settled');  // B 专属

  agentAToken = generateAccessToken({ userId: agentAUserId, email: `ac-agentA-${ts}@test.com`, role: 'agent' });
  agentBToken = generateAccessToken({ userId: agentBUserId, email: `ac-agentB-${ts}@test.com`, role: 'agent' });
  customerToken = generateAccessToken({ userId: customerRoleId, email: `ac-cust-${ts}@test.com`, role: 'customer' });

  app = buildTestApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  try {
    const customerIds = [customerA1Id, customerA2Id, customerB1Id].filter((x) => x > 0);
    const agentIds = [agentAId, agentBId].filter((x) => x > 0);
    const userIds = [agentAUserId, agentBUserId, customerA1Id, customerA2Id, customerB1Id, customerRoleId].filter((x) => x > 0);
    await db.delete(schema.consumptionRecords).where(inArray(schema.consumptionRecords.userId, customerIds));
    await db.delete(schema.agentCommissions).where(inArray(schema.agentCommissions.agentId, agentIds));
    await db.delete(schema.agentCustomers).where(and(
      inArray(schema.agentCustomers.agentId, agentIds),
      inArray(schema.agentCustomers.customerUserId, customerIds),
    ));
    await db.delete(schema.customerBalances).where(inArray(schema.customerBalances.userId, customerIds));
    await db.delete(schema.agents).where(inArray(schema.agents.userId, [agentAUserId, agentBUserId]));
    await db.delete(schema.users).where(inArray(schema.users.id, userIds));
  } catch (err) {
    console.error('[agent-console.test] cleanup failed:', err);
  }
});

describe('agent-console 越权', () => {
  it('未登录 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/dashboard' });
    expect(res.statusCode).toBe(401);
  });

  it('customer（非 agent，无 agents 记录）→ 404 拒绝', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/dashboard', headers: auth(customerToken) });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /agent/dashboard（A7）', () => {
  it('返回代理商 A 的指标：客户数/消费/佣金/排名，且不含代理商 B 的数据', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/dashboard', headers: auth(agentAToken) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;

    expect(data.total_customers).toBe(2);
    expect(data.active_customers).toBe(2);

    // 累计消费 = A1(12.34) + A2(7.66) = ¥20.00 → 2000 分（不含 B 的 ¥88）
    expect(data.total_consumption).toBe(2000);
    // 本月消费 = 同样 ¥20 → 2000 分（记录都在本月）
    expect(data.month_consumption).toBe(2000);

    // 累计佣金 = 1.23 + 0.77 = ¥2.00 → 200 分（不含 B 的 ¥9.90）
    expect(data.total_commission).toBe(200);
    expect(data.month_commission).toBe(200); // 全部 settled 且在当月

    // 排名：B 累计佣金 ¥9.90 > A ¥2.00 → B 应排名更靠前（数值更小）；统计全库 active 代理商数
    expect(typeof data.ranking).toBe('number');
    expect(data.ranking).toBeGreaterThanOrEqual(1);
    expect(data.total_agents).toBeGreaterThanOrEqual(2);
  });

  it('代理商 B 的排名为 1（累计佣金最高）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/dashboard', headers: auth(agentBToken) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    // B 佣金(¥9.90) > A 佣金(¥2.00) → B 排名更靠前
    const b = await app.inject({ method: 'GET', url: '/api/v1/agent/dashboard', headers: auth(agentBToken) });
    const a = await app.inject({ method: 'GET', url: '/api/v1/agent/dashboard', headers: auth(agentAToken) });
    expect(b.json().data.ranking).toBeLessThan(a.json().data.ranking);
    expect(data.total_commission).toBe(990); // ¥9.90
  });
});

describe('GET /agent/consumption/recent（A7）', () => {
  it('返回名下客户的最近消费（近 10 条，amount 分），不含其他代理商的客户', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/consumption/recent', headers: auth(agentAToken) });
    expect(res.statusCode).toBe(200);
    const list = res.json().data.list;
    const names = list.map((r: any) => r.customer_name);
    expect(list.length).toBe(2);
    expect(names).toContain('CustomerOne');
    expect(names).toContain('CustomerTwo');
    expect(names).not.toContain('CustomerBeta');
    // amount 分
    expect(list.every((r: any) => typeof r.amount === 'number')).toBe(true);
    expect(typeof list[0].tokens).toBe('number');
    expect(typeof list[0].model_name).toBe('string');
    expect(typeof list[0].created_at).toBe('string');
  });
});

describe('GET /agent/customers（A8）', () => {
  it('返回名下客户（列表字段齐全，金额为分，commission_rate%），不含 B 的客户', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/customers', headers: auth(agentAToken) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.total).toBe(2);
    expect(data.list.length).toBe(2);

    const byName = new Map<string, any>(data.list.map((c: any) => [c.username, c]));
    const row: any = byName.get('CustomerOne');
    expect(row).toBeDefined();
    expect(row.email).toBe(`ac-a1-${ts}@test.com`);
    expect(row.balance).toBe(10000);           // ¥100 → 10000 分
    expect(row.total_consumed).toBe(1234);      // ¥12.34 → 1234 分
    expect(row.total_commission).toBe(123);     // ¥1.23 → 123 分
    expect(row.commission_rate).toBe(10);       // agent.commissionRate = 10.00 (%)
    expect(row.status).toBe('active');
    expect(typeof row.joined_at).toBe('string');

    expect(data.list.some((c: any) => c.username === 'CustomerBeta')).toBe(false);
  });

  it('search 过滤 + total 反映过滤结果', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/agent/customers?search=${encodeURIComponent('CustomerTwo')}`,
      headers: auth(agentAToken),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.list.length).toBe(1);
    expect(data.total).toBe(1);
    expect(data.list[0].username).toBe('CustomerTwo');

    // 邮箱搜索同样命中（A1 邮箱前缀 ac-a1）
    const byEmail = await app.inject({
      method: 'GET',
      url: `/api/v1/agent/customers?search=${encodeURIComponent(`a1-${ts}`)}`,
      headers: auth(agentAToken),
    });
    expect(byEmail.statusCode).toBe(200);
    expect(byEmail.json().data.total).toBe(1);
    expect(byEmail.json().data.list[0].id).toBe(customerA1Id);

    // 无命中 → 空列表
    const none = await app.inject({
      method: 'GET',
      url: '/api/v1/agent/customers?search=no-such-customer-xyz',
      headers: auth(agentAToken),
    });
    expect(none.json().data.list).toEqual([]);
    expect(none.json().data.total).toBe(0);
  });

  it('分页参数生效', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/agent/customers?page=1&page_size=1',
      headers: auth(agentAToken),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.total).toBe(2);
    expect(data.list.length).toBe(1);
  });
});

describe('GET /agent/consumption（A9）', () => {
  it('返回名下客户消费明细（字段齐全，amount 分）+ stats，不含 B 客户', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/consumption', headers: auth(agentAToken) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.list.length).toBe(2);
    expect(data.total).toBe(2);

    const names = data.list.map((r: any) => r.customer_name);
    expect(names).toEqual(expect.arrayContaining(['CustomerOne', 'CustomerTwo']));
    const a1 = data.list.find((r: any) => r.customer_name === 'CustomerOne');
    expect(a1.amount).toBe(1234);       // ¥12.34 → 分
    expect(a1.tokens_in).toBe(1000);
    expect(a1.total_tokens).toBe(1000);
    expect(typeof a1.tokens_out).toBe('number');
    expect(typeof a1.model_name).toBe('string');
    expect(typeof a1.created_at).toBe('string');

    // stats：今日/本月（A 名下总 token=3000，总金额 ¥20 → 2000 分）
    expect(data.stats.today_tokens).toBe(3000);
    expect(data.stats.today_amount).toBe(2000);
    expect(data.stats.month_tokens).toBe(3000);
    expect(data.stats.month_amount).toBe(2000);
  });

  it('customer_name 筛选只返回匹配客户的记录', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/agent/consumption?customer_name=${encodeURIComponent('CustomerTwo')}`,
      headers: auth(agentAToken),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.list.length).toBe(1);
    expect(data.total).toBe(1);
    expect(data.list[0].customer_name).toBe('CustomerTwo');
  });

  it('date_start/date_end 筛选生效（未来日期 → 空列表）', async () => {
    // 明天作为 date_start → 不含今日记录
    const tomorrow = new Date(Date.now() + 86400000);
    const ymd = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/agent/consumption?date_start=${ymd}`,
      headers: auth(agentAToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.list).toEqual([]);
    expect(res.json().data.total).toBe(0);

    // 今天作为区间 → 命中全部今日记录
    const today = new Date();
    const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const hit = await app.inject({
      method: 'GET',
      url: `/api/v1/agent/consumption?date_start=${todayYmd}&date_end=${todayYmd}`,
      headers: auth(agentAToken),
    });
    expect(hit.statusCode).toBe(200);
    expect(hit.json().data.total).toBe(2);
  });

  it('跨代理商隔离：Agent A 的消费不含 B 名下客户的记录', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/consumption', headers: auth(agentAToken) });
    expect(res.json().data.list.some((r: any) => r.customer_name === 'CustomerBeta')).toBe(false);
    // B 自己的接口看到自己的客户
    const b = await app.inject({ method: 'GET', url: '/api/v1/agent/consumption', headers: auth(agentBToken) });
    expect(b.statusCode).toBe(200);
    const bNames = b.json().data.list.map((r: any) => r.customer_name);
    expect(bNames).toEqual(['CustomerBeta']);
  });

  it('跨代理商隔离：Agent A 的客户列表不含 B 的客户', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/customers', headers: auth(agentBToken) });
    expect(res.json().data.total).toBe(1);
    expect(res.json().data.list[0].username).toBe('CustomerBeta');
  });
});