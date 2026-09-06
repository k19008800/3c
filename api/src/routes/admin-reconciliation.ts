/** 正式财务对账 API — 平台消费侧汇总与差异处理。 */
import type { FastifyInstance } from 'fastify';
import { requirePerm } from '../middleware/require-perm.js';
import { requireOperation2fa } from '../middleware/require-operation-2fa.js';
import { ValidationError, NotFoundError, AppError } from '../lib/errors.js';
import { db, schema } from '../db/index.js';
import { runReconciliation, listReconciliationReports, getReconciliationReport, exportReconciliation, resolveReconciliationMismatch, processReconciliationMismatch } from '../services/finance/reconciliation.js';

const TYPES = ['full', 'recharge', 'balance', 'commission', 'withdraw', 'consumption'];
function actor(req: any) { return Number(req.userContext?.userId ?? 0); }
async function audit(req: any, action: string, resourceId: string, details: unknown) {
  await db.insert(schema.auditLogs).values({ userId: actor(req) || null, action, resource: 'reconciliation', resourceId, details: details as any, ipAddress: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null });
}
function parseDate(value: unknown, field: string) {
  const text = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new ValidationError(`${field} 必须为 YYYY-MM-DD`);
  const [year, month, day] = text.split('-').map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month! - 1 || parsed.getUTCDate() !== day) {
    throw new ValidationError(`${field} 必须为有效日历日期`);
  }
  return text;
}
export async function adminReconciliationRoutes(app: FastifyInstance) {
  app.post('/api/v1/admin/finance/reconciliation/run', { preHandler: [requirePerm('finance.reconciliation')] }, async (req, reply) => {
    const body = (req.body ?? {}) as any;
    const startDate = parseDate(body.startDate ?? body.start_date, 'startDate');
    const endDate = parseDate(body.endDate ?? body.end_date, 'endDate');
    if (startDate > endDate) throw new ValidationError('startDate 不能晚于 endDate');
    if (endDate > new Date().toISOString().slice(0, 10)) throw new ValidationError('endDate 不能晚于当前日期');
    const startMs = Date.parse(`${startDate}T00:00:00.000Z`);
    const endMs = Date.parse(`${endDate}T00:00:00.000Z`);
    if ((endMs - startMs) / 86400000 > 90) throw new ValidationError('对账范围不能超过 90 天');
    const reconType = String(body.reconType ?? body.recon_type ?? 'full');
    if (!TYPES.includes(reconType)) throw new ValidationError('reconType 无效');
    const result = await runReconciliation({ startDate, endDate, reconType, createdBy: actor(req) });
    if (result.conflict) throw new AppError('同范围对账正在运行', 409, 'RECONCILIATION_ALREADY_RUNNING');
    await audit(req, 'reconciliation.run', String(result.report?.id), { startDate, endDate, reconType });
    return reply.send({ data: result.report });
  });
  app.get('/api/v1/admin/finance/reconciliation/reports', { preHandler: [requirePerm('finance.reconciliation')] }, async (req, reply) => {
    const q = (req.query ?? {}) as any; const page = Math.max(Number(q.page ?? 1), 1); const pageSize = Math.min(Math.max(Number(q.page_size ?? 20), 1), 100);
    return reply.send({ data: await listReconciliationReports(page, pageSize) });
  });
  app.get('/api/v1/admin/finance/reconciliation/reports/:id', { preHandler: [requirePerm('finance.reconciliation')] }, async (req, reply) => {
    const id = Number((req.params as any).id); if (!Number.isInteger(id) || id <= 0) throw new ValidationError('id 无效');
    const result = await getReconciliationReport(id); if (!result) throw new NotFoundError('reconciliation report', id); return reply.send({ data: result });
  });
  app.get('/api/v1/admin/finance/reconciliation/export/:id', { preHandler: [requirePerm('finance.reconciliation')] }, async (req, reply) => {
    const id = Number((req.params as any).id); const result = await exportReconciliation(id); if (!result) throw new NotFoundError('reconciliation report', id);
    return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${result.filename}"`).send(result.body);
  });
  app.post('/api/v1/admin/finance/reconciliation/mismatches/:id/resolve', { preHandler: [requirePerm('FINANCE_RECON_APPROVE'), requireOperation2fa] }, async (req, reply) => {
    const id = Number((req.params as any).id); const body = (req.body ?? {}) as any; const status = body.status;
    if (!['resolved', 'false_positive', 'ignored'].includes(status)) throw new ValidationError('status 无效');
    const note = String(body.resolutionNote ?? body.resolution_note ?? '').trim(); if (!note) throw new ValidationError('处理备注必填');
    const operatorId = actor(req); const reviewerId = Number(body.reviewerId ?? body.reviewer_id); if (!Number.isInteger(reviewerId) || reviewerId <= 0) throw new ValidationError('reviewerId 必须为正整数');
    const result = await resolveReconciliationMismatch(id, operatorId, reviewerId, status, note);
    if (result.kind === 'missing') throw new NotFoundError('reconciliation mismatch', id);
    if (result.kind === 'terminal') {
      const message = result.status === 'pending' ? '差异必须先进入处理中' : '差异已是终态';
      throw new AppError(message, 409, 'RECONCILIATION_STATUS_MISMATCH');
    }
    if (result.kind === 'sod') throw new AppError('处理人与复核人不能相同', 403, 'SOD_VIOLATION');
    await audit(req, 'reconciliation.mismatch.resolve', String(id), { status, reviewerId }); return reply.send({ data: result.row });
  });
  app.post('/api/v1/admin/finance/reconciliation/mismatches/:id/process', { preHandler: [requirePerm('FINANCE_RECON_APPROVE'), requireOperation2fa] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('id 无效');
    const result = await processReconciliationMismatch(id, actor(req));
    if (result.kind === 'missing') throw new NotFoundError('reconciliation mismatch', id);
    if (result.kind === 'invalid') throw new AppError('差异状态不可进入处理中', 409, 'RECONCILIATION_STATUS_MISMATCH');
    await audit(req, 'reconciliation.mismatch.process', String(id), {});
    return reply.send({ data: result.row });
  });
}
