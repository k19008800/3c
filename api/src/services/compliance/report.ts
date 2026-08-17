/**
 * 合规报告服务 — 导出审计 / 数据访问 汇总（P2-4）
 *
 * 格式约定（保持简单可测，路由层据此输出 JSON 或 CSV）：
 *   export_audit  → 数据导出流转统计（data_requests 状态机 + data_requests.* 审计操作）
 *   data_access   → 敏感数据访问统计（deletion_requests 状态机 + ip_blacklist 现状
 *                   + deletion.* / security.ip_blacklist.* / data_requests.export 审计操作）
 *
 * ReportResult 结构：
 *   { type, generatedAt, periodDays, summary: Record<string, number>, auditLogs: [{action, count}] }
 *
 * @module services/compliance
 * @see docs/iteration-plan-v2.md P2-4 合规审计报告生成
 */

import { db, schema } from '../../db';
import { gte, sql, and, or, like } from 'drizzle-orm';

/** 报告类型 */
export type ComplianceReportType = 'export_audit' | 'data_access';

/** 审计操作分组行 */
export interface AuditActionCount {
  action: string;
  count: number;
}

/** 合规报告统一结构 */
export interface ComplianceReport {
  type: ComplianceReportType;
  generatedAt: string;
  periodDays: number;
  summary: Record<string, number>;
  auditLogs: AuditActionCount[];
}

/** 默认统计周期（天） */
const DEFAULT_PERIOD_DAYS = 30;
/** 周期上限（天） */
const MAX_PERIOD_DAYS = 3650;

/**
 * 归一化统计周期天数。
 *
 * @param raw - 原始输入（可为 undefined / 字符串 / 数字）
 * @returns 1..3650 内的整数，非法输入回退默认 30
 */
export function normalizePeriodDays(raw: unknown): number {
  const n = Number(raw);
  if (Number.isNaN(n) || n <= 0) return DEFAULT_PERIOD_DAYS;
  return Math.min(Math.floor(n), MAX_PERIOD_DAYS);
}

/**
 * 按动作分组统计审计日志（指定前缀 + 周期）。
 *
 * 注意：不用 `action LIKE ANY(数组参数)` —— postgres.js 经 drizzle 内插的 JS 数组
 * 不会序列化成 PG 数组字面量（报「有缺陷的数组常量」），改用 or(like) 逐项参数化。
 *
 * @param actionPrefixes - 动作前缀列表，如 ['data_requests.']
 * @param days - 统计周期（天）
 * @returns 动作 → 次数，按次数降序
 */
