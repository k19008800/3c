// ============================================================
//  3cloud (3C) — 登录风控服务
//  失败计数 → 渐进惩罚 → IP/账号封禁 → 验证码挑战
//  全部状态存 Redis，不增加数据库写入瓶颈
// ============================================================

import { getRedis } from "../redis.js";
import { getDb } from "../db/index.js";
import { loginSecurityConfigs } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { recordSecurityEvent } from "./security-event.js";
import { sendAccountBannedEmail } from "./email-service.js";

// ── Redis Key 前缀 ──

const KEY = {
  failIp: (ip: string) => `risk:fail:ip:${ip}`,
  banIp: (ip: string) => `risk:ban:ip:${ip}`,
  failUser: (uid: number) => `risk:fail:user:${uid}`,
  banUser: (uid: number) => `risk:ban:user:${uid}`,
  fail24h: (uid: number) => `risk:fail:user:24h:${uid}`,
  captcha: (uid: number) => `risk:challenge:user:${uid}`,
  captchaSession: (s: string) => `risk:challenge:session:${s}`,
};

// ── 配置缓存（60 秒刷新） ──

interface SecurityConfigMap {
  maxIpFailPerMin: number;
  ipBanMinutes: number;
  maxUserFailPerMin: number;
  userCaptchaAfter: number;
  userBanMinutes: number;
  maxUserFail24h: number;
  [key: string]: any;
}

let configCache: { value: SecurityConfigMap; expiresAt: number } | null = null;

export async function loadSecurityConfig(): Promise<SecurityConfigMap> {
  const now = Date.now();
  if (configCache && now < configCache.expiresAt) {
    return configCache.value;
  }

  const db = getDb();
  const rows = await db
    .select({ key: loginSecurityConfigs.key, value: loginSecurityConfigs.value })
    .from(loginSecurityConfigs);

  const cfg: any = {};
  for (const row of rows) {
    try {
      cfg[row.key] = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    } catch {
      cfg[row.key] = row.value;
    }
  }

  configCache = {
    value: {
      maxIpFailPerMin: cfg.max_ip_fail_per_min ?? 5,
      ipBanMinutes: cfg.ip_ban_minutes ?? 5,
      maxUserFailPerMin: cfg.max_user_fail_per_min ?? 5,
      userCaptchaAfter: cfg.user_captcha_after ?? 3,
      userBanMinutes: cfg.user_ban_minutes ?? 15,
      maxUserFail24h: cfg.max_user_fail_24h ?? 10,
    },
    expiresAt: now + 60_000,
  };
  return configCache.value;
}

/** 清除缓存（管理端修改安全配置后调用） */
export function clearSecurityConfigCache() {
  configCache = null;
}

// ── 滑动窗口计数 ──

const WINDOW_SECONDS = 60;

async function countInWindow(key: string): Promise<number> {
  const redis = getRedis();
  const now = Date.now();
  const cutoff = now - WINDOW_SECONDS * 1000;
  await redis.zremrangebyscore(key, 0, cutoff);
  return redis.zcard(key);
}

async function addToWindow(key: string, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  const now = Date.now();
  const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
  await redis
    .multi()
    .zadd(key, now, member)
    .expire(key, ttlSeconds)
    .exec();
}

// ═══════════════════════════════════════════════
//  1. 登录前检查
// ═══════════════════════════════════════════════

export interface PreLoginCheckResult {
  allowed: boolean;
  retryAfterMs?: number;
  requireCaptcha?: boolean;
  captchaSession?: string;
  blockedReason?: string;
}

/**
 * 登录前检查：IP 是否被封禁，账号是否被封禁
 * 在验证密码之前调用
 */
