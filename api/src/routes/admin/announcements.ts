// ============================================================
//  3cloud (3C) — 公告管理路由（管理员）
//  GET    /api/v1/admin/announcements             — 列表（分页）
//  POST   /api/v1/admin/announcements             — 创建公告
//  PATCH  /api/v1/admin/announcements/:id         — 更新公告
//  DELETE /api/v1/admin/announcements/:id         — 删除公告
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { announcements, users, auditLogs, userNotifications } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

// ── 公告发布后广播站内信到所有活跃用户 ──
async function broadcastAnnouncement(title: string, content: string) {
  const db = getDb();
  const allUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.status, "active"));

  const CHUNK = 500;
  for (let i = 0; i < allUsers.length; i += CHUNK) {
    const chunk = allUsers.slice(i, i + CHUNK);
    await db.insert(userNotifications).values(
      chunk.map((u) => ({
        userId: u.id,
        type: "system_announcement" as any,
        title,
        content,
      }))
    );
  }
  return allUsers.length;
}

export async function adminAnnouncementRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 列表 ──
  app.get("/api/v1/admin/announcements", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const keyword = query.keyword?.trim();
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (keyword) {
      conditions.push(sql`${announcements.title} ILIKE ${`%${keyword}%`}`);
    }

    const whereClause = conditions.length > 0
      ? conditions.reduce((a, b) => sql`${a} AND ${b}`)
      : undefined;

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(announcements)
      .where(whereClause);
    const total = Number(totalResult?.count ?? 0);

    const rows = await db
      .select({
        id: announcements.id,
        title: announcements.title,
        content: announcements.content,
        type: announcements.type,
        status: announcements.status,
        priority: announcements.priority,
        createdBy: users.nickname,
        createdAt: announcements.createdAt,
        updatedAt: announcements.updatedAt,
      })
      .from(announcements)
      .leftJoin(users, eq(announcements.createdBy, users.id))
      .where(whereClause)
      .orderBy(desc(announcements.priority), desc(announcements.createdAt))
      .limit(pageSize)
      .offset(offset);

    reply.status(200).send({
      code: 0,
      data: { list: rows, total, page, pageSize },
      message: "ok",
    });
  });

  // ── 创建公告 ──
  app.post("/api/v1/admin/announcements", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { title, content, type, priority } = request.body as {
      title: string;
      content: string;
      type?: string;
      priority?: number;
    };

    if (!title?.trim() || !content?.trim()) {
      reply.status(400).send({ code: 400, data: null, message: "标题和内容不能为空" });
      return;
    }

    const operatorId = request.user!.userId;

    const [announcement] = await db
      .insert(announcements)
      .values({
        title: title.trim(),
        content: content.trim(),
        type: type ?? "system_announcement",
        priority: priority ?? 0,
        createdBy: operatorId,
      })
      .returning();

    await db.insert(auditLogs).values({
      operatorId,
      action: "announcement_create",
      targetType: "announcement",
      targetId: announcement.id,
      after: { title: announcement.title, type: announcement.type, priority: announcement.priority },
      ip: request.ip,
      description: `发布公告: ${announcement.title}`,
    });

    // 新建公告默认已发布 → 广播站内信
    broadcastAnnouncement(announcement.title, announcement.content).catch((err) =>
      app.log.error({ err }, "公告广播通知失败")
    );

    // Return with creator name
    const [creator] = await db
      .select({ nickname: users.nickname })
      .from(users)
      .where(eq(users.id, operatorId))
      .limit(1);

    reply.status(200).send({
      code: 0,
      data: { ...announcement, createdBy: creator?.nickname ?? null } as any,
      message: "ok",
    });
  });

  // ── 更新公告 ──
  app.patch("/api/v1/admin/announcements/:id", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id, 10);
    if (isNaN(id)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
      return;
    }

    const body = request.body as Record<string, any>;
    const allowedFields = ["title", "content", "type", "priority", "status"] as const;
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }
    if (Object.keys(updates).length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "没有可更新的字段" });
      return;
    }

    const [before] = await db
      .select({ title: announcements.title, status: announcements.status })
      .from(announcements)
      .where(eq(announcements.id, id))
      .limit(1);

    if (!before) {
      reply.status(404).send({ code: 404, data: null, message: "公告不存在" });
      return;
    }

    const operatorId = request.user!.userId;

    const [updated] = await db
      .update(announcements)
      .set({ ...updates, updatedAt: sql`NOW()` })
      .where(eq(announcements.id, id))
      .returning();

    await db.insert(auditLogs).values({
      operatorId,
      action: "announcement_update",
      targetType: "announcement",
      targetId: id,
      before,
      after: updates,
      ip: request.ip,
      description: `更新公告: ${before.title}`,
    });

    // 下架 → 上架（发布）时也广播站内信
    if (before.status === false && updates.status === true) {
      broadcastAnnouncement(updated.title, updated.content).catch((err) =>
        app.log.error({ err }, "公告广播通知失败")
      );
    }

    // Return with creator name
    const [creator] = await db
      .select({ nickname: users.nickname })
      .from(users)
      .leftJoin(announcements, eq(announcements.createdBy, users.id))
      .where(eq(announcements.id, id))
      .limit(1);

    reply.status(200).send({
      code: 0,
      data: { ...updated, createdBy: creator?.nickname ?? null } as any,
      message: "ok",
    });
  });

  // ── 删除公告 ──
  app.delete("/api/v1/admin/announcements/:id", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id, 10);
    if (isNaN(id)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
      return;
    }

    const [before] = await db
      .select({ title: announcements.title })
      .from(announcements)
      .where(eq(announcements.id, id))
      .limit(1);

    if (!before) {
      reply.status(404).send({ code: 404, data: null, message: "公告不存在" });
      return;
    }

    const operatorId = request.user!.userId;

    await db.delete(announcements).where(eq(announcements.id, id));

    await db.insert(auditLogs).values({
      operatorId,
      action: "announcement_delete",
      targetType: "announcement",
      targetId: id,
      before,
      ip: request.ip,
      description: `删除公告: ${before.title}`,
    });

    reply.status(200).send({ code: 0, data: null, message: "ok" });
  });
}
