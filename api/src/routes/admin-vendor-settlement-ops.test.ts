/**
 * #26 收口 — 供应商结算单 paid/dispute 端点状态机专项测试。
 *
 * 覆盖状态机与字段落库（每个用例使用独立结算单，避免状态串扰）：
 *   - generate → status=generated（统一命名；历史 draft 兼容）
 *   - confirm：generated/draft → confirmed（幂等）
 *   - paid：confirmed → paid（写 paid_at / payment_reference；幂等；非 confirmed 409）
 *   - dispute：generated/draft → disputed（写 dispute_reason / disputed_at；幂等；非待确认 409）
 *   - confirm：disputed → confirmed（解决争议，清空争议字段）
 *   - list / detail 返回 paid_at / payment_reference / dispute_reason / disputed_at
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, and, inArray, like } from 'drizzle-orm';
import { generateAccessToken } from '../services/auth/jwt.js';
import { adminVendorSettlementsRoutes } from './admin-vendor-settlements.js';
import { enableTest2fa, op2faHeaders, clearCreditCounters } from './test-helpers.js';

process.env.JWT_SECRET = 'test-vendor-settlement-ops-secret';

const ADMIN_EMAIL = 'vs-ops-admin@3cloud.dev';
const SUPPLIER_PREFIX = 'vs-ops-supplier-';

let app: FastifyInstance;
let adminId = 0;
let supplierId = 0;
let seq = 0;
const adminToken = () => generateAccessToken({ userId: adminId, email: ADMIN_EMAIL, role: 'admin' });

function opHeaders() {
  return op2faHeaders(adminToken(), adminId, ADMIN_EMAIL, 'admin');
}

/** 每个用例插入独立结算单（period 递增保证唯一，避开 onConflict 复用旧状态） */
async function freshSettlement(status: string) {
  seq += 1;
  const period = `2119-${String((seq % 12) + 1).padStart(2, '0')}`;
  const rows = await db.select().from(schema.vendorSettlements)
    .where(and(eq(schema.vendorSettlements.supplierId, supplierId), eq(schema.vendorSettlements.period, period)));
  if (rows[0]) return rows[0]!.id;
  const [s] = await db.insert(schema.vendorSettlements).values({
    supplierId, period, totalAmount: '100', itemCount: 3, status, createdBy: adminId,
  }).returning();
  return s!.id;
}

beforeAll(async () => {
  app = Fastify({ logger: false });
  app.setErrorHandler((err: any, _request, reply) => {
    const status = Number(err?.statusCode) || 500;
    reply.code(status).send({ code: err?.code ?? status, message: err?.message ?? 'Internal Server Error' });
  });
  await app.register(adminVendorSettlementsRoutes);
  await app.ready();

  await db.insert(schema.users).values({
    email: ADMIN_EMAIL, passwordHash: 'x', role: 'admin', status: 'active', name: 'VS Ops Admin', language: 'zh-CN',
  }).onConflictDoNothing().returning();
  const adminRows = await db.select().from(schema.users).where(eq(schema.users.email, ADMIN_EMAIL));
  adminId = adminRows[0]!.id;
  await enableTest2fa(adminId);

  // 清理历史残留（同前缀供应商及其结算单），保证每次运行状态全新
  const stale = await db.select({ id: schema.suppliers.id }).from(schema.suppliers).where(like(schema.suppliers.name, `${SUPPLIER_PREFIX}%`));
  if (stale.length > 0) {
    await db.delete(schema.vendorSettlements).where(inArray(schema.vendorSettlements.supplierId, stale.map((s) => s.id)));
    await db.delete(schema.suppliers).where(inArray(schema.suppliers.id, stale.map((s) => s.id)));
  }
  const [sp] = await db.insert(schema.suppliers).values({
    name: `${SUPPLIER_PREFIX}${Date.now()}`, code: `VSOPS${Date.now() % 100000}`, baseUrl: 'https://example.test', status: 'active',
  }).returning();
  supplierId = sp!.id;
});

afterAll(async () => {
  try {
    await db.delete(schema.vendorSettlements).where(eq(schema.vendorSettlements.supplierId, supplierId));
    await db.delete(schema.suppliers).where(eq(schema.suppliers.id, supplierId));
    await db.delete(schema.user2fa).where(eq(schema.user2fa.userId, adminId));
    await db.delete(schema.users).where(eq(schema.users.id, adminId));
    await clearCreditCounters([adminId]);
  } catch (err) {
    console.error('[admin-vendor-settlement-ops] cleanup failed:', err);
  }
});

