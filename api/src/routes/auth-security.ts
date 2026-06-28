// ============================================================
//  3cloud (3C) — 用户端安全相关路由
//  GET    /api/v1/auth/security/login-history   — 最近登录记录
//  GET    /api/v1/auth/security/sessions        — 活跃会话列表
//  POST   /api/v1/auth/security/logout-session/:id — 撤销指定会话
//  POST   /api/v1/auth/security/logout-all      — 撤销所有其他会话
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { userLoginHistory, userLoginSessions } from "../db/schema.js";
import { authenticateJWT } from "../middleware/auth.js";
import { revokeSession, revokeAllUserSessions } from "../services/session-manager.js";

export async function authSecurityRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 当前用户的登录历史 ──
  app.get("/api/v1/auth/security/login-history", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;
    const query = request.query as { limit?: string };
    const limit = Math.min(50, parseInt(query.limit ?? "10", 10) || 10);

    const rows = await db
      .select()
      .from(userLoginHistory)
      .where(eq(userLoginHistory.userId, userId))
      .orderBy(desc(userLoginHistory.createdAt))
      .limit(limit);

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          id: r.id,
          ip: r.ip,
          userAgent: r.userAgent,
          city: r.city,
          country: r.country,
          success: r.success,
          failReason: r.failReason,
          createdAt: r.createdAt.toISOString(),
        })),
      },
      message: "ok",
    });
  });

  // ── 当前用户的活跃会话 ──
  app.get("/api/v1/auth/security/sessions", async (request, reply) => {
    const userId = request.user!.userId;

    // 获取当前请求的 token（从 Authorization header）
    const authHeader = request.headers.authorization;
    const currentToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    const { getUserActiveSessions } = await import("../services/session-manager.js");
    const sessions = await getUserActiveSessions(userId, currentToken);

    reply.status(200).send({
      code: 0,
      data: { list: sessions },
      message: "ok",
    });
  });

  // ── 撤销指定会话 ──
  app.post("/api/v1/auth/security/logout-session/:id", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;
    const sessionId = parseInt((request.params as any).id);

    // 确认此会话属于当前用户
    const [session] = await db
      .select({ sessionToken: userLoginSessions.sessionToken })
      .from(userLoginSessions)
      .where(
        and(
          eq(userLoginSessions.id, sessionId),
          eq(userLoginSessions.userId, userId),
        ),
      )
      .limit(1);

    if (!session) {
      reply.status(404).send({ code: 404, data: null, message: "会话不存在" });
      return;
    }

    await revokeSession(session.sessionToken);

    reply.status(200).send({
      code: 0,
      data: null,
      message: "会话已撤销",
    });
  });

  // ── 撤销所有其他会话（保留当前） ──
  app.post("/api/v1/auth/security/logout-all", async (request, reply) => {
    const db = getDb();
    const userId = request.user!.userId;

    const authHeader = request.headers.authorization;
    const currentToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    // 获取除当前外的所有活跃会话
    const sessions = await db
      .select({ id: userLoginSessions.id, sessionToken: userLoginSessions.sessionToken })
      .from(userLoginSessions)
      .where(
        and(
          eq(userLoginSessions.userId, userId),
          eq(userLoginSessions.isActive, true),
        ),
      );

    let revokedCount = 0;
    for (const session of sessions) {
      if (session.sessionToken !== currentToken) {
        await revokeSession(session.sessionToken);
        revokedCount++;
      }
    }

    reply.status(200).send({
      code: 0,
      data: { revokedCount },
      message: `已撤销 ${revokedCount} 个其他会话`,
    });
  });
}
