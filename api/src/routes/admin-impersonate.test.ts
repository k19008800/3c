/**
 * 管理员「以用户身份登录」（Impersonation）后端集成测试
 *
 * 覆盖 kb/3cloud/admin-impersonate.md D1~D5：
 *   1. customer / agent 调用 impersonate → 403（非管理员越权）
 *   2. admin 调用成功 → 返回 accessToken + impersonateBy；verifyToken 后
 *      userId=目标、role=目标 role、impersonateBy 存在
 *   3. 目标 disabled → 拒绝
 *   4. 用模拟令牌请求 /api/v1/me → 返回目标用户身份
 *   5. 敏感写端点用模拟令牌 → 403 IMPERSONATION_BLOCKED；普通 admin 令牌 → 正常
 *   6. /impersonate/exit 使会话失效 + 写 audit_logs（impersonate_exit）
 *   7. impersonate_login 全程写 audit_logs（details 含 admin + target + ip）
 *
 * 风格对齐 admin-manual-topup.test.ts：真实 PG + Redis，独立 JWT 密钥，afterAll 清理。
 *
 * @module routes/admin-impersonate.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { and, eq, inArray } from 'drizzle-orm';
import { generateAccessToken, verifyToken } from '../services/auth/jwt';
import { adminCustomerRoutes } from './admin-customers';
import { authRoutes } from './auth';

// 独立 JWT 密钥（路由内 verifyToken 与测试签发共用同一 process.env 值）
process.env.JWT_SECRET = 'test-admin-impersonate-secret';

const ts = Date.now();

// 测试期间共享的数据库行 id
let adminId = 0;
let superAdminId = 0;
let customerUserId = 0;   // 被模拟目标（active）
let agentUserId = 0;
let disabledUserId = 0;   // 被模拟目标（disabled）

let adminToken = '';
let superAdminToken = '';
let customerToken = '';
let agentToken = '';
let impersonateToken = '';   // 模拟令牌（admin 模拟 customerUserId）
let impersonateRefresh = '';

let app: FastifyInstance;

/** 组装仅含本模块路由的最小 Fastify 实例 + 错误处理（AppError.statusCode → HTTP） */
function buildTestApp(): FastifyInstance {
  const instance = Fastify({ logger: false });
  instance.setErrorHandler((err: any, _request, reply) => {
    const status = Number(err?.statusCode) || 500;
    reply.code(status).send({ code: status, message: err?.message ?? 'Internal Server Error', errorCode: err?.code });
  });
  authRoutes(instance);
  adminCustomerRoutes(instance);
  return instance;
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  const [admin] = await db.insert(schema.users).values({
    email: `imp-admin-${ts}@test.com`, passwordHash: 'x', name: 'ImpAdmin', role: 'admin', status: 'active',
  }).returning({ id: schema.users.id });
  adminId = admin!.id;

  const [superAd] = await db.insert(schema.users).values({
    email: `imp-super-${ts}@test.com`, passwordHash: 'x', name: 'ImpSuper', role: 'super_admin', status: 'active',
  }).returning({ id: schema.users.id });
  superAdminId = superAd!.id;

  const [cust] = await db.insert(schema.users).values({
    email: `imp-cust-${ts}@test.com`, passwordHash: 'x', name: 'ImpCustomer', role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  customerUserId = cust!.id;

  const [agent] = await db.insert(schema.users).values({
    email: `imp-agent-${ts}@test.com`, passwordHash: 'x', name: 'ImpAgent', role: 'agent', status: 'active',
  }).returning({ id: schema.users.id });
  agentUserId = agent!.id;

  const [disabled] = await db.insert(schema.users).values({
    email: `imp-disabled-${ts}@test.com`, passwordHash: 'x', name: 'ImpDisabled', role: 'customer', status: 'disabled',
  }).returning({ id: schema.users.id });
  disabledUserId = disabled!.id;

  adminToken = generateAccessToken({ userId: adminId, email: `imp-admin-${ts}@test.com`, role: 'admin' });
  superAdminToken = generateAccessToken({ userId: superAdminId, email: `imp-super-${ts}@test.com`, role: 'super_admin' });
  customerToken = generateAccessToken({ userId: customerUserId, email: `imp-cust-${ts}@test.com`, role: 'customer' });
  agentToken = generateAccessToken({ userId: agentUserId, email: `imp-agent-${ts}@test.com`, role: 'agent' });

  app = buildTestApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  try {
    const targetUserIds = [adminId, superAdminId, customerUserId, agentUserId, disabledUserId].filter((x) => x > 0);
    // 清理模拟会话（user_sessions 关联 accessToken/refreshToken）
    await db.delete(schema.userSessions).where(
      inArray(schema.userSessions.userId, [customerUserId]),
    );
    // 清理审计（operator admin + target customer）
    await db.delete(schema.auditLogs).where(inArray(schema.auditLogs.userId, [adminId, superAdminId]));
    await db.delete(schema.auditLogs).where(and(
      eq(schema.auditLogs.resource, 'user'),
      inArray(schema.auditLogs.resourceId, [String(customerUserId), String(disabledUserId), String(agentUserId)]),
    ));
    await db.delete(schema.users).where(inArray(schema.users.id, targetUserIds));
    await db.delete(schema.userSessions).where(eq(schema.userSessions.refreshToken, impersonateRefresh));
  } catch (err) {
    console.error('[admin-impersonate.test] cleanup failed:', err);
  }
});

/* ═══════════ case 1：越权 ═══════════ */

describe('管理员以用户身份登录 - 越权与鉴权', () => {
  it('customer 调用 impersonate → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/customers/${customerUserId}/impersonate`,
      headers: auth(customerToken),
    });
    expect(res.statusCode).toBe(403);
    // adminAuth 拒绝角色 → FORBIDDEN
    expect(res.json().code).toBe(403);
  });

  it('agent 调用 impersonate → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/customers/${customerUserId}/impersonate`,
      headers: auth(agentToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('未登录 → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/customers/${customerUserId}/impersonate`,
    });
    expect(res.statusCode).toBe(401);
  });
});