export async function preLoginCheck(
  ip: string,
  userId: number | null, // userId 可能为 null（邮箱不存在时传 null）
  email: string,
): Promise<PreLoginCheckResult> {
  const redis = getRedis();
  const cfg = await loadSecurityConfig();

  // 1. 检查 IP 是否被封禁
  const ipBanKey = KEY.banIp(ip);
  const ipBanRaw = await redis.get(ipBanKey);
  if (ipBanRaw) {
    const banStart = parseInt(ipBanRaw, 10);
    const elapsed = Date.now() - banStart;
    const remaining = Math.max(0, cfg.ipBanMinutes * 60_000 - elapsed);
    return { allowed: false, retryAfterMs: remaining, blockedReason: "IP 已被临时封禁" };
  }

  // 2. 如果 userId 已知，检查账号是否被封禁
  if (userId !== null) {
    const userBanKey = KEY.banUser(userId);
    const userBanRaw = await redis.get(userBanKey);
    if (userBanRaw) {
      const parts = userBanRaw.split(":");
      const banStart = parseInt(parts[0], 10);
      const elapsed = Date.now() - banStart;
      const remaining = Math.max(0, (parseInt(parts[1], 10) || cfg.userBanMinutes * 60_000) - elapsed);
      return {
        allowed: false,
        retryAfterMs: remaining,
        blockedReason: remaining >= 3600_000
          ? `账号已被封禁，剩余 ${Math.ceil(remaining / 3600_000)} 小时`
          : `账号已被临时封禁，剩余 ${Math.ceil(remaining / 60_000)} 分钟`,
      };
    }

    // 3. 检查是否频繁失败触发验证码
    const failCount = await countInWindow(KEY.failUser(userId));
    if (failCount >= cfg.userCaptchaAfter) {
      // 无论是否已有验证码，都生成新验证码（覆盖旧的）
      // 确保前端能收到 captchaSession
      const captchaSession = Math.random().toString(36).slice(2, 10);
      const captchaCode = Math.random().toString().slice(2, 8);
      await redis.setex(KEY.captcha(userId), 300, captchaCode);
      await redis.setex(KEY.captchaSession(captchaSession), 300, `${userId}:${captchaCode}`);

      // 记录安全事件
      await recordSecurityEvent({
        userId,
        eventType: "user_captcha",
        riskLevel: "medium",
        ip,
        detail: { failCount },
      });

      return { allowed: true, requireCaptcha: true, captchaSession };
    }
  }

  return { allowed: true, requireCaptcha: false };
}

// ═══════════════════════════════════════════════
//  2. 登录失败处理
// ═══════════════════════════════════════════════

export async function handleLoginFailure(
  ip: string,
  userId: number | null,
  email: string,
): Promise<void> {
  const cfg = await loadSecurityConfig();
  const redis = getRedis();

  // IP 级递增
  const ipFailKey = KEY.failIp(ip);
  await addToWindow(ipFailKey, 120);
  const ipCount = await countInWindow(ipFailKey);

  // 如果 IP 超过阈值，封禁 IP
  if (ipCount >= cfg.maxIpFailPerMin) {
    await redis.setex(KEY.banIp(ip), cfg.ipBanMinutes * 60, String(Date.now()));
    await recordSecurityEvent({
      userId: null,
      eventType: "ip_banned",
      riskLevel: "high",
      ip,
      detail: { failCount: ipCount, banMinutes: cfg.ipBanMinutes },
    });
  }

  // 如果 userId 已知，账号级递增
  if (userId !== null) {
    const userFailKey = KEY.failUser(userId);
    await addToWindow(userFailKey, 120);
    const userCount = await countInWindow(userFailKey);

    // 24h 累计
    const fail24hKey = KEY.fail24h(userId);
    await addToWindow(fail24hKey, 86400);
    const fail24hCount = await countInWindow(fail24hKey);

    // 超过每分钟阈值 → 临时封禁
    if (userCount >= cfg.maxUserFailPerMin) {
      const banDuration = cfg.userBanMinutes * 60;
      await redis.setex(KEY.banUser(userId), banDuration, `${Date.now()}:${banDuration * 1000}`);

      // 异步发送通知
      recordSecurityEvent({
        userId,
        eventType: "user_banned",
        riskLevel: "high",
        ip,
        detail: { failCount: userCount, banMinutes: cfg.userBanMinutes },
      }).catch(() => {});

      // 获取用户邮箱发通知（异步）
      getUserEmail(userId).then((userEmail) => {
        if (userEmail) {
          sendAccountBannedEmail({
            toEmail: userEmail,
            nickname: null,
            reason: `登录失败次数过多（${userCount}次/分钟）`,
            duration: `${cfg.userBanMinutes} 分钟`,
            unbanAt: new Date(Date.now() + cfg.userBanMinutes * 60_000).toISOString(),
          }).catch(() => {});
        }
      }).catch(() => {});
    }

    // 超过 24h 阈值 → 封禁 24 小时
    if (fail24hCount >= cfg.maxUserFail24h) {
      const banDuration = 86400;
      await redis.setex(KEY.banUser(userId), banDuration, `${Date.now()}:${banDuration * 1000}`);

      recordSecurityEvent({
        userId,
        eventType: "user_banned",
        riskLevel: "critical",
        ip,
        detail: { failCount: fail24hCount, banMinutes: 1440 },
      }).catch(() => {});
    }
  }
}

