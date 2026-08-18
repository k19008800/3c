/**
 * 分区维护脚本 — 大表月度子表自动建表 / 清理（P3-1）
 *
 * 背景：consumption_records / balance_transactions 为按月 RANGE 分区表
 * （migration 0025，PARTITION BY RANGE(created_at)）。本地 PG17 无 pg_partman 扩展
 * → 子表生命周期由本脚本维护，供 cron / 手动调用。
 *
 * 功能：
 *   - ensureMonthPartitions()：预建缺失的月度子表（默认 当前月±1 ～ 当前月+3 个月，幂等）
 *   - dropExpiredPartitions()：清理超过保留期（默认 12 个月）的旧子表（默认 dry-run，--drop 才真删）
 *   - 直接运行：`tsx src/db/partition-maintenance.ts [--drop]` → 先 ensure 再按需 drop，输出报告
 *
 * 安全约束：
 *   - 只操作命名符合 <表>_YYYY_MM 约定的子表；DEFAULT 兜底子表与外来命名一律不碰
 *   - 建表用 CREATE TABLE IF NOT EXISTS ... PARTITION OF（幂等，缺哪张补哪张）
 *   - 删表仅按子表名月份 < 截止月 判定，并校验其确为对应父表的子表（由 listChildTables 保证）
 *   - 动态 DDL 的标识符/字面量均由内部日期构造（无用户输入），无注入面
 *
 * 用法示例（cron 每月 1 日 02:00）：
 *   pnpm --filter @3cloud/api exec tsx src/db/partition-maintenance.ts
 *   pnpm --filter @3cloud/api exec tsx src/db/partition-maintenance.ts --drop
 *
 * @module db/partition-maintenance
 * @see api/src/db/migrations/0025_partition_big_tables.sql
 * @see docs/iteration-plan-v2.md P3-1 大表分区落地
 */

import { sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { db } from './index';

/** 已分区的两张大表 */
export const PARTITIONED_TABLES = ['consumption_records', 'balance_transactions'] as const;
export type PartitionedTable = (typeof PARTITIONED_TABLES)[number];

/** 子表命名约定 <表>_YYYY_MM（migration 0025 与维护脚本共用） */
const MONTH_PARTITION_RE = /^(consumption_records|balance_transactions)_(\d{4})_(\d{2})$/;

// ============================================================
// 日期工具（全部基于 UTC 月份边界，避免时区造成月份错位）
// ============================================================

/** 当月 1 日 00:00（UTC） */
function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** 月份平移（UTC，n 可为负） */
function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

/** YYYY-MM-DD（UTC） */
function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 按月份日期构造子表名：<表>_YYYY_MM */
export function monthPartitionName(table: PartitionedTable, month: Date): string {
  const y = month.getUTCFullYear();
  const m = String(month.getUTCMonth() + 1).padStart(2, '0');
  return `${table}_${y}_${m}`;
}

// ============================================================
// 子表查询 / 建表 / 删表
// ============================================================

/** 列出某父表（public schema）的所有子表名 */
async function listChildTables(parent: string): Promise<string[]> {
  const rows = (await db.execute(sql`
    SELECT c.relname AS name
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace n ON n.oid = p.relnamespace
    WHERE n.nspname = 'public' AND p.relname = ${parent}
    ORDER BY c.relname
  `)) as unknown as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

/** 为某父表创建单个月度子表（幂等：已存在则跳过） */
async function createMonthPartition(table: PartitionedTable, month: Date): Promise<string> {
  const name = monthPartitionName(table, month);
  const fromIso = toIso(month);
  const toIso_ = toIso(addMonths(month, 1));
  // 标识符/字面量全部由内部日期构造，sql.raw 安全
  await db.execute(sql.raw(
    `CREATE TABLE IF NOT EXISTS ${name} PARTITION OF ${table} FOR VALUES FROM ('${fromIso}') TO ('${toIso_}')`,
  ));
  return name;
}

// ============================================================
// 对外 API
// ============================================================

/**
 * 预建缺失的月度子表（幂等）。
 *
 * 默认覆盖 [当前月-3, 当前月+3]（对齐 P3-1「当前月 ± 3 个月」口径）；跨月后重跑即可补齐新月（cron 场景）。
 *
 * @param opts - monthsAhead：未来月数（默认 3）；monthsBehind：过去月数（默认 3）；now：基准时间（测试可注入）
 * @returns 本次新建的子表名列表
 */
export async function ensureMonthPartitions(
  opts: { monthsAhead?: number; monthsBehind?: number; now?: Date } = {},
): Promise<string[]> {
  const ahead = opts.monthsAhead ?? 3;
  const behind = opts.monthsBehind ?? 3;
  const now = opts.now ?? new Date();
  const start = addMonths(monthStart(now), -behind);
  const end = addMonths(monthStart(now), ahead);

  const created: string[] = [];
  for (const table of PARTITIONED_TABLES) {
    const existing = new Set(await listChildTables(table));
    for (let m = start; m <= end; m = addMonths(m, 1)) {
      const name = monthPartitionName(table, m);
      if (existing.has(name)) continue;
      created.push(await createMonthPartition(table, m));
    }
  }
  return created;
}

/**
 * 清理超过保留期的旧月度子表。
 *
 * 判定：子表名符合 <表>_YYYY_MM 约定 且 月份 < 截止月（当前月 - retentionMonths）。
 * 只删命名约定的子表；DEFAULT 兜底子表与外来命名一律跳过。
 *
 * @param opts - retentionMonths：保留月数（默认 12）；dryRun：仅报告不删除（默认 true，安全默认）；
 *               now：基准时间（测试可注入）
 * @returns { dropped, skipped } — dropped：实际删除的子表；skipped：因 dry-run / 非约定命名 / 未过期跳过
 */
export async function dropExpiredPartitions(
  opts: { retentionMonths?: number; dryRun?: boolean; now?: Date } = {},
): Promise<{ dropped: string[]; skipped: string[] }> {
  const retention = opts.retentionMonths ?? 12;
  const dryRun = opts.dryRun ?? true;
  const now = opts.now ?? new Date();
  const cutoff = addMonths(monthStart(now), -retention);

  const dropped: string[] = [];
  const skipped: string[] = [];
  for (const table of PARTITIONED_TABLES) {
    for (const child of await listChildTables(table)) {
      const m = MONTH_PARTITION_RE.exec(child);
      // 非约定命名（含 DEFAULT 兜底子表）→ 不碰
      if (!m || m[1] !== table) {
        skipped.push(child);
        continue;
      }
      const ym = new Date(Date.UTC(Number(m[2]), Number(m[3]) - 1, 1));
      if (ym >= cutoff) continue; // 未过期
      if (dryRun) {
        skipped.push(`${child} (dry-run)`);
        continue;
      }
      await db.execute(sql.raw(`DROP TABLE IF EXISTS public.${child}`));
      dropped.push(child);
    }
  }
  return { dropped, skipped };
}

// ============================================================
// CLI 入口（直接运行：tsx src/db/partition-maintenance.ts [--drop]）
// ============================================================

/**
 * 命令行入口：先确保未来子表存在，再按需清理过期子表。
 *
 * @param argv - 命令行参数（--drop 才真正删除过期子表，否则 dry-run）
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  try {
    const drop = argv.includes('--drop');
    console.log('🔧 分区维护：', PARTITIONED_TABLES.join(' / '));
    const created = await ensureMonthPartitions();
    console.log(created.length === 0
      ? '  子表已齐全（无新建）'
      : `  新建子表: ${created.join(', ')}`);

    const { dropped, skipped } = await dropExpiredPartitions({ dryRun: !drop });
    if (dropped.length > 0) console.log(`  删除过期子表: ${dropped.join(', ')}`);
    const dryRunNote = drop ? '' : '（dry-run，加 --drop 才真删）';
    console.log(`  过期候选跳过: ${skipped.length}${dryRunNote}`);
    if (skipped.length > 0 && !drop) console.log(`    ${skipped.join(', ')}`);
  } finally {
    // 关闭连接池，否则 tsx 进程因悬挂句柄不退出
    await (db.$client as { end: () => Promise<void> }).end().catch(() => {});
  }
}

// 直接运行（tsx）时执行 main；被 import 时不触发
if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error('分区维护失败:', e);
    process.exit(1);
  });
}
