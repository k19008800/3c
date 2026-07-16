// ============================================================
//  3cloud (3C) — 安全风控管理路由（管理员）
//  GET    /api/v1/admin/security/dashboard             — 安全总览
//  GET    /api/v1/admin/security/config                — 安全配置列表
//  GET    /api/v1/admin/security/config/:key           — 单条配置
//  PATCH  /api/v1/admin/security/config/:key           — 更新单条配置
//  GET    /api/v1/admin/security/events                — 安全事件列表
//  POST   /api/v1/admin/security/events/:id/ack        — 确认事件
//  POST   /api/v1/admin/security/events/batch-ack      — 批量确认事件
//  GET    /api/v1/admin/security/bans                  — 封禁列表
//  POST   /api/v1/admin/security/bans/ip               — 封禁 IP
//  POST   /api/v1/admin/security/bans/user             — 封禁用户
//  POST   /api/v1/admin/security/unban/ip              — 解封 IP
//  POST   /api/v1/admin/security/unban/user            — 解封用户
//  GET    /api/v1/admin/security/circuits              — 熔断状态
//  POST   /api/v1/admin/security/circuits/:vmId/reset  — 重置熔断
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, sql, inArray, and, gte, desc } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { loginSecurityConfigs, auditLogs, securityEvents, users, securityAutoRules } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { clearSecurityConfigCache, clearIpBan, clearUserBan } from "../../services/login-security.js";
import { querySecurityEvents, acknowledgeEvent, getUnacknowledgedHighRiskCount, recordSecurityEvent } from "../../services/security-event.js";
import { getAllCircuitStatuses, resetCircuit, getActiveCircuitCount } from "../../services/circuit-breaker.js";

import { getRedis } from "../../redis.js";

