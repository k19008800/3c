// ============================================================
//  3cloud (3C) — 实名认证 提交频率限制
// ============================================================

import { getRedis } from "../../redis.js";
import { AppError } from "../auth-service/index.js";

const SUBMIT_RATE_KEY = "realname:rate";
const SUBMIT_COOLDOWN = 300; // 5 分钟

export async function checkSubmitRateLimit(userId: number): Promise<void> {
  const redis = getRedis();
  const key = `${SUBMIT_RATE_KEY}:${userId}`;
  const ttl = await redis.ttl(key);
  if (ttl > 0) {
    throw new AppError("TOO_FREQUENT", `提交过于频繁，请 ${Math.ceil(ttl / 60)} 分钟后再试`, 429);
  }
}

export async function markSubmitRateLimit(userId: number): Promise<void> {
  const redis = getRedis();
  const key = `${SUBMIT_RATE_KEY}:${userId}`;
  await redis.setex(key, SUBMIT_COOLDOWN, "1");
}
