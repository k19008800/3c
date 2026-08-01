import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index";
import { chatSessions, chatMessages } from "../db/schema/chat";
import { startUserChat } from "../services/chat-service";

/**
 * 用户端在线客服 REST 对齐 SPEC-§27.1
 */

function requireAuth(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED" });
    }
  };
}

export function meChatRoutes(app: FastifyInstance) {
  const auth = requireAuth(app);
  const uid = (req: any) => Number((req as any).user.sub);

  // 1. 发起聊天（HTTP 预检用，返回会话 id + 排队状态）
  app.post("/me/chat/start", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const { category } = req.body as any;
    const r = await startUserChat(userId, category);
    return { code: 0, data: r, message: "ok" };
  });

  // 2. 历史聊天记录
  app.get("/me/chat/history", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const q = req.query as any;
    const page = Math.max(Number(q.page ?? 1), 1);
    const limit = Math.min(Number(q.limit ?? 20), 50);
    const offset = (page - 1) * limit;
    const rows = await pool.query(
      `SELECT cs.id AS session_id, cs.status, cs.created_at, cs.closed_at,
              (SELECT COUNT(*) FROM chat_messages cm WHERE cm.session_id=cs.id) AS msg_count
       FROM chat_sessions cs WHERE cs.user_id=$1 ORDER BY cs.created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]);
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM chat_sessions WHERE user_id=$1`, [userId]);
    return { code: 0, data: { list: rows.rows, pagination: { page, page_size: limit, total: Number(total.rows[0]?.c ?? 0) } }, message: "ok" };
  });

  // 3. 某次聊天完整消息
  app.get("/me/chat/sessions/:id/messages", { onRequest: [auth] }, async (req, reply) => {
    const userId = uid(req);
    const id = Number((req.params as any).id);
    const s = await db.select().from(chatSessions).where(eq(chatSessions.id, id)).limit(1);
    if (!s[0] || s[0].userId !== userId) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const rows = await db.select().from(chatMessages).where(eq(chatMessages.sessionId, id)).orderBy(chatMessages.createdAt);
    return { code: 0, data: { messages: rows }, message: "ok" };
  });

  // 4. 满意度评价
  app.post("/me/chat/feedback", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const b = req.body as any;
    if (!b.session_id || !b.rating) return { code: 400, error: "BAD_PARAMS" };
    await pool.query(
      `INSERT INTO chat_feedback (session_id, user_id, rating, comment) VALUES ($1,$2,$3,$4)`,
      [Number(b.session_id), userId, Number(b.rating), b.comment ?? null]).catch(() => {});
    return { code: 0, data: { success: true }, message: "感谢您的评价" };
  });

  // 5. 离线自动回复 + 新建工单
  app.post("/me/chat/offline-ticket", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const { content } = req.body as { content?: string };
    if (!content) return { code: 400, error: "BAD_PARAMS" };
    const ticketNo = `TS${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-4)}`;
    const tk = await pool.query(
      `INSERT INTO tickets (ticket_no, user_id, title, category, priority, status, description, source) VALUES ($1,$2,$3,'other','normal','pending',$4,'chat_offline') RETURNING id`,
      [ticketNo, userId, "离线留言工单", content]);
    return { code: 0, data: { success: true, ticket_id: tk.rows[0]?.id, ticket_no: ticketNo }, message: "已创建工单，客服上线后处理" };
  });
}
