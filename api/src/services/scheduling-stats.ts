// ============================================================
//  3cloud (3C) — 模型调度实时计数器
//  轻量 Redis Hash 计数器，每 1 分钟一个 Bucket
//  关键路径：Pipeline HINCRBY × 4 + EXPIRE × 3 = 1 次网络往返
//  异常容灾：Redis 不可用时静默降级，不阻塞主流程
// ============================================================

import { getRedis } from "../redis.js";

const MINUTE_TTL = 7200; // 2 小时自动过期

/** 获取当前分钟 Bucket Key 后缀 (YYYYMMDDHHmm) */
function getMinuteBucket(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${y}${m}${d}${h}${min}`;
}

/**
 * 记录一次成功的模型调度统计
 * @param vendorName - 上游厂商名
 * @param modelName - 模型名
 * @param totalTokens - 本次消耗 Token 数
 * @param durationMs - 请求耗时（毫秒）
 */
export async function recordSchedulingStats(
  vendorName: string,
  modelName: string,
  totalTokens: number,
  durationMs: number,
): Promise<void> {
  try {
    const redis = getRedis();
    const bucket = getMinuteBucket();
    const field = `${modelName}::${vendorName}`;

    // Redis Pipeline：4 个 HINCRBY + 3 个 EXPIRE = 1 次网络往返
    const pipeline = redis.pipeline();
    pipeline.hincrby(`scheduling:rpm:${bucket}`, field, 1);
    pipeline.hincrby(`scheduling:tpm:${bucket}`, field, totalTokens);
    pipeline.hincrby(`scheduling:lat:${bucket}`, `${field}::lat`, durationMs);
    pipeline.hincrby(`scheduling:lat:${bucket}`, `${field}::cnt`, 1);
    pipeline.expire(`scheduling:rpm:${bucket}`, MINUTE_TTL);
    pipeline.expire(`scheduling:tpm:${bucket}`, MINUTE_TTL);
    pipeline.expire(`scheduling:lat:${bucket}`, MINUTE_TTL);

    await pipeline.exec();
  } catch {
    // Redis 不可用时静默降级，不阻塞主流程
  }
}
