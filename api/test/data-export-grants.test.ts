/**
 * 数据导出授权管理集成测试 — /me/data-export/* 授权鉴权 + /admin/data-export-grants CRUD + 审计
 *
 * 覆盖（docs/PRD-数据导出授权管理.md §10 验收清单）：
 *   B1-B4  未授权用户调 request/requests/:id/cancel → 403 DATA_EXPORT_NOT_GRANTED
 *   B5     已授权（enabled=true）用户调四接口 → 正常
 *   B6     授权停用后 request/list/detail/cancel → 403
 *   B7     download 例外：停用后已 exported 未过期仍可下载（200）；未 exported/过期沿用 400/410
 *   B8     无 token → 401；非 admin 调 admin 授权接口 → 403
 *   C1-C11 授权管理 CRUD（创建/重复409/用户404/启停/删除/分页/筛选/搜索/列表字段）
 *   G1-G4  审计（create/update/delete 写 audit_logs，可追溯操作人/时间/IP）
 *
 * 环境：独立端口 3037；数据用唯一 email 隔离；运行前需已执行 0036_data_export_grants 迁移。
 *
 * @see docs/PRD-数据导出授权管理.md §10 验收清单
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../src/db';
import { eq, desc, sql } from 'drizzle-orm';
import { unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';
import { EXPORT_DIR } from '../src/services/compliance/export';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-data-export-grants-secret',
  PORT: '3037',
};

let app: FastifyInstance;
/** 测试生成的导出文件（afterAll 清理） */
const createdFiles: string[] = [];

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function registerUser(prefix: string) {
  const email = `${prefix}-${uid()}@test.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'Test1234!', name: 'GRANT Test' },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as { user: { id: number; email: string }; accessToken: string };
  return { email, user: body.user, accessToken: body.accessToken };
}

/** 注册后提权为 admin 并重新登录（JWT role 在签发时固化） */
async function registerAdmin(prefix: string) {
  const { email, user } = await registerUser(prefix);
  await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, user.id));
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: 'Test1234!' },
  });
  expect(login.statusCode).toBe(200);
  return { email, user, accessToken: (login.json() as { accessToken: string }).accessToken };
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** 通过管理端接口新建授权（默认启用） */
async function createGrant(token: string, userId: number, body: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/admin/data-export-grants',
    headers: auth(token),
    payload: { userId, ...body },
  });
}

/** 通过管理端接口更新授权 */
async function updateGrant(token: string, userId: number, body: Record<string, unknown>) {
  return app.inject({
    method: 'PUT',
    url: `/api/v1/admin/data-export-grants/${userId}`,
    headers: auth(token),
    payload: body,
  });
}

/** 提交导出申请（用户端，需已授权） */
async function submitExport(token: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/me/data-export/request',
    headers: auth(token),
    payload: { dataScope: 'all', reason: '授权测试' },
  });
}

beforeAll(async () => {
  app = await buildApp({ envOverrides: testEnv });
  await app.ready();
});

afterAll(async () => {
  for (const rel of createdFiles) {
    try {
      const abs = resolve(EXPORT_DIR, rel.split(/[\\/]/).pop()!);
      if (existsSync(abs)) unlinkSync(abs);
    } catch { /* 忽略清理失败 */ }
  }
  await app.close();
});

/** 查询最新一条指定 action 的审计记录 */
async function latestAudit(action: string, resourceId?: string) {
  const rows = await db.select().from(schema.auditLogs)
    .where(sql`${schema.auditLogs.action} = ${action}${resourceId ? sql` AND ${schema.auditLogs.resourceId} = ${resourceId}` : sql``}`)
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

describe('B. 用户端接口授权鉴权', () => {
  it('B1-B4 未授权用户调 request/requests/:id/cancel → 403 DATA_EXPORT_NOT_GRANTED', async () => {
    const user = await registerUser('neg-unauth');

    const req = await submitExport(user.accessToken);
    expect(req.statusCode).toBe(403);
    expect(req.json().code).toBe('DATA_EXPORT_NOT_GRANTED');
    expect(req.json().message).toBe('您暂未被授权使用数据导出功能，请联系管理员');

    const list = await app.inject({ method: 'GET', url: '/api/v1/me/data-export/requests', headers: auth(user.accessToken) });
    expect(list.statusCode).toBe(403);

    const detail = await app.inject({ method: 'GET', url: '/api/v1/me/data-export/1', headers: auth(user.accessToken) });
    expect(detail.statusCode).toBe(403);

    const cancel = await app.inject({ method: 'POST', url: '/api/v1/me/data-export/1/cancel', headers: auth(user.accessToken) });
    expect(cancel.statusCode).toBe(403);
  });

  it('B5 已授权（enabled=true）用户调四接口 → 正常', async () => {
    const admin = await registerAdmin('b5-admin');
    const user = await registerUser('b5-user');
    await createGrant(admin.accessToken, user.user.id);

    // request 正常 201
    const req = await submitExport(user.accessToken);
    expect(req.statusCode).toBe(201);
    const reqData = req.json().data;
    expect(reqData.status).toBe('pending');

    // requests 列表正常
    const list = await app.inject({ method: 'GET', url: '/api/v1/me/data-export/requests', headers: auth(user.accessToken) });
    expect(list.statusCode).toBe(200);
    expect((list.json() as any).data.list).toHaveLength(1);

    // :id 详情正常
    const detail = await app.inject({ method: 'GET', url: `/api/v1/me/data-export/${reqData.id}`, headers: auth(user.accessToken) });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.id).toBe(reqData.id);

    // :id/cancel 正常
    const cancel = await app.inject({ method: 'POST', url: `/api/v1/me/data-export/${reqData.id}/cancel`, headers: auth(user.accessToken) });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().data.status).toBe('cancelled');
  });

  it('B6 授权停用后 request/list/detail/cancel → 403', async () => {
    const admin = await registerAdmin('b6-admin');
    const user = await registerUser('b6-user');
    await createGrant(admin.accessToken, user.user.id, { enabled: true });

    // 先提交一条正常（证明启用时可用）
    const ok = await submitExport(user.accessToken);
    expect(ok.statusCode).toBe(201);
    const reqId = ok.json().data.id;

    // 停用授权
    await updateGrant(admin.accessToken, user.user.id, { enabled: false });

    const req2 = await submitExport(user.accessToken);
    expect(req2.statusCode).toBe(403);
    expect(req2.json().code).toBe('DATA_EXPORT_NOT_GRANTED');

    const list = await app.inject({ method: 'GET', url: '/api/v1/me/data-export/requests', headers: auth(user.accessToken) });
    expect(list.statusCode).toBe(403);

    const detail = await app.inject({ method: 'GET', url: `/api/v1/me/data-export/${reqId}`, headers: auth(user.accessToken) });
    expect(detail.statusCode).toBe(403);

    const cancel = await app.inject({ method: 'POST', url: `/api/v1/me/data-export/${reqId}/cancel`, headers: auth(user.accessToken) });
    expect(cancel.statusCode).toBe(403);
  });

  it('B7 download 例外：停用后已 exported 未过期仍可下载（200）；未 exported/过期沿用 400/410', async () => {
    const admin = await registerAdmin('b7-admin');
    const user = await registerUser('b7-user');
    await createGrant(admin.accessToken, user.user.id);

    // 生成一条 exported 记录
    const submit = await submitExport(user.accessToken);
    const req = submit.json().data;
    await app.inject({ method: 'POST', url: `/api/v1/admin/data-requests/${req.id}/approve`, headers: auth(admin.accessToken) });
    const exportRes = await app.inject({ method: 'POST', url: `/api/v1/admin/data-requests/${req.id}/export`, headers: auth(admin.accessToken) });
    expect(exportRes.statusCode).toBe(200);
    createdFiles.push(exportRes.json().data.filePath);

    // 停用授权后：download 仍应放行（历史成果不受停用影响）
    await updateGrant(admin.accessToken, user.user.id, { enabled: false });

    const download = await app.inject({ method: 'GET', url: `/api/v1/me/data-export/${req.id}/download`, headers: auth(user.accessToken) });
    expect(download.statusCode).toBe(200);

    // 未 exported → 400 FILE_NOT_READY（download 不因授权 403）
    const user2 = await registerUser('b7-2');
    await createGrant(admin.accessToken, user2.user.id);
    const submit2 = await submitExport(user2.accessToken);
    const req2 = submit2.json().data;
    const notReady = await app.inject({ method: 'GET', url: `/api/v1/me/data-export/${req2.id}/download`, headers: auth(user2.accessToken) });
    expect(notReady.statusCode).toBe(400);
    expect(notReady.json().code).toBe('FILE_NOT_READY');

    // 已 exported 但过期 → 410 FILE_EXPIRED（download 不因授权 403）
    const user3 = await registerUser('b7-3');
    await createGrant(admin.accessToken, user3.user.id);
    const submit3 = await submitExport(user3.accessToken);
    const req3 = submit3.json().data;
    await app.inject({ method: 'POST', url: `/api/v1/admin/data-requests/${req3.id}/approve`, headers: auth(admin.accessToken) });
    const exp3 = await app.inject({ method: 'POST', url: `/api/v1/admin/data-requests/${req3.id}/export`, headers: auth(admin.accessToken) });
    createdFiles.push(exp3.json().data.filePath);
    await db.update(schema.dataRequests).set({ fileExpiresAt: sql`NOW() - INTERVAL '1 hour'` }).where(eq(schema.dataRequests.id, req3.id));
    const expired = await app.inject({ method: 'GET', url: `/api/v1/me/data-export/${req3.id}/download`, headers: auth(user3.accessToken) });
    expect(expired.statusCode).toBe(410);
    expect(expired.json().code).toBe('FILE_EXPIRED');
  });

  it('B8 无 token → 401；非 admin 调 admin 授权接口 → 403', async () => {
    // 无 token 调用户端 grant-status → 401
    const noTokenStatus = await app.inject({ method: 'GET', url: '/api/v1/me/data-export/grant-status' });
    expect(noTokenStatus.statusCode).toBe(401);

    // 无 token 调 admin 列表 → 401
    const noTokenList = await app.inject({ method: 'GET', url: '/api/v1/admin/data-export-grants' });
    expect(noTokenList.statusCode).toBe(401);

    // 普通 customer 调 admin 列表 → 403（无 dataExportGrant.view）
    const customer = await registerUser('b8-customer');
    const list = await app.inject({ method: 'GET', url: '/api/v1/admin/data-export-grants', headers: auth(customer.accessToken) });
    expect(list.statusCode).toBe(403);

    // 普通 customer 调 admin POST → 403（无 dataExportGrant.edit）
    const post = await createGrant(customer.accessToken, customer.user.id);
    expect(post.statusCode).toBe(403);
  });
});

describe('C. 授权管理 API', () => {
  it('C1 POST 对未授权用户创建成功 → 201，返回授权记录', async () => {
    const admin = await registerAdmin('c1-admin');
    const user = await registerUser('c1-user');
    const res = await createGrant(admin.accessToken, user.user.id, { remark: 'VIP 定向开放' });
    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data.userId).toBe(user.user.id);
    expect(data.email).toBe(user.email);
    expect(data.enabled).toBe(true);
    expect(data.grantedBy).toBe(admin.user.id);
    expect(data.grantedAt).toBeTruthy();
    expect(data.remark).toBe('VIP 定向开放');
  });

  it('C2 POST 对已授权用户重复创建 → 409', async () => {
    const admin = await registerAdmin('c2-admin');
    const user = await registerUser('c2-user');
    await createGrant(admin.accessToken, user.user.id);
    const res = await createGrant(admin.accessToken, user.user.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('DATA_EXPORT_GRANT_EXISTS');
  });

  it('C3 POST 对不存在用户 → 404', async () => {
    const admin = await registerAdmin('c3-admin');
    const res = await createGrant(admin.accessToken, 999999999);
    expect(res.statusCode).toBe(404);
  });

  it('C4 PUT 启用 → enabled=true 且写 grantedAt', async () => {
    const admin = await registerAdmin('c4-admin');
    const user = await registerUser('c4-user');
    // 以停用创建
    await createGrant(admin.accessToken, user.user.id, { enabled: false });
    // 启用
    const res = await updateGrant(admin.accessToken, user.user.id, { enabled: true });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.enabled).toBe(true);
    expect(data.grantedAt).toBeTruthy();
    expect(data.grantedBy).toBe(admin.user.id);
  });

  it('C5 PUT 停用 → enabled=false 且写 disabledAt', async () => {
    const admin = await registerAdmin('c5-admin');
    const user = await registerUser('c5-user');
    await createGrant(admin.accessToken, user.user.id);
    const res = await updateGrant(admin.accessToken, user.user.id, { enabled: false });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.enabled).toBe(false);
    expect(data.disabledAt).toBeTruthy();
    expect(data.disabledBy).toBe(admin.user.id);
  });

  it('C6 PUT 授权记录不存在 → 404', async () => {
    const admin = await registerAdmin('c6-admin');
    const user = await registerUser('c6-user');
    const res = await updateGrant(admin.accessToken, user.user.id, { enabled: true });
    expect(res.statusCode).toBe(404);
  });

  it('C7 DELETE → 204，删除后 POST 可再次创建', async () => {
    const admin = await registerAdmin('c7-admin');
    const user = await registerUser('c7-user');
    await createGrant(admin.accessToken, user.user.id);
    const del = await app.inject({ method: 'DELETE', url: `/api/v1/admin/data-export-grants/${user.user.id}`, headers: auth(admin.accessToken) });
    expect(del.statusCode).toBe(204);
    // 删除后可再次创建
    const res = await createGrant(admin.accessToken, user.user.id);
    expect(res.statusCode).toBe(201);
  });

  it('C8 GET 分页正确（page/pageSize/total），默认 pageSize=20、上限 100', async () => {
    const admin = await registerAdmin('c8-admin');
    // 创建 3 个已授权用户
    for (let i = 0; i < 3; i++) {
      const u = await registerUser(`c8-u${i}`);
      await createGrant(admin.accessToken, u.user.id);
    }
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/data-export-grants?page=1&pageSize=2', headers: auth(admin.accessToken) });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(2);
    expect(data.list.length).toBe(2);
    expect(data.total).toBeGreaterThanOrEqual(3);

    // pageSize 超过 100 → 截断为 100
    const capped = await app.inject({ method: 'GET', url: '/api/v1/admin/data-export-grants?pageSize=500', headers: auth(admin.accessToken) });
    expect(capped.statusCode).toBe(200);
    expect(capped.json().data.pageSize).toBe(100);
  });

  it('C9 GET 按 status 筛选（enabled/disabled/all）正确', async () => {
    const admin = await registerAdmin('c9-admin');
    // 两个用户共用唯一 name token，测试用 search 隔离自身记录，避免共享 DB 累积记录影响分页断言
    const grp = `c9grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const u1 = await registerUser('c9-e1');
    await db.update(schema.users).set({ name: grp }).where(eq(schema.users.id, u1.user.id));
    await createGrant(admin.accessToken, u1.user.id); // enabled
    const u2 = await registerUser('c9-d1');
    await db.update(schema.users).set({ name: grp }).where(eq(schema.users.id, u2.user.id));
    await createGrant(admin.accessToken, u2.user.id);
    await updateGrant(admin.accessToken, u2.user.id, { enabled: false }); // disabled

    const q = (status: string) => `/api/v1/admin/data-export-grants?status=${status}&search=${encodeURIComponent(grp)}&pageSize=100`;

    const enabled = await app.inject({ method: 'GET', url: q('enabled'), headers: auth(admin.accessToken) });
    const enabledIds = (enabled.json() as any).data.list.map((r: any) => r.userId);
    expect(enabledIds).toContain(u1.user.id);
    expect(enabledIds).not.toContain(u2.user.id);

    const disabled = await app.inject({ method: 'GET', url: q('disabled'), headers: auth(admin.accessToken) });
    const disabledIds = (disabled.json() as any).data.list.map((r: any) => r.userId);
    expect(disabledIds).toContain(u2.user.id);
    expect(disabledIds).not.toContain(u1.user.id);

    const all = await app.inject({ method: 'GET', url: q('all'), headers: auth(admin.accessToken) });
    const allIds = (all.json() as any).data.list.map((r: any) => r.userId);
    expect(allIds).toContain(u1.user.id);
    expect(allIds).toContain(u2.user.id);
  });

  it('C10 GET 按 search（email/name 模糊）筛选正确', async () => {
    const admin = await registerAdmin('c10-admin');
    const u = await registerUser('c10-searchme');
    await createGrant(admin.accessToken, u.user.id);

    // 按 email 前缀模糊
    const byEmail = await app.inject({ method: 'GET', url: `/api/v1/admin/data-export-grants?search=${encodeURIComponent(u.email.split('@')[0].slice(0, 8))}&pageSize=100`, headers: auth(admin.accessToken) });
    const emailIds = (byEmail.json() as any).data.list.map((r: any) => r.userId);
    expect(emailIds).toContain(u.user.id);

    // 按 name 模糊（注册名统一 GRANT Test）
    const byName = await app.inject({ method: 'GET', url: '/api/v1/admin/data-export-grants?search=GRANT', headers: auth(admin.accessToken) });
    const nameIds = (byName.json() as any).data.list.map((r: any) => r.userId);
    expect(nameIds.length).toBeGreaterThan(0);
  });

  it('C11 列表返回用户信息(email/name)+授权人+授权/停用时间+备注', async () => {
    const admin = await registerAdmin('c11-admin');
    const u = await registerUser('c11-user');
    const grp = `c11grp-${Date.now()}`;
    await db.update(schema.users).set({ name: grp }).where(eq(schema.users.id, u.user.id));
    await createGrant(admin.accessToken, u.user.id, { remark: '备注A' });
    // 用唯一 name token 隔离自身记录，避免共享 DB 累积记录影响分页
    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/data-export-grants?status=enabled&search=${encodeURIComponent(grp)}&pageSize=100`, headers: auth(admin.accessToken) });
    const item = (res.json() as any).data.list.find((r: any) => r.userId === u.user.id);
    expect(item).toBeTruthy();
    expect(item.email).toBe(u.email);
    expect(item.name).toBe(grp);
    expect(item.grantedByName).toBeTruthy();
    expect(item.grantedAt).toBeTruthy();
    expect(item.remark).toBe('备注A');
    expect(item.createdAt).toBeTruthy();
    expect(item.updatedAt).toBeTruthy();
  });
});

describe('G. 审计', () => {
  it('G1 新建授权写 audit_logs（action data_export_grants.create，可追溯操作人/IP）', async () => {
    const admin = await registerAdmin('g1-admin');
    const user = await registerUser('g1-user');
    await createGrant(admin.accessToken, user.user.id);
    const audit = await latestAudit('data_export_grants.create', String(user.user.id));
    expect(audit).toBeTruthy();
    expect(audit!.userId).toBe(admin.user.id);
    expect((audit!.details as any).userId).toBe(user.user.id);
  });

  it('G2 启用/停用写 audit_logs（action data_export_grants.update，含 userId/enabled）', async () => {
    const admin = await registerAdmin('g2-admin');
    const user = await registerUser('g2-user');
    await createGrant(admin.accessToken, user.user.id);
    await updateGrant(admin.accessToken, user.user.id, { enabled: false });
    const audit = await latestAudit('data_export_grants.update', String(user.user.id));
    expect(audit).toBeTruthy();
    expect((audit!.details as any).userId).toBe(user.user.id);
    expect((audit!.details as any).enabled).toBe(false);
  });

  it('G3 删除写 audit_logs（action data_export_grants.delete）', async () => {
    const admin = await registerAdmin('g3-admin');
    const user = await registerUser('g3-user');
    await createGrant(admin.accessToken, user.user.id);
    await app.inject({ method: 'DELETE', url: `/api/v1/admin/data-export-grants/${user.user.id}`, headers: auth(admin.accessToken) });
    const audit = await latestAudit('data_export_grants.delete', String(user.user.id));
    expect(audit).toBeTruthy();
  });

  it('G4 审计记录可追溯（操作人、时间、IP）', async () => {
    const admin = await registerAdmin('g4-admin');
    const user = await registerUser('g4-user');
    await createGrant(admin.accessToken, user.user.id);
    const audit = await latestAudit('data_export_grants.create', String(user.user.id));
    expect(audit!.userId).toBe(admin.user.id);
    expect(audit!.createdAt).toBeTruthy();
    expect(audit!.ipAddress).toBeTruthy();
    expect(audit!.action).toBe('data_export_grants.create');
  });
});
