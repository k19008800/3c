// ============================================================
//  3cloud (3C) — 页面内容管理路由（管理员）
//  GET    /api/v1/admin/page-contents          — 列表
//  POST   /api/v1/admin/page-contents          — 创建新页面
//  PATCH  /api/v1/admin/page-contents/:id      — 更新（状态/内容）
//  DELETE /api/v1/admin/page-contents/:id      — 删除
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { pageContents, users, auditLogs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

export async function adminPageContentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 列表 ──
  app.get("/api/v1/admin/page-contents", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (_request, reply) => {
    const db = getDb();
    const rows = await db
      .select({
        id: pageContents.id,
        slug: pageContents.slug,
        titleZh: pageContents.titleZh,
        titleEn: pageContents.titleEn,
        contentMarkdownZh: pageContents.contentMarkdownZh,
        contentMarkdownEn: pageContents.contentMarkdownEn,
        status: pageContents.status,
        updatedBy: users.nickname,
        updatedAt: pageContents.updatedAt,
        createdAt: pageContents.createdAt,
      })
      .from(pageContents)
      .leftJoin(users, eq(pageContents.updatedBy, users.id))
      .orderBy(desc(pageContents.createdAt));

    reply.status(200).send({
      code: 0,
      data: { list: rows },
      message: "ok",
    });
  });

  // ── 创建 ──
  app.post("/api/v1/admin/page-contents", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { slug, titleZh, titleEn, contentMarkdownZh, contentMarkdownEn, status } = request.body as {
      slug: string;
      titleZh: string;
      titleEn?: string;
      contentMarkdownZh?: string;
      contentMarkdownEn?: string;
      status?: boolean;
    };

    if (!slug?.trim() || !titleZh?.trim()) {
      reply.status(400).send({ code: 400, data: null, message: "slug 和中文标题不能为空" });
      return;
    }

    const operatorId = request.user!.userId;

    const [created] = await db
      .insert(pageContents)
      .values({
        slug: slug.trim(),
        titleZh: titleZh.trim(),
        titleEn: titleEn?.trim() ?? null,
        contentMarkdownZh: contentMarkdownZh ?? null,
        contentMarkdownEn: contentMarkdownEn ?? null,
        status: status ?? true,
        updatedBy: operatorId,
      })
      .returning();

    await db.insert(auditLogs).values({
      operatorId,
      action: "page_content_create",
      targetType: "page_content",
      targetId: created.id,
      after: { slug: created.slug, titleZh: created.titleZh },
      ip: request.ip,
      description: `创建页面内容: ${created.titleZh} (${created.slug})`,
    });

    reply.status(200).send({ code: 0, data: created, message: "ok" });
  });

  // ── 更新（状态 / 内容）──
  app.patch("/api/v1/admin/page-contents/:id", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id, 10);
    if (isNaN(id)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
      return;
    }

    const body = request.body as Record<string, any>;
    const allowedFields = ["titleZh", "titleEn", "contentMarkdownZh", "contentMarkdownEn", "status", "slug"] as const;
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }
    if (Object.keys(updates).length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "没有可更新的字段" });
      return;
    }

    const [before] = await db
      .select({ slug: pageContents.slug, titleZh: pageContents.titleZh, status: pageContents.status })
      .from(pageContents)
      .where(eq(pageContents.id, id))
      .limit(1);

    if (!before) {
      reply.status(404).send({ code: 404, data: null, message: "页面不存在" });
      return;
    }

    const operatorId = request.user!.userId;

    const [updated] = await db
      .update(pageContents)
      .set({ ...updates, updatedBy: operatorId, updatedAt: sql`NOW()` })
      .where(eq(pageContents.id, id))
      .returning();

    await db.insert(auditLogs).values({
      operatorId,
      action: "page_content_update",
      targetType: "page_content",
      targetId: id,
      before,
      after: updates,
      ip: request.ip,
      description: `更新页面内容: ${before.titleZh}`,
    });

    reply.status(200).send({ code: 0, data: updated, message: "ok" });
  });

  // ── 删除 ──
  app.delete("/api/v1/admin/page-contents/:id", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id, 10);
    if (isNaN(id)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
      return;
    }

    const [before] = await db
      .select({ slug: pageContents.slug, titleZh: pageContents.titleZh })
      .from(pageContents)
      .where(eq(pageContents.id, id))
      .limit(1);

    if (!before) {
      reply.status(404).send({ code: 404, data: null, message: "页面不存在" });
      return;
    }

    const operatorId = request.user!.userId;

    await db.delete(pageContents).where(eq(pageContents.id, id));

    await db.insert(auditLogs).values({
      operatorId,
      action: "page_content_delete",
      targetType: "page_content",
      targetId: id,
      before,
      ip: request.ip,
      description: `删除页面内容: ${before.titleZh} (${before.slug})`,
    });

    reply.status(200).send({ code: 0, data: null, message: "ok" });
  });
}
