// ============================================================
//  3cloud (3C) — Redis 连接
//  用途：Session / 缓存 / 限流计数器
// ============================================================

import { Redis } from "ioredis";
import { config } from "./config.js";

let redis: Redis;

export function createRedis() {
  if (redis) return redis;

  redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: 3,
    enableAutoPipelining: true, // PERF: 自动批量合并命令减少 RTT
    retryStrategy(times) {
      // PERF: 增加重试次数到 10，最大退避 5s，提高瞬断恢复能力
      if (times > 10) return null;
      return Math.min(times * 200, 5000);
    },
    lazyConnect: false, // PERF: 启动时即连接，尽早暴露连接问题
  });

  redis.on("error", (err) => {
    console.error("[Redis] Connection error:", err.message);
  });

  redis.on("connect", () => {
    console.log("[Redis] Connected");
  });

  return redis;
}

export function getRedis(): Redis {
  if (!redis) throw new Error("Redis not initialized. Call createRedis() first.");
  return redis;
}

export async function checkRedisConnection(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

export { redis };
