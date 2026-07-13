// ============================================================
//  3cloud (3C) — 通知路由
//  GET    /api/v1/auth/notifications          — 通知列表
//  POST   /api/v1/auth/notifications/read     — 标记已读
//  PUT    /api/me/notifications/:id/read      — 标记单条已读
//  PUT    /api/me/notifications/read-all      — 全部已读
//  GET    /api/me/notifications/unread-count  — 未读数量
//  POST   /api/v1/admin/notifications/announcement — 管理员全站公告
//  GET    /api/agent/notifications            — 代理商通知
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../middleware/auth.js";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { userNotifications, users } from "../db/schema.js";

export async function notificationRoutes(app: FastifyInstance) {
  // ── 获取用户通知列表 ──
  // GET /api/v1/auth/notifications?page=1&pageSize=20&unreadOnly=false&type=
  app.get("/api/v1/auth/notifications", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;

      const query = request.query as {
        page?: string;
        pageSize?: string;
        unreadOnly?: string;
        type?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
      const offset = (page - 1) * pageSize;
      const unreadOnly = query.unreadOnly === "true";

      const conditions: any[] = [eq(userNotifications.userId, userId)];
      if (unreadOnly) {
        conditions.push(sql`${userNotifications.readAt} IS NULL`);
      }
      if (query.type) {
        conditions.push(eq(userNotifications.type, query.type as any));
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

      const conditions: any[] = [
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

  // ══════════════════════════════════════════════
  //  新增通知 API — 兼容原始路由风格
  // ══════════════════════════════════════════════

  // ── GET /api/me/notifications — 用户通知列表（带 type 过滤） ──
  app.get("/api/me/notifications", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;

      const query = request.query as {
        type?: string;
        unread_only?: string;
        page?: string;
        limit?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20", 10) || 20));
      const offset = (page - 1) * limit;
      const unreadOnly = query.unread_only === "true";

      const conditions: any[] = [eq(userNotifications.userId, userId)];
      if (unreadOnly) {
        conditions.push(sql`${userNotifications.readAt} IS NULL`);
      }
      if (query.type) {
        const types = query.type.split(",");
        if (types.length > 0) {
          conditions.push(sql`${userNotifications.type} = ANY(${types}::notification_type[])`);
        }
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
        .limit(limit)
        .offset(offset);

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
          limit,
        },
        message: "ok",
      });
    },
  });

  // ── PUT /api/me/notifications/:id/read — 标记单条为已读 ──
  app.put("/api/me/notifications/:id/read", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;
      const notifId = parseInt((request.params as any).id, 10);

      if (isNaN(notifId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的通知 ID" });
        return;
      }

      await db
        .update(userNotifications)
        .set({ readAt: new Date() })
        .where(and(eq(userNotifications.id, notifId), eq(userNotifications.userId, userId)));

      reply.status(200).send({ code: 0, data: null, message: "ok" });
    },
  });

  // ── PUT /api/me/notifications/read-all — 全部标记为已读 ──
  app.put("/api/me/notifications/read-all", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;

      await db
        .update(userNotifications)
        .set({ readAt: new Date() })
        .where(and(eq(userNotifications.userId, userId), sql`${userNotifications.readAt} IS NULL`));

      reply.status(200).send({ code: 0, data: null, message: "ok" });
    },
  });

  // ── GET /api/me/notifications/unread-count — 未读数量 ──
  app.get("/api/me/notifications/unread-count", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;

      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userNotifications)
        .where(and(eq(userNotifications.userId, userId), sql`${userNotifications.readAt} IS NULL`));

      reply.status(200).send({
        code: 0,
        data: { unreadCount: Number(result?.count ?? 0) },
        message: "ok",
      });
    },
  });

  // ── GET /api/v1/me/notifications/unread-count — 未读数量（前端兼容路径）──
  app.get("/api/v1/me/notifications/unread-count", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;

      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userNotifications)
        .where(and(eq(userNotifications.userId, userId), sql`${userNotifications.readAt} IS NULL`));

      reply.status(200).send({
        code: 0,
        data: { unreadCount: Number(result?.count ?? 0) },
        message: "ok",
      });
    },
  });

  // ── POST /api/v1/admin/notifications/announcement — 管理员发送全站公告 ──
  app.post("/api/v1/admin/notifications/announcement", {
    preHandler: [authenticateJWT, requirePerm(Perm.CONFIG_EDIT)],
    handler: async (request, reply) => {
      const db = getDb();
      const body = request.body as { title: string; content: string } | null;

      if (!body || !body.title || !body.content) {
        reply.status(400).send({ code: 400, data: null, message: "title 和 content 必填" });
        return;
      }

      // Insert notifications for all active users
      const allUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.status, "active"));

      // Batch insert (chunked to avoid massive queries)
      const CHUNK = 500;
      for (let i = 0; i < allUsers.length; i += CHUNK) {
        const chunk = allUsers.slice(i, i + CHUNK);
        await db.insert(userNotifications).values(
          chunk.map((u) => ({
            userId: u.id,
            type: "system_announcement" as any,
            title: body.title,
            content: body.content,
          }))
        );
      }

      reply.status(200).send({
        code: 0,
        data: { totalUsers: allUsers.length },
        message: `全站公告已发送给 ${allUsers.length} 名用户`,
      });
    },
  });

  // ── GET /api/agent/notifications — 代理商通知列表（包含客户事件） ──
  app.get("/api/agent/notifications", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;
      const userRole = request.user!.role;

      if (userRole !== "agent") {
        reply.status(403).send({ code: 403, data: null, message: "仅代理商可访问" });
        return;
      }

      const query = request.query as {
        page?: string;
        limit?: string;
        unread_only?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20", 10) || 20));
      const offset = (page - 1) * limit;
      const unreadOnly = query.unread_only === "true";

      // Agent notifications: commission_settled, withdraw_result, agent_client_event, system_announcement
      const agentTypes = ["commission_settled", "withdraw_result", "agent_client_event", "system_announcement", "system"];

      const conditions: any[] = [
        eq(userNotifications.userId, userId),
        inArray(userNotifications.type, agentTypes as any),
      ];

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
        .limit(limit)
        .offset(offset);

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
          limit,
        },
        message: "ok",
      });
    },
  });

  // ── GET /api/agent/notifications/unread-count — 代理商未读数量 ──
  app.get("/api/agent/notifications/unread-count", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;
      const userRole = request.user!.role;

      if (userRole !== "agent") {
        reply.status(403).send({ code: 403, data: null, message: "仅代理商可访问" });
        return;
      }

      const agentTypes = ["commission_settled", "withdraw_result", "agent_client_event", "system_announcement", "system"];

      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userNotifications)
        .where(
          and(
            eq(userNotifications.userId, userId),
            inArray(userNotifications.type, agentTypes as any),
            sql`${userNotifications.readAt} IS NULL`,
          )
        );

      reply.status(200).send({
        code: 0,
        data: { total: Number(result?.count ?? 0) },
        message: "ok",
      });
    },
  });

  // ── GET /api/v1/agent/notifications — 前端兼容路由 ──
  app.get("/api/v1/agent/notifications", {
    preHandler: [authenticateJWT],
    handler: async (request, reply) => {
      const db = getDb();
      const userId = request.user!.userId;
      const userRole = request.user!.role;

      if (userRole !== "agent") {
        reply.status(403).send({ code: 403, data: null, message: "仅代理商可访问" });
        return;
      }

      const query = request.query as {
        page?: string;
        pageSize?: string;
        unread_only?: string;
        type?: string;
        unreadOnly?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
      const offset = (page - 1) * pageSize;
      const unreadOnly = query.unread_only === "true" || query.unreadOnly === "true";

      const conditions: any[] = [
        eq(userNotifications.userId, userId),
        inArray(userNotifications.type, ["commission_settled", "withdraw_result", "agent_client_event", "system_announcement", "system"] as any),
      ];

      if (unreadOnly) {
        conditions.push(sql`${userNotifications.readAt} IS NULL`);
      }

      if (query.type) {
        conditions.push(eq(userNotifications.type, query.type as any));
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
        },
        message: "ok",
      });
    },
  });
}
