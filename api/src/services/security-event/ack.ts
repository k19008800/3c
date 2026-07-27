// ============================================================
//  3cloud (3C) — 安全事件服务 — 确认与统计
// ============================================================

import { getDb } from "../../db/index.js";
import { securityEvents } from "../../db/schema.js";
import { and, eq, or, sql } from "drizzle-orm";

export async function acknowledgeEvent(eventId: number, operatorId: number): Promise<boolean> {
  const db = getDb();
  const [event] = await db.update(securityEvents).set({ acknowledged: true, acknowledgedBy: operatorId, acknowledgedAt: new Date() })
    .where(eq(securityEvents.id, eventId)).returning({ id: securityEvents.id });
  return !!event;
}

export async function getUnacknowledgedHighRiskCount(): Promise<number> {
  const db = getDb();
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(securityEvents)
    .where(and(eq(securityEvents.acknowledged, false), or(eq(securityEvents.riskLevel, "high"), eq(securityEvents.riskLevel, "critical"))));
  return Number(result?.count ?? 0);
}

export async function getBannedIpCount(): Promise<number> {
  const redis = (await import("../../redis.js")).getRedis();
  let count = 0, cursor = '0';
  do { const [nc, batch] = await redis.scan(cursor, 'MATCH', 'risk:ban:ip:*', 'COUNT', 100); cursor = nc; count += batch.length; } while (cursor !== '0');
  return count;
}

export async function getBannedUserCount(): Promise<number> {
  const redis = (await import("../../redis.js")).getRedis();
  let count = 0, cursor = '0';
  do { const [nc, batch] = await redis.scan(cursor, 'MATCH', 'risk:ban:user:*', 'COUNT', 100); cursor = nc; count += batch.length; } while (cursor !== '0');
  return count;
}