/* ═══════════ case 2：admin 调用成功 ═══════════ */

describe('admin 发起模拟', () => {
  it('成功 → 200；返回 accessToken/refreshToken/expiresIn/impersonateBy；verifyToken 后 userId=目标、role=目标、impersonateBy 存在', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/customers/${customerUserId}/impersonate`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.id).toBe(customerUserId);
    expect(body.user.email).toBe(`imp-cust-${ts}@test.com`);
    expect(body.user.role).toBe('customer');
    expect(typeof body.accessToken).toBe('string');
    expect(typeof body.refreshToken).toBe('string');
    expect(body.expiresIn).toBe(900);
    expect(body.impersonateBy).toEqual({ adminId, adminEmail: `imp-admin-${ts}@test.com` });

    impersonateToken = body.accessToken;
    impersonateRefresh = body.refreshToken;

    // verifyToken 还原
    const payload = verifyToken(body.accessToken);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe(customerUserId);
    expect(payload!.role).toBe('customer');
    expect(payload!.impersonateBy).toEqual({ adminId, adminEmail: `imp-admin-${ts}@test.com` });
  });

  it('目标不存在 → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/customers/99999999/impersonate',
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(404);
  });

  it('目标 role 非 customer（如 agent）→ 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/customers/${agentUserId}/impersonate`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(404);
  });
});

/* ═══════════ case 3：目标 disabled ═══════════ */

describe('目标状态校验', () => {
  it('disabled 用户 → 拒绝（403）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/customers/${disabledUserId}/impersonate`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toContain('active');
  });
});

/* ═══════════ case 4：/me 用模拟令牌返回目标身份 ═══════════ */

describe('模拟令牌访问 /api/v1/me', () => {
  it('返回目标用户身份（id/email/name/role=customer）', async () => {
    // 先确保拿到一个模拟令牌（若上一个 describe 顺序不定，这里重新发起）
    let token = impersonateToken;
    if (!token) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/customers/${customerUserId}/impersonate`,
        headers: auth(adminToken),
      });
      token = res.json().accessToken;
      impersonateToken = token;
    }
    const res = await app.inject({ method: 'GET', url: '/api/v1/me', headers: auth(token) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(customerUserId);
    expect(body.email).toBe(`imp-cust-${ts}@test.com`);
    expect(body.role).toBe('customer');
  });
});

/* ═══════════ case 5：敏感写拦截 ═══════════ */

describe('敏感写端点拦截（D1）', () => {
  it('模拟令牌访问 POST /admin/customers/batch/status → 403 IMPERSONATION_BLOCKED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/customers/batch/status',
      headers: auth(impersonateToken),
      payload: { ids: [customerUserId], status: 'disabled' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().errorCode).toBe('IMPERSONATION_BLOCKED');
  });

  it('普通 admin 令牌访问 batch/status → 正常（200）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/customers/batch/status',
      headers: auth(adminToken),
      payload: { ids: [customerUserId], status: 'active' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('模拟令牌访问 PATCH /admin/customers/:id/status → 403 IMPERSONATION_BLOCKED', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/customers/${customerUserId}/status`,
      headers: auth(impersonateToken),
      payload: { status: 'disabled' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().errorCode).toBe('IMPERSONATION_BLOCKED');
  });
});