// ═══════════════════════════════════════════════
//  3. 登录成功处理
// ═══════════════════════════════════════════════

export async function handleLoginSuccess(
  ip: string,
  userId: number,
): Promise<void> {
  const redis = getRedis();

  // 清除失败计数
  await redis.del(KEY.failIp(ip));
  await redis.del(KEY.failUser(userId));
  // 保留 24h 累计计数用于风控，但单一计数器足够

  // 清除验证码标记
  await redis.del(KEY.captcha(userId));
}

// ═══════════════════════════════════════════════
//  4. 验证码校验
// ═══════════════════════════════════════════════

export async function verifyCaptchaSession(
  captchaSession: string,
  captchaCode: string,
): Promise<{ valid: boolean; userId?: number }> {
  const redis = getRedis();
  const stored = await redis.get(KEY.captchaSession(captchaSession));
  if (!stored) return { valid: false };

  const parts = stored.split(":");
  const sessionUserId = parseInt(parts[0], 10);
  const sessionCode = parts[1];

  if (sessionCode !== captchaCode) return { valid: false };

  // 验证通过，清理
  await redis.del(KEY.captchaSession(captchaSession));
  await redis.del(KEY.captcha(sessionUserId));
  return { valid: true, userId: sessionUserId };
}

// ═══════════════════════════════════════════════
//  5. 辅助：检查用户/IP 是否被封禁
// ═══════════════════════════════════════════════

export async function isUserBanned(userId: number): Promise<boolean> {
  const redis = getRedis();
  return (await redis.exists(KEY.banUser(userId))) === 1;
}

export async function isIpBanned(ip: string): Promise<boolean> {
  const redis = getRedis();
  return (await redis.exists(KEY.banIp(ip))) === 1;
}

// ═══════════════════════════════════════════════
//  5b. 手动解封（管理后台调用）
// ═══════════════════════════════════════════════

export async function clearIpBan(ip: string): Promise<void> {
  const redis = getRedis();
  await redis.del(KEY.banIp(ip));
  await redis.del(KEY.failIp(ip));
}

export async function clearUserBan(userId: number): Promise<void> {
  const redis = getRedis();
  await redis.del(KEY.banUser(userId));
  await redis.del(KEY.failUser(userId));
}

// ═══════════════════════════════════════════════
//  6. 辅助：获取用户邮箱
// ═══════════════════════════════════════════════

async function getUserEmail(userId: number): Promise<string | null> {
  try {
    const db = getDb();
    const { users } = await import("../db/schema.js");
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user?.email ?? null;
  } catch {
    return null;
  }
}
