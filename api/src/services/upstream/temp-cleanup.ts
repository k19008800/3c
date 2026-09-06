/**
 * 多模态临时资产磁盘缓存 — TTL 清理 + 容量上限闭环（§11 磁盘缓存管理完整闭环）
 *
 * 职责：
 *   - 配置读写（system_config，key 前缀 media.）：
 *       media.temp_ttl_hours            临时文件 TTL（小时），默认 24
 *       media.cleanup_interval_minutes  清理调度间隔（分钟），默认 60
 *       media.max_total_size_gb         磁盘上限（GB），默认 20
 *       media.emergency_cleanup_ttl_minutes 紧急清理的激进 TTL（分钟），默认 5
 *       media.audit_retention_days      审计保留天数，默认 180
 *   - runTempCleanupOnce()：单次清理
 *       1. 遍历 getTempAssetDir()，删除 mtime 超过 temp_ttl_hours 的文件；
 *       2. 若总大小 > max_total_size_gb → 紧急清理：先删超过
 *          emergency_cleanup_ttl_minutes 的旧文件，再按 mtime 从旧到新删除，
 *          直至总大小 < 70% 上限；
 *       3. 更新内存统计（last_cleanup_at / freed_today），便于 temp-stats 展示。
 *   - startTempCleanupScheduler(app)：注册到 app.ts 的常驻调度器
 *     （setInterval + app.addHook('onClose') 清理，参照 app.ts 现有调度器模式；
 *     每个 tick 读取运行时配置，interval 变更即时生效）。
 *   - getTempCacheStats()：供 /admin/sys/cache/temp-stats 使用
 *     （file_count / dir_size / usage_pct 实时扫描；hit_count / last_cleanup_at /
 *      freed_today 来自内存统计，进程重启后归零 —— 符合规格「无则 0/null」）。
 *
 * 文件删除用 node:fs/promises unlink；目录不存在时全部容错返回 0，不抛错。
 *
 * @module services/upstream
 * @see docs/gap-fix-spec-2026-08-18.md §11
 * @see services/upstream/temp-asset-store.ts getTempAssetDir
 */

import type { FastifyInstance } from 'fastify';
import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { db, schema } from '../../db/index.js';
import { sql } from 'drizzle-orm';
import { getTempAssetDir } from './temp-asset-store.js';

/* ───────── 配置类型与默认值 ───────── */

/** 临时资产缓存配置（system_config media.*，全部为数字，秒/字节由调用方换算） */
export interface TempCacheConfig {
  /** 临时文件 TTL（小时） */
  temp_ttl_hours: number;
  /** 清理调度间隔（分钟） */
  cleanup_interval_minutes: number;
  /** 磁盘容量上限（GB） */
  max_total_size_gb: number;
  /** 紧急清理的激进 TTL（分钟） */
  emergency_cleanup_ttl_minutes: number;
  /** 审计日志保留天数 */
  audit_retention_days: number;
}

/** 配置默认值（规格 §11 契约） */
export const DEFAULT_TEMP_CACHE_CONFIG: TempCacheConfig = {
  temp_ttl_hours: 24,
  cleanup_interval_minutes: 60,
  max_total_size_gb: 20,
  emergency_cleanup_ttl_minutes: 5,
  audit_retention_days: 180,
};

/** 配置键（system_config.key，统一 media. 前缀） */
const CONFIG_KEYS: Record<keyof TempCacheConfig, string> = {
  temp_ttl_hours: 'media.temp_ttl_hours',
  cleanup_interval_minutes: 'media.cleanup_interval_minutes',
  max_total_size_gb: 'media.max_total_size_gb',
  emergency_cleanup_ttl_minutes: 'media.emergency_cleanup_ttl_minutes',
  audit_retention_days: 'media.audit_retention_days',
};

const GB = 1024 * 1024 * 1024;

/* ───────── 内存统计（hit_count / last_cleanup_at / freed_today） ───────── */

