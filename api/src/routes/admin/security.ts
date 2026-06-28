// ============================================================
//  3cloud (3C) — 安全风控管理路由（管理员）
//  GET    /api/v1/admin/security/config          — 安全配置列表
//  GET    /api/v1/admin/security/config/:key     — 单条配置
//  PATCH  /api/v1/admin/security/config/:key     — 更新单条配置
//  GET    /api/v1/admin/security/events          — 安全事件列表
//  POST   /api/v1/admin/security/events/:id/ack  — 确认事件
//  GET    /api/v1/admin/security/circuits        — 熔断状态
//  POST   /api/v1/admin/security/circuits/:vmId/reset — 重置熔断
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { loginSecurityConfigs, auditLogs } from "../../db/schema.js";
import { authenticateJWT, requireRole } from "../../middleware/auth.js";
import { clearSecurityConfigCache, loadSecurityConfig } from "../../services/login-security.js";
import { querySecurityEvents, acknowledgeEvent, getUnacknowledgedHighRiskCount } from "../../services/security-event.js";
import { getAllCircuitStatuses, resetCircuit, getActiveCircuitCount } from "../../services/circuit-breaker.js";
import { AppError } from "../../services/auth-service.js";

export async function adminSecurityRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);
  app.addHook("preHandler", requireRole("super_admin", "admin"));

  // ──────────────────────────────────────────────
  //  安全配置
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/security/config
  app.get("/api/v1/admin/security/config", async (request, reply) => {
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
  app.get("/api/v1/admin/security/config/:key", async (request, reply) => {
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
  app.patch("/api/v1/admin/security/config/:key", async (request, reply) => {
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
  //  安全事件
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/security/events
  app.get("/api/v1/admin/security/events", async (request, reply) => {
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
  app.post("/api/v1/admin/security/events/:id/ack", async (request, reply) => {
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

  // ──────────────────────────────────────────────
  //  熔断管理
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/security/circuits
  app.get("/api/v1/admin/security/circuits", async (request, reply) => {
    const circuits = await getAllCircuitStatuses();

    reply.status(200).send({
      code: 0,
      data: { list: circuits },
      message: "ok",
    });
  });

  // POST /api/v1/admin/security/circuits/:vmId/reset
  app.post("/api/v1/admin/security/circuits/:vmId/reset", async (request, reply) => {
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
}
