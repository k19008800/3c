// ============================================================
//  3cloud (3C) — 兑换码风控引擎
//  防爆破 / IP 封禁 / 用户频率 / 码泄露检测
// ============================================================

import { getDb } from "../db/index.js";
import { getRedis } from "../redis.js";
import { redemptionFraudEvents } from "../db/schema.js";
import { notifyFraudAlert } from "./redemption-notify.js";

// ── Redis Key 定义 ──

const KEY_PREFIX = "fraud";

function bruteForceIpKey(ip: string): string {
  return `${KEY_PREFIX}:brute:ip:${ip}`; // 计数器，TTL 600s
}

function bruteBlockedIpKey(ip: string): string {
  return `${KEY_PREFIX}:brute:blocked:${ip}`; // 标记位，TTL 1800s
}

function userFreqKey(userId: number): string {
  return `${KEY_PREFIX}:user:freq:${userId}`; // 计数器，TTL 3600s
}

function codeAttemptKey(codeId: number): string {
  return `${KEY_PREFIX}:code:attempt:${codeId}`; // Set，TTL 600s
}

const BANNED_IPS_SET = `${KEY_PREFIX}:banned:ips`; // 全局 IP 黑名单 Set

// ── 风险分数权重 ──

const WEIGHT_BRUTE_FORCE = 0.4;
const WEIGHT_USER_FREQ = 0.3;
const WEIGHT_NEW_USER = 0.2;
const WEIGHT_CODE_ATTEMPT = 0.1;

const BRUTE_FORCE_THRESHOLD = 20;   // 超过此值封禁
const BRUTE_FORCE_MAX = 100;        // 归一化上限
const USER_FREQ_WARN = 10;          // 超过此值告警（warning）
const USER_FREQ_MAX = 50;           // 归一化上限
const CODE_LEAK_THRESHOLD = 3;      // 同一码不同 IP 超过此值触发 code_leak
const CODE_ATTEMPT_MAX = 20;        // 归一化上限

// ── 返回类型 ──

export interface RedeemFraudResult {
  blocked: boolean;
  riskScore: number;
  reason?: string;
}

// ── 写入 DB frood event ──

async function insertFraudEvent(params: {
  eventType: string;
  ip?: string;
  userId?: number;
  codeId?: number;
  code?: string;
  riskScore: number;
  detail?: Record<string, any>;
  severity: "warning" | "high" | "critical";
  acknowledged?: boolean;
  acknowledgedBy?: number;
  acknowledgedAt?: Date;
}): Promise<void> {
  const db = getDb();
  await db.insert(redemptionFraudEvents).values({
    eventType: params.eventType,
    ip: params.ip ?? null,
    userId: params.userId ?? null,
    codeId: params.codeId ?? null,
    code: params.code ?? null,
    riskScore: params.riskScore,
    detail: params.detail ? JSON.stringify(params.detail) : null,
    severity: params.severity,
    acknowledged: params.acknowledged ?? false,
    acknowledgedBy: params.acknowledgedBy ?? null,
    acknowledgedAt: params.acknowledgedAt ?? null,
  });

  // critical 级别事件通知管理员
  if (params.severity === "critical") {
    notifyFraudAlert({
      eventType: params.eventType,
      ip: params.ip ?? "",
      severity: params.severity,
      detail: params.detail ? JSON.stringify(params.detail) : "无详情",
    }).catch((err) => {
      console.error("[Fraud] 风控告警通知发送失败:", err);
    });
  }
}

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
//  6. 封禁 IP
// ════════════════════════════════════════════════════════════════

export async function banIp(
  ip: string,
  reason: string,
  adminUserId?: number,
): Promise<void> {
  const redis = getRedis();

  await redis.sadd(BANNED_IPS_SET, ip);
  await redis.setex(bruteBlockedIpKey(ip), 1800, "1");

  await insertFraudEvent({
    eventType: "high_risk_score",
    ip,
    riskScore: 100,
    detail: { reason },
    severity: "critical",
    acknowledged: true,
    acknowledgedBy: adminUserId,
    acknowledgedAt: new Date(),
  });
}

// ════════════════════════════════════════════════════════════════
//  7. 解封 IP
// ════════════════════════════════════════════════════════════════

export async function unbanIp(ip: string): Promise<void> {
  const redis = getRedis();

  await redis.srem(BANNED_IPS_SET, ip);
  await redis.del(bruteBlockedIpKey(ip));
}

// ════════════════════════════════════════════════════════════════
//  8. 检查 IP 是否被封禁
// ════════════════════════════════════════════════════════════════

export async function isIpBanned(ip: string): Promise<boolean> {
  const redis = getRedis();

  const inSet = await redis.sismember(BANNED_IPS_SET, ip);
  if (inSet) return true;

  const blockedTtl = await redis.ttl(bruteBlockedIpKey(ip));
  return blockedTtl > 0;
}

// ════════════════════════════════════════════════════════════════
//  Helper: 判断是否为 24 小时内注册的新用户
// ════════════════════════════════════════════════════════════════

async function checkIsNewUser(userId: number): Promise<boolean> {
  try {
    const db = getDb();
    const { users } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

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
