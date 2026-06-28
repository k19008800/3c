// ============================================================
//  3cloud (3C) — 通知路由
//  GET  /api/v1/auth/notifications      — 通知列表
//  POST /api/v1/auth/notifications/read  — 标记已读
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../middleware/auth.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { userNotifications } from "../db/schema.js";

export async function notificationRoutes(app: FastifyInstance) {
  // ── 获取用户通知列表 ──
  // GET /api/v1/auth/notifications?page=1&pageSize=20&unreadOnly=false
  app.get("/api/v1/auth/notifications", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;

      const query = request.query as {
        page?: string;
        pageSize?: string;
        unreadOnly?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
      const offset = (page - 1) * pageSize;
      const unreadOnly = query.unreadOnly === "true";

      const conditions = [eq(userNotifications.userId, userId)];
      if (unreadOnly) {
        conditions.push(sql`${userNotifications.readAt} IS NULL`);
      }

      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userNotifications)
        .where(and(...conditions));

      const total = Number(totalResult?.count ?? 0);

      const rows = await db
        .select()
        .from(userNotifications)
        .where(and(...conditions))
        .orderBy(desc(userNotifications.createdAt))
        .limit(pageSize)
        .offset(offset);

      // 未读数量
      const [unreadResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userNotifications)
        .where(
          and(
            eq(userNotifications.userId, userId),
            sql`${userNotifications.readAt} IS NULL`,
          )
        );

      const unreadCount = Number(unreadResult?.count ?? 0);

      reply.status(200).send({
        code: 0,
        data: {
          list: rows.map((r) => ({
            id: r.id,
            type: r.type,
            title: r.title,
            content: r.content,
            readAt: r.readAt?.toISOString() ?? null,
            refType: r.refType,
            refId: r.refId,
            createdAt: r.createdAt.toISOString(),
          })),
          total,
          page,
          pageSize,
          unreadCount,
        },
        message: "ok",
      });
    },
  });

  // ── 标记通知为已读 ──
  // POST /api/v1/auth/notifications/read
  // Body: { ids?: number[] }  不传 ids 则标记全部已读
  app.post("/api/v1/auth/notifications/read", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;
      const body = request.body as { ids?: number[] } | null;

      const conditions = [
        eq(userNotifications.userId, userId),
        sql`${userNotifications.readAt} IS NULL`,
      ];

      if (body?.ids && body.ids.length > 0) {
        conditions.push(sql`${userNotifications.id} = ANY(${body.ids}::int[])`);
      }

      await db
        .update(userNotifications)
        .set({ readAt: new Date() })
        .where(and(...conditions));

      reply.status(200).send({
        code: 0,
        data: null,
        message: "已标记为已读",
      });
    },
  });
}
