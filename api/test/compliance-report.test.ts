/**
 * P2-4 合规报告集成测试 — /admin/compliance/report（真实 PG + Redis）
 *
 * 覆盖（docs/iteration-plan-v2.md P2-4 测试要求）：
 *   1. export_audit：聚合 data_requests 状态机分布 + 审计操作摘要
 *   2. data_access：聚合 deletion_requests 状态机 + ip_blacklist 现状 + 审计操作摘要
 *   3. CSV 格式输出
 *   4. 非法 type → 400
 *
 * 说明：报告统计整表（共享库会累积历史数据），断言采用「结构 + 自建数据下限」，
 * 保证并行运行下依然确定：自建记录所在的状态桶 count ≥ 自建数。
 *
 * @see docs/iteration-plan-v2.md P2-4
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../src/db';
import { eq } from 'drizzle-orm';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-compliance-secret-p2-4',
  PORT: '3039',
};

let app: FastifyInstance;
/** 自建记录 id（不影响清理，仅用于断言下限） */
const selfDataRequestIds: number[] = [];
const selfDeletionIds: number[] = [];

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function registerUser(prefix: string) {
  const email = `${prefix}-${uid()}@test.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'Test1234!', name: 'P2-4 Compliance' },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as { user: { id: number }; accessToken: string };
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

beforeAll(async () => {
  app = await buildApp({ envOverrides: testEnv });
  await app.ready();

  // 自建数据：2 条 data_requests（pending + cancelled）、1 条 deletion_requests（pending）
  const [u1, u2] = await Promise.all([registerUser('comp-u1'), registerUser('comp-u2')]);
  const [dr1] = await db.insert(schema.dataRequests).values({
    userId: u1.user.id, requestType: 'data_export', status: 'pending', dataScope: 'all',
  }).returning({ id: schema.dataRequests.id });
  const [dr2] = await db.insert(schema.dataRequests).values({
    userId: u1.user.id, requestType: 'data_export', status: 'cancelled', dataScope: 'profile',
  }).returning({ id: schema.dataRequests.id });
  const [dl1] = await db.insert(schema.deletionRequests).values({
    userId: u2.user.id, reason: 'comp test', status: 'pending',
  }).returning({ id: schema.deletionRequests.id });
  selfDataRequestIds.push(dr1!.id, dr2!.id);
  selfDeletionIds.push(dl1!.id);
});

afterAll(async () => {
  // 清理自建记录（保持共享库干净）
  if (selfDataRequestIds.length > 0) {
    await db.delete(schema.dataRequests).where(eq(schema.dataRequests.id, selfDataRequestIds[0]!));
    await db.delete(schema.dataRequests).where(eq(schema.dataRequests.id, selfDataRequestIds[1]!));
  }
  if (selfDeletionIds.length > 0) {
    await db.delete(schema.deletionRequests).where(eq(schema.deletionRequests.id, selfDeletionIds[0]!));
  }
  await app.close();
});

describe('GET /api/v1/admin/compliance/report', () => {
  it('export_audit：结构正确 + 自建数据下限命中', async () => {
    const admin = await registerAdmin('comp-admin-export');
    const res = await app.inject({
      method: 'GET', url: '/api/v1/admin/compliance/report?type=export_audit&days=30', headers: auth(admin.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const report = res.json().data;
    expect(report.type).toBe('export_audit');
    expect(report.periodDays).toBe(30);
    expect(typeof report.generatedAt).toBe('string');
    expect(report.summary).toBeDefined();
    expect(report.summary.totalRequests).toBeGreaterThanOrEqual(2);
    expect(report.summary.pending).toBeGreaterThanOrEqual(1);
    expect(report.summary.cancelled).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(report.auditLogs)).toBe(true);
    // auditLogs 结构：{ action, count }
    for (const row of report.auditLogs) {
      expect(typeof row.action).toBe('string');
      expect(typeof row.count).toBe('number');
    }
  });

  it('data_access：结构正确 + 自建数据下限命中', async () => {
    const admin = await registerAdmin('comp-admin-access');
    const res = await app.inject({
      method: 'GET', url: '/api/v1/admin/compliance/report?type=data_access', headers: auth(admin.accessToken),
    });
    expect(res.statusCode).toBe(200);
    const report = res.json().data;
    expect(report.type).toBe('data_access');
    expect(report.summary.deletionTotal).toBeGreaterThanOrEqual(1);
    expect(report.summary.deletionPending).toBeGreaterThanOrEqual(1);
    expect(typeof report.summary.ipBlacklistActive).toBe('number');
    expect(typeof report.summary.ipBlacklistScopeApi).toBe('number');
    expect(Array.isArray(report.auditLogs)).toBe(true);
  });

  it('CSV 格式输出', async () => {
    const admin = await registerAdmin('comp-admin-csv');
    const res = await app.inject({
      method: 'GET', url: '/api/v1/admin/compliance/report?type=export_audit&format=csv', headers: auth(admin.accessToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const body = res.body as string;
    expect(body).toContain('type,generated_at,period_days');
    expect(body).toContain('summary_key,summary_value');
    expect(body).toContain('action,count');
    expect(body).toContain('export_audit');
  });

  it('非法 type → 400；非 admin → 403', async () => {
    const admin = await registerAdmin('comp-admin-bad');
    const bad = await app.inject({
      method: 'GET', url: '/api/v1/admin/compliance/report?type=bogus', headers: auth(admin.accessToken),
    });
    expect(bad.statusCode).toBe(400);

    const { accessToken } = await registerUser('comp-perm');
    const forbidden = await app.inject({
      method: 'GET', url: '/api/v1/admin/compliance/report', headers: auth(accessToken),
    });
    expect(forbidden.statusCode).toBe(403);
  });
});
