// ============================================================
//  3cloud (3C) — 自动处置规则 CRUD 路由
//  GET    /api/v1/admin/security/auto-rules          — 规则列表
//  POST   /api/v1/admin/security/auto-rules          — 创建规则
//  PUT    /api/v1/admin/security/auto-rules/:id      — 修改规则
//  DELETE /api/v1/admin/security/auto-rules/:id      — 删除规则
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, sql, and, desc } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { securityAutoRules, auditLogs } from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";

const VALID_ACTIONS = ["ban_ip", "ban_user", "notify_admin", "limit_login"];

export async function securityRulesRoutes(app: FastifyInstance) {
  // ── 规则列表 ──
  // GET /api/v1/admin/security/auto-rules
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

  // ── 创建规则 ──
  // POST /api/v1/admin/security/auto-rules
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

    if (!VALID_ACTIONS.includes(body.action)) {
      reply.status(400).send({ code: 400, data: null, message: `action 必须为: ${VALID_ACTIONS.join(", ")}` });
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

  // ── 修改规则 ──
  // PUT /api/v1/admin/security/auto-rules/:id
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
      if (!VALID_ACTIONS.includes(body.action)) {
        reply.status(400).send({ code: 400, data: null, message: `action 必须为: ${VALID_ACTIONS.join(", ")}` });
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

  // ── 删除规则 ──
  // DELETE /api/v1/admin/security/auto-rules/:id
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
}
