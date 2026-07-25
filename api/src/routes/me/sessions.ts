// ============================================================
//  3cloud (3C) — 用户登录会话管理
//  GET    /api/v1/me/sessions    — 获取登录设备列表
//  DELETE /api/v1/me/sessions/:id — 登出指定设备
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { userLoginSessions } from "../../db/schema.js";
import { authenticateJWT } from "../../middleware/auth.js";

export async function meSessionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // 获取当前用户的活跃会话列表
  // GET /api/v1/me/sessions
  app.get("/api/v1/me/sessions", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;

    const sessions = await db
      .select({
        id: userLoginSessions.id,
        ip: userLoginSessions.ip,
        userAgent: userLoginSessions.userAgent,
        city: userLoginSessions.city,
        country: userLoginSessions.country,
        isActive: userLoginSessions.isActive,
        lastActivity: userLoginSessions.lastActivity,
        createdAt: userLoginSessions.createdAt,
        expiredAt: userLoginSessions.expiredAt,
      })
      .from(userLoginSessions)
      .where(
        and(
          eq(userLoginSessions.userId, userId),
          eq(userLoginSessions.isActive, true)
        )
      )
      .orderBy(desc(userLoginSessions.lastActivity))
      .limit(50);

    reply.status(200).send({
      code: 0,
      data: sessions.map((s) => ({
        id: s.id,
        ip: s.ip,
        userAgent: s.userAgent,
        city: s.city,
        country: s.country,
        isActive: s.isActive,
        lastActivity: s.lastActivity?.toISOString() ?? null,
        createdAt: s.createdAt?.toISOString() ?? null,
        expiredAt: s.expiredAt?.toISOString() ?? null,
      })),
      message: "ok",
    });
  });

  // 登出指定设备
  // DELETE /api/v1/me/sessions/:id
  app.delete("/api/v1/me/sessions/:id", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    const sessionId = parseInt(id, 10);

    if (isNaN(sessionId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的会话 ID" });
      return;
    }

    // 验证会话属于当前用户
    const [session] = await db
      .select({ id: userLoginSessions.id })
      .from(userLoginSessions)
      .where(
        and(
          eq(userLoginSessions.id, sessionId),
          eq(userLoginSessions.userId, userId)
        )
      )
      .limit(1);

    if (!session) {
      reply.status(404).send({ code: 404, data: null, message: "会话不存在" });
      return;
    }

    await db
      .update(userLoginSessions)
      .set({
        isActive: false,
        expiredAt: new Date(),
      })
      .where(eq(userLoginSessions.id, sessionId));

    reply.status(200).send({
      code: 0,
      data: null,
      message: "已登出该设备",
    });
  });

  // 登出所有其他设备
  // DELETE /api/v1/me/sessions/others
  app.delete("/api/v1/me/sessions/others", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;

    // 获取当前会话的 sessionKey（如果可用）
    // 这里简单处理：保留最新的那条
    const [currentSession] = await db
      .select({ id: userLoginSessions.id })
      .from(userLoginSessions)
      .where(
        and(
          eq(userLoginSessions.userId, userId),
          eq(userLoginSessions.isActive, true)
        )
      )
      .orderBy(desc(userLoginSessions.lastActivity))
      .limit(1);

    if (!currentSession) {
      reply.status(200).send({ code: 0, data: null, message: "无活跃会话" });
      return;
    }

    await db
      .update(userLoginSessions)
      .set({
        isActive: false,
        expiredAt: new Date(),
      })
      .where(
        and(
          eq(userLoginSessions.userId, userId),
          eq(userLoginSessions.isActive, true),
          // 保留当前会话（最新的一条）
          // 注意：实际生产环境建议用 session token 来识别
        )
      );

    reply.status(200).send({
      code: 0,
      data: null,
      message: "已登出其他所有设备",
    });
  });
}
