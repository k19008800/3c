/**
 * 供应商结算单路由 — /api/v1/admin/vendor-settlements + /api/v1/admin/supplier-bill-match（P1-3）
 *
 * 端点：
 *   POST /api/v1/admin/vendor-settlements/generate   — 月度结算单自动计算（幂等：已生成返回既有结果）
 *   GET  /api/v1/admin/vendor-settlements            — 结算单列表（period / supplier_id 过滤 + 分页）
 *   GET  /api/v1/admin/vendor-settlements/:id        — 结算单详情（含明细）
 *   GET  /api/v1/admin/vendor-settlements/:id/download — 结算单下载（CSV）
 *   POST /api/v1/admin/vendor-settlements/:id/confirm  — 确认结算单（generated/draft → confirmed；disputed → confirmed 解决争议，幂等）
 *   POST /api/v1/admin/vendor-settlements/:id/paid     — 标记打款（confirmed → paid，写入 paid_at / payment_reference）
 *   POST /api/v1/admin/vendor-settlements/:id/dispute  — 标记争议（generated/draft → disputed，写入 dispute_reason）
 *   GET  /api/v1/admin/supplier-bill-match           — 供应商账单匹配差异（只读计算）
 *
 * 全部走 adminAuth（role ∈ {admin, super_admin}）。
 *
 * @module routes
 * @see docs/iteration-plan-v2.md P1-3
 */

import type { FastifyInstance } from 'fastify';
import { verifyToken } from '../services/auth/jwt.js';
import { requireOperation2fa } from '../middleware/require-operation-2fa.js';
import { UnauthorizedError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';
import {
  generateSettlements,
  listSettlements,
  getSettlementDetail,
  getSettlementCsv,
  matchSupplierBill,
  listSupplierBillMatches,
  confirmSettlement,
  markSettlementPaid,
  markSettlementDispute,
} from '../services/finance/vendor-settlement.js';

/* ───────── auth helpers ───────── */

async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
}

async function adminAuth(request: any, reply: any) {
  await jwtAuth(request, reply);
  const { role } = request.userContext as { role: string };
  if (role !== 'admin' && role !== 'super_admin') {
    throw new ForbiddenError('Admin access required');
  }
}

/* ───────── helpers ───────── */

const PERIOD_RE = /^\d{4}-\d{2}$/;

/**
 * 校验 period 为真实存在的月份。
 * ⚠️ 仅靠 PERIOD_RE 只能挡格式，挡不住 `2026-13` / `2026-00` 这类语义非法值——
 * 它们会一路走到 SQL 的 monthRangeOf，new Date(2026, 12, 1) 悄悄滚到 2027-01，
 * 结果是「查不到数据」被误读成「该月无消费」。这里提前拒绝。
 */
function assertPeriod(period: string): void {
  if (!PERIOD_RE.test(period)) {
    throw new ValidationError('period 必须为 YYYY-MM 格式');
  }
  const month = Number(period.slice(5, 7));
  if (month < 1 || month > 12) {
    throw new ValidationError(`period 的月份必须为 01-12，收到 ${period}`);
  }
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function parseId(raw: string, label = 'id'): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError(`invalid ${label}`);
  return id;
}

