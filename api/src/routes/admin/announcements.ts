// ============================================================
//  3cloud (3C) — 公告管理路由（管理员）
//  GET    /api/v1/admin/announcements             — 列表（分页）
//  POST   /api/v1/admin/announcements             — 创建公告
//  PATCH  /api/v1/admin/announcements/:id         — 更新公告
//  DELETE /api/v1/admin/announcements/:id         — 删除公告
//  GET    /api/v1/admin/announcements/:id/stats   — 阅读统计
//  GET    /api/v1/admin/announcements/:id/readers — 阅读用户列表
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { announcements, users, auditLogs, userNotifications, announcementReads } from "../../db/schema.js";
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
        scheduledAt: announcements.scheduledAt,
        isPublished: announcements.isPublished,
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

    // ── 单条详情 ──
  app.get("/api/v1/admin/announcements/:id", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id, 10);
    if (isNaN(id)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
      return;
    }

    const [row] = await db
      .select({
        id: announcements.id,
        title: announcements.title,
        content: announcements.content,
        type: announcements.type,
        status: announcements.status,
        priority: announcements.priority,
        scheduledAt: announcements.scheduledAt,
        isPublished: announcements.isPublished,
        createdBy: users.nickname,
        createdAt: announcements.createdAt,
        updatedAt: announcements.updatedAt,
      })
      .from(announcements)
      .leftJoin(users, eq(announcements.createdBy, users.id))
      .where(eq(announcements.id, id))
      .limit(1);

    if (!row) {
      reply.status(404).send({ code: 404, data: null, message: "公告不存在" });
      return;
    }

    reply.status(200).send({ code: 0, data: row, message: "ok" });
  });

  // ── 创建公告 ──
  app.post("/api/v1/admin/announcements", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { title, content, type, priority, scheduledAt } = request.body as {
      title: string;
      content: string;
      type?: string;
      priority?: number;
      scheduledAt?: string; // ISO 8601 datetime string
    };

    if (!title?.trim() || !content?.trim()) {
      reply.status(400).send({ code: 400, data: null, message: "标题和内容不能为空" });
      return;
    }

    const operatorId = request.user!.userId;

    // 解析定时发布时间
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
    const now = new Date();

    // 如果设置了定时发布时间且在未来，则 isPublished = false
    // 否则立即发布（isPublished = true）
    const isPublished = !scheduledDate || scheduledDate <= now;

    const [announcement] = await db
      .insert(announcements)
      .values({
        title: title.trim(),
        content: content.trim(),
        type: type ?? "system_announcement",
        priority: priority ?? 0,
        scheduledAt: scheduledDate,
        isPublished,
        createdBy: operatorId,
      })
      .returning();

    await db.insert(auditLogs).values({
      operatorId,
      action: "announcement_create",
      targetType: "announcement",
      targetId: announcement.id,
      after: { 
        title: announcement.title, 
        type: announcement.type, 
        priority: announcement.priority,
        scheduledAt: announcement.scheduledAt,
        isPublished: announcement.isPublished,
      },
      ip: request.ip,
      description: scheduledDate 
        ? `创建定时公告: ${announcement.title}，计划发布时间: ${scheduledDate.toLocaleString('zh-CN')}`
        : `发布公告: ${announcement.title}`,
    });

    // 立即发布时才广播站内信
    if (isPublished) {
      broadcastAnnouncement(announcement.title, announcement.content).catch((err) =>
        app.log.error({ err }, "公告广播通知失败")
      );
    }

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
    const allowedFields = ["title", "content", "type", "priority", "status", "scheduledAt", "cancelScheduled"] as const;
    const updates: Record<string, any> = {};
    
    // 处理取消定时发布
    if (body.cancelScheduled === true) {
      updates.scheduledAt = null;
      updates.isPublished = true;
    } else {
      for (const field of allowedFields) {
        if (field === "cancelScheduled") continue; // 跳过特殊字段
        if (field === "scheduledAt" && body[field]) {
          updates.scheduledAt = new Date(body[field]);
          // 如果新的定时时间在未来，设置为未发布
          if (updates.scheduledAt > new Date()) {
            updates.isPublished = false;
          }
        } else if (body[field] !== undefined && field !== "scheduledAt") {
          updates[field] = body[field];
        }
      }
    }
    
    if (Object.keys(updates).length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "没有可更新的字段" });
      return;
    }

    const [before] = await db
      .select({ 
        title: announcements.title, 
        status: announcements.status,
        scheduledAt: announcements.scheduledAt,
        isPublished: announcements.isPublished,
      })
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

    // 下架 → 上架（发布）时也广播站内信（仅已发布公告）
    if (before.status === false && updates.status === true && updated.isPublished) {
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

  // ── 阅读统计 ──
  app.get("/api/v1/admin/announcements/:id/stats", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id, 10);
    if (isNaN(id)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
      return;
    }

    // 检查公告是否存在
    const [announcement] = await db
      .select({ title: announcements.title })
      .from(announcements)
      .where(eq(announcements.id, id))
      .limit(1);

    if (!announcement) {
      reply.status(404).send({ code: 404, data: null, message: "公告不存在" });
      return;
    }

    // 统计活跃用户总数（status = 'active'）
    const [totalUsersResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.status, "active"));
    const totalUsers = Number(totalUsersResult?.count ?? 0);

    // 统计已读用户数
    const [readUsersResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(announcementReads)
      .where(eq(announcementReads.announcementId, id));
    const readUsers = Number(readUsersResult?.count ?? 0);

    // 计算阅读率
    const readRate = totalUsers > 0 ? (readUsers / totalUsers * 100).toFixed(2) : "0.00";

    reply.status(200).send({
      code: 0,
      data: {
        announcementId: id,
        title: announcement.title,
        totalUsers,
        readUsers,
        unreadUsers: totalUsers - readUsers,
        readRate: parseFloat(readRate),
      },
      message: "ok",
    });
  });

  // ── 阅读用户列表 ──
  app.get("/api/v1/admin/announcements/:id/readers", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id, 10);
    if (isNaN(id)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
      return;
    }

    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;
    const readStatus = query.readStatus; // 'read' | 'unread' | undefined (全部)

    // 检查公告是否存在
    const [announcement] = await db
      .select({ title: announcements.title })
      .from(announcements)
      .where(eq(announcements.id, id))
      .limit(1);

    if (!announcement) {
      reply.status(404).send({ code: 404, data: null, message: "公告不存在" });
      return;
    }

    let list: Array<{
      id: number;
      email: string;
      nickname: string | null;
      isRead: boolean;
      readAt: string | null;
    }> = [];
    let total = 0;

    if (readStatus === "read") {
      // 已读用户
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(announcementReads)
        .where(eq(announcementReads.announcementId, id));
      total = Number(totalResult?.count ?? 0);

      list = await db
        .select({
          id: users.id,
          email: users.email,
          nickname: users.nickname,
          isRead: sql<boolean>`true`,
          readAt: announcementReads.readAt,
        })
        .from(announcementReads)
        .innerJoin(users, eq(announcementReads.userId, users.id))
        .where(eq(announcementReads.announcementId, id))
        .orderBy(desc(announcementReads.readAt))
        .limit(pageSize)
        .offset(offset);
    } else if (readStatus === "unread") {
      // 未读用户 = 活跃用户 - 已读用户
      // 先获取已读用户 ID
      const readUserIds = await db
        .select({ userId: announcementReads.userId })
        .from(announcementReads)
        .where(eq(announcementReads.announcementId, id));
      const readIdSet = new Set(readUserIds.map(r => r.userId));

      // 查询活跃用户总数
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.status, "active"));
      const allActiveUsers = Number(totalResult?.count ?? 0);

      // 未读用户列表（排除已读）
      if (readIdSet.size === 0) {
        // 没有人读过，返回所有活跃用户
        total = allActiveUsers;
        list = await db
          .select({
            id: users.id,
            email: users.email,
            nickname: users.nickname,
            isRead: sql<boolean>`false`,
            readAt: sql<string | null>`null`,
          })
          .from(users)
          .where(eq(users.status, "active"))
          .orderBy(desc(users.id))
          .limit(pageSize)
          .offset(offset);
      } else {
        // 排除已读用户
        const [unreadTotalResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(
            and(
              eq(users.status, "active"),
              sql`${users.id} NOT IN (SELECT user_id FROM announcement_reads WHERE announcement_id = ${id})`
            )
          );
        total = Number(unreadTotalResult?.count ?? 0);

        list = await db
          .select({
            id: users.id,
            email: users.email,
            nickname: users.nickname,
            isRead: sql<boolean>`false`,
            readAt: sql<string | null>`null`,
          })
          .from(users)
          .where(
            and(
              eq(users.status, "active"),
              sql`${users.id} NOT IN (SELECT user_id FROM announcement_reads WHERE announcement_id = ${id})`
            )
          )
          .orderBy(desc(users.id))
          .limit(pageSize)
          .offset(offset);
      }
    } else {
      // 全部用户（默认）
      // 获取活跃用户总数
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.status, "active"));
      total = Number(totalResult?.count ?? 0);

      // 获取当前页的活跃用户
      const activeUsers = await db
        .select({
          id: users.id,
          email: users.email,
          nickname: users.nickname,
        })
        .from(users)
        .where(eq(users.status, "active"))
        .orderBy(desc(users.id))
        .limit(pageSize)
        .offset(offset);

      // 获取这些用户的已读记录
      const userIds = activeUsers.map(u => u.id);
      let readRecords: Map<number, Date> = new Map();
      
      if (userIds.length > 0) {
        const records = await db
          .select({
            userId: announcementReads.userId,
            readAt: announcementReads.readAt,
          })
          .from(announcementReads)
          .where(
            and(
              eq(announcementReads.announcementId, id),
              inArray(announcementReads.userId, userIds)
            )
          );
        readRecords = new Map(records.map(r => [r.userId, r.readAt]));
      }

      // 合并数据
      list = activeUsers.map(u => ({
        id: u.id,
        email: u.email,
        nickname: u.nickname,
        isRead: readRecords.has(u.id),
        readAt: readRecords.get(u.id)?.toISOString() ?? null,
      }));
    }

    reply.status(200).send({
      code: 0,
      data: { list, total, page, pageSize },
      message: "ok",
    });
  });
}
