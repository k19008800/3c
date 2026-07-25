// ============================================================
//  3cloud (3C) — 公告阅读统计（管理端）
//  GET /api/v1/admin/announcements/:id/stats — 阅读统计详情
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { announcements, announcementReads, users } from "../../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";

export async function adminAnnouncementStatsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 公告阅读统计（含读者列表） ──
  // GET /api/v1/admin/announcements/:id/stats
  // 返回: { totalUsers, readCount, readRate, readers: [...] }
  app.get("/api/v1/admin/announcements/:id/stats", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const id = parseInt((request.params as any).id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ code: 400, data: null, message: "无效的公告ID" });
    }

    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

    // 检查公告是否存在
    const [announcement] = await db
      .select({ id: announcements.id, title: announcements.title })
      .from(announcements)
      .where(eq(announcements.id, id))
      .limit(1);

    if (!announcement) {
      return reply.status(404).send({ code: 404, data: null, message: "公告不存在" });
    }

    // 统计活跃用户总数（status = 'active'）
    const [totalUsersResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.status, "active"));
    const totalUsers = Number(totalUsersResult?.count ?? 0);

    // 统计已读用户数
    const [readResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(announcementReads)
      .where(eq(announcementReads.announcementId, id));
    const readCount = Number(readResult?.count ?? 0);

    // 阅读率
    const readRate = totalUsers > 0 ? readCount / totalUsers : 0;

    // 读者列表（分页）
    const [readerTotalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(announcementReads)
      .where(eq(announcementReads.announcementId, id));
    const readerTotal = Number(readerTotalResult?.count ?? 0);

    const readers = await db
      .select({
        userId: users.id,
        email: users.email,
        nickname: users.nickname,
        readAt: announcementReads.readAt,
      })
      .from(announcementReads)
      .innerJoin(users, eq(announcementReads.userId, users.id))
      .where(eq(announcementReads.announcementId, id))
      .orderBy(desc(announcementReads.readAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    reply.status(200).send({
      code: 0,
      data: {
        announcementId: id,
        title: announcement.title,
        totalUsers,
        readCount,
        unreadCount: totalUsers - readCount,
        readRate: parseFloat(readRate.toFixed(4)),
        readers: {
          list: readers as Array<{ userId: number; email: string; nickname: string | null; readAt: Date }>,
          total: readerTotal,
          page,
          pageSize,
        },
      },
      message: "ok",
    });
  });
}