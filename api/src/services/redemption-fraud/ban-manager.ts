// ============================================================
//  3cloud (3C) — 兑换码风控 IP 封禁管理
// ============================================================

import { getRedis } from "../../redis.js";
import { bruteBlockedIpKey, BANNED_IPS_SET } from "./constants.js";
import { insertFraudEvent } from "./events.js";

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
