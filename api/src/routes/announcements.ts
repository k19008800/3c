// ============================================================
//  3cloud (3C) — 公告用户端路由（已登录用户可见）
//  GET  /api/v1/announcements        — 获取已发布的公告列表（含已读状态）
//  POST /api/v1/announcements/:id/read — 标记公告为已读
//  POST /api/v1/announcements/read-all — 全部标记已读
//  GET  /api/v1/announcements/unread-count — 未读公告数量
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { announcements, announcementReads, users } from "../db/schema.js";
import { authenticateJWT } from "../middleware/auth.js";
import { getPaginationCount } from "../utils/count-optimizer.js";

export async function announcementRoutes(app: FastifyInstance) {
  // 用户端只需要登录，不需要管理员权限
  app.addHook("preHandler", authenticateJWT);

  // ── 已发布公告列表（含已读状态） ──
  app.get("/api/v1/announcements", async (request, reply) => {
    const db = getDb();
    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;
    const userId = request.user!.userId;

    // 只返回 status = true 且 isPublished = true 的公告
    const countQuery = async () => {
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(announcements)
        .where(
          and(
            eq(announcements.status, true),
            eq(announcements.isPublished, true)
          )
        );
      return Number(totalResult?.count ?? 0);
    };
    
    const total = await getPaginationCount("announcements", countQuery, { status: true });

    const rows = await db
      .select({
        id: announcements.id,
        title: announcements.title,
        content: announcements.content,
        type: announcements.type,
        priority: announcements.priority,
        createdBy: users.nickname,
        createdAt: announcements.createdAt,
        updatedAt: announcements.updatedAt,
      })
      .from(announcements)
      .leftJoin(users, eq(announcements.createdBy, users.id))
      .where(
        and(
          eq(announcements.status, true),
          eq(announcements.isPublished, true)
        )
      )
      .orderBy(desc(announcements.priority), desc(announcements.createdAt))
      .limit(pageSize)
      .offset(offset);

    // 查询当前用户已读的公告ID列表
    const announcementIds = rows.map(r => r.id);
    let readIds: number[] = [];
    
    if (announcementIds.length > 0) {
      const readRecords = await db
        .select({ announcementId: announcementReads.announcementId })
        .from(announcementReads)
        .where(
          and(
            eq(announcementReads.userId, userId),
            inArray(announcementReads.announcementId, announcementIds)
          )
        );
      readIds = readRecords.map(r => r.announcementId);
    }

    // 添加已读状态
    const rowsWithReadStatus = rows.map(row => ({
      ...row,
      isRead: readIds.includes(row.id),
    }));

    reply.status(200).send({
      code: 0,
      data: { list: rowsWithReadStatus, total, page, pageSize },
      message: "ok",
    });
  });

  // ── 标记单个公告为已读 ──
  app.post("/api/v1/announcements/:id/read", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;
    const announcementId = parseInt((request.params as any).id, 10);

    if (isNaN(announcementId)) {
      return reply.status(400).send({ code: 400, message: "无效的公告ID" });
    }

    // 检查公告是否存在且已发布
    const [announcement] = await db
      .select()
      .from(announcements)
      .where(
        and(
          eq(announcements.id, announcementId),
          eq(announcements.status, true),
          eq(announcements.isPublished, true)
        )
      );

    if (!announcement) {
      return reply.status(404).send({ code: 404, message: "公告不存在或未发布" });
    }

    // 插入已读记录（使用 ON CONFLICT DO NOTHING 避免重复）
    await db
      .insert(announcementReads)
      .values({
        announcementId,
        userId,
      })
      .onConflictDoNothing();

    reply.status(200).send({
      code: 0,
      message: "已标记为已读",
    });
  });

  // ── 全部标记已读 ──
  app.post("/api/v1/announcements/read-all", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;

    // 获取所有已发布的公告ID
    const allAnnouncements = await db
      .select({ id: announcements.id })
      .from(announcements)
      .where(
        and(
          eq(announcements.status, true),
          eq(announcements.isPublished, true)
        )
      );

    if (allAnnouncements.length === 0) {
      return reply.status(200).send({
        code: 0,
        message: "没有需要标记的公告",
        data: { count: 0 },
      });
    }

    // 获取已读的公告ID
    const alreadyRead = await db
      .select({ announcementId: announcementReads.announcementId })
      .from(announcementReads)
      .where(eq(announcementReads.userId, userId));
    
    const alreadyReadIds = new Set(alreadyRead.map(r => r.announcementId));

    // 找出未读的公告
    const unreadAnnouncements = allAnnouncements.filter(a => !alreadyReadIds.has(a.id));

    if (unreadAnnouncements.length === 0) {
      return reply.status(200).send({
        code: 0,
        message: "所有公告已读",
        data: { count: 0 },
      });
    }

    // 批量插入已读记录
    await db.insert(announcementReads).values(
      unreadAnnouncements.map(a => ({
        announcementId: a.id,
        userId,
      }))
    );

    reply.status(200).send({
      code: 0,
      message: "全部标记已读成功",
      data: { count: unreadAnnouncements.length },
    });
  });

  // ── 未读公告数量 ──
  app.get("/api/v1/announcements/unread-count", async (request, reply) => {
    try {
    const db = getDb();
    const userId = request.user!.userId;

    // 统计已发布公告总数
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(announcements)
      .where(
        and(
          eq(announcements.status, true),
          eq(announcements.isPublished, true)
        )
      );
    const total = Number(totalResult?.count ?? 0);

    // 统计已读数量
    const [readResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(announcementReads)
      .where(eq(announcementReads.userId, userId));
    const readCount = Number(readResult?.count ?? 0);

    // 未读数量 = 总数 - 已读数量（注意：已读记录可能包含已删除的公告，但实际差异很小）
    // 更精确的做法：只统计已发布公告的已读记录
    const [unreadResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(announcements)
      .where(
        and(
          eq(announcements.status, true),
          eq(announcements.isPublished, true),
          sql`${announcements.id} NOT IN (
            SELECT announcement_id FROM announcement_reads WHERE user_id = ${userId}
          )`
        )
      );
    const unreadCount = Number(unreadResult?.count ?? 0);

    reply.status(200).send({
      code: 0,
      data: { unreadCount, total, readCount: total - unreadCount },
      message: "ok",
    });
    } catch (err: any) {
      reply.status(500).send({
        code: 500,
        data: null,
        message: `获取未读公告数量失败: ${err.message}`,
      });
    }
  });
}
