/**
 * P2-2 营销素材库 + 排行榜结构集成测试
 *
 * 覆盖（docs/iteration-plan-v2.md P2-2 测试要求）：
 *   ☐ 素材库：POST /admin/content 创建成功 + 审计写入；GET /agent/materials 只返回 published 素材
 *   ☐ 素材库：参数缺失/非法 slug/重复 slug → 400；非 admin 创建 → 403；未登录读素材 → 401
 *   ☐ 排行榜：period=month/total 返回结构含 top 列表与我的名次（含 P2-2 新增 total 字段）
 *
 * 素材库约定：type='marketing-material'，slug='material-<name>'，status='published'|'draft'。
 * 金额口径：DB 元 → API 分（排行榜佣金）。
 *
 * @see docs/iteration-plan-v2.md P2-2
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../src/db';
import { eq, and, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-jwt-secret-agent-materials',
  PORT: '3037',
};

describe('agent 营销素材库 + 排行榜（P2-2）', () => {
  let app: FastifyInstance;
  let adminToken = '';
  let agentToken = '';
  let agentUserId = 0;
  let agentId = 0;

  const ts = Date.now();
  const adminEmail = `admin-mat-${ts}@test.com`;
  const agentEmail = `agent-mat-${ts}@test.com`;
  const custEmail = `cust-mat-${ts}@test.com`;

  beforeAll(async () => {
    app = await buildApp({ envOverrides: testEnv });
    await app.ready();

    // ── 管理员（注册 → 提权 → 登录）──
    await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: adminEmail, password: 'Admin12345', name: '素材管理员' },
    });
    await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.email, adminEmail));
    const adminLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: 'Admin12345' },
    });
    adminToken = adminLogin.json().accessToken;

    // ── 代理商（user + agents 行）──
    const [agentUser] = await db.insert(schema.users).values({
      email: agentEmail,
      passwordHash: bcrypt.hashSync('Test1234!', 10),
      name: '素材代理',
      role: 'agent',
    }).returning({ id: schema.users.id });
    agentUserId = agentUser!.id;
    const [agent] = await db.insert(schema.agents).values({
      userId: agentUserId,
      commissionRate: '10.00',
      availableBalance: '0',
      totalEarnings: '0',
    }).returning({ id: schema.agents.id });
    agentId = agent!.id;
    agentToken = (await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: agentEmail, password: 'Test1234!' },
    })).json().accessToken;

    // ── 客户 + 归属绑定 + 一笔消费佣金（排行榜数据）──
    const [cust] = await db.insert(schema.users).values({
      email: custEmail,
      passwordHash: bcrypt.hashSync('Test1234!', 10),
      name: '素材客户',
      role: 'customer',
    }).returning({ id: schema.users.id });
    const custId = cust!.id;
    await db.insert(schema.agentCustomers).values({
      agentId,
      customerUserId: custId,
      status: 'active',
      source: 'test',
    });
    const [consumption] = await db.insert(schema.consumptionRecords).values({
      userId: custId,
      requestId: `mat-req-${ts}`,
      model: 'gpt-4o',
      cost: '100.0000',
    }).returning({ id: schema.consumptionRecords.id });
    const { generateCommissionForConsumption } = await import('../src/services/agent/commission');
    const comm = await generateCommissionForConsumption({ userId: custId, consumptionRecordId: consumption!.id, cost: '100.0000' });
    expect(comm).not.toBeNull();
  });

  afterAll(async () => {
    await app.close();
  });

  // ═════════════════════════════════════════════
  // 1. POST /api/v1/admin/content — 创建素材
  // ═════════════════════════════════════════════

  it('agent 素材：创建 published → 201 + 审计写入', async () => {
    const slug = `material-launch-${ts}`;
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/content',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        type: 'marketing-material',
        slug,
        title: '春季上新推广文案',
        content: '尊敬的客户，3Cloud 春季模型上新…（模板正文）',
        status: 'published',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.id).toBeGreaterThan(0);
    expect(body.data.type).toBe('marketing-material');
    expect(body.data.slug).toBe(slug);
    expect(body.data.status).toBe('published');

    // 审计写入（writeAudit：action=ops.content-create，details 含 slug）
    const audits = await db.select({ id: schema.auditLogs.id })
      .from(schema.auditLogs)
      .where(and(
        eq(schema.auditLogs.action, 'ops.content-create'),
        sql`${schema.auditLogs.details}->>'slug' = ${slug}`,
      ))
      .limit(1);
    expect(audits.length).toBe(1);
  });

  it('agent 素材：创建 draft → 201 + status=draft', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/content',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        type: 'marketing-material',
        slug: `material-draft-${ts}`,
        title: '草稿素材',
        content: '草稿正文',
        status: 'draft',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.status).toBe('draft');
  });

  it('agent 素材：缺 content → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/content',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { type: 'marketing-material', slug: `material-nocontent-${ts}`, title: '无正文' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('agent 素材：marketing-material 的 slug 不符合约定 → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/content',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { type: 'marketing-material', slug: 'bad-slug-name', title: '非法 slug', content: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('agent 素材：重复 slug → 400', async () => {
    const slug = `material-dup-${ts}`;
    const first = await app.inject({
      method: 'POST', url: '/api/v1/admin/content',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { type: 'marketing-material', slug, title: '重复素材1', content: 'x' },
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: 'POST', url: '/api/v1/admin/content',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { type: 'marketing-material', slug, title: '重复素材2', content: 'y' },
    });
    expect(second.statusCode).toBe(400);
  });

  it('agent 素材：非 admin（代理商）创建 → 403', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/content',
      headers: { authorization: `Bearer ${agentToken}` },
      payload: { type: 'marketing-material', slug: `material-noperm-${ts}`, title: '越权', content: 'x' },
    });
    expect(res.statusCode).toBe(403);
  });

  // ═════════════════════════════════════════════
  // 2. GET /api/v1/agent/materials — 代理端素材列表
  // ═════════════════════════════════════════════

  it('GET /agent/materials → 只返回 published 素材（draft 排除），字段 id/slug/title/content/updated_at', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/agent/materials',
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const list = body.data.list as Array<{
      id: number; slug: string; title: string; content: string; updated_at: string;
    }>;
    expect(list.length).toBeGreaterThanOrEqual(1);

    // 只含 published（draft 不出现）
    const slugs = new Set(list.map((m) => m.slug));
    expect(slugs.has(`material-draft-${ts}`)).toBe(false);
    expect(slugs.has(`material-launch-${ts}`)).toBe(true);

    // 字段齐备
    for (const m of list) {
      expect(typeof m.id).toBe('number');
      expect(typeof m.slug).toBe('string');
      expect(typeof m.title).toBe('string');
      expect(typeof m.content).toBe('string');
      expect(!Number.isNaN(new Date(m.updated_at).getTime())).toBe(true);
    }

    // 模板正文原样返回（published 素材）
    const launch = list.find((m) => m.slug === `material-launch-${ts}`);
    expect(launch!.content).toContain('模板正文');
  });

  it('GET /agent/materials 未登录 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/materials' });
    expect(res.statusCode).toBe(401);
  });

  // ═════════════════════════════════════════════
  // 3. GET /api/v1/agent/ranking — 排行榜结构（month/total + 我的名次 + total）
  // ═════════════════════════════════════════════

  it('agent 排行 period=month：top 列表 + 我的名次 + total 字段', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/agent/ranking?period=month&limit=200',
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const list = body.data.list as Array<{
      rank: number; agent_id: number; agent_name: string; total_commission: number;
      customer_count: number; month_consumption: number; period: string;
    }>;
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < list.length; i++) {
      expect(list[i]!.rank).toBe(i + 1);
      expect(Number.isInteger(list[i]!.total_commission)).toBe(true);
      if (i > 0) expect(list[i - 1]!.total_commission).toBeGreaterThanOrEqual(list[i]!.total_commission);
    }

    // 我的名次（本测试代理佣金 100×10% = 10.00 → 1000 分）
    expect(body.data.my_rank).not.toBeNull();
    expect(body.data.my_rank.agent_id).toBe(agentId);
    expect(body.data.my_rank.total_commission).toBe(1000);
    expect(body.data.my_rank.customer_count).toBe(1);
    expect(body.data.my_rank.period).toBe(new Date().toISOString().slice(0, 7));

    // P2-2 新增：total = 榜单口径代理商总数（不受 limit 截断）
    expect(typeof body.data.total).toBe('number');
    expect(body.data.total).toBeGreaterThanOrEqual(1);
  });

  it('agent 排行 period=total：结构与我的名次（period=total）', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/agent/ranking?period=total',
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data.list)).toBe(true);
    expect(body.data.my_rank).not.toBeNull();
    expect(body.data.my_rank.agent_id).toBe(agentId);
    expect(body.data.my_rank.total_commission).toBe(1000);
    expect(body.data.my_rank.period).toBe('total');
    expect(typeof body.data.total).toBe('number');
    expect(body.data.total).toBeGreaterThanOrEqual(1);
  });

  it('agent 排行：未登录 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/ranking' });
    expect(res.statusCode).toBe(401);
  });
});
