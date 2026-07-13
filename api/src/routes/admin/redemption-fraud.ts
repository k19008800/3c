// ============================================================
//  3cloud (3C) — Admin 兑换码风控管理
//
//  GET    /api/v1/admin/redemption/fraud-events      — 风控事件列表
//  POST   /api/v1/admin/redemption/fraud/ban-ip      — 封禁 IP
//  POST   /api/v1/admin/redemption/fraud/unban-ip    — 解封 IP
//  GET    /api/v1/admin/redemption/fraud/banned-ips   — 已封禁 IP 列表
//  GET    /api/v1/admin/redemption/fraud/stats         — 风控统计概览
//  PATCH  /api/v1/admin/redemption/fraud/config        — 更新风控配置
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  redemptionFraudEvents,
  auditLogs,
  systemConfigs,
} from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { getRedis } from "../../redis.js";
import { banIp, unbanIp } from "../../services/redemption-fraud.js";
import { AppError } from "../../services/auth-service.js";

export async function adminRedemptionFraudRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ════════════════════════════════════════════════════════════════
  //  1. GET /api/v1/admin/redemption/fraud-events
  //  风控事件列表（分页 + 筛选）
  // ════════════════════════════════════════════════════════════════
  app.get("/api/v1/admin/redemption/fraud-events", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const query = request.query as {
        page?: string;
        pageSize?: string;
        eventType?: string;
        severity?: string;
        acknowledged?: string;
        ip?: string;
        startDate?: string;
        endDate?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
      const offset = (page - 1) * pageSize;

      // ── 构建筛选条件 ──
      const conditions: any[] = [];

      if (query.eventType) {
        conditions.push(eq(redemptionFraudEvents.eventType, query.eventType));
      }
      if (query.severity) {
        conditions.push(eq(redemptionFraudEvents.severity, query.severity));
      }
      if (query.acknowledged === "true") {
        conditions.push(eq(redemptionFraudEvents.acknowledged, true));
      } else if (query.acknowledged === "false") {
        conditions.push(eq(redemptionFraudEvents.acknowledged, false));
      }
      if (query.ip) {
        conditions.push(eq(redemptionFraudEvents.ip, query.ip));
      }
      if (query.startDate) {
        conditions.push(gte(redemptionFraudEvents.createdAt, new Date(query.startDate)));
      }
      if (query.endDate) {
        conditions.push(lte(redemptionFraudEvents.createdAt, new Date(query.endDate)));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // ── 总数 ──
      const [totalResult] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(redemptionFraudEvents)
        .where(whereClause);

      const total = totalResult?.total ?? 0;

      // ── 查询列表 ──
      const rows = await db
        .select()
        .from(redemptionFraudEvents)
        .where(whereClause)
        .orderBy(desc(redemptionFraudEvents.createdAt))
        .limit(pageSize)
        .offset(offset);

      const list = rows.map((r) => ({
        id: r.id,
        eventType: r.eventType,
        ip: r.ip,
        userId: r.userId,
        codeId: r.codeId,
        code: r.code,
        riskScore: r.riskScore,
        detail: r.detail ? JSON.parse(r.detail) : null,
        severity: r.severity,
        acknowledged: r.acknowledged,
        acknowledgedBy: r.acknowledgedBy,
        acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      }));

      reply.status(200).send({
        code: 0,
        data: { list, total, page, pageSize },
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  2. POST /api/v1/admin/redemption/fraud/ban-ip
  //  封禁 IP（调用风控服务 + 记录审计日志）
  // ════════════════════════════════════════════════════════════════
  app.post("/api/v1/admin/redemption/fraud/ban-ip", {
    preHandler: [requirePerm(Perm.SECURITY_EDIT)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const adminUserId = request.user!.userId;

      const body = request.body as { ip: string; reason?: string };
      const { ip, reason } = body;

      if (!ip) {
        reply.status(400).send({ code: 400, data: null, message: "缺少 IP 地址" });
        return;
      }

      // ── 调用风控服务封禁 IP ──
      await banIp(ip, reason ?? "管理员手动封禁", adminUserId);

      // ── 记录审计日志 ──
      await db.insert(auditLogs).values({
        operatorId: adminUserId,
        action: "fraud_ban_ip",
        targetType: "ip",
        after: { ip, reason: reason ?? "管理员手动封禁" },
        ip: request.ip,
        description: `兑换码风控: 封禁 IP ${ip}, 原因: ${reason ?? "管理员手动封禁"}`,
      });

      reply.status(200).send({
        code: 0,
        message: "IP 已封禁",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  3. POST /api/v1/admin/redemption/fraud/unban-ip
  //  解封 IP（调用风控服务 + 记录审计日志）
  // ════════════════════════════════════════════════════════════════
  app.post("/api/v1/admin/redemption/fraud/unban-ip", {
    preHandler: [requirePerm(Perm.SECURITY_EDIT)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const adminUserId = request.user!.userId;

      const body = request.body as { ip: string };
      const { ip } = body;

      if (!ip) {
        reply.status(400).send({ code: 400, data: null, message: "缺少 IP 地址" });
        return;
      }

      // ── 调用风控服务解封 IP ──
      await unbanIp(ip);

      // ── 记录审计日志 ──
      await db.insert(auditLogs).values({
        operatorId: adminUserId,
        action: "fraud_unban_ip",
        targetType: "ip",
        after: { ip },
        ip: request.ip,
        description: `兑换码风控: 解封 IP ${ip}`,
      });

      reply.status(200).send({
        code: 0,
        message: "IP 已解封",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  4. GET /api/v1/admin/redemption/fraud/banned-ips
  //  获取已封禁 IP 列表
  // ════════════════════════════════════════════════════════════════
  app.get("/api/v1/admin/redemption/fraud/banned-ips", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    try {
      const redis = getRedis();
      const bannedIps = await redis.smembers("fraud:banned:ips");

      reply.status(200).send({
        code: 0,
        data: bannedIps,
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  5. GET /api/v1/admin/redemption/fraud/stats
  //  风控统计概览
  // ════════════════════════════════════════════════════════════════
  app.get("/api/v1/admin/redemption/fraud/stats", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const redis = getRedis();

      // ── 今日风控事件数 ──
      const [todayResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(redemptionFraudEvents)
        .where(sql`${redemptionFraudEvents.createdAt} >= CURRENT_DATE`);

      const todayEvents = todayResult?.count ?? 0;

      // ── 按严重级别分组 ──
      const severityRows = await db
        .select({
          severity: redemptionFraudEvents.severity,
          count: sql<number>`count(*)::int`,
        })
        .from(redemptionFraudEvents)
        .where(sql`${redemptionFraudEvents.createdAt} >= CURRENT_DATE`)
        .groupBy(redemptionFraudEvents.severity);

      const bySeverity: Record<string, number> = { warning: 0, high: 0, critical: 0 };
      for (const row of severityRows) {
        bySeverity[row.severity] = row.count;
      }

      // ── 按类型分组 ──
      const typeRows = await db
        .select({
          eventType: redemptionFraudEvents.eventType,
          count: sql<number>`count(*)::int`,
        })
        .from(redemptionFraudEvents)
        .where(sql`${redemptionFraudEvents.createdAt} >= CURRENT_DATE`)
        .groupBy(redemptionFraudEvents.eventType);

      const byType: Record<string, number> = {};
      for (const row of typeRows) {
        byType[row.eventType] = row.count;
      }

      // ── 未处理数 ──
      const [unackResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(redemptionFraudEvents)
        .where(eq(redemptionFraudEvents.acknowledged, false));

      const unacknowledged = unackResult?.count ?? 0;

      // ── 被封禁 IP 数 ──
      const bannedIpCount = await redis.scard("fraud:banned:ips");

      reply.status(200).send({
        code: 0,
        data: {
          todayEvents,
          bySeverity,
          byType,
          unacknowledged,
          bannedIpCount,
        },
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  6. PATCH /api/v1/admin/redemption/fraud/config
  //  更新兑换码风控配置（system_configs 表 upsert）
  // ════════════════════════════════════════════════════════════════
  app.patch("/api/v1/admin/redemption/fraud/config", {
    preHandler: [requirePerm(Perm.SECURITY_EDIT)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const adminUserId = request.user!.userId;

      const body = request.body as {
        bruteForceThreshold?: number;
        bruteForceWindowSeconds?: number;
        blockDurationSeconds?: number;
        userFreqThreshold?: number;
        codeLeakThreshold?: number;
      };

      // ── 配置定义（key, default, 描述）──
      const configDefs: { key: string; value: number | undefined; defaultValue: number; description: string }[] = [
        {
          key: "redemption_fraud_brute_force_threshold",
          value: body.bruteForceThreshold,
          defaultValue: 20,
          description: "暴力破解触发阈值（N 次/窗口）",
        },
        {
          key: "redemption_fraud_brute_force_window_seconds",
          value: body.bruteForceWindowSeconds,
          defaultValue: 600,
          description: "暴力破解窗口期（秒）",
        },
        {
          key: "redemption_fraud_block_duration_seconds",
          value: body.blockDurationSeconds,
          defaultValue: 1800,
          description: "IP 封禁时长（秒）",
        },
        {
          key: "redemption_fraud_user_freq_threshold",
          value: body.userFreqThreshold,
          defaultValue: 10,
          description: "用户频率阈值（次/日）",
        },
        {
          key: "redemption_fraud_code_leak_threshold",
          value: body.codeLeakThreshold,
          defaultValue: 3,
          description: "兑换码泄露阈值（同一码使用次数）",
        },
      ];

      // ── 收集变更值以便返回 ──
      const updatedConfigs: Record<string, string> = {};

      for (const def of configDefs) {
        const newValue = def.value !== undefined ? def.value : def.defaultValue;
        const valueStr = String(newValue);

        // upsert
        const [existing] = await db
          .select({ id: systemConfigs.id })
          .from(systemConfigs)
          .where(eq(systemConfigs.key, def.key))
          .limit(1);

        if (existing) {
          await db
            .update(systemConfigs)
            .set({
              value: valueStr,
              updatedBy: adminUserId,
              updatedAt: new Date(),
            })
            .where(eq(systemConfigs.key, def.key));
        } else {
          await db.insert(systemConfigs).values({
            key: def.key,
            value: valueStr,
            description: def.description,
            updatedBy: adminUserId,
          });
        }

        updatedConfigs[def.key] = valueStr;
      }

      // ── 记录审计日志 ──
      await db.insert(auditLogs).values({
        operatorId: adminUserId,
        action: "fraud_config_update",
        targetType: "system_config",
        after: updatedConfigs,
        ip: request.ip,
        description: `兑换码风控配置更新: ${JSON.stringify(updatedConfigs)}`,
      });

      reply.status(200).send({
        code: 0,
        data: updatedConfigs,
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });
}
