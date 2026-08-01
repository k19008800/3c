import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, pool } from "../db/index";
import { tickets, TICKET_CATEGORIES, TICKET_STATUS, TICKET_PRIORITY, TICKET_CATEGORY_LABEL } from "../db/schema/tickets";
import { ticketReplies, ticketSatisfaction } from "../db/schema/ticket-support";
import { nextTicketNo, logTicketOp, isDuplicateTicket } from "../services/ticket";

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

export function meTicketsRoutes(app: FastifyInstance) {
  const auth = requireAuth(app);
  const uid = (req: any) => Number((req as any).user.sub);

  // 1. 我的工单列表
  app.get("/me/tickets", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const q = req.query as any;
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.limit ?? 20), 50);
    const offset = (page - 1) * pageSize;
    let where = "WHERE user_id=$1 AND is_spam=false";
    const params: any[] = [userId];
    const pp = (v: any) => { params.push(v); return `$${params.length}`; };
    if (q.status) where += ` AND status=${pp(q.status)}`;
    const rows = await pool.query(
      `SELECT id, ticket_no, title, category, priority, status, created_at,
              (SELECT COUNT(*) FROM ticket_replies tr WHERE tr.ticket_id=t.id AND tr.is_staff=true AND tr.created_at > COALESCE((SELECT max(r2.created_at) FROM ticket_replies r2 WHERE r2.ticket_id=t.id AND r2.user_id=$1), '1970-01-01')) AS unread
       FROM tickets t ${where} ORDER BY created_at DESC LIMIT ${pp(pageSize)} OFFSET ${pp(offset)}`, params);
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM tickets ${where.replace("$1", "$1")}`, params.slice(0, params.length - 2));
    return { code: 0, data: { list: rows.rows.map((r: any) => ({ ...r, category_label: TICKET_CATEGORY_LABEL[r.category] ?? r.category, status_label: TICKET_STATUS[r.status] ?? r.status, priority_label: TICKET_PRIORITY[r.priority] ?? r.priority })), pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.c ?? 0) } }, message: "ok" };
  });

  // 2. 创建工单
  app.post("/me/tickets", { onRequest: [auth] }, async (req, reply) => {
    const userId = uid(req);
    const b = req.body as any;
    if (!b.title || !b.description) return reply.code(400).send({ code: 400, error: "BAD_PARAMS", message: "标题和描述必填" });
    if (!TICKET_CATEGORIES.includes(b.category)) return reply.code(400).send({ code: 400, error: "BAD_CATEGORY" });
    // 重复提交检查
    if (await isDuplicateTicket(userId, b.title)) {
      return reply.code(409).send({ code: 409, error: "DUPLICATE", message: "您已提交过相似工单，请勿重复提交" });
    }
    const ticketNo = await nextTicketNo();
    const created = await db.insert(tickets).values({
      ticketNo, userId, title: b.title, category: b.category,
      priority: b.priority ?? "normal", description: b.description,
      attachments: b.attachments ? JSON.stringify(b.attachments) : null,
    }).returning();
    await logTicketOp(created[0]!.id, userId, "created", "用户创建工单");
    // 通知客服主管（此处简化为记录）
    return { code: 0, data: { id: created[0]!.id, ticket_no: ticketNo }, message: "工单已提交" };
  });

  // 3. 工单详情（含回复）
  app.get("/me/tickets/:id", { onRequest: [auth] }, async (req, reply) => {
    const userId = uid(req);
    const id = Number((req.params as any).id);
    const tk = await db.select().from(tickets).where(and(eq(tickets.id, id), eq(tickets.userId, userId), eq(tickets.isSpam, false))).limit(1);
    if (!tk[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const replies = await db.select().from(ticketReplies).where(eq(ticketReplies.ticketId, id)).orderBy(ticketReplies.createdAt);
    const sat = await db.select().from(ticketSatisfaction).where(eq(ticketSatisfaction.ticketId, id)).limit(1);
    return { code: 0, data: { ticket: { ...tk[0], category_label: TICKET_CATEGORY_LABEL[tk[0].category] ?? tk[0].category, status_label: TICKET_STATUS[tk[0].status] ?? tk[0].status, priority_label: TICKET_PRIORITY[tk[0].priority] ?? tk[0].priority, attachments: tk[0].attachments ? JSON.parse(tk[0].attachments) : [] }, replies: replies.map((r: any) => ({ id: r.id, ticket_id: r.ticketId, user_id: r.userId, is_staff: r.isStaff, content: r.content, attachments: r.attachments ? JSON.parse(r.attachments) : [], created_at: r.createdAt })), satisfaction: sat[0] ?? null }, message: "ok" };
  });

  // 4. 回复工单
  app.post("/me/tickets/:id/reply", { onRequest: [auth] }, async (req, reply) => {
    const userId = uid(req);
    const id = Number((req.params as any).id);
    const { content } = req.body as { content?: string };
    if (!content) return reply.code(400).send({ code: 400, error: "BAD_PARAMS", message: "内容必填" });
    const tk = await db.select().from(tickets).where(and(eq(tickets.id, id), eq(tickets.userId, userId), eq(tickets.isSpam, false))).limit(1);
    if (!tk[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    if (tk[0].status === "closed") return reply.code(400).send({ code: 400, error: "CLOSED", message: "工单已关闭" });
    await db.insert(ticketReplies).values({ ticketId: id, userId, isStaff: false, content });
    // 若已解决则重新打开
    if (tk[0].status === "resolved") {
      await db.update(tickets).set({ status: "processing", updatedAt: new Date() }).where(eq(tickets.id, id));
    }
    return { code: 0, data: { success: true }, message: "已回复" };
  });

  // 5. 用户自行关闭（仅待处理）
  app.post("/me/tickets/:id/close", { onRequest: [auth] }, async (req, reply) => {
    const userId = uid(req);
    const id = Number((req.params as any).id);
    const tk = await db.select().from(tickets).where(and(eq(tickets.id, id), eq(tickets.userId, userId))).limit(1);
    if (!tk[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    if (tk[0].status !== "pending") return reply.code(400).send({ code: 400, error: "BAD_STATE", message: "仅待处理工单可自行关闭" });
    await db.update(tickets).set({ status: "closed", closedAt: new Date(), closedBy: "user", updatedAt: new Date() }).where(eq(tickets.id, id));
    await logTicketOp(id, userId, "closed", "用户自行关闭");
    return { code: 0, data: { success: true }, message: "工单已关闭" };
  });

  // 6. 满意度评价（已解决/已关闭）
  app.post("/me/tickets/:id/satisfaction", { onRequest: [auth] }, async (req, reply) => {
    const userId = uid(req);
    const id = Number((req.params as any).id);
    const { rating, comment } = req.body as { rating?: number; comment?: string };
    if (!rating || rating < 1 || rating > 5) return reply.code(400).send({ code: 400, error: "BAD_PARAMS", message: "评分 1-5 必填" });
    const tk = await db.select().from(tickets).where(and(eq(tickets.id, id), eq(tickets.userId, userId))).limit(1);
    if (!tk[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    if (!["resolved", "closed"].includes(tk[0].status)) return reply.code(400).send({ code: 400, error: "BAD_STATE", message: "仅已解决/已关闭可评价" });
    await db.insert(ticketSatisfaction).values({ ticketId: id, rating, comment: comment ?? null });
    return { code: 0, data: { success: true }, message: "感谢您的评价" };
  });
}
