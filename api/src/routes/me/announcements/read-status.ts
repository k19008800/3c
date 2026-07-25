// ============================================================
//  3cloud (3C) — 标记公告已读（用户端）
//  POST /api/v1/me/announcements/:id/read — 标记公告已读
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { announcements, announcementReads } from "../../../db/schema.js";
import { authenticateJWT } from "../../../middleware/auth.js";

export async function announcementReadStatusRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 标记公告已读 ──
  app.post("/api/v1/me/announcements/:id/read", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;
    const announcementId = parseInt((request.params as any).id, 10);

    if (isNaN(announcementId)) {
      return reply.status(400).send({ code: 400, data: null, message: "无效的公告ID" });
    }

    // 检查公告是否存在且已发布
    const [announcement] = await db
      .select({ id: announcements.id })
      .from(announcements)
      .where(
        and(
          eq(announcements.id, announcementId),
          eq(announcements.status, true),
          eq(announcements.isPublished, true)
        )
      )
      .limit(1);

    if (!announcement) {
      return reply.status(404).send({ code: 404, data: null, message: "公告不存在或未发布" });
    }

    // UPSERT：如果记录已存在则更新 read_at，否则插入新记录
    await db
      .insert(announcementReads)
      .values({ announcementId, userId })
      .onConflictDoUpdate({
        target: [announcementReads.userId, announcementReads.announcementId],
        set: { readAt: sql`NOW()` },
      });

    reply.status(200).send({ code: 0, data: null, message: "已标记为已读" });
  });
}