// @ts-nocheck
// ============================================================
// 3cloud (3C) — 分区表自动清理定时任务
// 每天凌晨 3:00 执行，清理超过保留期的旧分区表
// 保留策略：
//   - call_logs: 保留 6 个月
//   - commission_logs: 保留 12 个月
// ============================================================

import cron from "node-cron";
import { getDb } from "../db/index.js";
import { sql } from "drizzle-orm";

let cleanupJob: cron.ScheduledTask | null = null;

/**
 * 执行分区清理任务
 * @returns 清理的分区数量（如果函数返回数量）或 void
 */
export async function cleanupOldPartitions(): Promise<void> {
  try {
    const db = getDb();
    
    // 调用数据库中的清理函数
    await db.execute(sql`
      SELECT cleanup_old_partitions()
    `);
    
    console.log("[PartitionCleanup] Old partitions cleaned successfully");
  } catch (err) {
    console.error("[PartitionCleanup] Failed to clean partitions:", err);
    // 不要抛出错误，避免影响其他定时任务
  }
}

/**
 * 注册分区清理定时任务
 * @param schedule Cron表达式，默认为每天凌晨3点
 */
export function schedulePartitionCleanup(schedule: string = "0 3 * * *"): void {
  if (cleanupJob) {
    console.log("[PartitionCleanup] Already scheduled, skipping");
    return;
  }

  cleanupJob = cron.schedule(schedule, async () => {
    console.log(`[PartitionCleanup] Running scheduled cleanup at ${new Date().toISOString()}`);
    await cleanupOldPartitions();
  });

  console.log(`[PartitionCleanup] Scheduled: ${schedule} (daily at 3:00 AM)`);
}

/**
 * 手动执行分区清理（用于测试或手动触发）
 */
export async function runPartitionCleanupNow(): Promise<void> {
  console.log("[PartitionCleanup] Manual cleanup triggered");
  await cleanupOldPartitions();
}

/**
 * 停止分区清理定时任务
 */
export function stopPartitionCleanup(): void {
  if (cleanupJob) {
    cleanupJob.stop();
    cleanupJob = null;
    console.log("[PartitionCleanup] Stopped");
  }
}

/**
 * 获取任务状态
 */
export function getPartitionCleanupStatus(): {
  scheduled: boolean;
  schedule: string | null;
} {
  return {
    scheduled: cleanupJob !== null,
    schedule: cleanupJob ? "0 3 * * *" : null,
  };
}