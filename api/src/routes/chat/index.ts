// ============================================================
//  3cloud (3C) — 在线聊天 用户端 API（§27）
//  POST  /api/v1/me/chat/start            — 发起聊天
//  GET   /api/v1/me/chat/history           — 历史列表
//  GET   /api/v1/me/chat/sessions/:id/messages — 消息记录
//  POST  /api/v1/me/chat/feedback          — 满意度评价
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, and, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { chatSessions, chatMessages } from "../../db/schema.js";
import { authenticateJWT } from "../../middleware/auth.js";

export async function chatUserRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticateJWT);

  // ── 发起聊天（进入排队或直接分配客服）──
  app.post("/api/v1/me/chat/start", async (req, reply) => {
    const userId = (req as any).user.id;
    const { category } = req.body as any;

    const db = getDb();

    // 检查是否有进行中的会话
    const active = await db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.userId, userId),
          sql`status IN ('waiting', 'active')`
        )
      )
      .limit(1);

    if (active.length > 0) {
      // 5 分钟内回来继续排队（等待中的旧会话保留）
      const waitTime = Date.now() - new Date(active[0].waitingStartedAt || active[0].createdAt).getTime();
      if (waitTime < 5 * 60 * 1000 && active[0].status === "waiting") {
        return reply.send({ sessionId: active[0].id, status: "waiting", existing: true });
      }
      // 否则关闭旧会话
      await db
        .update(chatSessions)
        .set({ status: "closed", closedAt: sql`NOW()`, closedBy: "system" })
        .where(eq(chatSessions.id, active[0].id));
    }

    // 检查是否有在线客服
    // 简化实现：直接排队等待，用 queuePosition 表示位置
    const waitingCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatSessions)
      .where(eq(chatSessions.status, "waiting"));

    const queuePosition = (Number(waitingCount[0]?.count) || 0) + 1;

    const [session] = await db
      .insert(chatSessions)
      .values({
        userId,
        status: "waiting",
        category: category || null,
        queuePosition,
        waitingStartedAt: sql`NOW()`,
      })
      .returning();

    return reply.status(201).send({
      sessionId: session.id,
      status: "waiting",
      queuePosition,
    });
  });

  // ── 历史聊天记录列表 ──
  app.get("/api/v1/me/chat/history", async (req, reply) => {
    const userId = (req as any).user.id;
    const query = req.query as any;
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 20));

    const db = getDb();
    const [rows, totalArr] = await Promise.all([
      db
        .select({
          id: chatSessions.id,
          status: chatSessions.status,
          staffId: chatSessions.staffId,
          createdAt: chatSessions.createdAt,
          staffAssignedAt: chatSessions.staffAssignedAt,
          closedAt: chatSessions.closedAt,
          category: chatSessions.category,
        })
        .from(chatSessions)
        .where(eq(chatSessions.userId, userId))
        .orderBy(desc(chatSessions.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db
        .select({ count: sql<number>`count(*)` })
        .from(chatSessions)
        .where(eq(chatSessions.userId, userId)),
    ]);

    return reply.send({
      sessions: rows,
      total: Number(totalArr[0]?.count || 0),
      page,
    });
  });

  // ── 单次聊天的消息记录 ──
  app.get("/api/v1/me/chat/sessions/:id/messages", async (req, reply) => {
    const userId = (req as any).user.id;
    const id = parseInt((req.params as any).id);
    if (isNaN(id)) return reply.status(400).send({ error: "无效参数" });

    const db = getDb();
    const session = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)))
      .limit(1);

    if (session.length === 0) {
      return reply.status(404).send({ error: "会话不存在" });
    }

    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, id))
      .orderBy(chatMessages.createdAt);

    return reply.send({ session: session[0], messages });
  });

  // ── 聊天结束后满意度评价 ──
  app.post("/api/v1/me/chat/feedback", async (req, reply) => {
    const userId = (req as any).user.id;
    const { sessionId, rating, comment } = req.body as any;

    const id = parseInt(sessionId);
    if (isNaN(id)) return reply.status(400).send({ error: "无效参数" });

    const r = parseInt(rating);
    if (isNaN(r) || r < 1 || r > 5) {
      return reply.status(400).send({ error: "评分必须在 1-5 之间" });
    }

    const db = getDb();
    const session = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)))
      .limit(1);

    if (session.length === 0) {
      return reply.status(404).send({ error: "会话不存在" });
    }

    // 简化为在消息中插入一条系统反馈消息
    const [msg] = await db
      .insert(chatMessages)
      .values({
        sessionId: id,
        senderId: userId,
        senderType: "user",
        contentType: "system",
        content: `[满意度评价] 评分: ${r}/5${comment ? ` - ${comment}` : ""}`,
      })
      .returning();

    return reply.status(201).send(msg);
  });
}
