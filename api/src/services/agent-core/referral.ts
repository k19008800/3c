// ============================================================
//  3cloud (3C) — 推荐码服务
// ============================================================

import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { agents } from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import { getRedis } from "../../redis.js";
import { nanoid } from "nanoid";

/** 推荐码字符长度 */
const REFERRAL_CODE_LENGTH = 8;
/** Redis 推荐码缓存 TTL（秒），90 天 */
const REFERRAL_CACHE_TTL = 90 * 24 * 3600;
/** 推荐码正则：只允许字母数字 */
const REFERRAL_CODE_REGEX = /^[A-Za-z0-9]{4,16}$/;

/**
 * 为代理商生成或获取推荐码
 * - 先查数据库（持久化），有则直接返回
 * - 无则生成新码，同时写入 DB 和 Redis
 */
export async function getAgentReferralCode(userId: number): Promise<string> {
  const db = getDb();
  const redis = getRedis();

  const [agent] = await db
    .select({ id: agents.id, referralCode: agents.referralCode })
    .from(agents)
    .where(eq(agents.userId, userId))
    .limit(1);

  if (!agent) {
    throw new AppError("NOT_AGENT", "您不是代理商", 400);
  }

  // 数据库已有推荐码，直接返回
  if (agent.referralCode) {
    // 同时确保 Redis 缓存存在
    const cached = await redis.get(`ref:uid:${userId}`);
    if (!cached) {
      await redis.setex(`ref:link:${agent.referralCode}`, REFERRAL_CACHE_TTL, String(agent.id));
      await redis.setex(`ref:uid:${userId}`, REFERRAL_CACHE_TTL, agent.referralCode);
    }
    return agent.referralCode;
  }

  // 从 Redis 读取已有记录
  const existingCode = await redis.get(`ref:uid:${userId}`);
  if (existingCode) {
    // 回写到数据库
    await db.update(agents).set({ referralCode: existingCode }).where(eq(agents.id, agent.id));
    return existingCode;
  }

  // 生成新推荐码（排除易混淆字符 O0Il）
  let code: string;
  do {
    code = nanoid(REFERRAL_CODE_LENGTH).replace(/[0OIl]/g, () => nanoid(1));
  } while (await db.select({ id: agents.id }).from(agents).where(eq(agents.referralCode, code)).limit(1));

  // 写入数据库（持久化）
  await db.update(agents).set({ referralCode: code }).where(eq(agents.id, agent.id));
  // 写入 Redis（快速查询缓存）
  await redis.setex(`ref:link:${code}`, REFERRAL_CACHE_TTL, String(agent.id));
  await redis.setex(`ref:uid:${userId}`, REFERRAL_CACHE_TTL, code);

  return code;
}

/**
 * 管理员设置或更新代理商推荐码
 */
export async function setAgentReferralCode(
  agentId: number,
  code: string,
  operatorId: number,
): Promise<void> {
  if (!REFERRAL_CODE_REGEX.test(code)) {
    throw new AppError("INVALID_REFERRAL_CODE", "推荐码格式无效（4-16位字母数字）", 400);
  }

  const db = getDb();
  const redis = getRedis();

  // 检查唯一性
  const [existing] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.referralCode, code))
    .limit(1);
  if (existing && existing.id !== agentId) {
    throw new AppError("REFERRAL_CODE_DUPLICATE", "推荐码已被其他代理商使用", 409);
  }

  // 更新数据库
  await db.update(agents).set({ referralCode: code }).where(eq(agents.id, agentId));
  // 更新 Redis 缓存
  const oldCode = await redis.get(`ref:uid:${agentId}`);
  if (oldCode) await redis.del(`ref:link:${oldCode}`);
  await redis.setex(`ref:link:${code}`, REFERRAL_CACHE_TTL, String(agentId));
  await redis.setex(`ref:uid:${agentId}`, REFERRAL_CACHE_TTL, code);
}

/**
 * 通过推荐码查询代理商 ID
 */
export async function resolveReferralCode(code: string): Promise<number | null> {
  const redis = getRedis();
  const db = getDb();

  // 先查 Redis 缓存
  const cached = await redis.get(`ref:link:${code}`);
  if (cached) return parseInt(cached, 10);

  // Redis 未命中，查数据库
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.referralCode, code))
    .limit(1);
  if (!agent) return null;

  // 回写 Redis
  await redis.setex(`ref:link:${code}`, REFERRAL_CACHE_TTL, String(agent.id));
  return agent.id;
}

/**
 * 获取所有推荐码统计（管理后台用）
 */
export async function getAllReferralCodes(): Promise<Array<{
  agentId: number;
  userId: number;
  referralCode: string | null;
}>> {
  const db = getDb();
  const rows = await db
    .select({
      agentId: agents.id,
      userId: agents.userId,
      referralCode: agents.referralCode,
    })
    .from(agents)
    .where(eq(agents.status, true));
  return rows;
}
