// ============================================================
//  3cloud (3C) — AI 风控模型管理路由
//  策略配置、手动检测、风险事件查询
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, gte, and, sql, like, or } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { auditLogs, securityEvents, users } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { detectRisk } from "../../services/risk-control/ai-detector.js";
import { querySecurityEvents, acknowledgeEvent } from "../../services/security-event.js";
import { getRedis } from "../../redis.js";

// ── 风控策略类型 ──
interface RiskStrategy {
  key: string;
  name: string;
  enabled: boolean;
  weight: number;       // 权重 0-100
  threshold: number;    // 触发阈值
  description: string;
}

// ── 默认策略配置 ──
const DEFAULT_STRATEGIES: RiskStrategy[] = [
  { key: "sensitive_word", name: "敏感词检测", enabled: true, weight: 40, threshold: 25, description: "检测操作内容中的敏感关键词" },
  { key: "repeat_operation", name: "重复操作检测", enabled: true, weight: 35, threshold: 3, description: "短时间内相同操作重复提交检测" },
  { key: "abnormal_ip", name: "异常 IP 检测", enabled: true, weight: 20, threshold: 1, description: "检测不在常用 IP 列表中的访问" },
  { key: "batch_operation", name: "批量操作检测", enabled: true, weight: 40, threshold: 10, description: "短期内大量操作检测" },
];

export async function adminRiskControlRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  AI 风控检测入口
  // ──────────────────────────────────────────────

  // POST /api/v1/admin/risk-control/detect
  // 手动触发风控检测
  app.post("/api/v1/admin/risk-control/detect", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const { text, userId, action, ip } = request.body as any;

    if (!text) {
      return reply.status(400).send({ code: 400, message: "检测内容不能为空" });
    }

    const result = await detectRisk(text, {
      userId: userId || 0,
      action: action || "manual_check",
      ip: ip || request.ip,
    });

    reply.status(200).send({
      code: 0,
      data: result,
      message: "检测完成",
    });
  });

  // ──────────────────────────────────────────────
  //  风控策略管理
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/risk-control/strategies
  app.get("/api/v1/admin/risk-control/strategies", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const redis = getRedis();
    let strategies: RiskStrategy[];

    try {
      const cached = await redis.get("risk:control:strategies");
      if (cached) {
        strategies = JSON.parse(cached);
      } else {
        strategies = DEFAULT_STRATEGIES;
        await redis.setex("risk:control:strategies", 86400, JSON.stringify(strategies));
      }
    } catch {
      strategies = DEFAULT_STRATEGIES;
    }

    reply.status(200).send({
      code: 0,
      data: { list: strategies },
      message: "ok",
    });
  });

  // PUT /api/v1/admin/risk-control/strategies
  app.put("/api/v1/admin/risk-control/strategies", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const { strategies } = request.body as { strategies: RiskStrategy[] };
    
    if (!Array.isArray(strategies)) {
      return reply.status(400).send({ code: 400, message: "无效的策略数据" });
    }

    const redis = getRedis();
    await redis.setex("risk:control:strategies", 86400, JSON.stringify(strategies));

    const db = getDb();
    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "config_update" as any,
      targetType: "risk_control",
      ip: request.ip,
      description: "更新 AI 风控策略配置",
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "风控策略已更新",
    });
  });

  // ──────────────────────────────────────────────
  //  风控风险事件查询
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/risk-control/events
  app.get("/api/v1/admin/risk-control/events", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const query = request.query as any;
    const page = parseInt(query.page || "1", 10);
    const pageSize = parseInt(query.pageSize || "20", 10);
    const riskLevel = query.riskLevel || "";
    const acknowledged = query.acknowledged;

    const db = getDb();
    const conditions = [];

    if (riskLevel && riskLevel !== "all") {
      conditions.push(eq(securityEvents.riskLevel, riskLevel));
    }
    if (acknowledged === "false") {
      conditions.push(eq(securityEvents.acknowledged, false));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [list, total] = await Promise.all([
      db
        .select({
          id: securityEvents.id,
          eventType: securityEvents.eventType,
          riskLevel: securityEvents.riskLevel,
          description: securityEvents.description,
          ip: securityEvents.ip,
          userId: securityEvents.userId,
          acknowledged: securityEvents.acknowledged,
          acknowledgedBy: securityEvents.acknowledgedBy,
          createdAt: securityEvents.createdAt,
        })
        .from(securityEvents)
        .where(where)
        .orderBy(desc(securityEvents.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ count: sql<number>`count(*)` })
        .from(securityEvents)
        .where(where),
    ]);

    reply.status(200).send({
      code: 0,
      data: {
        list,
        total: Number(total[0]?.count ?? 0),
        page,
        pageSize,
      },
      message: "ok",
    });
  });

  // POST /api/v1/admin/risk-control/events/:id/acknowledge
  app.post("/api/v1/admin/risk-control/events/:id/acknowledge", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const eventId = parseInt(id, 10);

    await acknowledgeEvent(eventId, request.user!.userId);

    reply.status(200).send({
      code: 0,
      data: null,
      message: "已确认风险事件",
    });
  });

  // ──────────────────────────────────────────────
  //  风控统计概览
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/risk-control/stats
  app.get("/api/v1/admin/risk-control/stats", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const db = getDb();

    const [totalEvents, criticalCount, highCount, unacknowledgedCount] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(securityEvents)
        .where(gte(securityEvents.createdAt, sql`CURRENT_DATE - INTERVAL '30 days'`)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(securityEvents)
        .where(and(
          gte(securityEvents.createdAt, sql`CURRENT_DATE - INTERVAL '30 days'`),
          eq(securityEvents.riskLevel, "critical" as any),
        )),
      db
        .select({ count: sql<number>`count(*)` })
        .from(securityEvents)
        .where(and(
          gte(securityEvents.createdAt, sql`CURRENT_DATE - INTERVAL '30 days'`),
          eq(securityEvents.riskLevel, "high" as any),
        )),
      db
        .select({ count: sql<number>`count(*)` })
        .from(securityEvents)
        .where(and(
          gte(securityEvents.createdAt, sql`CURRENT_DATE - INTERVAL '30 days'`),
          eq(securityEvents.acknowledged, false),
          or(
            eq(securityEvents.riskLevel, "critical" as any),
            eq(securityEvents.riskLevel, "high" as any),
          ),
        )),
    ]);

    reply.status(200).send({
      code: 0,
      data: {
        totalEvents: Number(totalEvents[0]?.count ?? 0),
        criticalCount: Number(criticalCount[0]?.count ?? 0),
        highCount: Number(highCount[0]?.count ?? 0),
        unacknowledgedCount: Number(unacknowledgedCount[0]?.count ?? 0),
      },
      message: "ok",
    });
  });
}