async function countAuditActions(actionPrefixes: string[], days: number): Promise<AuditActionCount[]> {
  const likeConditions = actionPrefixes.map((p) => like(schema.auditLogs.action, `${p}%`));
  const rows = await db
    .select({
      action: schema.auditLogs.action,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.auditLogs)
    .where(and(
      or(...likeConditions),
      gte(schema.auditLogs.createdAt, sql`NOW() - (${days} || ' days')::interval`),
    ))
    .groupBy(schema.auditLogs.action)
    .orderBy(sql`count(*) DESC`);
  return rows.map((r) => ({ action: r.action, count: r.count }));
}

/**
 * 单列分组计数（如 status 分组）。
 *
 * @param table - Drizzle 表对象
 * @param column - 分组列（Drizzle 列引用，参数化安全）
 * @returns 分组值 → 行数
 */
async function groupCount(table: any, column: any): Promise<Record<string, number>> {
  const rows = await db
    .select({ key: column, count: sql<number>`count(*)::int` })
    .from(table)
    .groupBy(column);
  const out: Record<string, number> = {};
  for (const r of rows) {
    out[String(r.key)] = r.count;
  }
  return out;
}

/**
 * 生成「导出审计」报告：data_requests 状态机分布 + 范围分布 + 相关审计操作。
 *
 * @param days - 统计周期（天）
 * @returns 报告对象
 */
export async function buildExportAuditReport(days: number): Promise<ComplianceReport> {
  const statuses = await groupCount(schema.dataRequests, schema.dataRequests.status);
  const scopes = await groupCount(schema.dataRequests, schema.dataRequests.dataScope);
  const audits = await countAuditActions(['data_requests.'], days);

  const total = Object.values(statuses).reduce((s, n) => s + n, 0);
  const summary: Record<string, number> = {
    totalRequests: total,
    pending: statuses.pending ?? 0,
    approved: statuses.approved ?? 0,
    rejected: statuses.rejected ?? 0,
    exported: statuses.exported ?? 0,
    cancelled: statuses.cancelled ?? 0,
    scopeAll: scopes.all ?? 0,
    scopeConsumption: scopes.consumption ?? 0,
    scopeApikeys: scopes.apikeys ?? 0,
    scopeProfile: scopes.profile ?? 0,
  };

  return {
    type: 'export_audit',
    generatedAt: new Date().toISOString(),
    periodDays: days,
    summary,
    auditLogs: audits,
  };
}

/**
 * 生成「数据访问」报告：deletion_requests 状态机 + ip_blacklist 现状 + 相关审计操作。
 *
 * @param days - 统计周期（天）
 * @returns 报告对象
 */
export async function buildDataAccessReport(days: number): Promise<ComplianceReport> {
  const deletionStatuses = await groupCount(schema.deletionRequests, schema.deletionRequests.status);
  const exportStatuses = await groupCount(schema.dataRequests, schema.dataRequests.status);
  const audits = await countAuditActions(['deletion.', 'security.ip_blacklist.', 'data_requests.export'], days);

  const [blRow] = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status = 'active')::int AS active,
      count(*) FILTER (WHERE status = 'active' AND scope = 'api')::int AS scope_api,
      count(*) FILTER (WHERE status = 'active' AND scope = 'admin')::int AS scope_admin,
      count(*) FILTER (WHERE status = 'active' AND scope = 'all')::int AS scope_all
    FROM ip_blacklist
  `) as unknown as Array<{ active: number; scope_api: number; scope_admin: number; scope_all: number }>;

  const summary: Record<string, number> = {
    deletionTotal: Object.values(deletionStatuses).reduce((s, n) => s + n, 0),
    deletionPending: deletionStatuses.pending ?? 0,
    deletionApproved: deletionStatuses.approved ?? 0,
    deletionRejected: deletionStatuses.rejected ?? 0,
    deletionCancelled: deletionStatuses.cancelled ?? 0,
    deletionDeleted: deletionStatuses.deleted ?? 0,
    exportPending: exportStatuses.pending ?? 0,
    exportApproved: exportStatuses.approved ?? 0,
    exportExported: exportStatuses.exported ?? 0,
    ipBlacklistActive: blRow?.active ?? 0,
    ipBlacklistScopeApi: blRow?.scope_api ?? 0,
    ipBlacklistScopeAdmin: blRow?.scope_admin ?? 0,
    ipBlacklistScopeAll: blRow?.scope_all ?? 0,
  };

  return {
    type: 'data_access',
    generatedAt: new Date().toISOString(),
    periodDays: days,
    summary,
    auditLogs: audits,
  };
}

/**
 * 按类型生成合规报告（路由层入口）。
 *
 * @param type - 报告类型
 * @param days - 统计周期（天）
 * @returns 报告对象
 * @throws {Error} 未知报告类型
 */
export async function buildComplianceReport(
  type: ComplianceReportType,
  days: number,
): Promise<ComplianceReport> {
  if (type === 'export_audit') return buildExportAuditReport(days);
  if (type === 'data_access') return buildDataAccessReport(days);
  throw new Error(`Unknown compliance report type: ${type}`);
}

/**
 * 将报告扁平化为 CSV 文本。
 *
 * 格式：
 *   type,generated_at,period_days
 *   export_audit,2026-08-18T10:00:00.000Z,30
 *
 *   summary_key,summary_value
 *   total_requests,5
 *   ...
 *
 *   action,count
 *   data_requests.approve,2
 *   ...
 *
 * @param report - 报告对象
 * @returns CSV 文本
 */
export function reportToCsv(report: ComplianceReport): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines: string[] = [];
  lines.push('type,generated_at,period_days');
  lines.push([esc(report.type), esc(report.generatedAt), esc(report.periodDays)].join(','));
  lines.push('');
  lines.push('summary_key,summary_value');
  for (const [key, value] of Object.entries(report.summary)) {
    lines.push([esc(key), esc(value)].join(','));
  }
  lines.push('');
  lines.push('action,count');
  for (const row of report.auditLogs) {
    lines.push([esc(row.action), esc(row.count)].join(','));
  }
  return `${lines.join('\n')}\n`;
}
