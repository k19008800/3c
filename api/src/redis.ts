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
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
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
