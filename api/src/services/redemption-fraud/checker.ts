// ============================================================
//  3cloud (3C) — 兑换码风控引擎 检查 & 记录
//  防爆破 / IP 封禁 / 用户频率 / 码泄露检测
// ============================================================

import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { eq } from "drizzle-orm";
import { users } from "../../db/schema.js";
import { insertFraudEvent } from "./events.js";
import {
  bruteForceIpKey, bruteBlockedIpKey, userFreqKey, codeAttemptKey,
  BANNED_IPS_SET, BRUTE_FORCE_THRESHOLD, BRUTE_FORCE_MAX,
  USER_FREQ_WARN, USER_FREQ_MAX, CODE_LEAK_THRESHOLD, CODE_ATTEMPT_MAX,
  WEIGHT_BRUTE_FORCE, WEIGHT_USER_FREQ, WEIGHT_NEW_USER, WEIGHT_CODE_ATTEMPT,
} from "./constants.js";
import type { RedeemFraudResult } from "./types.js";

// ════════════════════════════════════════════════════════════════
//  1. 风控检查（兑换入口）
// ════════════════════════════════════════════════════════════════

export async function checkRedeemFraud(
  input: {
    ip: string;
    userId: number;
    code: string;
    codeRecord: any | null;
  },
): Promise<RedeemFraudResult> {
  const { ip, userId } = input;
  const redis = getRedis();

  // ── 1. 检查 IP 是否在黑名单 ──
  const banned = await redis.sismember(BANNED_IPS_SET, ip);
  if (banned) {
    return { blocked: true, riskScore: 100, reason: "IP 已被加入黑名单" };
  }

  // ── 2. 检查是否在临时封禁期 ──
  const blockedTtl = await redis.ttl(bruteBlockedIpKey(ip));
  if (blockedTtl > 0) {
    return {
      blocked: true,
      riskScore: 90,
      reason: `IP 临时封禁中，剩余 ${blockedTtl} 秒`,
    };
  }

  // ── 3. 计算各维度分数 ──
  const bruteCount = parseInt((await redis.get(bruteForceIpKey(ip))) ?? "0", 10);
  const userFreq = parseInt((await redis.get(userFreqKey(userId))) ?? "0", 10);

  // 查询用户是否为新建（24 小时内注册）
  const isNewUser = await checkIsNewUser(userId);

  const riskScore = calculateRiskScore({
    bruteForceCount: bruteCount,
    userFreqCount: userFreq,
    isNewUser,
    codeAttemptCount: 0, // 无 codeRecord 时设为 0
  });

  return { blocked: false, riskScore };
}

// ════════════════════════════════════════════════════════════════
//  2. 记录爆破尝试（兑换码不存在时调用）
// ════════════════════════════════════════════════════════════════

export async function recordBruteForce(
  ip: string,
  attemptedCode: string,
  codeId?: number,
): Promise<void> {
  const redis = getRedis();
  const key = bruteForceIpKey(ip);

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 600); // 600s TTL
  }

  // 超过阈值 → 写入 DB + 封禁 IP
  if (count >= BRUTE_FORCE_THRESHOLD) {
    const blockedKey = bruteBlockedIpKey(ip);
    await redis.setex(blockedKey, 1800, "1"); // 封禁 30 分钟
    await redis.sadd(BANNED_IPS_SET, ip);     // 加入全局黑名单

    await insertFraudEvent({
      eventType: "brute_force",
      ip,
      code: attemptedCode,
      codeId,
      riskScore: Math.min(100, Math.round((count / BRUTE_FORCE_MAX) * 100)),
      detail: { attemptCount: count, threshold: BRUTE_FORCE_THRESHOLD },
      severity: "critical",
    });
  }
}

// ════════════════════════════════════════════════════════════════
//  3. 记录码泄露（同一码被不同 IP 尝试超过阈值）
// ════════════════════════════════════════════════════════════════

export async function recordCodeLeak(codeId: number, ip: string): Promise<void> {
  const redis = getRedis();
  const key = codeAttemptKey(codeId);

  await redis.sadd(key, ip);
  const ttl = await redis.ttl(key);
  if (ttl === -2) {
    await redis.expire(key, 600); // 600s TTL if not set
  }

  const uniqueIps = await redis.scard(key);
  if (uniqueIps >= CODE_LEAK_THRESHOLD) {
    await insertFraudEvent({
      eventType: "code_leak",
      ip,
      codeId,
      riskScore: Math.min(100, Math.round((uniqueIps / CODE_ATTEMPT_MAX) * 100)),
      detail: { uniqueIpCount: uniqueIps, threshold: CODE_LEAK_THRESHOLD },
      severity: "high",
    });
  }
}

// ════════════════════════════════════════════════════════════════
//  4. 记录用户兑换频率（兑换成功后调用）
// ════════════════════════════════════════════════════════════════

export async function recordUserFrequency(userId: number): Promise<void> {
  const redis = getRedis();
  const key = userFreqKey(userId);

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 3600); // 3600s TTL
  }

  if (count >= USER_FREQ_WARN) {
    await insertFraudEvent({
      eventType: "user_frequency",
      userId,
      riskScore: Math.min(100, Math.round((count / USER_FREQ_MAX) * 100)),
      detail: { frequencyCount: count, threshold: USER_FREQ_WARN },
      severity: "warning",
    });
  }
}

// ════════════════════════════════════════════════════════════════
//  5. 计算风险分数（0-100）
// ════════════════════════════════════════════════════════════════

export function calculateRiskScore(factors: {
  bruteForceCount: number;
  userFreqCount: number;
  isNewUser: boolean;
  codeAttemptCount: number;
}): number {
  const { bruteForceCount, userFreqCount, isNewUser, codeAttemptCount } = factors;

  // 各维度的归一化分数（0-100）
  const bruteScore = Math.min(100, (bruteForceCount / BRUTE_FORCE_MAX) * 100);
  const freqScore = Math.min(100, (userFreqCount / USER_FREQ_MAX) * 100);
  const newUserScore = isNewUser ? 60 : 0; // 新用户基础分 60
  const codeAttemptScore = Math.min(100, (codeAttemptCount / CODE_ATTEMPT_MAX) * 100);

  // 加权汇总
  const total =
    bruteScore * WEIGHT_BRUTE_FORCE +
    freqScore * WEIGHT_USER_FREQ +
    newUserScore * WEIGHT_NEW_USER +
    codeAttemptScore * WEIGHT_CODE_ATTEMPT;

  return Math.round(Math.min(100, Math.max(0, total)));
}

// ════════════════════════════════════════════════════════════════
//  Helper: 判断是否为 24 小时内注册的新用户
// ════════════════════════════════════════════════════════════════

async function checkIsNewUser(userId: number): Promise<boolean> {
  try {
    const db = getDb();
    const [user] = await db
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user?.createdAt) return false;

    const now = new Date();
    const diffMs = now.getTime() - new Date(user.createdAt).getTime();
    return diffMs < 24 * 60 * 60 * 1000; // < 24 hours
  } catch {
    return false;
  }
}
