// ============================================================
//  3cloud (3C) — 安全事件记录服务
//  写 security_events 表 + 高风险事件告警通知
// ============================================================

import { getDb } from "../db/index.js";
import { securityEvents } from "../db/schema.js";
import { and, eq, gte, lte, desc, or, sql } from "drizzle-orm";

// ── 事件类型 ──

export type SecurityEventType =
  | "brute_force"
  | "unusual_location"
  | "new_device"
  | "ip_banned"
  | "user_banned"
  | "user_captcha"
  | "circuit_trip"
  | "circuit_recovery"
  | "vendor_failure"
  | "test_alert";

export type RiskLevel = "low" | "medium" | "high" | "critical";

// ── 参数 ──

export interface SecurityEventParams {
  userId: number | null;
  eventType: SecurityEventType;
  riskLevel: RiskLevel;
  ip?: string;
  userAgent?: string;
  city?: string;
  country?: string;
  detail?: Record<string, any>;
}

// ── 记录安全事件（同步写入，高性能场景可改为队列） ──

export async function recordSecurityEvent(
  params: SecurityEventParams,
): Promise<number> {
  const db = getDb();

  const [event] = await db
    .insert(securityEvents)
    .values({
      userId: params.userId,
      eventType: params.eventType,
      riskLevel: params.riskLevel,
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
      city: params.city ?? null,
      country: params.country ?? null,
      detail: params.detail ? JSON.parse(JSON.stringify(params.detail)) : null,
    })
    .returning({ id: securityEvents.id });

  const eventId = event?.id ?? 0;

  // 高危/严重事件 → 如果有管理员通知配置，发送通知
  // （当前只做记录，通知逻辑后续可扩展）
  if (params.riskLevel === "critical" || params.riskLevel === "high") {
    // 异步通知管理员（未来可接入钉钉/企业微信 webhook）
    console.log(
      `[SecurityEvent] ${params.riskLevel.toUpperCase()} ${params.eventType} ` +
      `userId=${params.userId} ip=${params.ip} detail=${JSON.stringify(params.detail)}`,
    );
  }

  return eventId;
}

// ── 批量获取安全事件（管理端用） ──

export interface SecurityEventQuery {
  page?: number;
  pageSize?: number;
  eventType?: string;
  riskLevel?: string;
  acknowledged?: boolean;
  userId?: number;
  startDate?: string;
  endDate?: string;
}

export async function querySecurityEvents(query: SecurityEventQuery) {
  const db = getDb();

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [sql`1=1`];

  if (query.eventType) {
    conditions.push(eq(securityEvents.eventType, query.eventType as any));
  }
  if (query.riskLevel) {
    conditions.push(eq(securityEvents.riskLevel, query.riskLevel as any));
  }
  if (query.acknowledged !== undefined) {
    conditions.push(eq(securityEvents.acknowledged, query.acknowledged));
  }
  if (query.userId) {
    conditions.push(eq(securityEvents.userId, query.userId));
  }
  if (query.startDate) {
    conditions.push(gte(securityEvents.createdAt, new Date(query.startDate)));
  }
  if (query.endDate) {
    conditions.push(lte(securityEvents.createdAt, new Date(query.endDate)));
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(securityEvents)
    .where(and(...conditions));

  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select()
    .from(securityEvents)
    .where(and(...conditions))
    .orderBy(desc(securityEvents.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      eventType: r.eventType,
      riskLevel: r.riskLevel,
      ip: r.ip,
      userAgent: r.userAgent,
      city: r.city,
      country: r.country,
      detail: r.detail,
      acknowledged: r.acknowledged,
      acknowledgedBy: r.acknowledgedBy,
      acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

// ── 确认安全事件 ──

export async function acknowledgeEvent(eventId: number, operatorId: number): Promise<boolean> {
  const db = getDb();

  const [event] = await db
    .update(securityEvents)
    .set({
      acknowledged: true,
      acknowledgedBy: operatorId,
      acknowledgedAt: new Date(),
    })
    .where(eq(securityEvents.id, eventId))
    .returning({ id: securityEvents.id });

  return !!event;
}

// ── 获取未确认的高危事件数 ──

export async function getUnacknowledgedHighRiskCount(): Promise<number> {
  const db = getDb();

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(securityEvents)
    .where(
      and(
        eq(securityEvents.acknowledged, false),
        or(
          eq(securityEvents.riskLevel, "high"),
          eq(securityEvents.riskLevel, "critical"),
        ),
      ),
    );

  return Number(result?.count ?? 0);
}

// ── 获取当前封禁中的 IP 数 ──

export async function getBannedIpCount(): Promise<number> {
  const redis = (await import("../redis.js")).getRedis();
  // 扫描 risk:ban:ip:* 前缀
  const keys = await redis.keys("risk:ban:ip:*");
  return keys.length;
}

// ── 获取当前封禁中的用户数 ──

export async function getBannedUserCount(): Promise<number> {
  const redis = (await import("../redis.js")).getRedis();
  const keys = await redis.keys("risk:ban:user:*");
  return keys.length;
}

// ── 导出配置读取函数别名 ──

import { loadSecurityConfig } from "./login-security.js";
export const getConfig = loadSecurityConfig;
