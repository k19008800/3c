// ============================================================
//  3cloud (3C) — 安全风控管理路由入口
//  注册所有安全风控子路由
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, sql, desc, gte } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { loginSecurityConfigs, auditLogs, securityEvents, users, securityAutoRules } from "../../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";
import { clearSecurityConfigCache, clearIpBan, clearUserBan } from "../../../services/login-security.js";
import {
  querySecurityEvents,
  acknowledgeEvent,
  getUnacknowledgedHighRiskCount,
  recordSecurityEvent,
} from "../../../services/security-event.js";
import { getAllCircuitStatuses, resetCircuit, getActiveCircuitCount } from "../../../services/circuit-breaker.js";
import { getRedis } from "../../../redis.js";

import { securityConfigRoutes } from "./config.js";
import { securityEventsRoutes } from "./events.js";
import { securityBansRoutes } from "./bans.js";
import { securityRulesRoutes } from "./rules.js";

export async function adminSecurityRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 子模块 ──
  await securityConfigRoutes(app);
  await securityEventsRoutes(app);
  await securityBansRoutes(app);
  await securityRulesRoutes(app);

  // ──────────────────────────────────────────────
  //  安全总览看板
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/security/dashboard
  app.get("/api/v1/admin/security/dashboard", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const db = getDb();
    const redis = getRedis();

    const [
      unacknowledgedHighRisk,
      activeCircuits,
      bannedIps,
      bannedUsers,
      recentEventsRes,
      todayEventCount,
      weekEventCount,
    ] = await Promise.all([
      getUnacknowledgedHighRiskCount(),
      getActiveCircuitCount(),
      // 【优化】使用 SCAN 替代 KEYS
      (async () => {
        let count = 0, cursor = '0';
        do { const [nc, batch] = await redis.scan(cursor, 'MATCH', 'risk:ban:ip:*', 'COUNT', 100); cursor = nc; count += batch.length; } while (cursor !== '0');
        return count;
      })(),
      (async () => {
        let count = 0, cursor = '0';
        do { const [nc, batch] = await redis.scan(cursor, 'MATCH', 'risk:ban:user:*', 'COUNT', 100); cursor = nc; count += batch.length; } while (cursor !== '0');
        return count;
      })(),
      querySecurityEvents({ page: 1, pageSize: 5 }),
      db
        .select({ count: sql<number>`count(*)` })
        .from(securityEvents)
        .where(gte(securityEvents.createdAt, sql`CURRENT_DATE`)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(securityEvents)
        .where(gte(securityEvents.createdAt, sql`CURRENT_DATE - INTERVAL '7 days'`)),
    ]);

    const riskDistribution = await db
      .select({
        riskLevel: securityEvents.riskLevel,
        count: sql<number>`count(*)`,
      })
      .from(securityEvents)
      .where(gte(securityEvents.createdAt, sql`CURRENT_DATE - INTERVAL '7 days'`))
      .groupBy(securityEvents.riskLevel)
      .orderBy(securityEvents.riskLevel);

    const typeDistribution = await db
      .select({
        eventType: securityEvents.eventType,
        count: sql<number>`count(*)`,
      })
      .from(securityEvents)
      .where(gte(securityEvents.createdAt, sql`CURRENT_DATE - INTERVAL '7 days'`))
      .groupBy(securityEvents.eventType)
      .orderBy(desc(sql`count(*)`));

    const trend = await db
      .select({
        date: sql<string>`to_char(created_at, 'MM-DD')`,
        critical: sql<number>`count(*) FILTER (WHERE risk_level = 'critical')`,
        high: sql<number>`count(*) FILTER (WHERE risk_level = 'high')`,
        medium: sql<number>`count(*) FILTER (WHERE risk_level = 'medium')`,
        low: sql<number>`count(*) FILTER (WHERE risk_level = 'low')`,
        total: sql<number>`count(*)`,
      })
      .from(securityEvents)
      .where(gte(securityEvents.createdAt, sql`CURRENT_DATE - INTERVAL '6 days'`))
      .groupBy(sql`to_char(created_at, 'MM-DD')`)
      .orderBy(sql`to_char(created_at, 'MM-DD')`);

    reply.status(200).send({
      code: 0,
      data: {
        stats: {
          unacknowledgedHighRisk,
          activeCircuits,
          bannedIps,
          bannedUsers,
          todayEventCount: Number(todayEventCount[0]?.count ?? 0),
          weekEventCount: Number(weekEventCount[0]?.count ?? 0),
        },
        riskDistribution,
        typeDistribution,
        trend,
        recentEvents: recentEventsRes.list,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  熔断管理
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/security/circuits
  app.get("/api/v1/admin/security/circuits", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const circuits = await getAllCircuitStatuses();

    reply.status(200).send({
      code: 0,
      data: { list: circuits },
      message: "ok",
    });
  });

  // POST /api/v1/admin/security/circuits/:vmId/reset
  app.post("/api/v1/admin/security/circuits/:vmId/reset", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const { vmId } = request.params as { vmId: string };
    const vendorModelId = parseInt(vmId, 10);

    await resetCircuit(vendorModelId);

    const db = getDb();
    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "config_update" as any,
      targetType: "circuit_breaker",
      targetId: vendorModelId,
      ip: request.ip,
      description: `手动重置厂商熔断 (vendorModelId=${vendorModelId})`,
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "熔断已重置",
    });
  });
}
