/**
 * P2-2 邀请注册落地集成测试
 *
 * 覆盖（docs/iteration-plan-v2.md P2-2 测试要求）：
 *   ☐ 注册携带有效 invite_code → 用户创建成功 + agent_invitations.used_by/used_at 被标记 + 响应 invite_ok=true
 *   ☐ 注册携带无效/disabled 码 → 400，用户不创建
 *   ☐ 同码已被使用 → 400，用户不创建
 *   ☐ 并发同码注册（2 并发）→ 仅 1 个成功（原子占用）
 *   ☐ 注册带 invite_code 不产生 agent_customers 归属记录（SPEC-§8 模型对齐：归属唯一来源=报备划拨）
 *   ☐ 不带 invite_code 注册 → 回归正常 + invite_ok=false
 *
 * 说明：
 * - 真实 DB（threecloud_v3）+ Fastify app.inject，与 test/auth.test.ts / agent-settlement.test.ts 同模式。
 * - 每次运行使用 Date.now() 生成唯一邮箱/邀请码，避免共享 DB 残留冲突。
 * - 金额无涉及；邀请码字符集为大写字母+数字（生成逻辑见 services/agent/settlement.ts）。
 *
 * @see docs/SPEC-§8-运营增长模块.md（模型对齐声明）
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../src/db';
import { eq, and, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-jwt-secret-invite-register',
  PORT: '3036',
};

describe('Auth Register with invite_code（P2-2 邀请注册落地）', () => {
  let app: FastifyInstance;

  // 代理商（user + agents 行）+ 邀请码
  let agentUserId = 0;
  let agentId = 0;

  const ts = Date.now();

  /** 每次调用生成唯一邀请码（大写字母+数字） */
  const uniqueCode = (tag: string): string => `INV${tag}${ts % 100000000}`.toUpperCase().slice(0, 14);

  beforeAll(async () => {
    app = await buildApp({ envOverrides: testEnv });
    await app.ready();

    // 代理商用户 + agents 行
    const [agentUser] = await db.insert(schema.users).values({
      email: `agent-inv-${ts}@test.com`,
      passwordHash: bcrypt.hashSync('Test1234!', 10),
      name: '邀请代理商',
      role: 'agent',
    }).returning({ id: schema.users.id });
    agentUserId = agentUser!.id;
    const [agent] = await db.insert(schema.agents).values({
      userId: agentUserId,
      commissionRate: '15.00',
      availableBalance: '0',
      totalEarnings: '0',
    }).returning({ id: schema.agents.id });
    agentId = agent!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  /** 直插一条邀请码（active/disabled） */
  async function insertInvite(code: string, status: 'active' | 'disabled' = 'active'): Promise<number> {
    const [row] = await db.insert(schema.agentInvitations).values({
      agentId,
      code,
      status,
    }).returning({ id: schema.agentInvitations.id });
    return row!.id;
  }

  /** 注册请求 */
  function register(email: string, inviteCode?: string) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email,
        password: 'Test1234!',
        name: '新客户',
        ...(inviteCode ? { invite_code: inviteCode } : {}),
      },
    });
  }

  /** 按邮箱查用户 id（不存在返回 null） */
  async function findUserIdByEmail(email: string): Promise<number | null> {
    const rows = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
    return rows[0]?.id ?? null;
  }

  it('注册携带有效 invite_code → 201 + invite_ok=true + used_by/used_at 被标记 + 无 agent_customers 归属', async () => {
    const code = uniqueCode('OK');
    await insertInvite(code);
    const email = `invitee-ok-${ts}@test.com`;

    const res = await register(email, code);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe(email);
    expect(body.user.role).toBe('customer');
    expect(body.invite_ok).toBe(true);

    // 邀请记录被占用：used_by = 新用户 id，used_at 非空
    const userId = await findUserIdByEmail(email);
    expect(userId).not.toBeNull();
    const [inv] = await db.select({
      usedBy: schema.agentInvitations.usedBy,
      usedAt: schema.agentInvitations.usedAt,
      status: schema.agentInvitations.status,
    }).from(schema.agentInvitations).where(eq(schema.agentInvitations.code, code)).limit(1);
    expect(inv).toBeTruthy();
    expect(inv!.usedBy).toBe(userId);
    expect(inv!.usedAt).not.toBeNull();

    // 模型对齐（SPEC-§8）：邀请注册不产生客户归属
    const bindings = await db.select({ id: schema.agentCustomers.id })
      .from(schema.agentCustomers)
      .where(eq(schema.agentCustomers.customerUserId, userId!));
    expect(bindings).toHaveLength(0);
  });

  it('注册携带不存在的邀请码 → 400，用户不创建', async () => {
    const email = `invitee-bad-${ts}@test.com`;
    const res = await register(email, `NOPE${ts % 100000000}`);
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('邀请码');
    expect(await findUserIdByEmail(email)).toBeNull();
  });

  it('注册携带 disabled 邀请码 → 400，用户不创建', async () => {
    const code = uniqueCode('DIS');
    await insertInvite(code, 'disabled');
    const email = `invitee-dis-${ts}@test.com`;
    const res = await register(email, code);
    expect(res.statusCode).toBe(400);
    expect(await findUserIdByEmail(email)).toBeNull();
  });

  it('同码已被使用 → 第二次注册 400，用户不创建', async () => {
    const code = uniqueCode('USED');
    await insertInvite(code);
    const emailA = `invitee-used-a-${ts}@test.com`;
    const emailB = `invitee-used-b-${ts}@test.com`;

    const first = await register(emailA, code);
    expect(first.statusCode).toBe(201);
    expect(first.json().invite_ok).toBe(true);

    const second = await register(emailB, code);
    expect(second.statusCode).toBe(400);
    expect(second.json().message).toContain('邀请码');
    expect(await findUserIdByEmail(emailB)).toBeNull();
  });

  it('并发同码注册（2 并发）→ 仅 1 个成功（原子占用）', async () => {
    const code = uniqueCode('RACE');
    await insertInvite(code);
    const emailA = `invitee-race-a-${ts}@test.com`;
    const emailB = `invitee-race-b-${ts}@test.com`;

    const [ra, rb] = await Promise.all([register(emailA, code), register(emailB, code)]);
    const statuses = [ra.statusCode, rb.statusCode].sort();
    expect(statuses).toEqual([201, 400]);

    // 只存在一个用户（败者事务回滚）
    const idA = await findUserIdByEmail(emailA);
    const idB = await findUserIdByEmail(emailB);
    const winnerId = idA ?? idB;
    expect(winnerId).not.toBeNull();
    expect(idA !== null && idB !== null).toBe(false);

    // 邀请码 used_by 恰好指向胜者
    const [inv] = await db.select({ usedBy: schema.agentInvitations.usedBy })
      .from(schema.agentInvitations).where(eq(schema.agentInvitations.code, code)).limit(1);
    expect(inv!.usedBy).toBe(winnerId);
  });

  it('不带 invite_code 注册 → 回归正常 + invite_ok=false', async () => {
    const email = `invitee-none-${ts}@test.com`;
    const res = await register(email);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe(email);
    expect(body.invite_ok).toBe(false);
    expect(body.accessToken).toBeDefined();
  });

  it('邀请码大小写归一：小写输入命中大写存储码', async () => {
    const code = uniqueCode('LOWER');
    await insertInvite(code);
    const email = `invitee-lower-${ts}@test.com`;
    const res = await register(email, code.toLowerCase());
    expect(res.statusCode).toBe(201);
    expect(res.json().invite_ok).toBe(true);

    const [inv] = await db.select({ usedBy: schema.agentInvitations.usedBy })
      .from(schema.agentInvitations).where(and(eq(schema.agentInvitations.code, code), isNull(schema.agentInvitations.usedBy))).limit(1);
    // 大写存储码已被占用
    expect(inv).toBeUndefined();
  });
});
