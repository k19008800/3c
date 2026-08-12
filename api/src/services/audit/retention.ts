/**
 * 对话上下文留痕 — 数据保留策略 + 清理调度器
 *
 * 后台可配置保留策略（存 system_config）：
 *   - 保留单位 + 数量：day / week / month / quarter / halfYear / year × N
 *   - 轮询计划：多久检查一次（日/周/月/季度/半年/年）+ 具体执行日与时间（UTC+8）
 *   - 可停用（enabled=false → 全量永久保留，不做自动清理）
 *
 * 调度器每分钟 tick，命中「轮询日 + 时间」且与上次执行处于不同周期时，
 * 删除 occurred_at 早于保留期的记录；lastPollKey 持久化到 system_config，跨进程防重复。
 *
 * 与主链路完全解耦：清理失败只打日志，不影响 API。
 */
import { db, schema } from '../../db';
import { lt, sql } from 'drizzle-orm';

/* ───────── 常量 ───────── */

export type RetainUnit = 'day' | 'week' | 'month' | 'quarter' | 'halfYear' | 'year';
export type PollUnit = 'day' | 'week' | 'month' | 'quarter' | 'halfYear' | 'year';

export const RETAIN_UNITS: RetainUnit[] = ['day', 'week', 'month', 'quarter', 'halfYear', 'year'];
export const POLL_UNITS: PollUnit[] = ['day', 'week', 'month', 'quarter', 'halfYear', 'year'];

export const UNIT_LABELS: Record<string, string> = {
  day: '日', week: '周', month: '月', quarter: '季度', halfYear: '半年', year: '全年',
};

/** 单位时长（毫秒，近似：月≈30.44天、季度≈91.31天、半年≈182.6天、年≈365.25天） */
const UNIT_MS: Record<RetainUnit, number> = {
  day: 24 * 3600 * 1000,
  week: 7 * 24 * 3600 * 1000,
  month: 30.44 * 24 * 3600 * 1000,
  quarter: 91.31 * 24 * 3600 * 1000,
  halfYear: 182.62 * 24 * 3600 * 1000,
  year: 365.25 * 24 * 3600 * 1000,
};

/** 默认配置：关闭自动清理（全量永久保留） */
const DEFAULT_CONFIG: RetentionConfig = {
  enabled: false,
  retainUnit: 'month',
  retainAmount: 12,
  pollUnit: 'day',
  pollHour: 3,
  pollDayOfWeek: 1,
  pollDayOfMonth: 1,
  pollMonth: 1,
};

const CONFIG_KEY = 'conv_retention';
const LAST_POLL_KEY = 'conv_retention_last_poll';

export interface RetentionConfig {
  enabled: boolean;
  retainUnit: RetainUnit;
  retainAmount: number;
  pollUnit: PollUnit;
  pollHour: number;       // 0-23 UTC+8
  pollDayOfWeek: number;  // 0-6, 0=周日（pollUnit=week 时）
  pollDayOfMonth: number; // 1-31（pollUnit=month/quarter/halfYear/year 时）
  pollMonth: number;      // 1-12（pollUnit=year 时）
}

/* ───────── 配置读写 ───────── */

