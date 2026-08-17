/**
 * 供应商结算单路由 — /api/v1/admin/vendor-settlements + /api/v1/admin/supplier-bill-match（P1-3）
 *
 * 端点：
 *   POST /api/v1/admin/vendor-settlements/generate   — 月度结算单自动计算（幂等：已生成返回既有结果）
 *   GET  /api/v1/admin/vendor-settlements            — 结算单列表（period / supplier_id 过滤 + 分页）
 *   GET  /api/v1/admin/vendor-settlements/:id        — 结算单详情（含明细）
 *   GET  /api/v1/admin/vendor-settlements/:id/download — 结算单下载（CSV）
 *   POST /api/v1/admin/vendor-settlements/:id/confirm  — 确认结算单（draft → confirmed，幂等）
 *   GET  /api/v1/admin/supplier-bill-match           — 供应商账单匹配差异（只读计算）
 *
 * 全部走 adminAuth（role ∈ {admin, super_admin}）。
 *
 * @module routes
 * @see docs/iteration-plan-v2.md P1-3
 */

import type { FastifyInstance } from 'fastify';
import { verifyToken } from '../services/auth/jwt';
import { UnauthorizedError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import {
  generateSettlements,
  listSettlements,
  getSettlementDetail,
  getSettlementCsv,
  matchSupplierBill,
  confirmSettlement,
} from '../services/finance/vendor-settlement';

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
    if (!PERIOD_RE.test(period)) {
      throw new ValidationError('period 必须为 YYYY-MM 格式');
    }
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
    if (period !== undefined && !PERIOD_RE.test(period)) {
      throw new ValidationError('period 必须为 YYYY-MM 格式');
    }
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

  /** POST /api/v1/admin/vendor-settlements/:id/confirm — 确认结算单（draft → confirmed，幂等） */
  app.post('/api/v1/admin/vendor-settlements/:id/confirm', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = parseId((request.params as { id: string }).id, 'settlement id');
    const record = await confirmSettlement(id);
    if (!record) throw new NotFoundError('vendor settlement', id);
    return reply.send({
      data: { id: record.id, status: record.status },
      message: record.status === 'confirmed' ? '结算单已确认' : '结算单已是确认状态',
    });
  });

  /** GET /api/v1/admin/supplier-bill-match — 供应商账单匹配差异（只读计算） */
  app.get('/api/v1/admin/supplier-bill-match', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as { period?: string; supplier_id?: string; bill_amount?: string };
    const period = (q.period ?? '').trim();
    const supplierId = Number(q.supplier_id);
    const billAmount = Number(q.bill_amount);

    if (!PERIOD_RE.test(period)) throw new ValidationError('period 必须为 YYYY-MM 格式');
    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      throw new ValidationError('supplier_id 必须为正整数');
    }
    if (!Number.isFinite(billAmount) || billAmount < 0) {
      throw new ValidationError('bill_amount 必须为非负数字（元）');
    }

    const data = await matchSupplierBill({ period, supplierId, billAmount });
    return reply.send({ data });
  });
}
