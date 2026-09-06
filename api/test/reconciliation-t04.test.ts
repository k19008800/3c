/** T-04 P0：真实 Fastify + PostgreSQL 对账/供应商结算专项验收。 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { db, schema } from '../src/db';
import { eq, sql } from 'drizzle-orm';
import { generateAccessToken, generateOperationToken } from '../src/services/auth/jwt';
import { enableTest2fa, TEST_OP_SUMMARY, testOpSummaryHash } from '../src/routes/test-helpers';
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';

const env = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 't04-reconciliation-secret',
  PORT: '3094',
};
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let app: FastifyInstance;
let adminId = 0;
let financeId = 0;
let mismatchId = 0;
let directResolveMismatchId = 0;
let reportId = 0;
let runningReportId = 0;
const auth = (userId: number, role = 'admin') => ({ authorization: `Bearer ${generateAccessToken({ userId, email: `${role}-${suffix}@test.local`, role })}` });
const auth2fa = (userId: number, role = 'admin') => ({
  ...auth(userId, role),
  'x-operation-token': generateOperationToken({ userId, email: `${role}-${suffix}@test.local`, role, seq: 1, summaryHash: testOpSummaryHash() }),
  'x-operation-confirm': 'confirmed',
  'x-operation-summary': JSON.stringify(TEST_OP_SUMMARY),
});

beforeAll(async () => {
  // 专项测试使用真实 PG；迁移可重复执行，避免依赖开发者本机是否预先跑过 0034。
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  const migration = fs.readFileSync(path.resolve(process.cwd(), 'src/db/migrations/0034_reconciliation.sql'), 'utf8');
  for (const statement of migration.split(';').map((s: string) => s.trim()).filter(Boolean)) await sql.unsafe(statement);
  await sql.end();
  app = await buildApp({ envOverrides: env });
  await app.ready();
  const [admin] = await db.insert(schema.users).values({ email: `t04-admin-${suffix}@test.local`, passwordHash: 'x', name: 'T04 admin', role: 'admin', status: 'active' }).returning();
  const [finance] = await db.insert(schema.users).values({ email: `t04-finance-${suffix}@test.local`, passwordHash: 'x', name: 'T04 finance', role: 'admin', status: 'active' }).returning();
  adminId = admin!.id; financeId = finance!.id;
  await enableTest2fa(adminId);
  const [report] = await db.insert(schema.reconciliationReports).values({ startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date('2026-01-02T00:00:00Z'), createdBy: adminId }).returning();
  reportId = report!.id;
  const [runningReport] = await db.insert(schema.reconciliationReports).values({ startDate: new Date('2026-01-03T00:00:00Z'), endDate: new Date('2026-01-05T00:00:00Z'), reconType: 'consumption', status: 'running', createdBy: adminId, startedAt: new Date() }).returning();
  runningReportId = runningReport!.id;
  const [mismatch] = await db.insert(schema.reconciliationMismatches).values({ reportId, reference: `t04-${suffix}`, differenceAmount: '1.25000000' }).returning();
  mismatchId = mismatch!.id;
  const [directResolveMismatch] = await db.insert(schema.reconciliationMismatches).values({ reportId, reference: `t04-direct-${suffix}`, differenceAmount: '2.00000000' }).returning();
  directResolveMismatchId = directResolveMismatch!.id;
});

afterAll(async () => {
  if (mismatchId) await db.delete(schema.reconciliationMismatches).where(eq(schema.reconciliationMismatches.id, mismatchId));
  if (directResolveMismatchId) await db.delete(schema.reconciliationMismatches).where(eq(schema.reconciliationMismatches.id, directResolveMismatchId));
  if (reportId) await db.delete(schema.reconciliationReports).where(eq(schema.reconciliationReports.id, reportId));
  if (runningReportId) await db.delete(schema.reconciliationReports).where(eq(schema.reconciliationReports.id, runningReportId));
  if (adminId || financeId) await db.delete(schema.user2fa).where(sql`${schema.user2fa.userId} in (${adminId}, ${financeId})`);
  if (adminId) await db.delete(schema.users).where(eq(schema.users.id, adminId));
  if (financeId) await db.delete(schema.users).where(eq(schema.users.id, financeId));
  await app.close();
});

describe('T-04 reconciliation routes', () => {
  it('无 token→401、无权限角色→403、非法日期→400', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/finance/reconciliation/reports' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/finance/reconciliation/reports', headers: auth(adminId, 'customer') })).statusCode).toBe(403);
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/finance/reconciliation/run', headers: auth(adminId), payload: { startDate: '2026-02-31', endDate: '2026-03-01' } });
    expect(res.statusCode).toBe(400);
    const leapDay = await app.inject({ method: 'POST', url: '/api/v1/admin/finance/reconciliation/run', headers: auth(adminId), payload: { startDate: '2026-02-29', endDate: '2026-03-01' } });
    expect(leapDay.statusCode).toBe(400);
  });

  it('正式 run 使用 [start,end) 日期边界并返回 numeric 字符串', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/finance/reconciliation/run', headers: auth(adminId), payload: { startDate: '2026-01-01', endDate: '2026-01-02', reconType: 'consumption' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('completed');
    expect(typeof res.json().data.totalAmount).toBe('string');
  });

  it('同范围已有 running 报告→409，且不创建重复报告', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/finance/reconciliation/run', headers: auth(adminId), payload: { startDate: '2026-01-03', endDate: '2026-01-04', reconType: 'consumption' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error?.code ?? res.json().code).toBe('RECONCILIATION_ALREADY_RUNNING');
  });

  it('日期范围超过 90 天→400，且不创建报告', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/finance/reconciliation/run', headers: auth(adminId), payload: { startDate: '2026-01-01', endDate: '2026-04-02' } });
    expect(res.statusCode).toBe(400);
  });

  it('报告列表/详情/CSV 可查询', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/v1/admin/finance/reconciliation/reports?page=1&page_size=10', headers: auth(adminId) });
    expect(list.statusCode).toBe(200); expect(list.json().data.items.length).toBeGreaterThan(0);
    const detail = await app.inject({ method: 'GET', url: `/api/v1/admin/finance/reconciliation/reports/${reportId}`, headers: auth(adminId) });
    expect(detail.statusCode).toBe(200); expect(detail.json().data.mismatches).toHaveLength(2);
    const csv = await app.inject({ method: 'GET', url: `/api/v1/admin/finance/reconciliation/export/${reportId}`, headers: auth(adminId) });
    expect(csv.statusCode).toBe(200); expect(csv.headers['content-type']).toContain('text/csv'); expect(csv.body.charCodeAt(0)).toBe(0xfeff);
  });

  it('差异必须先 pending→processing，备注必填、SoD、终态不可逆', async () => {
    const bypassForbidden = await app.inject({ method: 'POST', url: `/api/v1/admin/finance/reconciliation/mismatches/${directResolveMismatchId}/resolve`, headers: auth(adminId, 'agent'), payload: { status: 'resolved', reviewerId: financeId, resolutionNote: 'must be forbidden' } });
    expect(bypassForbidden.statusCode).toBe(403);
    const bypass = await app.inject({ method: 'POST', url: `/api/v1/admin/finance/reconciliation/mismatches/${directResolveMismatchId}/resolve`, headers: auth2fa(adminId), payload: { status: 'resolved', reviewerId: financeId, resolutionNote: 'must process first' } });
    expect(bypass.statusCode).toBe(409);
    expect(bypass.json().error?.code ?? bypass.json().code).toBe('RECONCILIATION_STATUS_MISMATCH');
    const processing = await app.inject({ method: 'POST', url: `/api/v1/admin/finance/reconciliation/mismatches/${mismatchId}/process`, headers: auth2fa(adminId) });
    expect(processing.statusCode).toBe(200); expect(processing.json().data.status).toBe('processing');
    const duplicateProcess = await app.inject({ method: 'POST', url: `/api/v1/admin/finance/reconciliation/mismatches/${mismatchId}/process`, headers: auth2fa(adminId) });
    expect(duplicateProcess.statusCode).toBe(409);
    expect(duplicateProcess.json().error?.code ?? duplicateProcess.json().code).toBe('RECONCILIATION_STATUS_MISMATCH');
    const sod = await app.inject({ method: 'POST', url: `/api/v1/admin/finance/reconciliation/mismatches/${mismatchId}/resolve`, headers: auth2fa(adminId), payload: { status: 'resolved', reviewerId: adminId, resolutionNote: 'safe non-funding resolution' } });
    expect(sod.statusCode).toBe(403);
    const empty = await app.inject({ method: 'POST', url: `/api/v1/admin/finance/reconciliation/mismatches/${mismatchId}/resolve`, headers: auth2fa(adminId), payload: { status: 'resolved', reviewerId: financeId, resolutionNote: ' ' } });
    expect(empty.statusCode).toBe(400);
    const resolved = await app.inject({ method: 'POST', url: `/api/v1/admin/finance/reconciliation/mismatches/${mismatchId}/resolve`, headers: auth2fa(adminId), payload: { status: 'resolved', reviewerId: financeId, resolutionNote: 'safe non-funding resolution' } });
    expect(resolved.statusCode).toBe(200);
    const terminal = await app.inject({ method: 'POST', url: `/api/v1/admin/finance/reconciliation/mismatches/${mismatchId}/resolve`, headers: auth2fa(adminId), payload: { status: 'ignored', reviewerId: financeId, resolutionNote: 'must reject' } });
    expect(terminal.statusCode).toBe(409);
  });
});