describe('供应商结算单 paid/dispute 状态机（#26 收口）', () => {
  it('confirm：generated → confirmed；幂等重确认返回 confirmed', async () => {
    const id = await freshSettlement('generated');
    const ok = await app.inject({
      method: 'POST', url: `/api/v1/admin/vendor-settlements/${id}/confirm`, headers: opHeaders(),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data?.status).toBe('confirmed');
    const again = await app.inject({
      method: 'POST', url: `/api/v1/admin/vendor-settlements/${id}/confirm`, headers: opHeaders(),
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().data?.status).toBe('confirmed');
  });

  it('confirm：历史 draft 状态兼容（draft → confirmed）', async () => {
    const id = await freshSettlement('draft');
    const ok = await app.inject({
      method: 'POST', url: `/api/v1/admin/vendor-settlements/${id}/confirm`, headers: opHeaders(),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data?.status).toBe('confirmed');
  });

  it('paid：confirmed → paid，写 paid_at / payment_reference；list/detail 返回字段', async () => {
    const id = await freshSettlement('confirmed');
    const ok = await app.inject({
      method: 'POST', url: `/api/v1/admin/vendor-settlements/${id}/paid`,
      headers: opHeaders(), payload: { payment_reference: 'TF21000301' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data?.status).toBe('paid');
    expect(ok.json().data?.payment_reference).toBe('TF21000301');
    expect(ok.json().data?.paid_at).toBeTruthy();

    const [row] = await db.select().from(schema.vendorSettlements).where(eq(schema.vendorSettlements.id, id));
    expect(row!.status).toBe('paid');
    expect(row!.paymentReference).toBe('TF21000301');
    expect(row!.paidAt).toBeTruthy();

    // 幂等：已 paid 再标记 → 200 paid
    const again = await app.inject({
      method: 'POST', url: `/api/v1/admin/vendor-settlements/${id}/paid`,
      headers: opHeaders(), payload: { payment_reference: 'TF21000302' },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().data?.status).toBe('paid');

    const list = await app.inject({
      method: 'GET', url: '/api/v1/admin/vendor-settlements?page_size=100', headers: { authorization: `Bearer ${adminToken()}` },
    });
    expect(list.json().data.items).toBeDefined();
    const item = list.json().data.items.find((x: any) => x.id === id);
    expect(item.status).toBe('paid');
    expect(item.payment_reference).toBe('TF21000301');
    expect(item.paid_at).toBeTruthy();

    const detail = await app.inject({
      method: 'GET', url: `/api/v1/admin/vendor-settlements/${id}`, headers: { authorization: `Bearer ${adminToken()}` },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.status).toBe('paid');
    expect(detail.json().data.payment_reference).toBe('TF21000301');
  });

  it('paid：非 confirmed 状态 → 409 SETTLEMENT_STATUS_MISMATCH', async () => {
    const id = await freshSettlement('generated');
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/vendor-settlements/${id}/paid`, headers: opHeaders(),
      payload: { payment_reference: 'TF-X' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('SETTLEMENT_STATUS_MISMATCH');
  });

  it('dispute：generated → disputed，写 dispute_reason / disputed_at；list/detail 返回字段', async () => {
    const id = await freshSettlement('generated');
    const ok = await app.inject({
      method: 'POST', url: `/api/v1/admin/vendor-settlements/${id}/dispute`,
      headers: opHeaders(), payload: { reason: '对账金额不一致' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data?.status).toBe('disputed');
    expect(ok.json().data?.dispute_reason).toBe('对账金额不一致');

    const [row] = await db.select().from(schema.vendorSettlements).where(eq(schema.vendorSettlements.id, id));
    expect(row!.status).toBe('disputed');
    expect(row!.disputeReason).toBe('对账金额不一致');
    expect(row!.disputedAt).toBeTruthy();

    const list = await app.inject({
      method: 'GET', url: `/api/v1/admin/vendor-settlements?status=disputed`, headers: { authorization: `Bearer ${adminToken()}` },
    });
    const item = list.json().data.items.find((x: any) => x.id === id);
    expect(item.status).toBe('disputed');
    expect(item.dispute_reason).toBe('对账金额不一致');
    expect(item.disputed_at).toBeTruthy();
  });

  it('dispute：非待确认状态（confirmed）→ 409 SETTLEMENT_STATUS_MISMATCH', async () => {
    const id = await freshSettlement('confirmed');
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/vendor-settlements/${id}/dispute`, headers: opHeaders(),
      payload: { reason: 'x' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('SETTLEMENT_STATUS_MISMATCH');
  });

  it('confirm：disputed → confirmed（解决争议，清空争议字段）', async () => {
    const id = await freshSettlement('disputed');
    const ok = await app.inject({
      method: 'POST', url: `/api/v1/admin/vendor-settlements/${id}/confirm`, headers: opHeaders(),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data?.status).toBe('confirmed');

    const [row] = await db.select().from(schema.vendorSettlements).where(eq(schema.vendorSettlements.id, id));
    expect(row!.status).toBe('confirmed');
    expect(row!.disputeReason).toBeNull();
    expect(row!.disputedAt).toBeNull();
  });

  it('list：status 过滤（disputed/paid/generated/confirmed）返回一致', async () => {
    for (const st of ['disputed', 'paid', 'generated', 'confirmed']) {
      const id = await freshSettlement(st);
      const res = await app.inject({
        method: 'GET', url: `/api/v1/admin/vendor-settlements?status=${st}&page_size=100`, headers: { authorization: `Bearer ${adminToken()}` },
      });
      expect(res.statusCode).toBe(200);
      const hit = res.json().data.items.find((x: any) => x.id === id);
      expect(hit).toBeDefined();
      expect(hit.status).toBe(st);
    }
  });
});
