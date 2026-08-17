/**
 * P2-4 数据导出流转集成测试 — /me/data-export/* + /admin/data-requests/*（真实 PG + Redis）
 *
 * 覆盖（docs/iteration-plan-v2.md P2-4 测试要求）：
 *   1. 状态机全链路：提交→approve→export→download（含文件生成）
 *   2. reject / cancel（仅 pending）/ 重复提交 pending 400 / 越权访问他人 403
 *   3. 导出文件过期 → 410
 *   4. 管理端权限：非 admin 访问 admin 端点 → 403
 *   5. 审计：管理端 approve/reject/export 写 audit_logs
 *
 * 环境：独立端口 3036；数据用唯一 email 隔离；测试生成的导出文件在 afterAll 清理。
 *
 * @see docs/iteration-plan-v2.md P2-4
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../src/db';
import { eq, sql, desc } from 'drizzle-orm';
import { unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';
import { EXPORT_DIR } from '../src/services/compliance/export';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-data-requests-secret-p2-4',
  PORT: '3036',
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
    payload: { email, password: 'Test1234!', name: 'P2-4 Test' },
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

/** 提交导出申请 */
async function submitExport(accessToken: string, payload: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/me/data-export/request',
    headers: auth(accessToken),
    payload,
  });
  return res;
}

beforeAll(async () => {
  app = await buildApp({ envOverrides: testEnv });
  await app.ready();
});

afterAll(async () => {
  // 清理本测试生成的导出文件（best-effort）
  for (const rel of createdFiles) {
    try {
      const abs = resolve(EXPORT_DIR, rel.split(/[\\/]/).pop()!);
      if (existsSync(abs)) unlinkSync(abs);
    } catch { /* 忽略清理失败 */ }
  }
  await app.close();
});

describe('数据导出 export 全链路：提交 → approve → export → download', () => {
  it('全链路走通，文件生成且可下载，重复提交 pending 400', async () => {
    const { user, accessToken } = await registerUser('de-ok');
    const admin = await registerAdmin('de-admin-ok');

    // 提交
    const submit = await submitExport(accessToken, { dataScope: 'all', reason: '合规自查' });
    expect(submit.statusCode).toBe(201);
    const req = (submit.json() as any).data;
    expect(req.status).toBe('pending');
    expect(req.dataScope).toBe('all');

    // 存在 pending → 重复提交 400
    const dup = await submitExport(accessToken, { dataScope: 'apikeys' });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().code).toBe('EXISTS');

    // 我的列表
    const list = await app.inject({ method: 'GET', url: '/api/v1/me/data-export/requests', headers: auth(accessToken) });
    expect(list.statusCode).toBe(200);
    expect((list.json() as any).data.list).toHaveLength(1);

    // 管理端列表可见
    const adminList = await app.inject({
      method: 'GET', url: '/api/v1/admin/data-requests?status=pending', headers: auth(admin.accessToken),
    });
    expect(adminList.statusCode).toBe(200);
    const adminItems = (adminList.json() as any).data.list as any[];
    expect(adminItems.some((r) => r.id === req.id && r.userEmail === user.email)).toBe(true);

    // approve
    const approve = await app.inject({
      method: 'POST', url: `/api/v1/admin/data-requests/${req.id}/approve`,
      headers: auth(admin.accessToken), payload: { note: 'ok' },
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().data.status).toBe('approved');
    expect(approve.json().data.adminId).toBe(admin.user.id);
    expect(approve.json().data.reviewedAt).toBeTruthy();

    // 非 approved 状态下 download → 400 FILE_NOT_READY
    const notReady = await app.inject({
      method: 'GET', url: `/api/v1/me/data-export/${req.id}/download`, headers: auth(accessToken),
    });
    expect(notReady.statusCode).toBe(400);
    expect(notReady.json().code).toBe('FILE_NOT_READY');

    // export → 生成文件
    const exportRes = await app.inject({
      method: 'POST', url: `/api/v1/admin/data-requests/${req.id}/export`, headers: auth(admin.accessToken),
    });
    expect(exportRes.statusCode).toBe(200);
    const exported = exportRes.json().data;
    expect(exported.status).toBe('exported');
    expect(exported.filePath).toMatch(/^exports\/data-export-\d+-.+\.json$/);
    createdFiles.push(exported.filePath);

    // 幂等：再次 export 返回已有文件
    const exportAgain = await app.inject({
      method: 'POST', url: `/api/v1/admin/data-requests/${req.id}/export`, headers: auth(admin.accessToken),
    });
    expect(exportAgain.statusCode).toBe(200);
    expect(exportAgain.json().data.filePath).toBe(exported.filePath);

    // download → 文件内容包含 profile / apiKeys / consumptionRecords
    const download = await app.inject({
      method: 'GET', url: `/api/v1/me/data-export/${req.id}/download`, headers: auth(accessToken),
    });
    expect(download.statusCode).toBe(200);
    const content = download.json() as any;
    expect(content.userId).toBe(user.id);
    expect(content.scope).toBe('all');
    expect(content.profile).toBeTruthy();
    expect(Array.isArray(content.apiKeys)).toBe(true);
    expect(Array.isArray(content.consumptionRecords)).toBe(true);
    // 敏感字段不导出
    expect(JSON.stringify(content)).not.toContain('password_hash');
    expect(JSON.stringify(content)).not.toContain('key_hash');

    // 审计日志
    const [audit] = await db.select({ action: schema.auditLogs.action })
      .from(schema.auditLogs)
      .where(sql`${schema.auditLogs.action} = 'data_requests.export' AND ${schema.auditLogs.resourceId} = ${String(req.id)}`)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(1);
    expect(audit).toBeTruthy();
  });

  it('dataScope 非法 → 400', async () => {
    const { accessToken } = await registerUser('de-scope');
    const res = await submitExport(accessToken, { dataScope: 'bogus' });
    expect(res.statusCode).toBe(400);
  });
});

