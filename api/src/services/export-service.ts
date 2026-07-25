// ============================================================
//  3cloud (3C) — 数据导出服务
//  支持 CSV/JSON 格式导出用量数据
// ============================================================

import { eq, and, gte, lt, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { callLogs } from "../db/schema.js";

// ── 导出数据类型 ──

export interface ExportRow {
  date: string;           // 日期 YYYY-MM-DD
  model: string;          // 模型名称
  calls: number;          // 调用次数
  inputTokens: number;    // 输入 Token
  outputTokens: number;   // 输出 Token
  totalTokens: number;    // 总 Token
  cost: string;           // 费用（元）
}

export interface ExportOptions {
  userId: number;
  startDate: Date;
  endDate: Date;
  format: 'csv' | 'json';
}

// ── 查询用量数据 ──

export async function queryUsageData(
  userId: number,
  startDate: Date,
  endDate: Date
): Promise<ExportRow[]> {
  const db = getDb();

  // 按日期+模型聚合
  const rows = await db
    .select({
      date: sql<string>`${callLogs.createdAt}::date::text`,
      model: sql<string>`${callLogs.modelName}`,
      calls: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${callLogs.promptTokens}), 0)::bigint`,
      outputTokens: sql<number>`coalesce(sum(${callLogs.completionTokens}), 0)::bigint`,
      totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      cost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
    })
    .from(callLogs)
    .where(
      and(
        eq(callLogs.userId, userId),
        gte(callLogs.createdAt, startDate),
        lt(callLogs.createdAt, endDate)
      )
    )
    .groupBy(sql`${callLogs.createdAt}::date`, callLogs.modelName)
    .orderBy(sql`${callLogs.createdAt}::date asc`, callLogs.modelName);

  return rows.map(r => ({
    date: r.date,
    model: r.model || 'unknown',
    calls: r.calls,
    inputTokens: Number(r.inputTokens),
    outputTokens: Number(r.outputTokens),
    totalTokens: Number(r.totalTokens),
    cost: Number(r.cost).toFixed(6),
  }));
}

// ── 生成 CSV ──

export function generateCSV(data: ExportRow[]): string {
  const headers = ['date', 'model', 'calls', 'inputTokens', 'outputTokens', 'totalTokens', 'cost'];
  const lines: string[] = [headers.join(',')];

  for (const row of data) {
    const values = [
      row.date,
      `"${row.model.replace(/"/g, '""')}"`,  // CSV 转义
      row.calls,
      row.inputTokens,
      row.outputTokens,
      row.totalTokens,
      row.cost,
    ];
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

// ── 生成 JSON ──

export function generateJSON(data: ExportRow[]): string {
  return JSON.stringify(data, null, 2);
}

// ── 导出入口 ──

export async function exportUsageData(options: ExportOptions): Promise<{ content: string; filename: string; mimeType: string }> {
  const { userId, startDate, endDate, format } = options;

  // 查询数据
  const data = await queryUsageData(userId, startDate, endDate);

  // 生成文件名
  const dateStr = new Date().toISOString().slice(0, 10);
  const ext = format === 'csv' ? 'csv' : 'json';
  const filename = `usage-export-${dateStr}.${ext}`;

  // 生成内容
  const content = format === 'csv' ? generateCSV(data) : generateJSON(data);
  const mimeType = format === 'csv' ? 'text/csv' : 'application/json';

  return { content, filename, mimeType };
}
