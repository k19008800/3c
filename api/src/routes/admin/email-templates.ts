// ============================================================
//  3cloud (3C) — 邮件模板管理路由（管理员）
//  GET    /api/v1/admin/email-templates             — 列表
//  POST   /api/v1/admin/email-templates             — 创建新模板
//  PUT    /api/v1/admin/email-templates/:name       — 更新模板
//  DELETE /api/v1/admin/email-templates/:name       — 删除模板
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { emailTemplates, auditLogs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

export async function adminEmailTemplateRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 列表 ──
  app.get("/api/v1/admin/email-templates", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (_request, reply) => {
    const db = getDb();
    const rows = await db
      .select({
        id: emailTemplates.id,
        name: emailTemplates.name,
        subjectZh: emailTemplates.subjectZh,
        subjectEn: emailTemplates.subjectEn,
        bodyHtmlZh: emailTemplates.bodyHtmlZh,
        bodyHtmlEn: emailTemplates.bodyHtmlEn,
        updatedAt: emailTemplates.updatedAt,
      })
      .from(emailTemplates)
      .orderBy(emailTemplates.name);

    reply.status(200).send({
      code: 0,
      data: { list: rows },
      message: "ok",
    });
  });

  // ── 创建 ──
  app.post("/api/v1/admin/email-templates", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { name, subjectZh, subjectEn, bodyHtmlZh, bodyHtmlEn } = request.body as {
      name: string;
      subjectZh: string;
      subjectEn?: string;
      bodyHtmlZh: string;
      bodyHtmlEn?: string;
    };

    if (!name?.trim() || !subjectZh?.trim() || !bodyHtmlZh?.trim()) {
      reply.status(400).send({ code: 400, data: null, message: "模板名称、中文主题和中文正文不能为空" });
      return;
    }

    // Check name uniqueness
    const [existing] = await db
      .select({ id: emailTemplates.id })
      .from(emailTemplates)
      .where(eq(emailTemplates.name, name.trim()))
      .limit(1);

    if (existing) {
      reply.status(409).send({ code: 409, data: null, message: `模板名称 "${name}" 已存在` });
      return;
    }

    const operatorId = request.user!.userId;

    const [created] = await db
      .insert(emailTemplates)
      .values({
        name: name.trim(),
        subjectZh: subjectZh.trim(),
        subjectEn: subjectEn?.trim() ?? "",
        bodyHtmlZh: bodyHtmlZh,
        bodyHtmlEn: bodyHtmlEn ?? "",
      })
      .returning();

    await db.insert(auditLogs).values({
      operatorId,
      action: "email_template_create",
      targetType: "email_template",
      targetId: created.id,
      after: { name: created.name, subjectZh: created.subjectZh },
      ip: request.ip,
      description: `创建邮件模板: ${created.name}`,
    });

    reply.status(200).send({ code: 0, data: created, message: "ok" });
  });

  // ── 更新 ──
  app.put("/api/v1/admin/email-templates/:name", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const name = decodeURIComponent((request.params as any).name);

    const body = request.body as Record<string, any>;
    const allowedFields = ["subjectZh", "subjectEn", "bodyHtmlZh", "bodyHtmlEn"] as const;
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }
    if (Object.keys(updates).length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "没有可更新的字段" });
      return;
    }

    const [before] = await db
      .select({ name: emailTemplates.name, subjectZh: emailTemplates.subjectZh })
      .from(emailTemplates)
      .where(eq(emailTemplates.name, name))
      .limit(1);

    if (!before) {
      reply.status(404).send({ code: 404, data: null, message: "模板不存在" });
      return;
    }

    const operatorId = request.user!.userId;

    const [updated] = await db
      .update(emailTemplates)
      .set({ ...updates, updatedAt: sql`NOW()` })
      .where(eq(emailTemplates.name, name))
      .returning();

    await db.insert(auditLogs).values({
      operatorId,
      action: "email_template_update",
      targetType: "email_template",
      targetId: updated.id,
      before,
      after: updates,
      ip: request.ip,
      description: `更新邮件模板: ${name}`,
    });

    reply.status(200).send({ code: 0, data: updated, message: "ok" });
  });

  // ── 删除 ──
  app.delete("/api/v1/admin/email-templates/:name", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const name = decodeURIComponent((request.params as any).name);

    const [before] = await db
      .select({ name: emailTemplates.name, subjectZh: emailTemplates.subjectZh })
      .from(emailTemplates)
      .where(eq(emailTemplates.name, name))
      .limit(1);

    if (!before) {
      reply.status(404).send({ code: 404, data: null, message: "模板不存在" });
      return;
    }

    const operatorId = request.user!.userId;

    await db.delete(emailTemplates).where(eq(emailTemplates.name, name));

    await db.insert(auditLogs).values({
      operatorId,
      action: "email_template_delete",
      targetType: "email_template",
      targetId: 0,
      before,
      ip: request.ip,
      description: `删除邮件模板: ${name}`,
    });

    reply.status(200).send({ code: 0, data: null, message: "ok" });
  });
}