interface MemoryStats {
  hitCount: number;
  lastCleanupAt: string | null;
  freedToday: number;
  freedDate: string; // YYYY-MM-DD（UTC），跨天自动重置 freedToday
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

const memoryStats: MemoryStats = {
  hitCount: 0,
  lastCleanupAt: null,
  freedToday: 0,
  freedDate: todayKey(),
};

/** 累计一次临时资产命中（供命中统计；无则 0） */
export function recordTempAssetHit(): void {
  memoryStats.hitCount += 1;
}

/* ───────── 配置读写 ───────── */

function toPositiveNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * 读取临时资产缓存配置（system_config media.*，缺省回退默认值）。
 *
 * @returns 完整配置对象
 */
export async function readTempCacheConfig(): Promise<TempCacheConfig> {
  const keys = Object.values(CONFIG_KEYS);
  const rows = await db
    .select({ key: schema.systemConfig.key, value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(sql`${schema.systemConfig.key} IN (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    temp_ttl_hours: toPositiveNumber(map.get(CONFIG_KEYS.temp_ttl_hours), DEFAULT_TEMP_CACHE_CONFIG.temp_ttl_hours),
    cleanup_interval_minutes: toPositiveNumber(map.get(CONFIG_KEYS.cleanup_interval_minutes), DEFAULT_TEMP_CACHE_CONFIG.cleanup_interval_minutes),
    max_total_size_gb: toPositiveNumber(map.get(CONFIG_KEYS.max_total_size_gb), DEFAULT_TEMP_CACHE_CONFIG.max_total_size_gb),
    emergency_cleanup_ttl_minutes: toPositiveNumber(map.get(CONFIG_KEYS.emergency_cleanup_ttl_minutes), DEFAULT_TEMP_CACHE_CONFIG.emergency_cleanup_ttl_minutes),
    audit_retention_days: toPositiveNumber(map.get(CONFIG_KEYS.audit_retention_days), DEFAULT_TEMP_CACHE_CONFIG.audit_retention_days),
  };
}

/**
 * 保存临时资产缓存配置（逐 key upsert，operator 记录到 updated_by）。
 *
 * @param operatorId - 操作人 user id（来自 JWT），可为 null
 * @param cfg - 完整配置
 * @returns 保存后的配置
 */
export async function saveTempCacheConfig(operatorId: number | null, cfg: TempCacheConfig): Promise<TempCacheConfig> {
  const entries = Object.entries(cfg) as Array<[keyof TempCacheConfig, number]>;
  for (const [shortKey, value] of entries) {
    const key = CONFIG_KEYS[shortKey];
    if (!key) continue;
    await db.insert(schema.systemConfig)
      .values({ key, value: String(value), updatedBy: operatorId, description: `media cache config: ${shortKey}` })
      .onConflictDoUpdate({
        target: schema.systemConfig.key,
        set: { value: String(value), updatedBy: operatorId, updatedAt: new Date() },
      });
  }
  return cfg;
}

/* ───────── 目录扫描 ───────── */

interface ScannedFile {
  name: string;
  size: number;
  mtimeMs: number;
}

/** 扫描临时目录：文件数 / 总字节 / 文件明细（mtime 升序）。目录不存在 → 空结果不抛错。 */
async function scanTempDir(): Promise<{ files: ScannedFile[]; fileCount: number; dirSize: number }> {
  const dir = getTempAssetDir();
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: ScannedFile[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      try {
        const s = await stat(path.join(dir, entry.name));
        files.push({ name: entry.name, size: s.size, mtimeMs: s.mtimeMs });
      } catch {
        // 单个文件 stat 失败（竞态删除等）忽略
      }
    }
    const dirSize = files.reduce((acc, f) => acc + f.size, 0);
    files.sort((a, b) => a.mtimeMs - b.mtimeMs);
    return { files, fileCount: files.length, dirSize };
  } catch {
    // 目录不存在 / 无权限 → 视为空
    return { files: [], fileCount: 0, dirSize: 0 };
  }
}

/* ───────── 统计 ───────── */

/** 临时缓存统计（temp-stats 端点数据源） */
export interface TempCacheStats {
  hit_count: number;
  file_count: number;
  dir_size: number;
  usage_pct: number;
  dir_path: string;
  last_cleanup_at: string | null;
  freed_today: number;
}

/**
 * 获取临时缓存统计。
 *
 * file_count / dir_size / usage_pct 实时扫描目录；hit_count / last_cleanup_at /
 * freed_today 来自内存统计（无则 0 / null）。目录不存在时各值回退 0，不报错。
 */
export async function getTempCacheStats(): Promise<TempCacheStats> {
  const cfg = await readTempCacheConfig();
  const { fileCount, dirSize } = await scanTempDir();
  const maxBytes = cfg.max_total_size_gb * GB;
  const usagePct = maxBytes > 0 ? Math.round((dirSize / maxBytes) * 10000) / 100 : 0;
  // 跨天重置 freedToday
  if (memoryStats.freedDate !== todayKey()) {
    memoryStats.freedDate = todayKey();
    memoryStats.freedToday = 0;
  }
  return {
    hit_count: memoryStats.hitCount,
    file_count: fileCount,
    dir_size: dirSize,
    usage_pct: usagePct,
    dir_path: getTempAssetDir(),
    last_cleanup_at: memoryStats.lastCleanupAt,
    freed_today: memoryStats.freedToday,
  };
}

/* ───────── 清理执行 ───────── */

/**
 * 执行一次临时资产清理（可独立调用，便于测试）。
 *
 * 流程：
 *   1. 读取配置（temp_ttl_hours / max_total_size_gb / emergency_cleanup_ttl_minutes）；
 *   2. 删除 mtime 超过 temp_ttl_hours 的过期文件；
 *   3. 若剩余总大小 > max_total_size_gb → 紧急清理：
 *      先删 mtime 超过 emergency_cleanup_ttl_minutes 的旧文件，再按 mtime 从旧到新
 *      删除，直至总大小 < 70% × 上限；
 *   4. 更新内存统计 last_cleanup_at / freed_today。
 *
 * @returns { deleted, freedBytes, emergency } — 删除文件数 / 释放字节 / 是否触发紧急清理
 */
export async function runTempCleanupOnce(): Promise<{ deleted: number; freedBytes: number; emergency: boolean }> {
  const cfg = await readTempCacheConfig();
  const { files } = await scanTempDir();
  if (files.length === 0) {
    memoryStats.lastCleanupAt = new Date().toISOString();
    return { deleted: 0, freedBytes: 0, emergency: false };
  }

  const nowMs = Date.now();
  const ttlMs = cfg.temp_ttl_hours * 3600 * 1000;
  const maxBytes = cfg.max_total_size_gb * GB;

  // 1. 正常 TTL：过期文件
  const expired = files.filter((f) => nowMs - f.mtimeMs >= ttlMs);

  // 2. 容量评估（TTL 删除后的剩余）
  let remaining = files.reduce((acc, f) => acc + f.size, 0);
  for (const f of expired) remaining -= f.size;
  const overLimit = remaining > maxBytes;
  const targetBytes = maxBytes * 0.7;

  // 紧急清理候选：先激进 TTL（emergency_cleanup_ttl_minutes），再最旧优先
  let emergencyCandidates: ScannedFile[] = [];
  if (overLimit) {
    const emergencyTtlMs = cfg.emergency_cleanup_ttl_minutes * 60 * 1000;
    const aggressive = files.filter((f) => nowMs - f.mtimeMs >= emergencyTtlMs && !expired.includes(f));
    // 最旧优先：扫描结果已按 mtime 升序
    const oldestFirst = files.filter((f) => !expired.includes(f) && !aggressive.includes(f));
    emergencyCandidates = [...aggressive, ...oldestFirst];
  }

  // 3. 执行删除（幂等：unlink 失败视为文件已被删，计数按成功为准）
  const toDelete = new Set<string>();
  let freedBytes = 0;
  let deleted = 0;
  const dir = getTempAssetDir();

  const tryUnlink = async (f: ScannedFile): Promise<boolean> => {
    if (toDelete.has(f.name)) return false;
    try {
      await unlink(path.join(dir, f.name));
      toDelete.add(f.name);
      freedBytes += f.size;
      deleted += 1;
      return true;
    } catch {
      return false;
    }
  };

  for (const f of expired) {
    await tryUnlink(f);
  }

  if (overLimit) {
    let sizeAfter = remaining;
    for (const f of emergencyCandidates) {
      if (sizeAfter < targetBytes) break;
      if (await tryUnlink(f)) sizeAfter -= f.size;
    }
  }

  // 4. 统计更新
  memoryStats.lastCleanupAt = new Date().toISOString();
  if (memoryStats.freedDate !== todayKey()) {
    memoryStats.freedDate = todayKey();
    memoryStats.freedToday = 0;
  }
  memoryStats.freedToday += freedBytes;

  return { deleted, freedBytes, emergency: overLimit };
}

/* ───────── 调度器 ───────── */

let schedulerStarted = false;

/**
 * 启动临时资产清理调度器（注册到 app.ts，由主 agent 统一调用）。
 *
 * 每分钟 tick，读取运行时配置：距上次清理 >= cleanup_interval_minutes 时执行一次
 * runTempCleanupOnce()（配置变更即时生效，无需重启）。app.close() 时清除 interval。
 *
 * @param app - Fastify 实例（用于 log 与 onClose 钩子）
 */
export function startTempCleanupScheduler(app: FastifyInstance): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  let lastRunAt = 0;
  const tick = async () => {
    try {
      const cfg = await readTempCacheConfig();
      const intervalMs = cfg.cleanup_interval_minutes * 60 * 1000;
      if (Date.now() - lastRunAt < intervalMs) return;
      lastRunAt = Date.now();
      const result = await runTempCleanupOnce();
      app.log.info(
        `🧹 [temp-cleanup] 清理完成：删除 ${result.deleted} 个文件，释放 ${result.freedBytes} 字节` +
          (result.emergency ? '（触发紧急清理）' : ''),
      );
    } catch (err: any) {
      app.log.warn({ err }, `[temp-cleanup] tick 异常: ${err?.message ?? err}`);
    }
  };

  const timer = setInterval(tick, 60 * 1000);
  // onClose 钩子清理 interval：需在 app.ready() 之前注册（Fastify 限制）。
  // 若主 agent 在 startApp（listen 之后，参照 retention 等调度器）调用，
  // addHook 会抛 FST_ERR_HOOK_ADD_HOOK_AFTER_READY → 退化为纯 setInterval
  // （进程退出自然清理，与 app.ts 现有调度器模式一致）。
  try {
    app.addHook('onClose', async () => {
      clearInterval(timer);
    });
  } catch {
    /* app 已 ready，无法再注册 onClose；interval 随进程退出回收 */
  }
  app.log.info('⏰ 临时资产磁盘缓存清理调度器已启动（每分钟检查，按 media.cleanup_interval_minutes 间隔清理）');
}