export async function adminVendorSettlementsRoutes(app: FastifyInstance) {
  /** POST /api/v1/admin/vendor-settlements/generate — 月度结算单自动计算（幂等） */
  app.post('/api/v1/admin/vendor-settlements/generate', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body ?? {}) as { period?: string };
    const period = (body.period ?? '').trim() || currentMonth();
    assertPeriod(period);
    const operatorId = (request as any).userContext?.userId ?? 0;
    const data = await generateSettlements(period, operatorId);
    return reply.send({ data });
  });

  /** GET /api/v1/admin/vendor-settlements — 结算单列表（period / supplier_id 过滤 + 分页） */
  app.get('/api/v1/admin/vendor-settlements', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as {
      period?: string;
      supplier_id?: string;
      page?: string;
      page_size?: string;
    };
    const page = Math.max(parseInt(q.page ?? '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(q.page_size ?? '20', 10) || 20, 1), 100);
    const period = q.period?.trim() || undefined;
    const supplierId = q.supplier_id ? Number(q.supplier_id) : undefined;
    if (supplierId !== undefined && (!Number.isInteger(supplierId) || supplierId <= 0)) {
      throw new ValidationError('supplier_id 必须为正整数');
    }
    if (period !== undefined) assertPeriod(period);
    const data = await listSettlements({ period, supplierId, page, pageSize });
    return reply.send({ data });
  });

  /** GET /api/v1/admin/vendor-settlements/:id — 结算单详情（含明细） */
  app.get('/api/v1/admin/vendor-settlements/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id, 'settlement id');
    const detail = await getSettlementDetail(id);
    if (!detail) throw new NotFoundError('vendor settlement', id);
    return reply.send({ data: detail });
  });

  /** GET /api/v1/admin/vendor-settlements/:id/download — 结算单下载（CSV） */
  app.get('/api/v1/admin/vendor-settlements/:id/download', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id, 'settlement id');
    const result = await getSettlementCsv(id);
    if (!result) throw new NotFoundError('vendor settlement', id);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${result.filename}"`);
    // BOM：Excel 打开 UTF-8 CSV 中文不乱码
    return reply.send(`\uFEFF${result.csv}`);
  });

  /** POST /api/v1/admin/vendor-settlements/:id/confirm — 确认结算单（generated/draft → confirmed；disputed → confirmed 解决争议）；资金写操作级 2FA（R7） */
  app.post('/api/v1/admin/vendor-settlements/:id/confirm', { preHandler: [adminAuth, requireOperation2fa] }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id, 'settlement id');
    const record = await confirmSettlement(id);
    if (!record) throw new NotFoundError('vendor settlement', id);
    return reply.send({
      data: { id: record.id, status: record.status },
      message: record.status === 'confirmed' ? '结算单已确认' : '结算单已是确认状态',
    });
  });

  /** POST /api/v1/admin/vendor-settlements/:id/paid — 标记打款（confirmed → paid）；资金写操作级 2FA（R7，#26 收口） */
  app.post('/api/v1/admin/vendor-settlements/:id/paid', { preHandler: [adminAuth, requireOperation2fa] }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id, 'settlement id');
    const body = (request.body ?? {}) as { payment_reference?: string };
    const record = await markSettlementPaid(id, body.payment_reference);
    if (!record) throw new NotFoundError('vendor settlement', id);
    return reply.send({
      data: { id: record.id, status: record.status, paid_at: record.paidAt?.toISOString() ?? null, payment_reference: record.paymentReference },
      message: record.status === 'paid' ? '已标记打款' : '结算单已标记打款',
    });
  });

  /** POST /api/v1/admin/vendor-settlements/:id/dispute — 标记争议（generated/draft → disputed）；资金写操作级 2FA（R7，#26 收口） */
  app.post('/api/v1/admin/vendor-settlements/:id/dispute', { preHandler: [adminAuth, requireOperation2fa] }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id, 'settlement id');
    const body = (request.body ?? {}) as { reason?: string };
    const record = await markSettlementDispute(id, body.reason);
    if (!record) throw new NotFoundError('vendor settlement', id);
    return reply.send({
      data: { id: record.id, status: record.status, dispute_reason: record.disputeReason },
      message: record.status === 'disputed' ? '已标记争议' : '结算单已标记争议',
    });
  });

  /** GET /api/v1/admin/supplier-bill-match — 供应商账单匹配差异（只读计算） */
  app.get('/api/v1/admin/supplier-bill-match', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as { period?: string; supplier_id?: string; bill_amount?: string };
    const period = (q.period ?? '').trim();
    const supplierId = Number(q.supplier_id);
    const billAmount = Number(q.bill_amount);

    assertPeriod(period);
    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      throw new ValidationError('supplier_id 必须为正整数');
    }
    if (!Number.isFinite(billAmount) || billAmount < 0) {
      throw new ValidationError('bill_amount 必须为非负数字（元）');
    }

    const data = await matchSupplierBill({ period, supplierId, billAmount });
    return reply.send({ data });
  });

  /**
   * GET /api/v1/admin/supplier-bill-match/list — 批量账单匹配概览（只读）
   *
   * query: period(必填 YYYY-MM) / supplier_id(可选)
   *
   * 与上面单数端点的分工：
   *   - `/supplier-bill-match`         单供应商核对：财务已拿到供应商账单金额，传入后算差异
   *   - `/supplier-bill-match/list`   全量概览：一次列出当月所有供应商的平台应付金额与调用次数，
   *                                  前端在该列表上让财务逐行填入账单金额再调单数端点核对
   *
   * 只读，不落库；返回行的 bill_amount 恒为 0、status 恒为 'pending'（尚未核对）。
   *
   * ⚠️ unattributed 必须透出给前端：mock 回退路径产生的消费记录没有供应商归属
   * （settle.ts 写入 supplierId = channel?.supplier.id，channel 为 null 时为 NULL）。
   * 实测 2026-10 有 99.9% 成本属此类，若只返回 items，运营会把「可归因部分」
   * 误当作「该月全部应付」而少付供应商。
   */
  app.get('/api/v1/admin/supplier-bill-match/list', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as { period?: string; supplier_id?: string };
    const period = (q.period ?? '').trim();
    assertPeriod(period);

    let supplierId: number | undefined;
    if (q.supplier_id !== undefined && q.supplier_id !== '') {
      const n = Number(q.supplier_id);
      if (!Number.isInteger(n) || n <= 0) throw new ValidationError('supplier_id 必须为正整数');
      supplierId = n;
    }

    const { items, unattributed } = await listSupplierBillMatches({ period, supplierId });
    return reply.send({ data: { period, items, unattributed } });
  });
}
