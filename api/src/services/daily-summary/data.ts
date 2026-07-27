// ============================================================
//  3cloud (3C) — 每日安全摘要 — 数据查询
// ============================================================

import { getDb } from "../../db/index.js";
import { securityEvents } from "../../db/schema.js";
import { eq, sql, and, gte } from "drizzle-orm";
import { loadSecurityConfig } from "../login-security.js";
import { scanKeys } from "../../utils/redis-scan.js";

export async function getDailySummaryData() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const db = getDb();

  const [totalRes] = await db.select({ count: sql<number>`count(*)` }).from(securityEvents).where(gte(securityEvents.createdAt, since));
  const totalEvents = Number(totalRes?.count ?? 0);

  const riskDistribution = await db.select({ riskLevel: securityEvents.riskLevel, count: sql<number>`count(*)` }).from(securityEvents)
    .where(gte(securityEvents.createdAt, since)).groupBy(securityEvents.riskLevel).orderBy(securityEvents.riskLevel);

  const typeDistribution = await db.select({ eventType: securityEvents.eventType, count: sql<number>`count(*)` }).from(securityEvents)
    .where(gte(securityEvents.createdAt, since)).groupBy(securityEvents.eventType).orderBy(sql`count(*) desc`);

  const recentEvents = await db.select().from(securityEvents)
    .where(and(gte(securityEvents.createdAt, since), eq(securityEvents.acknowledged, false)))
    .orderBy(sql`created_at desc`).limit(10);

  const [ipKeys, userKeys] = await Promise.all([scanKeys("risk:ban:ip:*"), scanKeys("risk:ban:user:*")]);

  const cfg = await loadSecurityConfig();
  const adminEmail = cfg.alert_admin_email as string | undefined;

  return { totalEvents, riskDistribution, typeDistribution, recentEvents, ipCount: ipKeys.length, userCount: userKeys.length, adminEmail, since };
}