export function parseRetentionConfig(raw: string | null | undefined): RetentionConfig {
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const p = JSON.parse(raw) as Partial<RetentionConfig>;
    return {
      enabled: p.enabled ?? DEFAULT_CONFIG.enabled,
      retainUnit: (RETAIN_UNITS as string[]).includes(p.retainUnit ?? '') ? p.retainUnit as RetainUnit : DEFAULT_CONFIG.retainUnit,
      retainAmount: Number.isInteger(p.retainAmount) && (p.retainAmount ?? 0) > 0 ? p.retainAmount as number : DEFAULT_CONFIG.retainAmount,
      pollUnit: (POLL_UNITS as string[]).includes(p.pollUnit ?? '') ? p.pollUnit as PollUnit : DEFAULT_CONFIG.pollUnit,
      pollHour: Number.isInteger(p.pollHour) && (p.pollHour ?? 0) >= 0 && (p.pollHour ?? 0) <= 23 ? p.pollHour as number : DEFAULT_CONFIG.pollHour,
      pollDayOfWeek: Number.isInteger(p.pollDayOfWeek) && (p.pollDayOfWeek ?? 0) >= 0 && (p.pollDayOfWeek ?? 0) <= 6 ? p.pollDayOfWeek as number : DEFAULT_CONFIG.pollDayOfWeek,
      pollDayOfMonth: Number.isInteger(p.pollDayOfMonth) && (p.pollDayOfMonth ?? 0) >= 1 && (p.pollDayOfMonth ?? 0) <= 31 ? p.pollDayOfMonth as number : DEFAULT_CONFIG.pollDayOfMonth,
      pollMonth: Number.isInteger(p.pollMonth) && (p.pollMonth ?? 0) >= 1 && (p.pollMonth ?? 0) <= 12 ? p.pollMonth as number : DEFAULT_CONFIG.pollMonth,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function readRetentionConfig(): Promise<RetentionConfig> {
  const [row] = await db.select({ value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(sql`${schema.systemConfig.key} = ${CONFIG_KEY}`);
  return parseRetentionConfig(row?.value);
}

export async function saveRetentionConfig(operatorId: number | null, cfg: RetentionConfig): Promise<RetentionConfig> {
  await db.insert(schema.systemConfig)
    .values({ key: CONFIG_KEY, value: JSON.stringify(cfg), updatedBy: operatorId })
    .onConflictDoUpdate({
      target: schema.systemConfig.key,
      set: { value: JSON.stringify(cfg), updatedBy: operatorId, updatedAt: new Date() },
    });
  return cfg;
}

/* ───────── 周期标识（UTC+8，用于防重复） ───────── */

function cstDate(): Date {
  return new Date(Date.now() + 8 * 3600 * 1000);
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

/** 当前轮询周期标识：day→YYYY-MM-DD / week→YYYY-Www / month→YYYY-MM / quarter→YYYYQn / halfYear→YYYYHn / year→YYYY */
export function pollPeriodKey(unit: PollUnit, ref?: Date): string {
  const d = ref ?? cstDate();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  switch (unit) {
    case 'day': return `${y}-${pad(m)}-${pad(day)}`;
    case 'week': {
      // ISO 周号
      const temp = new Date(Date.UTC(y, d.getUTCMonth(), day));
      const dayNum = (temp.getUTCDay() + 6) % 7;
      temp.setUTCDate(temp.getUTCDate() - dayNum + 3);
      const firstThursday = new Date(Date.UTC(temp.getUTCFullYear(), 0, 4));
      const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
      firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
      const weekNo = 1 + Math.round((temp.getTime() - firstThursday.getTime()) / (7 * 86400000));
      return `${y}-W${pad(weekNo)}`;
    }
    case 'month': return `${y}-${pad(m)}`;
    case 'quarter': return `${y}Q${Math.floor((m - 1) / 3) + 1}`;
    case 'halfYear': return `${y}H${m <= 6 ? 1 : 2}`;
    case 'year': return `${y}`;
  }
}

/** 当前是否命中轮询计划（UTC+8） */
export function isPollDue(cfg: RetentionConfig, ref?: Date): boolean {
  const d = ref ?? cstDate();
  const hour = d.getUTCHours();
  const month = d.getUTCMonth() + 1;
  const date = d.getUTCDate();
  const dow = d.getUTCDay();

  if (hour !== cfg.pollHour) return false;

  switch (cfg.pollUnit) {
    case 'day': return true;
    case 'week': return dow === cfg.pollDayOfWeek;
    case 'month': return date === cfg.pollDayOfMonth;
    case 'quarter': return [3, 6, 9, 12].includes(month) && date === cfg.pollDayOfMonth;
    case 'halfYear': return [6, 12].includes(month) && date === cfg.pollDayOfMonth;
    case 'year': return month === cfg.pollMonth && date === cfg.pollDayOfMonth;
  }
}

/* ───────── 清理执行 ───────── */

async function readLastPoll(): Promise<string> {
  const [row] = await db.select({ value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(sql`${schema.systemConfig.key} = ${LAST_POLL_KEY}`);
  return row?.value ?? '';
}

async function writeLastPoll(periodKey: string): Promise<void> {
  await db.insert(schema.systemConfig)
    .values({ key: LAST_POLL_KEY, value: periodKey })
    .onConflictDoUpdate({
      target: schema.systemConfig.key,
      set: { value: periodKey, updatedAt: new Date() },
    });
}

/** 保留截止时间：now - retainAmount × 单位 */
export function retentionCutoff(cfg: RetentionConfig, now: Date = new Date()): Date {
  return new Date(now.getTime() - cfg.retainAmount * UNIT_MS[cfg.retainUnit]);
}

/**
 * 执行一次清理：删除 occurred_at 早于保留期的记录。
 * 返回删除条数；失败抛错由调用方处理（调度器吞错，API 返回错误）。
 */
export async function applyRetention(cfg: RetentionConfig): Promise<number> {
  const cutoff = retentionCutoff(cfg);
  // 先计数再删除（drizzle 无行数返回，计数便于展示与审计）
  const expiredRows = await db
    .select({ expired: sql<number>`count(*)::int` })
    .from(schema.conversationContextRecords)
    .where(lt(schema.conversationContextRecords.occurredAt, cutoff));
  const expired = expiredRows[0]?.expired ?? 0;
  if (expired > 0) {
    await db.delete(schema.conversationContextRecords)
      .where(lt(schema.conversationContextRecords.occurredAt, cutoff));
  }
  return expired;
}

/* ───────── 调度器 ───────── */

let schedulerStarted = false;

export function startRetentionScheduler(log: { info: (msg: string) => void }) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const tick = async () => {
    try {
      const cfg = await readRetentionConfig();
      if (!cfg.enabled) return; // 停用 → 全量永久保留

      if (!isPollDue(cfg)) return;

      const periodKey = pollPeriodKey(cfg.pollUnit);
      const last = await readLastPoll();
      if (last === periodKey) return; // 本周期已执行过，防重复

      const deleted = await applyRetention(cfg);
      await writeLastPoll(periodKey);
      log.info(`🧹 [retention] 已清理 ${deleted} 条超期留痕（保留 ${cfg.retainAmount}${UNIT_LABELS[cfg.retainUnit]}，周期 ${periodKey}）`);
    } catch (err: any) {
      log.info(`[retention] tick 异常: ${err?.message ?? err}`);
    }
  };

  setInterval(tick, 60 * 1000);
  log.info('⏰ 对话留痕保留策略调度器已启动（每分钟检查轮询计划，UTC+8）');
}

/** 立即执行清理（后台按钮触发），并同步更新上次执行周期 */
export async function runRetentionNow(): Promise<{ deleted: number; cfg: RetentionConfig }> {
  const cfg = await readRetentionConfig();
  const deleted = await applyRetention(cfg);
  await writeLastPoll(pollPeriodKey(cfg.pollUnit));
  return { deleted, cfg };
}
