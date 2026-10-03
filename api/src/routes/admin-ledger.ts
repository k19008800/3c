/**
 * 平台总账路由 — /api/v1/admin/finance/ledger（PRD §29.1）
 *
 * 只读查询接口（写入由 billing 主链路副作用完成）：
 *   GET /admin/finance/ledger          分页查询分录（按科目/方向/用户/日期筛选）
 *   GET /admin/finance/ledger/summary  按科目汇总余额 + 会计恒等式校验（debit=credit）
 *
 * 鉴权：admin / super_admin 角色（与 admin-finance.ts 一致）。
 */

import type { FastifyInstance } from 'fastify';
import { verifyToken } from '../services/auth/jwt.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';
import { listLedger, ledgerSummary } from '../services/finance/platform-ledger.js';

async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid token');
  request.userContext = payload;
}

async function adminAuth(request: any, reply: any) {
  await jwtAuth(request, reply);
  const { role } = request.userContext as { role: string };
  if (role !== 'admin' && role !== 'super_admin') {
    throw new ForbiddenError('Admin access required');
  }
}

/** 解析 YYYY-MM-DD 起止（合法才返回 Date，非法忽略） */
function parseDate(s: string | undefined, endOfDay: boolean): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return endOfDay ? new Date(`${s}T23:59:59.999Z`) : new Date(`${s}T00:00:00.000Z`);
}

export async function adminLedgerRoutes(app: FastifyInstance) {
  /** GET /api/v1/admin/finance/ledger — 平台总账分录分页查询 */
  app.get('/api/v1/admin/finance/ledger', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as {
      account?: string; direction?: 'debit' | 'credit'; user_id?: string;
      start_date?: string; end_date?: string; page?: string; page_size?: string;
    };
    const result = await listLedger({
      account: q.account || undefined,
      direction: q.direction === 'debit' || q.direction === 'credit' ? q.direction : undefined,
      userId: q.user_id != null && Number.isFinite(Number(q.user_id)) ? Number(q.user_id) : undefined,
      startDate: parseDate(q.start_date, false),
      endDate: parseDate(q.end_date, true),
      page: q.page ? Number(q.page) : 1,
      pageSize: q.page_size ? Number(q.page_size) : 20,
    });
    return reply.send({ data: result });
  });

  /** GET /api/v1/admin/finance/ledger/summary — 科目汇总 + 会计恒等式校验 */
  app.get('/api/v1/admin/finance/ledger/summary', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query || {}) as { start_date?: string; end_date?: string };
    const summary = await ledgerSummary({
      startDate: parseDate(q.start_date, false),
      endDate: parseDate(q.end_date, true),
    });
    return reply.send({ data: summary });
  });
}
