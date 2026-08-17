/**
 * P1-2 代理商结算单 + 邀请码端点集成测试
 *
 * 覆盖：/agent/settlements（列表/详情/确认）、/agent/ranking、/agent/invite/*（code/regenerate/records）
 *
 * 说明：
 * - 越权用例：所有端点都通过 requireAgent 从 JWT 的 userId 解析当前代理商，
 *   数据天然按 agentId 隔离（无"按 id 操作他人资源"的入口），故不适用传统越权用例；
 *   用「B 代理看不到 A 代理的结算单/邀请记录」的资源隔离用例替代验证。
 * - 结算确认标记落在 system_config KV（P1-2 约束下不改 schema/migration），幂等由 onConflictDoUpdate 保证。
 * - 金额断言口径：DB 存「元」（numeric），API 输出「分」（整数）。
 *
 * @see docs/iteration-plan-v2.md P1-2
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../src/db';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { generateAccessToken } from '../src/services/auth/jwt';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:***@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-agent-settlement-secret',
  PORT: '3035',
};

describe('Agent Settlement + Invite（P1-2）', () => {
  let app: FastifyInstance;

  // 三个代理商的 agents.id 与对应用户的 users.id（用于签发登录态 token）
  let agentAId = 0;
  let agentAUserId = 0;
  let agentBId = 0;
  let agentBUserId = 0;
  let agentCId = 0;
  let agentCUserId = 0;
  let cust1Id = 0;
  let cust2Id = 0;
  let cust3Id = 0;

  /** 当前 UTC 会计期（DB to_char 与 JS toISOString 同口径） */
  const utcMonth = new Date().toISOString().slice(0, 7);
  /** 上一会计期（YYYY-MM） */
  const lastMonth = (() => {
    const [y, m] = utcMonth.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  })();
  /** 上一期的一个 UTC 时间点（用于造 settled_at 落上一期） */
  const lastMonthDate = new Date(Date.UTC(Number(utcMonth.slice(0, 4)), Number(utcMonth.slice(5, 7)) - 2, 15));

  // consumption_record_id 为 int4，Date.now() 会溢出 → 用时间截断的小自增 id（每次运行唯一）
  let nextCid = 500000 + (Date.now() % 400000);
  const nextConsumptionId = (): number => (nextCid += 1);

  /** 登录态请求头（真实签发 JWT，与 jwtAuth 校验同一密钥来源） */
  function authHeader(userId: number): { authorization: string } {
    const token = generateAccessToken({ userId, email: `agent-user-${userId}@test.com`, role: 'agent' });
    return { authorization: `Bearer ${token}` };
  }

  /** 创建用户 */
  async function createUser(email: string, name: string, role: 'customer' | 'agent'): Promise<number> {
    const [row] = await db.insert(schema.users).values({
      email,
      passwordHash: bcrypt.hashSync('Test1234!', 10),
      name,
      role,
    }).returning({ id: schema.users.id });
    return row!.id;
  }

  /** 创建代理商（agents 行） */
  async function createAgent(userId: number, rate: number): Promise<number> {
    const [row] = await db.insert(schema.agents).values({
      userId,
      commissionRate: rate.toFixed(2),
      availableBalance: '0',
      totalEarnings: '0',
    }).returning({ id: schema.agents.id });
    return row!.id;
  }

  /** 创建消费记录，返回 consumption_records.id */
  async function insertConsumption(userId: number, cost: string): Promise<number> {
    const [row] = await db.insert(schema.consumptionRecords).values({
      userId,
      requestId: `agent-settle-req-${nextConsumptionId()}-${Date.now()}`,
      model: 'gpt-4o',
      cost,
    }).returning({ id: schema.consumptionRecords.id });
    return row!.id;
  }

  /** 消费 → 实时佣金（服务层，settled + settledAt=now，落在当前月） */
  async function earnCommission(userId: number, cost: string): Promise<void> {
    const { generateCommissionForConsumption } = await import('../src/services/agent/commission');
    const cid = await insertConsumption(userId, cost);
    const comm = await generateCommissionForConsumption({ userId, consumptionRecordId: cid, cost });
    expect(comm).not.toBeNull();
  }

  beforeAll(async () => {
    app = await buildApp({ envOverrides: testEnv });
    await app.ready();

    // ── 代理商 A：15%，2 个客户（本月 2 笔 + 上月 1 笔佣金）──
    agentAUserId = await createUser(`agent-a-${Date.now()}@test.com`, '代理A', 'agent');
    agentAId = await createAgent(agentAUserId, 15);
    cust1Id = await createUser(`cust-a1-${Date.now()}@test.com`, '客户A1', 'customer');
    cust2Id = await createUser(`cust-a2-${Date.now()}@test.com`, '客户A2', 'customer');
    await db.insert(schema.agentCustomers).values([
      { agentId: agentAId, customerUserId: cust1Id, status: 'active', source: 'test' },
      { agentId: agentAId, customerUserId: cust2Id, status: 'active', source: 'test' },
    ]);

    // 代理商 A 本月佣金：100×15% = 15.00；200×15% = 30.00
    await earnCommission(cust1Id, '100.0000');
    await earnCommission(cust2Id, '200.0000');
    // 代理商 A 上月佣金：50×15% = 7.50（直插，settledAt 落上一期）
    {
      const cid = await insertConsumption(cust1Id, '50.0000');
      await db.insert(schema.agentCommissions).values({
        agentId: agentAId,
        customerUserId: cust1Id,
        consumptionRecordId: cid,
        amount: '7.5000',
        rate: '15.00',
        status: 'settled',
        settledAt: lastMonthDate,
      });
    }

    // ── 代理商 B：10%，1 个客户（本月 1 笔佣金 50.00）──
    agentBUserId = await createUser(`agent-b-${Date.now()}@test.com`, '代理B', 'agent');
    agentBId = await createAgent(agentBUserId, 10);
    cust3Id = await createUser(`cust-b3-${Date.now()}@test.com`, '客户B3', 'customer');
    await db.insert(schema.agentCustomers).values({
      agentId: agentBId,
      customerUserId: cust3Id,
      status: 'active',
      source: 'test',
    });
    await earnCommission(cust3Id, '500.0000');

    // ── 代理商 C：无任何佣金（空态用）──
    agentCUserId = await createUser(`agent-c-${Date.now()}@test.com`, '代理C', 'agent');
    agentCId = await createAgent(agentCUserId, 10);
  });

  afterAll(async () => {
    await app.close();
  });

  // ═════════════════════════════════════════════
  // 1. GET /api/v1/agent/settlements — 月度结算单列表
  // ═════════════════════════════════════════════

  it('settlements 列表：空态 → 200 + 空数组', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/settlements', headers: authHeader(agentCUserId) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data?.rows)).toBe(true);
    expect(body.data.rows).toHaveLength(0);
    expect(body.data.total).toBe(0);
  });

  it('settlements 列表：有数据 → 按会计期汇总（金额为分，精度正确，期倒序）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/settlements', headers: authHeader(agentAUserId) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const rows = body.data.rows;
    expect(rows).toHaveLength(2);

    // 期倒序：本月在前，上月在后
    expect(rows[0].period).toBe(utcMonth);
    expect(rows[0].total_commission).toBe(4500); // 15.00 + 30.00（分）
    expect(rows[0].settled_count).toBe(2);
    // 会计期状态来自共享 accounting_periods（其它任务/seed 可能已建当期行）→ 只断言合法枚举
    expect(['open', 'locked', 'unlocked']).toContain(rows[0].status);
    expect(rows[0].confirmable).toBe(true);

    expect(rows[1].period).toBe(lastMonth);
    expect(rows[1].total_commission).toBe(750); // 7.50（分）
    expect(rows[1].settled_count).toBe(1);
    expect(['open', 'locked', 'unlocked']).toContain(rows[1].status);

    // 统计
    expect(body.data.stats.pending).toBe(2);
    expect(body.data.stats.settled).toBe(0);
    expect(body.data.stats.month_commission).toBe(4500);
    expect(body.data.stats.total_settled).toBe(0);
  });

  it('settlements 列表：未登录 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/settlements' });
    expect(res.statusCode).toBe(401);
  });

  // ═════════════════════════════════════════════
  // 2. GET /api/v1/agent/settlements/:period — 单期详情
  // ═════════════════════════════════════════════

  it('settlements/:period 详情：有数据 → 200 + 明细（分）+ 汇总', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/agent/settlements/${utcMonth}`,
      headers: authHeader(agentAUserId),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items).toHaveLength(2);
    expect(body.data.summary.period).toBe(utcMonth);
    expect(body.data.summary.total_commission).toBe(4500);
    expect(body.data.summary.settled_count).toBe(2);
    expect(body.data.summary.confirmed).toBe(false);
    expect(body.data.summary.confirmable).toBe(true);

    // 明细字段：客户邮箱 / 消费金额（分）/ 佣金比例 / 佣金（分）
    const item = body.data.items.find((r: any) => r.commission === 3000); // 200.00 × 15%
    expect(item).toBeTruthy();
    expect(item.amount).toBe(20000); // 消费 200.00（分）
    expect(item.rate).toBe(15);
    expect(item.customer_email).toContain('cust-a2');
    expect(item.status).toBe('settled');
    expect(item.settled_at).toBeTruthy();
  });

  it('settlements/:period 详情：不存在期 → 200 + 空明细（保持一致，不抛 404）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/agent/settlements/2099-01',
      headers: authHeader(agentAUserId),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.items).toHaveLength(0);
    expect(body.data.summary.total_commission).toBe(0);
    expect(body.data.summary.settled_count).toBe(0);
  });

  it('settlements/:period 详情：非法期格式 → 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/agent/settlements/abc',
      headers: authHeader(agentAUserId),
    });
    expect(res.statusCode).toBe(400);
  });

  it('settlements/:period 详情：未登录 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/agent/settlements/${utcMonth}` });
    expect(res.statusCode).toBe(401);
  });

  // ═════════════════════════════════════════════
  // 3. POST /api/v1/agent/settlements/:period/confirm — 确认结算
  // ═════════════════════════════════════════════

  it('confirm：首次确认 → 200 + 已确认结果', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/agent/settlements/${utcMonth}/confirm`,
      headers: authHeader(agentAUserId),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.confirmed).toBe(true);
    expect(body.data.period).toBe(utcMonth);
    expect(body.data.total_commission).toBe(4500);
    expect(body.data.settled_count).toBe(2);
  });

  it('confirm：重复确认 → 幂等 200 + 同结果（不报错、不重复生成）', async () => {
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/agent/settlements/${utcMonth}/confirm`,
      headers: authHeader(agentAUserId),
    });
    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/agent/settlements/${utcMonth}/confirm`,
      headers: authHeader(agentAUserId),
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const a = first.json();
    const b = second.json();
    expect(b.data.confirmed).toBe(true);
    expect(b.data.total_commission).toBe(a.data.total_commission);
    expect(b.data.settled_count).toBe(a.data.settled_count);

    // 确认后列表该期 confirmable=false、stats.settled=1
    const list = await app.inject({ method: 'GET', url: '/api/v1/agent/settlements', headers: authHeader(agentAUserId) });
    const rows = list.json().data.rows;
    const row = rows.find((r: any) => r.period === utcMonth);
    expect(row.confirmable).toBe(false);
    expect(list.json().data.stats.settled).toBe(1);
  });

  it('confirm：已锁定会计期（locked）允许确认，且不重复生成', async () => {
    // 造一个 locked 会计期 + 该期有 A 的佣金 → 确认应成功
    // （onConflictDoUpdate 强制 locked，避免共享 DB 中该期已有其它状态导致断言不确定）
    await db.insert(schema.accountingPeriods).values({
      period: lastMonth,
      status: 'locked',
      incomeTotal: '0',
      expenseTotal: '0',
      grossProfit: '0',
      grossMargin: '0',
      lockedAt: new Date(),
    }).onConflictDoUpdate({
      target: schema.accountingPeriods.period,
      set: { status: 'locked', lockedAt: new Date() },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/agent/settlements/${lastMonth}/confirm`,
      headers: authHeader(agentAUserId),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.confirmed).toBe(true);
    expect(res.json().data.status).toBe('locked');
    expect(res.json().data.total_commission).toBe(750);

    // 幂等复查：重复确认仍 200，金额不变
    const again = await app.inject({
      method: 'POST',
      url: `/api/v1/agent/settlements/${lastMonth}/confirm`,
      headers: authHeader(agentAUserId),
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().data.total_commission).toBe(750);
  });

  it('confirm：未登录 → 401', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/v1/agent/settlements/${utcMonth}/confirm` });
    expect(res.statusCode).toBe(401);
  });

  // ═════════════════════════════════════════════
  // 4. GET /api/v1/agent/ranking — 业绩排名
  // ═════════════════════════════════════════════

  it('ranking：金额降序、含自己的名次、金额为分', async () => {
    // limit=200 拉满，避免共享 DB 中其它代理商把 A 挤出前 50
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/agent/ranking?period=month&limit=200',
      headers: authHeader(agentAUserId),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const list = body.data.list as Array<{
      rank: number; agent_id: number; agent_name: string; total_commission: number;
      customer_count: number; period: string;
    }>;
    expect(list.length).toBeGreaterThanOrEqual(1);

    // 金额降序 + rank 连续 + 金额为分（整数）
    for (let i = 0; i < list.length; i++) {
      expect(list[i].rank).toBe(i + 1);
      expect(Number.isInteger(list[i].total_commission)).toBe(true);
      if (i > 0) {
        expect(list[i - 1].total_commission).toBeGreaterThanOrEqual(list[i].total_commission);
      }
    }

    // 自己的行：A 本月 = 15.00 + 30.00 = 4500 分，2 个客户
    const mine = list.find((r) => r.agent_id === agentAId);
    expect(mine).toBeTruthy();
    expect(mine!.total_commission).toBe(4500);
    expect(mine!.customer_count).toBe(2);
    expect(mine!.period).toBe(utcMonth);

    // 自己的名次：与榜单行一致，且名次前佣金 ≥ 自己
    expect(body.data.my_rank).not.toBeNull();
    expect(body.data.my_rank.agent_id).toBe(agentAId);
    expect(body.data.my_rank.rank).toBe(mine!.rank);
    expect(body.data.my_rank.total_commission).toBe(4500);
    if (mine!.rank > 1) {
      expect(list[mine!.rank - 2].total_commission).toBeGreaterThanOrEqual(mine!.total_commission);
    }
  });

  it('ranking：累计口径（period=total）包含上月佣金', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/agent/ranking?period=total',
      headers: authHeader(agentAUserId),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const my = body.data.my_rank;
    expect(my).not.toBeNull();
    // A 累计 = 15.00 + 30.00 + 7.50 = 52.50 → 5250 分
    expect(my.total_commission).toBe(5250);
    expect(my.period).toBe('total');
  });

  it('ranking：未登录 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/ranking' });
    expect(res.statusCode).toBe(401);
  });

  // ═════════════════════════════════════════════
  // 5. 资源隔离（越权不适用：所有端点按 requireAgent 的 userId 自动限定本人）
  // ═════════════════════════════════════════════

  it('资源隔离：B 代理看不到 A 代理的结算单与邀请记录', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/settlements', headers: authHeader(agentBUserId) });
    expect(res.statusCode).toBe(200);
    const rows = res.json().data.rows;
    // B 只有本月 50.00，看不到 A 的期与金额
    expect(rows).toHaveLength(1);
    expect(rows[0].total_commission).toBe(5000);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/agent/settlements/${utcMonth}`,
      headers: authHeader(agentBUserId),
    });
    expect(detail.json().data.summary.total_commission).toBe(5000);
    expect(detail.json().data.summary.settled_count).toBe(1);

    const invites = await app.inject({ method: 'GET', url: '/api/v1/agent/invite/records', headers: authHeader(agentBUserId) });
    expect(invites.json().data.list).toHaveLength(0);
  });

  // ═════════════════════════════════════════════
  // 6. 邀请码：GET code / POST regenerate / GET records
  // ═════════════════════════════════════════════

  it('invite/code：无有效码 → { code: null }', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/invite/code', headers: authHeader(agentCUserId) });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.code).toBeNull();
  });

  it('invite/code/regenerate：生成新码（8~12 位大写字母数字），旧码失效，再次生成码不同', async () => {
    const h = authHeader(agentAUserId);
    const first = await app.inject({ method: 'POST', url: '/api/v1/agent/invite/code/regenerate', headers: h });
    expect(first.statusCode).toBe(200);
    const code1 = first.json().data.code as string;
    expect(code1).toMatch(/^[A-Z0-9]{8,12}$/);

    // 当前有效码 = code1
    const cur1 = await app.inject({ method: 'GET', url: '/api/v1/agent/invite/code', headers: h });
    expect(cur1.json().data.code).toBe(code1);

    // 再次 regenerate → 新码 ≠ 旧码，旧码失效
    const second = await app.inject({ method: 'POST', url: '/api/v1/agent/invite/code/regenerate', headers: h });
    expect(second.statusCode).toBe(200);
    const code2 = second.json().data.code as string;
    expect(code2).toMatch(/^[A-Z0-9]{8,12}$/);
    expect(code2).not.toBe(code1);

    const cur2 = await app.inject({ method: 'GET', url: '/api/v1/agent/invite/code', headers: h });
    expect(cur2.json().data.code).toBe(code2);

    // records：code1 已 disabled，code2 为 active
    const recs = await app.inject({ method: 'GET', url: '/api/v1/agent/invite/records', headers: h });
    const list = recs.json().data.list as Array<{ code: string; status: string }>;
    expect(list.find((r) => r.code === code1)?.status).toBe('disabled');
    expect(list.find((r) => r.code === code2)?.status).toBe('active');
  });

  it('invite code 唯一：插入重复 code 触发唯一约束（DB 兜底）', async () => {
    // 固定字面量会在共享 DB 跨运行残留 → 每次运行唯一
    const dupCode = `TESTCODE${Date.now() % 100000000}`;

    // 直插一条已知码（模拟已存在的历史码）
    await db.insert(schema.agentInvitations).values({
      agentId: agentAId,
      code: dupCode,
      status: 'disabled',
    });

    // 重复插入同码 → 必须抛唯一约束错误（23505）
    await expect(
      db.insert(schema.agentInvitations).values({ agentId: agentAId, code: dupCode, status: 'active' }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('invite/records：返回使用记录（used_by 用户名/邮箱/used_at），按创建时间倒序', async () => {
    const inviteeEmail = `invitee-${Date.now()}@test.com`;
    const inviteeId = await createUser(inviteeEmail, '被邀请客户', 'customer');

    // 把 A 的某条码标记为已使用
    const [inv] = await db.select({ id: schema.agentInvitations.id })
      .from(schema.agentInvitations)
      .where(eq(schema.agentInvitations.agentId, agentAId))
      .orderBy(schema.agentInvitations.id)
      .limit(1);
    const usedAt = new Date();
    await db.update(schema.agentInvitations)
      .set({ usedBy: inviteeId, usedAt })
      .where(eq(schema.agentInvitations.id, inv!.id));

    const res = await app.inject({ method: 'GET', url: '/api/v1/agent/invite/records', headers: authHeader(agentAUserId) });
    expect(res.statusCode).toBe(200);
    const list = res.json().data.list as Array<{
      id: number; code: string; status: string; invitee_name: string | null;
      invitee_email: string | null; used_at: string | null; created_at: string;
    }>;
    expect(list.length).toBeGreaterThanOrEqual(1);

    // 倒序：created_at 非递增
    for (let i = 1; i < list.length; i++) {
      expect(new Date(list[i - 1].created_at).getTime()).toBeGreaterThanOrEqual(new Date(list[i].created_at).getTime());
    }

    const used = list.find((r) => r.id === inv!.id);
    expect(used).toBeTruthy();
    expect(used!.invitee_name).toBe('被邀请客户');
    expect(used!.invitee_email).toBe(inviteeEmail);
    expect(used!.used_at).toBeTruthy();
  });

  it('invite 端点：未登录 → 401（code / regenerate / records）', async () => {
    const cases: Array<{ method: 'GET' | 'POST'; url: string }> = [
      { method: 'GET', url: '/api/v1/agent/invite/code' },
      { method: 'POST', url: '/api/v1/agent/invite/code/regenerate' },
      { method: 'GET', url: '/api/v1/agent/invite/records' },
    ];
    for (const c of cases) {
      const res = await app.inject({ method: c.method, url: c.url });
      expect(res.statusCode).toBe(401);
    }
  });
});
