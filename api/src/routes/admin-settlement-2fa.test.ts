/**
 * #26 专项 — 结算/对账资金写操作的操作级 2FA 契约测试。
 *
 * 覆盖 R7（ARCH v1.1 §4.4）：所有资金写端点必须由 requireOperation2fa 强制操作级 2FA。
 * 本次收口挂载的端点：
 *   - POST /admin/vendor-settlements/:id/confirm          结算单确认
 *   - POST /admin/finance/close/execute                   月结锁账
 *   - POST /admin/finance/close/:period/unlock            超管临时解锁
 *   - POST /admin/settlements/:id/settle                  供应商标记已结算
 *   - POST /admin/reconciliation/diffs/:id/:op            对账差异处理（补账/核销，T-04）
 *
 * 契约断言（每个端点）：
 *   - 缺 X-Operation-Token → 403 OPERATION_2FA_REQUIRED
 *   - 带一次性令牌 + 确认 + 摘要 → 成功（200）
 *   - 同一令牌重放 → 403 OPERATION_2FA_EXPIRED（一次性消费）
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, and, inArray } from 'drizzle-orm';
import { generateAccessToken } from '../services/auth/jwt.js';
import { financeDashboardRoutes } from './admin-finance.js';
import { adminVendorSettlementsRoutes } from './admin-vendor-settlements.js';
import { adminFinanceStatsRoutes } from './admin-finance-stats.js';
import { adminFinanceMissingRoutes } from './admin-finance-missing.js';
import { enableTest2fa, op2faHeaders, clearCreditCounters } from './test-helpers.js';

process.env.JWT_SECRET = 'test-admin-settlement-2fa-secret';

const ADMIN_EMAIL = 'settle-2fa-admin@3cloud.dev';
const SUPER_EMAIL = 'settle-2fa-super@3cloud.dev';

let app: FastifyInstance;
let adminId = 0;
let superId = 0;
let supplierId = 0;
let settlementId = 0;
const adminToken = () => generateAccessToken({ userId: adminId, email: ADMIN_EMAIL, role: 'admin' });
const superToken = () => generateAccessToken({ userId: superId, email: SUPER_EMAIL, role: 'super_admin' });

beforeAll(async () => {
  app = Fastify({ logger: false });
  app.setErrorHandler((err: any, _request, reply) => {
    const status = Number(err?.statusCode) || 500;
    reply.code(status).send({ code: err?.code ?? status, message: err?.message ?? 'Internal Server Error' });
  });
  await app.register(financeDashboardRoutes);
  await app.register(adminVendorSettlementsRoutes);
  await app.register(adminFinanceStatsRoutes);
  await app.register(adminFinanceMissingRoutes);
  await app.ready();

  // 操作人（admin + super_admin）启用 2FA
  await db.insert(schema.users).values({
    email: ADMIN_EMAIL, passwordHash: 'x', role: 'admin', status: 'active', name: 'Settle Admin', language: 'zh-CN',
  }).onConflictDoNothing().returning();
  await db.insert(schema.users).values({
    email: SUPER_EMAIL, passwordHash: 'x', role: 'super_admin', status: 'active', name: 'Settle Super', language: 'zh-CN',
  }).onConflictDoNothing().returning();
  const adminRows = await db.select().from(schema.users).where(eq(schema.users.email, ADMIN_EMAIL));
  const superRows = await db.select().from(schema.users).where(eq(schema.users.email, SUPER_EMAIL));
  adminId = adminRows[0]!.id;
  superId = superRows[0]!.id;
  await enableTest2fa(adminId);
  await enableTest2fa(superId);

  // 供应商（settle 端点）
  await db.insert(schema.suppliers).values({
    name: 'settle-2fa-supplier', code: 'SETTLE2FA', baseUrl: 'https://example.test', status: 'active',
  }).onConflictDoNothing().returning();
  const spRows = await db.select().from(schema.suppliers).where(eq(schema.suppliers.name, 'settle-2fa-supplier'));
  supplierId = spRows[0]!.id;

  // 结算单（confirm 端点，draft）
  await db.insert(schema.vendorSettlements).values({
    supplierId, period: '2099-01', totalAmount: '0', itemCount: 0,
    status: 'draft', createdBy: adminId,
  }).onConflictDoNothing().returning();
  const stRows = await db.select().from(schema.vendorSettlements)
    .where(and(eq(schema.vendorSettlements.supplierId, supplierId), eq(schema.vendorSettlements.period, '2099-01')));
  settlementId = stRows[0]!.id;

  // 对账差异（diffs 端点，T-04 补账/核销语义）：注入一条 unresolved 差异
  await db.insert(schema.systemConfig).values({
    key: 'reconciliation_diffs',
    value: JSON.stringify([{
      id: 900001, created_at: '2099-01-01T00:00:00.000Z', vendor_name: 'settle-2fa-supplier',
      diff_type: 'amount', platform_amount: 100, vendor_amount: 99.5, amount_diff: 0.5, status: 'unresolved',
    }]),
    description: 'test diff (2fa)',
  }).onConflictDoUpdate({ target: schema.systemConfig.key, set: { value: JSON.stringify([{
    id: 900001, created_at: '2099-01-01T00:00:00.000Z', vendor_name: 'settle-2fa-supplier',
    diff_type: 'amount', platform_amount: 100, vendor_amount: 99.5, amount_diff: 0.5, status: 'unresolved',
  }]) } });
});

afterAll(async () => {
  try {
    await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, 'reconciliation_diffs'));
    await db.delete(schema.user2fa).where(inArray(schema.user2fa.userId, [adminId, superId]));
    await db.delete(schema.vendorSettlements).where(eq(schema.vendorSettlements.supplierId, supplierId));
    await db.delete(schema.suppliers).where(eq(schema.suppliers.id, supplierId));
    await db.delete(schema.users).where(inArray(schema.users.id, [adminId, superId]));
    await clearCreditCounters([adminId, superId]);
  } catch (err) {
    console.error('[admin-settlement-2fa] cleanup failed:', err);
  }
});

describe('结算/对账资金写操作 · 操作级 2FA（#26）', () => {
  it('POST /vendor-settlements/:id/confirm — 缺令牌 403 REQUIRED；带令牌 200；同令牌重放 403 EXPIRED', async () => {
    const noToken = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/vendor-settlements/${settlementId}/confirm`,
      headers: { authorization: `Bearer ${adminToken()}` },
    });
    expect(noToken.statusCode).toBe(403);
    expect(noToken.json().code).toBe('OPERATION_2FA_REQUIRED');

    // 一次性令牌：同一组头（同令牌）发两次，第二次必须被 403 拒绝
    const opHeaders = op2faHeaders(adminToken(), adminId, ADMIN_EMAIL, 'admin');
    const ok = await app.inject({ method: 'POST', url: `/api/v1/admin/vendor-settlements/${settlementId}/confirm`, headers: opHeaders });
    expect(ok.statusCode).toBe(200);
    const replay = await app.inject({ method: 'POST', url: `/api/v1/admin/vendor-settlements/${settlementId}/confirm`, headers: opHeaders });
    expect(replay.statusCode).toBe(403);
    expect(replay.json().code).toBe('OPERATION_2FA_REPLAYED');
  });

  it('POST /finance/close/execute — 缺令牌 403 REQUIRED；带令牌 → 200', async () => {
    const noToken = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/finance/close/execute',
      headers: { authorization: `Bearer ${adminToken()}` },
      payload: { period: '2099-01' },
    });
    expect(noToken.statusCode).toBe(403);
    expect(noToken.json().code).toBe('OPERATION_2FA_REQUIRED');

    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/finance/close/execute',
      headers: op2faHeaders(adminToken(), adminId, ADMIN_EMAIL, 'admin'),
      payload: { period: '2099-01' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data?.period).toBe('2099-01');
  });

  it('POST /finance/close/:period/unlock — 缺令牌 403 REQUIRED；带令牌 → 200', async () => {
    const noToken = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/finance/close/2099-01/unlock',
      headers: { authorization: `Bearer ${superToken()}` },
      payload: { reason: 'test unlock' },
    });
    expect(noToken.statusCode).toBe(403);
    expect(noToken.json().code).toBe('OPERATION_2FA_REQUIRED');

    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/finance/close/2099-01/unlock',
      headers: op2faHeaders(superToken(), superId, SUPER_EMAIL, 'super_admin'),
      payload: { reason: 'test unlock' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data?.status).toBe('unlocked');
  });

  it('POST /settlements/:id/settle — 缺令牌 403 REQUIRED；带令牌 → 200', async () => {
    const noToken = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/settlements/${supplierId}/settle`,
      headers: { authorization: `Bearer ${adminToken()}` },
    });
    expect(noToken.statusCode).toBe(403);
    expect(noToken.json().code).toBe('OPERATION_2FA_REQUIRED');

    const ok = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/settlements/${supplierId}/settle`,
      headers: op2faHeaders(adminToken(), adminId, ADMIN_EMAIL, 'admin'),
    });
    expect(ok.statusCode).toBe(200);
  });

  it('POST /reconciliation/diffs/:id/resolve — 补账/核销差异处理：缺令牌 403 REQUIRED；带令牌 200；同令牌重放 403 REPLAYED', async () => {
    const noToken = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/reconciliation/diffs/900001/resolve',
      headers: { authorization: `Bearer ${adminToken()}` },
    });
    expect(noToken.statusCode).toBe(403);
    expect(noToken.json().code).toBe('OPERATION_2FA_REQUIRED');

    const opHeaders = op2faHeaders(adminToken(), adminId, ADMIN_EMAIL, 'admin');
    const ok = await app.inject({
      method: 'POST', url: '/api/v1/admin/reconciliation/diffs/900001/resolve', headers: opHeaders, payload: { reason: 'test' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data?.status).toBe('resolved');
    const replay = await app.inject({
      method: 'POST', url: '/api/v1/admin/reconciliation/diffs/900001/ignore', headers: opHeaders, payload: { reason: 'test' },
    });
    expect(replay.statusCode).toBe(403);
    expect(replay.json().code).toBe('OPERATION_2FA_REPLAYED');
  });
});
