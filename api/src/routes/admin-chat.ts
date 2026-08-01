import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index";
import { chatSessions, chatMessages, chatPresets } from "../db/schema/chat";

/**
 * 管理端在线客服 REST 对齐 SPEC-§27.1/§27.2
 */

function requireAdmin(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
      const role = (decoded as any).role;
      if (role !== "admin" && role !== "super_admin") {
        return reply.code(403).send({ code: 403, error: "FORBIDDEN", message: "需要管理员权限" });
      }
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED" });
    }
  };
}

export function adminChatRoutes(app: FastifyInstance) {
  const admin = requireAdmin(app);

  // 1. 等待队列
  app.get("/admin/chat/queue", { onRequest: [admin] }, async () => {
    const rows = await pool.query(
      `SELECT cs.id AS session_id, u.email, u.username, cs.category, cs.created_at,
              EXTRACT(EPOCH FROM (NOW() - cs.waiting_started_at))::int AS wait_seconds,
              (SELECT COUNT(*) FROM chat_messages cm WHERE cm.session_id=cs.id) AS msg_count
       FROM chat_sessions cs LEFT JOIN users u ON u.id=cs.user_id
       WHERE cs.status='waiting' ORDER BY cs.created_at LIMIT 50`);
    return { code: 0, data: { list: rows.rows }, message: "ok" };
  });

  // 2. 正在服务的会话
  app.get("/admin/chat/active", { onRequest: [admin] }, async (req) => {
    const staffId = Number((req as any).user.sub);
    const rows = await pool.query(
      `SELECT cs.id AS session_id, cs.user_id, u.email, u.username, cs.category, cs.staff_assigned_at,
              (SELECT content FROM chat_messages cm WHERE cm.session_id=cs.id ORDER BY cm.created_at DESC LIMIT 1) AS last_message,
              (SELECT COUNT(*) FROM chat_messages cm WHERE cm.session_id=cs.id AND cm.read_at IS NULL AND cm.sender_type='user') AS unread
       FROM chat_sessions cs LEFT JOIN users u ON u.id=cs.user_id
       WHERE cs.status='active' AND (cs.staff_id=$1 OR $1 IS NULL)
       ORDER BY cs.staff_assigned_at LIMIT 50`,
      [staffId]);
    return { code: 0, data: { list: rows.rows }, message: "ok" };
  });

  // 3. 会话消息
  app.get("/admin/chat/sessions/:id/messages", { onRequest: [admin] }, async (req) => {
    const id = Number((req.params as any).id);
    const rows = await pool.query(
      `SELECT cm.*, u.username AS sender_name FROM chat_messages cm LEFT JOIN users u ON u.id=cm.sender_id WHERE cm.session_id=$1 ORDER BY cm.created_at`,
      [id]);
    return { code: 0, data: { messages: rows.rows }, message: "ok" };
  });

  // 4. 关闭会话
  app.post("/admin/chat/sessions/:id/close", { onRequest: [admin] }, async (req) => {
    const id = Number((req.params as any).id);
    await pool.query(`UPDATE chat_sessions SET status='closed', closed_at=NOW(), closed_by='staff' WHERE id=$1`, [id]);
    return { code: 0, data: { success: true }, message: "会话已关闭" };
  });

  // 5. 转工单（创建关联工单 + 关闭聊天）
  app.post("/admin/chat/sessions/:id/transfer", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const sess = await db.select().from(chatSessions).where(eq(chatSessions.id, id)).limit(1);
    if (!sess[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const messages = await db.select().from(chatMessages).where(eq(chatMessages.sessionId, id)).orderBy(chatMessages.createdAt).limit(10);
    const title = `在线客服会话-${sess[0].userId}`;
    const desc = messages.map((m) => `${m.senderType}: ${m.content}`).slice(-10).join("\n");
    // 生成工单号
    const ticketNo = `TS${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-4)}`;
    const tk = await pool.query(
      `INSERT INTO tickets (ticket_no, user_id, title, category, priority, status, description, source) VALUES ($1,$2,$3,'other','normal','pending',$4,'chat_transfer') RETURNING id`,
      [ticketNo, sess[0].userId, title, desc]);
    await pool.query(`UPDATE chat_sessions SET status='transferred_to_ticket', closed_at=NOW(), closed_by='staff' WHERE id=$1`, [id]);
    return { code: 0, data: { success: true, ticket_id: tk.rows[0]?.id, ticket_no: ticketNo }, message: "已转工单" };
  });

  // 6. 客服状态
  app.post("/admin/chat/status", { onRequest: [admin] }, async (req) => {
    const staffId = Number((req as any).user.sub);
    const { status } = req.body as { status?: string };
    const s = ["online", "busy", "offline"].includes(status ?? "") ? status : "online";
    // 记录到客服在线表（内存由 WS 管理，这里记录 DB 用于持久化）
    await pool.query(
      `INSERT INTO staff_chat_status (staff_id, status, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (staff_id) DO UPDATE SET status=$2, updated_at=NOW()`,
      [staffId, s]).catch(() => {});
    return { code: 0, data: { success: true, status: s }, message: "状态已更新" };
  });

  // 7. 预设消息 CRUD
  app.get("/admin/chat/presets", { onRequest: [admin] }, async () => {
    const rows = await db.select().from(chatPresets).orderBy(chatPresets.sortOrder);
    return { code: 0, data: { list: rows }, message: "ok" };
  });

  app.post("/admin/chat/presets", { onRequest: [admin] }, async (req) => {
    const b = req.body as any;
    const c = await db.insert(chatPresets).values({ type: b.type ?? "custom", title: b.title, content: b.content, sortOrder: b.sortOrder ?? 0 }).returning();
    return { code: 0, data: c[0], message: "已创建预设消息" };
  });

  app.put("/admin/chat/presets/:id", { onRequest: [admin] }, async (req) => {
    const id = Number((req.params as any).id);
    const b = req.body as any;
    await db.update(chatPresets).set({ title: b.title, content: b.content, sortOrder: b.sortOrder }).where(eq(chatPresets.id, id));
    return { code: 0, data: { success: true }, message: "已更新" };
  });

  app.delete("/admin/chat/presets/:id", { onRequest: [admin] }, async (req) => {
    const id = Number((req.params as any).id);
    await db.delete(chatPresets).where(eq(chatPresets.id, id));
    return { code: 0, data: { success: true }, message: "已删除" };
  });

  // 8. 所有客服在线状态
  app.get("/admin/chat/staff-status", { onRequest: [admin] }, async () => {
    const rows = await pool.query(
      `SELECT u.id, u.username, COALESCE(scs.status,'offline') AS status, scs.updated_at
       FROM users u LEFT JOIN staff_chat_status scs ON scs.staff_id = u.id
       WHERE u.role IN ('admin','super_admin')`).catch(() => ({ rows: [] }));
    return { code: 0, data: { list: rows.rows }, message: "ok" };
  });
}
