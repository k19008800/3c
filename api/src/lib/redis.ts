import Redis from "ioredis";
import "dotenv/config";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

/**
 * BullMQ 专用连接（maxRetriesPerRequest = null，BullMQ 要求）
 */
export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

/**
 * 通用 Redis 连接（缓存、限流等普通操作）
 */
export const redis = new Redis(redisUrl);