export async function adminSecurityRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  安全配置
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/security/config
  app.get("/api/v1/admin/security/config", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(loginSecurityConfigs)
      .orderBy(loginSecurityConfigs.key);

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          key: r.key,
          value: r.value,
          description: r.description,
          updatedAt: r.updatedAt?.toISOString() ?? null,
        })),
      },
      message: "ok",
    });
  });

  // GET /api/v1/admin/security/config/:key
  app.get("/api/v1/admin/security/config/:key", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { key } = request.params as { key: string };
    const [row] = await db
      .select()
      .from(loginSecurityConfigs)
      .where(eq(loginSecurityConfigs.key, key))
      .limit(1);

    if (!row) {
      reply.status(404).send({ code: 404, data: null, message: "配置不存在" });
      return;
    }

    reply.status(200).send({
      code: 0,
      data: {
        key: row.key,
        value: row.value,
        description: row.description,
        updatedAt: row.updatedAt?.toISOString() ?? null,
      },
      message: "ok",
    });
  });

  // PATCH /api/v1/admin/security/config/:key
  app.patch("/api/v1/admin/security/config/:key", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const db = getDb();
    const { key } = request.params as { key: string };
    const operatorId = request.user!.userId;
    const { value } = request.body as { value: any };

    if (value === undefined || value === null) {
      reply.status(400).send({ code: 400, data: null, message: "缺少 value" });
      return;
    }

    const [existing] = await db
      .select()
      .from(loginSecurityConfigs)
      .where(eq(loginSecurityConfigs.key, key))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: `配置 "${key}" 不存在` });
      return;
    }

    const valueJson = JSON.stringify(value);

    await db.transaction(async (tx) => {
      await tx
        .update(loginSecurityConfigs)
        .set({ value: JSON.parse(JSON.stringify(value)), updatedAt: new Date() })
        .where(eq(loginSecurityConfigs.key, key));

      // 审计日志
      await tx.insert(auditLogs).values({
        operatorId,
        action: "config_update" as any,
        targetType: "security_config",
        targetId: existing.id,
        before: { value: existing.value },
        after: { value: valueJson },
        ip: request.ip,
        description: `更新安全配置 ${key}`,
      });
    });

    // 清除缓存
    clearSecurityConfigCache();

    reply.status(200).send({
      code: 0,
      data: null,
      message: "安全配置已更新",
    });
  });

  // ──────────────────────────────────────────────
  //  安全配置变更历史
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/security/config/history
  app.get("/api/v1/admin/security/config/history", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10)));
    const offset = (page - 1) * pageSize;

    const where = and(
      eq(auditLogs.targetType, "security_config"),
      query.key ? eq(sql`"audit_logs"."description"`, sql`'更新安全配置 ${query.key}'`) : sql`1=1`,
    );

    const [totalRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(eq(auditLogs.targetType, "security_config"));

    const total = Number(totalRes?.count ?? 0);

    const rows = await db
      .select({
        id: auditLogs.id,
        operatorId: auditLogs.operatorId,
        description: auditLogs.description,
        before: auditLogs.before,
        after: auditLogs.after,
        ip: auditLogs.ip,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(eq(auditLogs.targetType, "security_config"))
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          id: r.id,
          operatorId: r.operatorId,
          description: r.description,
          before: r.before,
          after: r.after,
          ip: r.ip,
          createdAt: r.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  安全总览看板
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/security/dashboard
  app.get("/api/v1/admin/security/dashboard", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const redis = getRedis();

    // 并行获取所有统计数据
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
      (async () => (await redis.keys("risk:ban:ip:*")).length)(),
      (async () => (await redis.keys("risk:ban:user:*")).length)(),
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

    // 按风险等级分布
    const riskDistribution = await db
      .select({
        riskLevel: securityEvents.riskLevel,
        count: sql<number>`count(*)`,
      })
      .from(securityEvents)
      .where(gte(securityEvents.createdAt, sql`CURRENT_DATE - INTERVAL '7 days'`))
      .groupBy(securityEvents.riskLevel)
      .orderBy(securityEvents.riskLevel);

    // 按事件类型分布
    const typeDistribution = await db
      .select({
        eventType: securityEvents.eventType,
        count: sql<number>`count(*)`,
      })
      .from(securityEvents)
      .where(gte(securityEvents.createdAt, sql`CURRENT_DATE - INTERVAL '7 days'`))
      .groupBy(securityEvents.eventType)
      .orderBy(desc(sql`count(*)`));

    // 近 7 天趋势
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
  //  安全事件
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/security/events
  app.get("/api/v1/admin/security/events", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const result = await querySecurityEvents({
      page: parseInt(query.page ?? "1", 10),
      pageSize: parseInt(query.pageSize ?? "20", 10),
      eventType: query.eventType,
      riskLevel: query.riskLevel,
      acknowledged: query.acknowledged !== undefined ? query.acknowledged === "true" : undefined,
      userId: query.userId ? parseInt(query.userId, 10) : undefined,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    reply.status(200).send({
      code: 0,
      data: result,
      message: "ok",
    });
  });

  // POST /api/v1/admin/security/events/:id/ack
  app.post("/api/v1/admin/security/events/:id/ack", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const eventId = parseInt(id, 10);
    const operatorId = request.user!.userId;

    const success = await acknowledgeEvent(eventId, operatorId);
    if (!success) {
      reply.status(404).send({ code: 404, data: null, message: "事件不存在" });
      return;
    }

    reply.status(200).send({
      code: 0,
      data: null,
      message: "事件已确认",
    });
  });

  // POST /api/v1/admin/security/events/batch-ack — 批量确认
  app.post("/api/v1/admin/security/events/batch-ack", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const { ids } = request.body as { ids: number[] };
    const operatorId = request.user!.userId;

    if (!Array.isArray(ids) || ids.length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "ids 不能为空" });
      return;
    }

    if (ids.length > 200) {
      reply.status(400).send({ code: 400, data: null, message: "单次最多确认 200 条" });
      return;
    }

    const db = getDb();
    const now = new Date();
    const updated = await db
      .update(securityEvents)
      .set({
        acknowledged: true,
        acknowledgedBy: operatorId,
        acknowledgedAt: now,
      })
      .where(and(inArray(securityEvents.id, ids), eq(securityEvents.acknowledged, false)))
      .returning({ id: securityEvents.id });

    reply.status(200).send({
      code: 0,
      data: { count: updated.length },
      message: `已确认 ${updated.length} 条事件`,
    });
  });

  // ──────────────────────────────────────────────
  //  熔断管理
  // ──────────────────────────────────────────────

  // ──────────────────────────────────────────────
  //  封禁管理
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/security/bans — 当前封禁列表
  app.get("/api/v1/admin/security/bans", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();
    const db = getDb();

    const [ipKeys, userKeys] = await Promise.all([
      redis.keys("risk:ban:ip:*"),
      redis.keys("risk:ban:user:*"),
    ]);

    // IP 封禁详情
    const ipBans: Array<{
      ip: string;
      banStart: number;
      remainingMs: number;
    }> = [];
    for (const key of ipKeys) {
      const ip = key.replace("risk:ban:ip:", "");
      const raw = await redis.get(key);
      if (raw) {
        const banStart = parseInt(raw, 10);
        const ttl = await redis.ttl(key);
        ipBans.push({ ip, banStart, remainingMs: Math.max(0, ttl * 1000) });
      }
    }

    // 用户封禁详情
    const userBans: Array<{
      userId: number;
      email: string | null;
      nickname: string | null;
      banStart: number;
      banDurationMs: number;
      remainingMs: number;
    }> = [];
    for (const key of userKeys) {
      const uidStr = key.replace("risk:ban:user:", "");
      const userId = parseInt(uidStr, 10);
      const raw = await redis.get(key);
      if (raw) {
        const parts = raw.split(":");
        const banStart = parseInt(parts[0], 10);
        const banDurationMs = parseInt(parts[1], 10) || 15 * 60 * 1000;
        const ttl = await redis.ttl(key);
        const remainingMs = Math.max(0, ttl * 1000);

        // 查用户信息
        const [user] = await db
          .select({ email: users.email, nickname: users.nickname })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        userBans.push({
          userId,
          email: user?.email ?? null,
          nickname: user?.nickname ?? null,
          banStart,
          banDurationMs,
          remainingMs,
        });
      }
    }

    // 按剩余时间排序（即将解封的在前）
    ipBans.sort((a, b) => a.remainingMs - b.remainingMs);
    userBans.sort((a, b) => a.remainingMs - b.remainingMs);

    reply.status(200).send({
      code: 0,
      data: { ipBans, userBans },
      message: "ok",
    });
  });

  // POST /api/v1/admin/security/bans/ip — 手动封禁 IP
  app.post("/api/v1/admin/security/bans/ip", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const db = getDb();
    const { ip, durationMinutes } = request.body as { ip: string; durationMinutes?: number };

    if (!ip) {
      reply.status(400).send({ code: 400, data: null, message: "缺少 IP" });
      return;
    }

    const redis = getRedis();
    const minutes = Math.max(1, Math.min(1440, durationMinutes ?? 60)); // 1分钟~24小时
    await redis.setex(`risk:ban:ip:${ip}`, minutes * 60, String(Date.now()));

    // 记录安全事件
    await recordSecurityEvent({
      userId: null,
      eventType: "ip_banned",
      riskLevel: "high",
      ip,
      detail: { operatorId: request.user!.userId, durationMinutes, source: "manual" },
    });

    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "config_update" as any,
      targetType: "risk_control",
      targetId: 0,
      ip: request.ip,
      description: `手动封禁 IP: ${ip} (${minutes}分钟)`,
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: `IP ${ip} 已被封禁 ${minutes} 分钟`,
    });
  });

  // POST /api/v1/admin/security/bans/user — 手动封禁用户
  app.post("/api/v1/admin/security/bans/user", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const db = getDb();
    const { userId, durationMinutes, reason } = request.body as {
      userId: number;
      durationMinutes?: number;
      reason?: string;
    };

    if (!userId) {
      reply.status(400).send({ code: 400, data: null, message: "缺少 userId" });
      return;
    }

    const redis = getRedis();
    const minutes = Math.max(1, Math.min(43200, durationMinutes ?? 1440)); // 1分钟~30天
    const banDurationMs = minutes * 60 * 1000;
    await redis.setex(
      `risk:ban:user:${userId}`,
      minutes * 60,
      `${Date.now()}:${banDurationMs}`,
    );

    // 记录安全事件
    await recordSecurityEvent({
      userId,
      eventType: "user_banned",
      riskLevel: "critical",
      detail: { operatorId: request.user!.userId, durationMinutes, reason, source: "manual" },
    });

    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "config_update" as any,
      targetType: "risk_control",
      targetId: userId,
      ip: request.ip,
      description: `手动封禁用户 userId=${userId} (${minutes}分钟): ${reason ?? ""}`,
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: `用户 ${userId} 已被封禁 ${minutes} 分钟`,
    });
  });

  // ──────────────────────────────────────────────
  //  IP/用户解封
  // ──────────────────────────────────────────────

  // POST /api/v1/admin/security/unban/ip — 解封 IP
  app.post("/api/v1/admin/security/unban/ip", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const db = getDb();
    const { ip } = request.body as { ip: string };

    if (!ip) {
      reply.status(400).send({ code: 400, data: null, message: "缺少 IP" });
      return;
    }

    await clearIpBan(ip);

    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "config_update" as any,
      targetType: "risk_control",
      targetId: 0,
      ip: request.ip,
      description: `手动解封 IP: ${ip}`,
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "IP 已解封",
    });
  });

  // POST /api/v1/admin/security/unban/user — 解封用户
  app.post("/api/v1/admin/security/unban/user", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const db = getDb();
    const { userId } = request.body as { userId: number };

    if (!userId) {
      reply.status(400).send({ code: 400, data: null, message: "缺少 userId" });
      return;
    }

    await clearUserBan(userId);

    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "config_update" as any,
      targetType: "risk_control",
      targetId: userId,
      ip: request.ip,
      description: `手动解封用户: userId=${userId}`,
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "用户已解封",
    });
  });

  // GET /api/v1/admin/security/circuits
  app.get("/api/v1/admin/security/circuits", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
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

    // 审计日志
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

  // ════════════════════════════════════════════════════════════
  //  自动处置规则 (Auto-Rules) CRUD
  // ════════════════════════════════════════════════════════════

  // GET /api/v1/admin/security/auto-rules — 规则列表
  app.get("/api/v1/admin/security/auto-rules", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as { enabled?: string; eventType?: string };

    const conditions: any[] = [sql`1=1`];
    if (query.enabled !== undefined) {
      conditions.push(eq(securityAutoRules.enabled, query.enabled === "true"));
    }
    if (query.eventType) {
      conditions.push(eq(securityAutoRules.eventType, query.eventType as any));
    }

    const rows = await db
      .select()
      .from(securityAutoRules)
      .where(and(...conditions))
      .orderBy(desc(securityAutoRules.createdAt));

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          eventType: r.eventType,
          countThreshold: r.countThreshold,
          timeWindowSeconds: r.timeWindowSeconds,
          action: r.action,
          actionParams: r.actionParams,
          enabled: r.enabled,
          createdBy: r.createdBy,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      },
      message: "ok",
    });
  });

  // POST /api/v1/admin/security/auto-rules — 创建规则
  app.post("/api/v1/admin/security/auto-rules", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const db = getDb();
    const body = request.body as {
      name: string;
      description?: string;
      eventType: string;
      countThreshold?: number;
      timeWindowSeconds?: number;
      action: string;
      actionParams?: Record<string, any>;
    };

    if (!body.name || !body.eventType || !body.action) {
      reply.status(400).send({ code: 400, data: null, message: "缺少必填字段：name, eventType, action" });
      return;
    }

    const validActions = ["ban_ip", "ban_user", "notify_admin", "limit_login"];
    if (!validActions.includes(body.action)) {
      reply.status(400).send({ code: 400, data: null, message: `action 必须为: ${validActions.join(", ")}` });
      return;
    }

    const [rule] = await db
      .insert(securityAutoRules)
      .values({
        name: body.name,
        description: body.description || null,
        eventType: body.eventType as any,
        countThreshold: body.countThreshold ?? 5,
        timeWindowSeconds: body.timeWindowSeconds ?? 300,
        action: body.action,
        actionParams: body.actionParams || {},
        enabled: true,
        createdBy: request.user!.userId,
        updatedBy: request.user!.userId,
      })
      .returning();

    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "config_update" as any,
      targetType: "security_auto_rule",
      targetId: rule.id,
      ip: request.ip,
      description: `创建安全自动处置规则: ${body.name} (${body.eventType})`,
    });

    reply.status(200).send({
      code: 0,
      data: rule,
      message: "自动处置规则已创建",
    });
  });

  // PUT /api/v1/admin/security/auto-rules/:id — 修改规则
  app.put("/api/v1/admin/security/auto-rules/:id", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const ruleId = parseInt(id, 10);

    if (isNaN(ruleId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的规则 ID" });
      return;
    }

    const [existing] = await db
      .select()
      .from(securityAutoRules)
      .where(eq(securityAutoRules.id, ruleId))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: "规则不存在" });
      return;
    }

    const body = request.body as Partial<{
      name: string;
      description: string;
      eventType: string;
      countThreshold: number;
      timeWindowSeconds: number;
      action: string;
      actionParams: Record<string, any>;
      enabled: boolean;
    }>;

    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.eventType !== undefined) updateData.eventType = body.eventType;
    if (body.countThreshold !== undefined) updateData.countThreshold = body.countThreshold;
    if (body.timeWindowSeconds !== undefined) updateData.timeWindowSeconds = body.timeWindowSeconds;
    if (body.action !== undefined) {
      const validActions = ["ban_ip", "ban_user", "notify_admin", "limit_login"];
      if (!validActions.includes(body.action)) {
        reply.status(400).send({ code: 400, data: null, message: `action 必须为: ${validActions.join(", ")}` });
        return;
      }
      updateData.action = body.action;
    }
    if (body.actionParams !== undefined) updateData.actionParams = body.actionParams;
    if (body.enabled !== undefined) updateData.enabled = body.enabled;
    updateData.updatedBy = request.user!.userId;
    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(securityAutoRules)
      .set(updateData)
      .where(eq(securityAutoRules.id, ruleId))
      .returning();

    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "config_update" as any,
      targetType: "security_auto_rule",
      targetId: ruleId,
      ip: request.ip,
      description: `更新安全自动处置规则 #${ruleId}: ${existing.name}`,
    });

    reply.status(200).send({
      code: 0,
      data: updated,
      message: "规则已更新",
    });
  });

  // DELETE /api/v1/admin/security/auto-rules/:id — 删除规则
  app.delete("/api/v1/admin/security/auto-rules/:id", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const ruleId = parseInt(id, 10);

    if (isNaN(ruleId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的规则 ID" });
      return;
    }

    const [existing] = await db
      .select()
      .from(securityAutoRules)
      .where(eq(securityAutoRules.id, ruleId))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: "规则不存在" });
      return;
    }

    await db
      .delete(securityAutoRules)
      .where(eq(securityAutoRules.id, ruleId));

    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "config_update" as any,
      targetType: "security_auto_rule",
      targetId: ruleId,
      ip: request.ip,
      description: `删除安全自动处置规则 #${ruleId}: ${existing.name}`,
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "规则已删除",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/security/test-alert — 发送测试告警
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/security/test-alert", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    try {
      const operatorId = request.user!.userId;

      // 记录一条测试安全事件
      await recordSecurityEvent({
        eventType: "test_alert",
        riskLevel: "low",
        userId: request.user!.userId,
        detail: { operatorId, message: "管理员手动触发测试告警" },
      });

      reply.status(200).send({
        code: 0,
        data: { ok: true, message: "测试告警已发送" },
        message: "ok",
      });
    } catch (err) {
      reply.status(500).send({
        code: 0,
        data: { ok: false, message: "测试告警发送失败" },
        message: "error",
      });
    }
  });
}
