// ============================================================
//  3cloud (3C) — 推荐码服务
// ============================================================

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { agents } from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import { getRedis } from "../../redis.js";
import { nanoid } from "nanoid";

/**
 * 获取或生成代理商推荐码
 * Redis 双向映射，TTL 90 天
 */
export async function getAgentReferralCode(userId: number): Promise<string> {
  const db = getDb();
  const redis = getRedis();

  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.userId, userId))
    .limit(1);

  if (!agent) {
    throw new AppError("NOT_AGENT", "您不是代理商", 400);
  }

  const existingCode = await redis.get(`ref:uid:${userId}`);
  if (existingCode) {
    return existingCode;
  }

  const code = nanoid(8).replace(/[0OIl]/g, () => nanoid(1));

  await redis.setex(`ref:link:${code}`, 90 * 24 * 3600, String(agent.id));
  await redis.setex(`ref:uid:${userId}`, 90 * 24 * 3600, code);

  return code;
}
