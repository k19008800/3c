// ============================================================
//  3cloud (3C) — 限流系统
//  4 级 × 2 维度 (RPM/TPM) — Redis 滑动窗口
//  级别：API Key → 用户 → 用户类型默认 → 全局兜底
//  维度：RPM（每分钟请求数）/ TPM（每分钟 Token 数）
// ============================================================

import { eq } from "drizzle-orm";
import { getRedis } from "../redis.js";
import { getDb } from "../db/index.js";
import { systemConfigs, users } from "../db/schema.js";

// ── 常量 ──

const WINDOW_SECONDS = 60;          // 滑动窗口大小（1 分钟）
const REDIS_PREFIX = "rl";          // rate-limit

// ── 缓存配置（120 秒刷新） ──

interface RateLimitConfig {
  personalRpm: number;
  personalTpm: number;
  enterpriseRpm: number;
  enterpriseTpm: number;
  globalRpm: number;
  globalTpm: number;
}

let configCache: { value: RateLimitConfig; expiresAt: number } | null = null;

async function loadConfig(): Promise<RateLimitConfig> {
  const now = Date.now();
  if (configCache && now < configCache.expiresAt) {
    return configCache.value;
  }

  const db = getDb();
  const rows = await db
    .select({ key: systemConfigs.key, value: systemConfigs.value })
    .from(systemConfigs)
    .where(
      eq(systemConfigs.key, "rate_limit_personal_rpm") ||
      eq(systemConfigs.key, "rate_limit_personal_tpm") ||
      eq(systemConfigs.key, "rate_limit_enterprise_rpm") ||
      eq(systemConfigs.key, "rate_limit_enterprise_tpm") ||
      eq(systemConfigs.key, "rate_limit_global_rpm") ||
      eq(systemConfigs.key, "rate_limit_global_tpm")
    );

  // 手动过滤 — Drizzle 的 or 条件有问题，改用多条查询
  const cfgMap = new Map<string, string>();
  for (const key of [
    "rate_limit_personal_rpm", "rate_limit_personal_tpm",
    "rate_limit_enterprise_rpm", "rate_limit_enterprise_tpm",
    "rate_limit_global_rpm", "rate_limit_global_tpm",
  ] as const) {
    const [row] = await db
      .select({ value: systemConfigs.value })
      .from(systemConfigs)
      .where(eq(systemConfigs.key, key))
      .limit(1);
    if (row) cfgMap.set(key, row.value);
  }

  const cfg: RateLimitConfig = {
    personalRpm: parseInt(cfgMap.get("rate_limit_personal_rpm") ?? "60"),
    personalTpm: parseInt(cfgMap.get("rate_limit_personal_tpm") ?? "100000"),
    enterpriseRpm: parseInt(cfgMap.get("rate_limit_enterprise_rpm") ?? "300"),
    enterpriseTpm: parseInt(cfgMap.get("rate_limit_enterprise_tpm") ?? "500000"),
    globalRpm: parseInt(cfgMap.get("rate_limit_global_rpm") ?? "30"),
    globalTpm: parseInt(cfgMap.get("rate_limit_global_tpm") ?? "50000"),
  };

  configCache = { value: cfg, expiresAt: now + 120_000 };
  return cfg;
}

/** 清除缓存（后台修改限流配置后调用） */
export function clearRateLimitCache() {
  configCache = null;
}

// ── 生成 Redis Key ──

function rpmKey(level: string, id: string): string {
  return `${REDIS_PREFIX}:rpm:${level}:${id}`;
}

function tpmKey(level: string, id: string): string {
  return `${REDIS_PREFIX}:tpm:${level}:${id}`;
}

// ── 获取当前窗口内计数 ──

async function getCount(redisKey: string): Promise<number> {
  const redis = getRedis();
  const now = Date.now();
  const cutoff = now - WINDOW_SECONDS * 1000;

  // 移除过期条目
  await redis.zremrangebyscore(redisKey, 0, cutoff);

  // 统计当前窗口
  const count = await redis.zcard(redisKey);
  return count;
}

// ── 获取当前窗口内 Token 总和 ──

async function getTokenSum(redisKey: string): Promise<number> {
  const redis = getRedis();
  const now = Date.now();
  const cutoff = now - WINDOW_SECONDS * 1000;

  // 移除过期条目
  await redis.zremrangebyscore(redisKey, 0, cutoff);

  // 聚合分数（tokens 存为 score）
  const sum = await redis.zcard(redisKey);
  // 注: zcard 不能聚合 score 总和，改用 zrange + 手动求和
  const members = await redis.zrange(redisKey, 0, -1, "WITHSCORES");
  let total = 0;
  for (let i = 1; i < members.length; i += 2) {
    total += parseInt(members[i] ?? "0");
  }
  return total;
}

