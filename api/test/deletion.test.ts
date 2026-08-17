/**
 * P2-4 账号注销流转集成测试 — /me/deletion/* + /admin/deletion-requests/*（真实 PG + Redis）
 *
 * 覆盖（docs/iteration-plan-v2.md P2-4 测试要求 + SPEC §2.11 边界）：
 *   1. checks：余额/工单/归属客户/代理身份/进行中导出 各布尔正确
 *   2. request → approve（cool_down_until=+7d）→ execute（删 api_keys/清余额/status=deleted）
 *   3. reject（原因必填）/ cancel（pending 直接撤；approved 冷静期内恢复；过冷静期 400）
 *   4. 已有申请重复提交 400
 *   5. 删除后登录被拒（users.status='deleted'）
 *   6. 管理端权限：非 admin → 403
 *
 * 环境：独立端口 3037；唯一 email 隔离。
 *
 * @see docs/iteration-plan-v2.md P2-4
 * @see docs/SPEC-§2-用户体系.md §2.11
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../src/db';
import { eq, sql, desc } from 'drizzle-orm';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-deletion-secret-p2-4',
  PORT: '3037',
};

let app: FastifyInstance;

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function registerUser(prefix: string) {
  const email = `${prefix}-${uid()}@test.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'Test1234!', name: 'P2-4 Del Test' },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as { user: { id: number; email: string }; accessToken: string };
  return { email, user: body.user, accessToken: body.accessToken };
}

async function registerAdmin(prefix: string) {
  const { email, user } = await registerUser(prefix);
  await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, user.id));
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'Test1234!' } });
  expect(login.statusCode).toBe(200);
  return { email, user, accessToken: (login.json() as { accessToken: string }).accessToken };
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** 清零用户余额（注册自带 ¥10 体验金） */
async function zeroBalance(userId: number) {
  await db.update(schema.customerBalances)
    .set({ totalBalance: '0', availableBalance: '0', frozenBalance: '0' })
    .where(eq(schema.customerBalances.userId, userId));
}

async function submitDeletion(accessToken: string, reason = '不再使用此平台') {
  return app.inject({ method: 'POST', url: '/api/v1/me/deletion/request', headers: auth(accessToken), payload: { reason } });
}

beforeAll(async () => {
  app = await buildApp({ envOverrides: testEnv });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/v1/me/deletion/checks', () => {
  it('默认用户：余额>0（体验金）→ balance.blocked=true，其余 false', async () => {
    const { user, accessToken } = await registerUser('del-checks-default');
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/deletion/checks', headers: auth(accessToken) });
    expect(res.statusCode).toBe(200);
    const checks = (res.json() as any).data.checks;
    expect(checks.balance.blocked).toBe(true);
    expect(checks.tickets.blocked).toBe(false);
    expect(checks.ownedCustomers.blocked).toBe(false);
    expect(checks.agent.blocked).toBe(false);
    expect(checks.pendingExport.blocked).toBe(false);
    expect((res.json() as any).data.allClear).toBe(false);
    expect(checks.balance.message).toContain('余额将清零');
    void user;
  });

  it('余额清零 + 进行中工单 + 进行中导出 → 对应布尔 true', async () => {
    const { user, accessToken } = await registerUser('del-checks-full');
    await zeroBalance(user.id);

    await db.insert(schema.tickets).values({
      userId: user.id, type: 'general', title: 't', content: 'c', status: 'open', priority: 'normal',
    });
    await db.insert(schema.dataRequests).values({
      userId: user.id, requestType: 'data_export', status: 'pending', dataScope: 'all',
    });

    const res = await app.inject({ method: 'GET', url: '/api/v1/me/deletion/checks', headers: auth(accessToken) });
    const checks = (res.json() as any).data.checks;
    expect(checks.balance.blocked).toBe(false);
    expect(checks.tickets.blocked).toBe(true);
    expect(checks.tickets.value).toBeGreaterThanOrEqual(1);
    expect(checks.pendingExport.blocked).toBe(true);
  });

  it('代理商 + 归属客户 → agent/ownedCustomers.blocked=true', async () => {
    const agent = await registerUser('del-checks-agent');
    await db.update(schema.users).set({ role: 'agent' }).where(eq(schema.users.id, agent.user.id));
    const [agentRow] = await db.insert(schema.agents).values({
      userId: agent.user.id, level: 'junior', commissionRate: '10.00', status: 'active', inviteCode: `INV${Math.random().toString(36).slice(2, 10)}`,
    }).returning({ id: schema.agents.id });
    // 绑定一个归属客户
    const customer = await registerUser('del-checks-cust');
    await db.insert(schema.agentCustomers).values({ agentId: agentRow!.id, customerUserId: customer.user.id, status: 'active' });

    const res = await app.inject({ method: 'GET', url: '/api/v1/me/deletion/checks', headers: auth(agent.accessToken) });
    const checks = (res.json() as any).data.checks;
    expect(checks.agent.blocked).toBe(true);
    expect(checks.ownedCustomers.blocked).toBe(true);
    expect(checks.ownedCustomers.value).toBeGreaterThanOrEqual(1);
  });
});

