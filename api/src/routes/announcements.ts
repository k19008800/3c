// ============================================================
//  3cloud (3C) — 公告用户端路由（已登录用户可见）
//  GET  /api/v1/announcements  — 获取已发布的公告列表
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { announcements, users } from "../db/schema.js";
import { authenticateJWT } from "../middleware/auth.js";
import { getPaginationCount } from "../utils/count-optimizer.js";

export async function announcementRoutes(app: FastifyInstance) {
  // 用户端只需要登录，不需要管理员权限
  app.addHook("preHandler", authenticateJWT);

  // ── 已发布公告列表 ──
  app.get("/api/v1/announcements", async (request, reply) => {
    const db = getDb();
    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    // 只返回 status = true（已发布）的公告
    const countQuery = async () => {
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(announcements)
        .where(eq(announcements.status, true));
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
      .where(eq(announcements.status, true))
      .orderBy(desc(announcements.priority), desc(announcements.createdAt))
      .limit(pageSize)
      .offset(offset);

    reply.status(200).send({
      code: 0,
      data: { list: rows, total, page, pageSize },
      message: "ok",
    });
  });
}
