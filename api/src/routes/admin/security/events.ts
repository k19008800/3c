// ============================================================
//  3cloud (3C) — 安全事件路由
//  GET   /api/v1/admin/security/events                  — 事件列表
//  POST  /api/v1/admin/security/events/:id/ack          — 确认事件
//  POST  /api/v1/admin/security/events/batch-ack        — 批量确认事件
//  POST  /api/v1/admin/security/test-alert              — 测试告警
// ============================================================

import { FastifyInstance } from "fastify";
import { inArray, and, eq } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { securityEvents } from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import {
  querySecurityEvents,
  acknowledgeEvent,
  recordSecurityEvent,
} from "../../../services/security-event.js";

export async function securityEventsRoutes(app: FastifyInstance) {
  // ── 事件列表 ──
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

  // ── 确认单条 ──
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

  // ── 批量确认 ──
  // POST /api/v1/admin/security/events/batch-ack
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

  // ── 测试告警 ──
  // POST /api/v1/admin/security/test-alert
  app.post("/api/v1/admin/security/test-alert", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    try {
      await recordSecurityEvent({
        eventType: "test_alert",
        riskLevel: "low",
        userId: request.user!.userId,
        detail: { operatorId: request.user!.userId, message: "管理员手动触发测试告警" },
      });

      reply.status(200).send({
        code: 0,
        data: { ok: true, message: "测试告警已发送" },
        message: "ok",
      });
    } catch (_err) {
      reply.status(500).send({
        code: 0,
        data: { ok: false, message: "测试告警发送失败" },
        message: "error",
      });
    }
  });
}
