// ============================================================
//  3cloud (3C) — 登录风控 滑动窗口计数
// ============================================================

import { getRedis } from "../../redis.js";

const WINDOW_SECONDS = 60;

export async function countInWindow(key: string): Promise<number> {
  const redis = getRedis();
  const now = Date.now();
  const cutoff = now - WINDOW_SECONDS * 1000;
  await redis.zremrangebyscore(key, 0, cutoff);
  return redis.zcard(key);
}

export async function addToWindow(key: string, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  const now = Date.now();
  const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
  await redis
    .multi()
    .zadd(key, now, member)
    .expire(key, ttlSeconds)
    .exec();
}
