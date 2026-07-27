// ============================================================
//  3cloud (3C) — 安全事件服务 — 记录与查询
// ============================================================

import { getDb } from "../../db/index.js";
import { securityEvents } from "../../db/schema.js";
import { and, eq, gte, lte, desc, or, sql } from "drizzle-orm";

export type SecurityEventType =
  | "brute_force" | "unusual_location" | "new_device" | "ip_banned"
  | "user_banned" | "user_captcha" | "circuit_trip" | "circuit_recovery"
  | "vendor_failure" | "test_alert";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface SecurityEventParams {
  userId: number | null; eventType: SecurityEventType; riskLevel: RiskLevel;
  ip?: string; userAgent?: string; city?: string; country?: string; detail?: Record<string, any>;
}

export async function recordSecurityEvent(params: SecurityEventParams): Promise<number> {
  const db = getDb();
  const [event] = await db.insert(securityEvents).values({
    userId: params.userId, eventType: params.eventType, riskLevel: params.riskLevel,
    ip: params.ip ?? null, userAgent: params.userAgent ?? null, city: params.city ?? null, country: params.country ?? null,
    detail: params.detail ? JSON.parse(JSON.stringify(params.detail)) : null,
  }).returning({ id: securityEvents.id });
  return event?.id ?? 0;
}

export interface SecurityEventQuery {
  page?: number; pageSize?: number; eventType?: string; riskLevel?: string;
  acknowledged?: boolean; userId?: number; startDate?: string; endDate?: string;
}

export async function querySecurityEvents(query: SecurityEventQuery) {
  const db = getDb();
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const conditions: any[] = [sql`1=1`];
  if (query.eventType) conditions.push(eq(securityEvents.eventType, query.eventType as any));
  if (query.riskLevel) conditions.push(eq(securityEvents.riskLevel, query.riskLevel as any));
  if (query.acknowledged !== undefined) conditions.push(eq(securityEvents.acknowledged, query.acknowledged));
  if (query.userId) conditions.push(eq(securityEvents.userId, query.userId));
  if (query.startDate) conditions.push(gte(securityEvents.createdAt, new Date(query.startDate)));
  if (query.endDate) conditions.push(lte(securityEvents.createdAt, new Date(query.endDate)));

  const [totalResult] = await db.select({ count: sql<number>`count(*)` }).from(securityEvents).where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);
  const rows = await db.select().from(securityEvents).where(and(...conditions)).orderBy(desc(securityEvents.createdAt)).limit(pageSize).offset(offset);

  return { list: rows.map(r => ({ id: r.id, userId: r.userId, eventType: r.eventType, riskLevel: r.riskLevel, ip: r.ip, userAgent: r.userAgent, city: r.city, country: r.country, detail: r.detail, acknowledged: r.acknowledged, acknowledgedBy: r.acknowledgedBy, acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() })), total, page, pageSize };
}