/* ═══════════ case 6：退出模拟 ═══════════ */

describe('退出模拟 /impersonate/exit', () => {
  it('普通令牌调用 → 400（仅模拟令牌可退出）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/customers/${customerUserId}/impersonate/exit`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(400);
  });

  it('未登录 → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/customers/${customerUserId}/impersonate/exit`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('模拟令牌调用成功 → 200 { message }；会话失效（user_sessions 中该 token 被删）；写 impersonate_exit 审计', async () => {
    // 确保有模拟会话（会话由 impersonate 端点 createSession 落库）
    const before = await db.select({ token: schema.userSessions.token })
      .from(schema.userSessions).where(eq(schema.userSessions.token, impersonateToken)).limit(1);
    expect(before.length).toBe(1);   // 模拟会话确实存在

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/customers/${customerUserId}/impersonate/exit`,
      headers: auth(impersonateToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('已退出模拟');

    // 会话已失效（user_sessions 行被删）
    const after = await db.select({ id: schema.userSessions.id })
      .from(schema.userSessions).where(eq(schema.userSessions.token, impersonateToken)).limit(1);
    expect(after.length).toBe(0);

    // 审计 impersonate_exit：operator=admin，target=customer，details 含 admin+target
    const audits = await db.select({ action: schema.auditLogs.action, userId: schema.auditLogs.userId, details: schema.auditLogs.details, resourceId: schema.auditLogs.resourceId })
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, 'impersonate_exit'))
      .orderBy(schema.auditLogs.id);
    const last = audits[audits.length - 1];
    expect(last).toBeDefined();
    expect(last!.userId).toBe(adminId);
    expect(last!.resourceId).toBe(String(customerUserId));
    const det = last!.details as { adminId: number; adminEmail: string; targetId: number; targetEmail: string };
    expect(det.adminId).toBe(adminId);
    expect(det.adminEmail).toBe(`imp-admin-${ts}@test.com`);
    expect(det.targetId).toBe(customerUserId);
    expect(det.targetEmail).toBe(`imp-cust-${ts}@test.com`);
  });
});

/* ═══════════ case 7：impersonate_login 审计 ═══════════ */

describe('模拟登录审计（D4）', () => {
  it('impersonate_login 写入 audit_logs：operator=admin、target=customer、details 含 admin+target、ip', async () => {
    const before = (await db.select({ id: schema.auditLogs.id }).from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, 'impersonate_login'))).length;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/customers/${customerUserId}/impersonate`,
      headers: auth(superAdminToken),
    });
    expect(res.statusCode).toBe(200);
    // 更新共享模拟令牌供退出用例使用前，先在下一个用例里用它（此处仅验证审计）
    impersonateToken = res.json().accessToken;
    impersonateRefresh = res.json().refreshToken;

    const after = await db.select({
      action: schema.auditLogs.action,
      userId: schema.auditLogs.userId,
      resource: schema.auditLogs.resource,
      resourceId: schema.auditLogs.resourceId,
      details: schema.auditLogs.details,
      ipAddress: schema.auditLogs.ipAddress,
    }).from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, 'impersonate_login'))
      .orderBy(schema.auditLogs.id);

    expect(after.length).toBe(before + 1);
    const rec = after[after.length - 1];
    expect(rec!.userId).toBe(superAdminId);
    expect(rec!.resource).toBe('user');
    expect(rec!.resourceId).toBe(String(customerUserId));
    const det = rec!.details as { adminId: number; adminEmail: string; targetId: number; targetEmail: string };
    expect(det.adminId).toBe(superAdminId);
    expect(det.adminEmail).toBe(`imp-super-${ts}@test.com`);
    expect(det.targetId).toBe(customerUserId);
    expect(det.targetEmail).toBe(`imp-cust-${ts}@test.com`);
    expect(typeof rec!.ipAddress).toBe('string');

    // 用该模拟令牌再次验证退出路径（此时会话存在）
    const exit = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/customers/${customerUserId}/impersonate/exit`,
      headers: auth(impersonateToken),
    });
    expect(exit.statusCode).toBe(200);
  });
});