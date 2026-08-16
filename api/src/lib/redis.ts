/**
 * Redis 客户端封装（ioredis，懒连接）
 *
 * 项目内 Redis 用于：限流计数、幂等缓存、供应商余额缓存等。
 * 统一走 cacheGet / cacheSet 两个薄封装：
 *   - 懒连接：模块加载不建连，首次读写才创建客户端；
 *   - 静默降级：Redis 不可用/异常时返回 null 或 no-op，不因缓存故障影响主链路。
 *
 * @module lib/redis
 */

import Redis from 'ioredis';

const DEFAULT_CACHE_TTL_SECONDS = 600;

let client: Redis | null = null;
let clientFailed = false;

/** 获取懒连接的 Redis 客户端；不可用时返回 null（不抛错） */
export function getRedis(): Redis | null {
  if (client) return client;
  if (clientFailed) return null;
  try {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      // 不无限重连：缓存层探活失败即视为不可用，避免卡住主流程
      retryStrategy: () => null,
    });
    client.on('error', () => {
      // 连接错误吞掉：缓存不可用不影响主链路
      clientFailed = true;
    });
    // 异步连接，不阻塞调用方；失败由 error 事件捕获
    client.connect().catch(() => {
      /* 已由 error 事件处理 */
    });
  } catch {
    clientFailed = true;
    client = null;
  }
  return client;
}

/**
 * 读取缓存值；Redis 不可用或异常时返回 null（不抛错）。
 */
export async function cacheGet(key: string): Promise<string | null> {
  try {
    const r = getRedis();
    if (!r) return null;
    return await r.get(key);
  } catch {
    return null;
  }
}

/**
 * 写入缓存（TTL 秒）；Redis 不可用或异常时静默跳过（不抛错）。
 */
export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds: number = DEFAULT_CACHE_TTL_SECONDS,
): Promise<void> {
  try {
    const r = getRedis();
    if (!r) return;
    await r.set(key, value, 'EX', ttlSeconds);
  } catch {
    /* 缓存写失败不阻断主流程 */
  }
}
