/** 平台侧正式对账服务 — 基于 consumption_records 汇总，绝不伪造供应商外部账单。 */
import { db, schema } from '../../db/index.js';
import { and, eq, gte, lt, desc, sql, count } from 'drizzle-orm';

export type ReconStatus = 'pending' | 'running' | 'completed' | 'failed';

function dateRange(startDate: string, endDate: string) {
  // API 日期是闭区间；查询边界转换为 [start, end + 1 day)，避免漏掉 endDate 当天记录。
  const end = new Date(`${endDate}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: new Date(`${startDate}T00:00:00.000Z`), end };
}
function amount(v: unknown): string { return String(v ?? '0'); }

/** 执行一次平台消费对账；同范围运行中的报告拒绝并发。 */
export async function runReconciliation(input: { startDate: string; endDate: string; reconType: string; createdBy: number }) {
  const { start, end } = dateRange(input.startDate, input.endDate);
  const existing = await db.select({ id: schema.reconciliationReports.id })
    .from(schema.reconciliationReports)
    .where(and(eq(schema.reconciliationReports.startDate, start), eq(schema.reconciliationReports.endDate, end), eq(schema.reconciliationReports.reconType, input.reconType), eq(schema.reconciliationReports.status, 'running'))).limit(1);
  if (existing[0]) return { conflict: true as const, id: existing[0].id };
  const [report] = await db.insert(schema.reconciliationReports).values({ startDate: start, endDate: end, reconType: input.reconType, status: 'pending', createdBy: input.createdBy }).returning();
  if (!report) throw new Error('reconciliation report creation failed');
  let started;
  try {
    [started] = await db.update(schema.reconciliationReports).set({ status: 'running', startedAt: new Date() }).where(and(eq(schema.reconciliationReports.id, report.id), eq(schema.reconciliationReports.status, 'pending'))).returning();
  } catch (error: any) {
    // 部分唯一索引是并发最终闸门；竞争失败清理本次 pending 草稿并返回受控冲突。
    if (error?.code === '23505' && String(error?.constraint ?? '').includes('uq_reconciliation_reports_running_range')) {
      await db.delete(schema.reconciliationReports).where(eq(schema.reconciliationReports.id, report.id));
      return { conflict: true as const, id: report.id };
    }
    throw error;
  }
  if (!started) throw new Error('reconciliation state transition failed');
  try {
    const [summary] = await db.select({ totalOrders: count(schema.consumptionRecords.id), totalAmount: sql<string>`coalesce(sum(${schema.consumptionRecords.cost}), 0)` })
      .from(schema.consumptionRecords).where(and(gte(schema.consumptionRecords.createdAt, start), lt(schema.consumptionRecords.createdAt, end)));
    const totalOrders = Number(summary?.totalOrders ?? 0);
    const [completed] = await db.update(schema.reconciliationReports).set({ status: 'completed', totalOrders, matchedOrders: totalOrders, mismatchedOrders: 0, totalAmount: amount(summary?.totalAmount), difference: '0', summary: { source: 'platform_consumption_records', external_source: false }, completedAt: new Date() }).where(and(eq(schema.reconciliationReports.id, report.id), eq(schema.reconciliationReports.status, 'running'))).returning();
    return { conflict: false as const, report: completed };
  } catch (error) {
    await db.update(schema.reconciliationReports).set({ status: 'failed', errorMessage: String(error), completedAt: new Date() }).where(and(eq(schema.reconciliationReports.id, report.id), eq(schema.reconciliationReports.status, 'running')));
    throw error;
  }
}

/** 分页查询报告。 */
export async function listReconciliationReports(page: number, pageSize: number) {
  const [items, totals] = await Promise.all([
    db.select({ id: schema.reconciliationReports.id, startDate: schema.reconciliationReports.startDate, endDate: schema.reconciliationReports.endDate, reconType: schema.reconciliationReports.reconType, status: schema.reconciliationReports.status, totalOrders: schema.reconciliationReports.totalOrders, matchedOrders: schema.reconciliationReports.matchedOrders, mismatchedOrders: schema.reconciliationReports.mismatchedOrders, totalAmount: schema.reconciliationReports.totalAmount, difference: schema.reconciliationReports.difference, errorMessage: schema.reconciliationReports.errorMessage, createdAt: schema.reconciliationReports.createdAt, startedAt: schema.reconciliationReports.startedAt, completedAt: schema.reconciliationReports.completedAt }).from(schema.reconciliationReports).orderBy(desc(schema.reconciliationReports.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(schema.reconciliationReports),
  ]);
  return { items, total: Number(totals[0]?.total ?? 0), page, pageSize };
}

/** 查询报告及其差异。 */
export async function getReconciliationReport(id: number) {
  const [report] = await db.select().from(schema.reconciliationReports).where(eq(schema.reconciliationReports.id, id)).limit(1);
  if (!report) return null;
  const mismatches = await db.select().from(schema.reconciliationMismatches).where(eq(schema.reconciliationMismatches.reportId, id)).orderBy(desc(schema.reconciliationMismatches.createdAt));
  return { report, mismatches };
}

/** 状态守卫处理差异；资金操作不在本 P0 闭环内，仅允许非资金终态标记。 */
export async function resolveReconciliationMismatch(id: number, operatorId: number, reviewerId: number, status: 'resolved' | 'false_positive' | 'ignored', note: string) {
  const [row] = await db.select().from(schema.reconciliationMismatches).where(eq(schema.reconciliationMismatches.id, id)).limit(1);
  if (!row) return { kind: 'missing' as const };
  // 必须先通过显式 process 事件；禁止 pending 直接跳入任何终态。
  if (row.status !== 'processing') return { kind: 'terminal' as const, status: row.status };
  if (!note.trim()) return { kind: 'invalid' as const };
  if (operatorId === reviewerId) return { kind: 'sod' as const };
  const [updated] = await db.update(schema.reconciliationMismatches).set({ status, resolutionNote: note.trim(), processingBy: operatorId, processingAt: row.processingAt ?? new Date(), resolvedBy: operatorId, resolvedAt: new Date(), reviewerId }).where(and(eq(schema.reconciliationMismatches.id, id), eq(schema.reconciliationMismatches.status, 'processing'))).returning();
  return updated ? { kind: 'ok' as const, row: updated } : { kind: 'terminal' as const, status: row.status };
}

/** 将差异显式置为处理中；这是人工处理主状态机的必经事件，不涉及资金。 */
export async function processReconciliationMismatch(id: number, operatorId: number) {
  const [updated] = await db.update(schema.reconciliationMismatches)
    .set({ status: 'processing', processingBy: operatorId, processingAt: new Date() })
    .where(and(eq(schema.reconciliationMismatches.id, id), eq(schema.reconciliationMismatches.status, 'pending')))
    .returning();
  if (updated) return { kind: 'ok' as const, row: updated };
  const [current] = await db.select({ status: schema.reconciliationMismatches.status })
    .from(schema.reconciliationMismatches).where(eq(schema.reconciliationMismatches.id, id)).limit(1);
  if (!current) return { kind: 'missing' as const };
  return { kind: 'invalid' as const, status: current.status };
}

/** 生成 UTF-8 BOM CSV。 */
export async function exportReconciliation(id: number) {
  const result = await getReconciliationReport(id);
  if (!result) return null;
  const csv = ['id,report_id,source,reference,difference_amount,severity,status,resolution_note', ...result.mismatches.map((m) => [m.id, m.reportId, m.source, m.reference ?? '', m.differenceAmount, m.severity, m.status, m.resolutionNote ?? ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\r\n');
  return { filename: `reconciliation-${id}.csv`, body: `\uFEFF${csv}` };
}