describe('注销 deletion 状态机：request → approve → execute', () => {
  it('提交（reason 必填）→ approve（+7 天冷静期）→ 冷静期前 execute 400 → 冷静期后 execute 全清', async () => {
    const { user, accessToken } = await registerUser('del-flow');
    const admin = await registerAdmin('del-flow-admin');
    await zeroBalance(user.id);

    // reason 缺失 → 400
    const noReason = await submitDeletion(accessToken, '');
    expect(noReason.statusCode).toBe(400);

    // 提交
    const submit = await submitDeletion(accessToken);
    expect(submit.statusCode).toBe(201);
    const req = (submit.json() as any).data;
    expect(req.status).toBe('pending');

    // 重复提交 → 400
    const dup = await submitDeletion(accessToken);
    expect(dup.statusCode).toBe(400);
    expect(dup.json().code).toBe('EXISTS');

    // status 端点
    const statusRes = await app.inject({ method: 'GET', url: '/api/v1/me/deletion/status', headers: auth(accessToken) });
    expect(statusRes.statusCode).toBe(200);
    expect((statusRes.json() as any).data.status).toBe('pending');

    // 管理端列表
    const adminList = await app.inject({ method: 'GET', url: '/api/v1/admin/deletion-requests?status=pending', headers: auth(admin.accessToken) });
    expect(adminList.statusCode).toBe(200);
    expect((adminList.json() as any).data.list.some((r: any) => r.id === req.id)).toBe(true);

    // approve → +7 天冷静期，users.status='deleting'
    const approve = await app.inject({ method: 'POST', url: `/api/v1/admin/deletion-requests/${req.id}/approve`, headers: auth(admin.accessToken) });
    expect(approve.statusCode).toBe(200);
    const approved = approve.json().data;
    expect(approved.status).toBe('approved');
    const coolDown = new Date(approved.coolDownUntil).getTime();
    expect(coolDown).toBeGreaterThan(Date.now() + 6 * 86400_000);
    expect(coolDown).toBeLessThan(Date.now() + 8 * 86400_000);
    const [u1] = await db.select({ status: schema.users.status }).from(schema.users).where(eq(schema.users.id, user.id));
    expect(u1!.status).toBe('deleting');

    // 冷静期内 execute → 400
    const earlyExecute = await app.inject({ method: 'POST', url: `/api/v1/admin/deletion-requests/${req.id}/execute`, headers: auth(admin.accessToken) });
    expect(earlyExecute.statusCode).toBe(400);
    expect(earlyExecute.json().code).toBe('COOL_DOWN_NOT_REACHED');

    // 模拟冷静期结束
    await db.update(schema.deletionRequests)
      .set({ coolDownUntil: sql`NOW() - INTERVAL '1 hour'` })
      .where(eq(schema.deletionRequests.id, req.id));

    // 造数据：api_key + session + 余额（先充一点再清零验证）
    await db.insert(schema.apiKeys).values({
      userId: user.id, keyHash: `del-key-${uid()}`, keyPrefix: '3c_del_', name: 'k', status: 'active',
    });
    await db.update(schema.customerBalances)
      .set({ totalBalance: '100.00', availableBalance: '100.00' })
      .where(eq(schema.customerBalances.userId, user.id));

    // execute
    const execute = await app.inject({ method: 'POST', url: `/api/v1/admin/deletion-requests/${req.id}/execute`, headers: auth(admin.accessToken) });
    expect(execute.statusCode).toBe(200);
    expect(execute.json().data.status).toBe('deleted');

    // 验证：api_keys 已删
    const keys = await db.select({ id: schema.apiKeys.id }).from(schema.apiKeys).where(eq(schema.apiKeys.userId, user.id));
    expect(keys).toHaveLength(0);
    // 验证：sessions 已删
    const sessions = await db.select({ id: schema.userSessions.id }).from(schema.userSessions).where(eq(schema.userSessions.userId, user.id));
    expect(sessions).toHaveLength(0);
    // 验证：余额清零 + 记账
    const [bal] = await db.select().from(schema.customerBalances).where(eq(schema.customerBalances.userId, user.id));
    expect(Number(bal!.totalBalance)).toBe(0);
    const [txRow] = await db.select().from(schema.balanceTransactions)
      .where(sql`${schema.balanceTransactions.userId} = ${user.id} AND ${schema.balanceTransactions.referenceType} = 'account_deletion'`)
      .orderBy(desc(schema.balanceTransactions.createdAt)).limit(1);
    expect(txRow).toBeTruthy();
    expect(Number(txRow!.amount)).toBe(-100);
    expect(Number(txRow!.balanceAfter)).toBe(0);
    expect(txRow!.description).toContain('注销余额清零');
    // 验证：users.status='deleted'
    const [u2] = await db.select({ status: schema.users.status }).from(schema.users).where(eq(schema.users.id, user.id));
    expect(u2!.status).toBe('deleted');
    // 验证：deletion_requests 收尾
    const [dr] = await db.select().from(schema.deletionRequests).where(eq(schema.deletionRequests.id, req.id));
    expect(dr!.status).toBe('deleted');
    expect(dr!.deletedAt).toBeTruthy();
    // 验证：登录被拒
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: user.email, password: 'Test1234!' } });
    expect(login.statusCode).toBe(401);
    // 验证：已注销用户再提交 → 400
    const again = await app.inject({ method: 'POST', url: '/api/v1/me/deletion/request', headers: auth(accessToken), payload: { reason: 'x' } });
    expect(again.statusCode).toBe(400);
  });

  it('reject：驳回原因必填；驳回后用户仍可登录（status=active）', async () => {
    const { user, accessToken } = await registerUser('del-reject');
    const admin = await registerAdmin('del-reject-admin');
    const submit = await submitDeletion(accessToken);
    const req = (submit.json() as any).data;

    // 无原因 → 400
    const noNote = await app.inject({ method: 'POST', url: `/api/v1/admin/deletion-requests/${req.id}/reject`, headers: auth(admin.accessToken), payload: {} });
    expect(noNote.statusCode).toBe(400);

    const reject = await app.inject({ method: 'POST', url: `/api/v1/admin/deletion-requests/${req.id}/reject`, headers: auth(admin.accessToken), payload: { note: '原因不符合' } });
    expect(reject.statusCode).toBe(200);
    expect(reject.json().data.status).toBe('rejected');
    expect(reject.json().data.adminNote).toBe('原因不符合');

    const [u] = await db.select({ status: schema.users.status }).from(schema.users).where(eq(schema.users.id, user.id));
    expect(u!.status).toBe('active');
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: user.email, password: 'Test1234!' } });
    expect(login.statusCode).toBe(200);
  });

  it('cancel：pending 直接撤；approved 冷静期内撤 + 恢复 active；过冷静期 400', async () => {
    // pending 直接撤
    const a = await registerUser('del-cancel-a');
    const s1 = await submitDeletion(a.accessToken);
    const r1 = (s1.json() as any).data;
    const c1 = await app.inject({ method: 'POST', url: '/api/v1/me/deletion/cancel', headers: auth(a.accessToken) });
    expect(c1.statusCode).toBe(200);
    expect(c1.json().data.status).toBe('cancelled');

    // approved 冷静期内撤 → 恢复 active
    const b = await registerUser('del-cancel-b');
    const admin = await registerAdmin('del-cancel-admin');
    const s2 = await submitDeletion(b.accessToken);
    const r2 = (s2.json() as any).data;
    await app.inject({ method: 'POST', url: `/api/v1/admin/deletion-requests/${r2.id}/approve`, headers: auth(admin.accessToken) });
    const c2 = await app.inject({ method: 'POST', url: '/api/v1/me/deletion/cancel', headers: auth(b.accessToken) });
    expect(c2.statusCode).toBe(200);
    expect(c2.json().data.status).toBe('cancelled');
    const [ub] = await db.select({ status: schema.users.status }).from(schema.users).where(eq(schema.users.id, b.user.id));
    expect(ub!.status).toBe('active');

    // approved 过冷静期撤 → 400
    const d = await registerUser('del-cancel-d');
    const admin2 = await registerAdmin('del-cancel-admin2');
    const s3 = await submitDeletion(d.accessToken);
    const r3 = (s3.json() as any).data;
    await app.inject({ method: 'POST', url: `/api/v1/admin/deletion-requests/${r3.id}/approve`, headers: auth(admin2.accessToken) });
    await db.update(schema.deletionRequests)
      .set({ coolDownUntil: sql`NOW() - INTERVAL '1 hour'` })
      .where(eq(schema.deletionRequests.id, r3.id));
    const c3 = await app.inject({ method: 'POST', url: '/api/v1/me/deletion/cancel', headers: auth(d.accessToken) });
    expect(c3.statusCode).toBe(400);
    expect(c3.json().code).toBe('COOL_DOWN_EXPIRED');
  });

  it('无申请时 cancel → 400 NO_REQUEST', async () => {
    const { accessToken } = await registerUser('del-no-req');
    const res = await app.inject({ method: 'POST', url: '/api/v1/me/deletion/cancel', headers: auth(accessToken) });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('NO_REQUEST');
  });
});

describe('注销 deletion 权限：管理端端点', () => {
  it('非 admin → 403；无 token → 401', async () => {
    const { accessToken } = await registerUser('del-perm');
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/deletion-requests', headers: auth(accessToken) });
    expect(res.statusCode).toBe(403);
    const noToken = await app.inject({ method: 'GET', url: '/api/v1/admin/deletion-requests' });
    expect(noToken.statusCode).toBe(401);
  });
});