// ── 记录请求到窗口 ──

async function recordRequest(redisKey: string): Promise<void> {
  const redis = getRedis();
  const now = Date.now();
  const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

  await redis
    .multi()
    .zadd(redisKey, now, member)
    .expire(redisKey, WINDOW_SECONDS * 2) // TTL 2 倍窗口
    .exec();
}

// ── 记录 Token 消耗到窗口 ──

async function recordTokens(redisKey: string, tokens: number): Promise<void> {
  const redis = getRedis();
  const now = Date.now();
  const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

  await redis
    .multi()
    .zadd(redisKey, tokens, member) // score = token 数
    .expire(redisKey, WINDOW_SECONDS * 2)
    .exec();
}

// ── 限流检查结果 ──

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number | null;  // 如果需要等待的时间（毫秒）null = 不限流
  level: string;                // 被限流的级别描述
  limit: number;                // 阈值
  current: number;              // 当前值
  dimension: "rpm" | "tpm";    // 限流维度
}

// ── 主入口：检查限流 ──

export async function checkRateLimit(
  userId: number,
  apiKeyId: number | null,
  userType: "personal" | "enterprise",
  rpmOverride: number | null,
  tpmOverride: number | null,
): Promise<RateLimitResult | null> {
  const cfg = await loadConfig();
  const now = Date.now();

  // ── 按级别顺序检查 RPM ──

  // ① API Key 级
  if (apiKeyId !== null) {
    const key = rpmKey("key", String(apiKeyId));
    const count = await getCount(key);
    const limit = 999999; // API Key 级暂不设硬阈值，用用户级兜底
    if (count >= limit) {
      return { allowed: false, retryAfterMs: WINDOW_SECONDS * 1000, level: "API Key", limit, current: count, dimension: "rpm" };
    }
  }

  // ② 用户级（含 override）
  {
    const key = rpmKey("user", String(userId));
    const count = await getCount(key);
    const limit = rpmOverride ?? (
      userType === "enterprise" ? cfg.enterpriseRpm : cfg.personalRpm
    );
    if (count >= limit) {
      return { allowed: false, retryAfterMs: WINDOW_SECONDS * 1000, level: `用户 ${userId}`, limit, current: count, dimension: "rpm" };
    }
  }

  // ③ 全局兜底
  {
    const key = rpmKey("global", "0");
    const count = await getCount(key);
    if (count >= cfg.globalRpm) {
      return { allowed: false, retryAfterMs: WINDOW_SECONDS * 1000, level: "全局", limit: cfg.globalRpm, current: count, dimension: "rpm" };
    }
  }

  // ── 按级别顺序检查 TPM ──

  // ① 用户级 TPM（含 override）
  {
    const key = tpmKey("user", String(userId));
    const sum = await getTokenSum(key);
    const limit = tpmOverride ?? (
      userType === "enterprise" ? cfg.enterpriseTpm : cfg.personalTpm
    );
    if (sum >= limit) {
      return { allowed: false, retryAfterMs: WINDOW_SECONDS * 1000, level: `用户 ${userId}`, limit, current: sum, dimension: "tpm" };
    }
  }

  // ② 全局兜底 TPM
  {
    const key = tpmKey("global", "0");
    const sum = await getTokenSum(key);
    if (sum >= cfg.globalTpm) {
      return { allowed: false, retryAfterMs: WINDOW_SECONDS * 1000, level: "全局", limit: cfg.globalTpm, current: sum, dimension: "tpm" };
    }
  }

  // 通过
  return null;
}

// ── 记录请求（在路由处理开始时调用） ──

export async function recordRequestForLimit(
  userId: number,
  apiKeyId: number | null,
): Promise<void> {
  if (apiKeyId !== null) {
    await recordRequest(rpmKey("key", String(apiKeyId)));
  }
  await recordRequest(rpmKey("user", String(userId)));
  await recordRequest(rpmKey("global", "0"));
}

// ── 记录 Token（在计费后调用） ──

export async function recordTokensForLimit(
  userId: number,
  totalTokens: number,
): Promise<void> {
  await recordTokens(tpmKey("user", String(userId)), totalTokens);
  await recordTokens(tpmKey("global", "0"), totalTokens);
}