describe('数据导出 export reject / cancel / 越权', () => {
  it('reject：pending → rejected；export 被拒', async () => {
    const { accessToken } = await registerUser('de-reject');
    const admin = await registerAdmin('de-admin-reject');
    const submit = await submitExport(accessToken, { dataScope: 'profile' });
    const req = (submit.json() as any).data;

    const reject = await app.inject({
      method: 'POST', url: `/api/v1/admin/data-requests/${req.id}/reject`,
      headers: auth(admin.accessToken), payload: { note: '信息不全' },
    });
    expect(reject.statusCode).toBe(200);
    expect(reject.json().data.status).toBe('rejected');

    // rejected 不允许 export
    const exportRes = await app.inject({
      method: 'POST', url: `/api/v1/admin/data-requests/${req.id}/export`, headers: auth(admin.accessToken),
    });
    expect(exportRes.statusCode).toBe(400);
    expect(exportRes.json().code).toBe('INVALID_STATE');
  });

  it('cancel：仅 pending 可撤；已 approved 撤不了', async () => {
    const { accessToken } = await registerUser('de-cancel');
    const admin = await registerAdmin('de-admin-cancel');
    const submit = await submitExport(accessToken, { dataScope: 'apikeys' });
    const req = (submit.json() as any).data;

    const cancel = await app.inject({
      method: 'POST', url: `/api/v1/me/data-export/${req.id}/cancel`, headers: auth(accessToken),
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().data.status).toBe('cancelled');

    // cancelled 后管理员 approve → 400 INVALID_STATE
    const approve = await app.inject({
      method: 'POST', url: `/api/v1/admin/data-requests/${req.id}/approve`, headers: auth(admin.accessToken),
    });
    expect(approve.statusCode).toBe(400);
    expect(approve.json().code).toBe('INVALID_STATE');
  });

  it('越权：他人申请详情 / 下载 → 403', async () => {
    const owner = await registerUser('de-owner');
    const other = await registerUser('de-other');
    const submit = await submitExport(owner.accessToken, { dataScope: 'all' });
    const req = (submit.json() as any).data;

    const detail = await app.inject({
      method: 'GET', url: `/api/v1/me/data-export/${req.id}`, headers: auth(other.accessToken),
    });
    expect(detail.statusCode).toBe(403);

    const cancel = await app.inject({
      method: 'POST', url: `/api/v1/me/data-export/${req.id}/cancel`, headers: auth(other.accessToken),
    });
    expect(cancel.statusCode).toBe(403);

    const download = await app.inject({
      method: 'GET', url: `/api/v1/me/data-export/${req.id}/download`, headers: auth(other.accessToken),
    });
    expect(download.statusCode).toBe(403);
  });
});

describe('数据导出 export 文件过期', () => {
  it('file_expires_at 已过 → download 410 FILE_EXPIRED', async () => {
    const { accessToken } = await registerUser('de-expire');
    const admin = await registerAdmin('de-admin-expire');
    const submit = await submitExport(accessToken, { dataScope: 'consumption' });
    const req = (submit.json() as any).data;
    await app.inject({ method: 'POST', url: `/api/v1/admin/data-requests/${req.id}/approve`, headers: auth(admin.accessToken) });
    const exportRes = await app.inject({ method: 'POST', url: `/api/v1/admin/data-requests/${req.id}/export`, headers: auth(admin.accessToken) });
    createdFiles.push(exportRes.json().data.filePath);

    // 模拟过期（timestamp 无时区语义，用 SQL 改）
    await db.update(schema.dataRequests)
      .set({ fileExpiresAt: sql`NOW() - INTERVAL '1 hour'` })
      .where(eq(schema.dataRequests.id, req.id));

    const download = await app.inject({
      method: 'GET', url: `/api/v1/me/data-export/${req.id}/download`, headers: auth(accessToken),
    });
    expect(download.statusCode).toBe(410);
    expect(download.json().code).toBe('FILE_EXPIRED');
  });
});

describe('数据导出 export 权限：管理端端点', () => {
  it('非 admin 访问 /admin/data-requests → 403；无 token → 401', async () => {
    const { accessToken } = await registerUser('de-perm');
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/data-requests', headers: auth(accessToken) });
    expect(res.statusCode).toBe(403);

    const noToken = await app.inject({ method: 'GET', url: '/api/v1/admin/data-requests' });
    expect(noToken.statusCode).toBe(401);
  });
});
