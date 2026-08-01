import type { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { db, pool } from "../db/index";
import { tickets, TICKET_STATUS, TICKET_PRIORITY, TICKET_CATEGORY_LABEL } from "../db/schema/tickets";
import { users } from "../db/schema/users";
import { ticketReplies, ticketSatisfaction, ticketOperationLogs, ticketTagDefs } from "../db/schema/ticket-support";
import { logTicketOp } from "../services/ticket";
import { sendEmail } from "../services/smtp";

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

export function adminTicketsRoutes(app: FastifyInstance) {
  const admin = requireAdmin(app);
  const opId = (req: any) => Number((req as any).user.sub);

  // 1. 工单队列（筛选/分页/统计）
  app.get("/admin/tickets", { onRequest: [admin] }, async (req) => {
    const q = req.query as any;
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.limit ?? 20), 100);
    const offset = (page - 1) * pageSize;
    let where = "WHERE t.is_spam=false";
    const params: any[] = [];
    const pp = (v: any) => { params.push(v); return `$${params.length}`; };
    if (q.status && q.status !== "all") where += ` AND t.status = ${pp(q.status)}`;
    if (q.priority) where += ` AND t.priority = ${pp(q.priority)}`;
    if (q.category) where += ` AND t.category = ${pp(q.category)}`;
    if (q.assignee_id) where += ` AND t.assignee_id = ${pp(Number(q.assignee_id))}`;
    if (q.search) where += ` AND (t.ticket_no ILIKE ${pp(`%${q.search}%`)} OR t.title ILIKE ${pp(`%${q.search}%`)} OR u.email ILIKE ${pp(`%${q.search}%`)} OR u.username ILIKE ${pp(`%${q.search}%`)})`;
    const rows = await pool.query(
      `SELECT t.*, u.email, u.username,
              (SELECT username FROM users WHERE id=t.assignee_id) AS assignee_name
       FROM tickets t LEFT JOIN users u ON u.id=t.user_id ${where}
       ORDER BY CASE t.status WHEN 'pending' THEN 0 WHEN 'processing' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END, t.created_at DESC
       LIMIT ${pp(pageSize)} OFFSET ${pp(offset)}`, params);
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM tickets t ${where}`, params.slice(0, params.length - 2));
    const stats = await pool.query(
      `SELECT status, COUNT(*)::int AS c FROM tickets WHERE is_spam=false GROUP BY status`);
    const statsObj: any = { pending: 0, processing: 0, resolved: 0, closed: 0 };
    for (const s of stats.rows) statsObj[s.status] = s.c;
    // 平均响应/解决时间
    const avg = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)))::int AS avg_resp,
              AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)))::int AS avg_resolve
       FROM tickets WHERE first_response_at IS NOT NULL`);
    return { code: 0, data: { list: rows.rows.map((r: any) => ({ ...r, category_label: TICKET_CATEGORY_LABEL[r.category] ?? r.category, status_label: TICKET_STATUS[r.status] ?? r.status, priority_label: TICKET_PRIORITY[r.priority] ?? r.priority })), pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.c ?? 0) }, stats: statsObj, avg_response_seconds: avg.rows[0]?.avg_resp ?? 0, avg_resolve_seconds: avg.rows[0]?.avg_resolve ?? 0 }, message: "ok" };
  });

  // 2. 工单详情
  app.get("/admin/tickets/:id", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const tk = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
    if (!tk[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const replies = await db.select().from(ticketReplies).where(eq(ticketReplies.ticketId, id)).orderBy(ticketReplies.createdAt);
    const ops = await db.select().from(ticketOperationLogs).where(eq(ticketOperationLogs.ticketId, id)).orderBy(desc(ticketOperationLogs.createdAt)).limit(50);
    const sat = await db.select().from(ticketSatisfaction).where(eq(ticketSatisfaction.ticketId, id)).limit(1);
    const tags = await db.select().from(ticketTagDefs);
    return { code: 0, data: { ticket: { ...tk[0], category_label: TICKET_CATEGORY_LABEL[tk[0].category] ?? tk[0].category, attachments: tk[0].attachments ? JSON.parse(tk[0].attachments) : [] }, replies: replies.map((r: any) => ({ id: r.id, ticket_id: r.ticketId, user_id: r.userId, is_staff: r.isStaff, content: r.content, attachments: r.attachments ? JSON.parse(r.attachments) : [], created_at: r.createdAt })), operation_logs: ops, satisfaction: sat[0] ?? null, all_tags: tags }, message: "ok" };
  });

  // 3. 客服回复
  app.post("/admin/tickets/:id/reply", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { content } = req.body as { content?: string };
    if (!content) return reply.code(400).send({ code: 400, error: "BAD_PARAMS" });
    const tk = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
    if (!tk[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const operatorId = opId(req);
    await db.insert(ticketReplies).values({ ticketId: id, userId: operatorId, isStaff: true, content });
    // 首次响应
    const upd: any = { updatedAt: new Date() };
    if (!tk[0].firstResponseAt) upd.firstResponseAt = new Date();
    if (tk[0].status === "pending") upd.status = "processing";
    await db.update(tickets).set(upd).where(eq(tickets.id, id));
    await logTicketOp(id, operatorId, "replied", "客服回复");
    // 通知用户（fire-and-forget 邮件）
    const user = (await db.select().from(users).where(eq(users.id, tk[0].userId)).limit(1))[0];
    if (user?.email) void sendEmail({ to: user.email, subject: `工单 ${tk[0].ticketNo} 有新回复`, html: `<p>您的工单「${tk[0].title}」有新的客服回复，请前往控制台查看。</p>` }).catch(() => {});
    return { code: 0, data: { success: true }, message: "已回复" };
  });

  // 4. 分配
  app.post("/admin/tickets/:id/assign", { onRequest: [admin] }, async (req) => {
    const id = Number((req.params as any).id);
    const { assignee_id } = req.body as { assignee_id?: number };
    await db.update(tickets).set({ assigneeId: assignee_id ?? null, updatedAt: new Date() }).where(eq(tickets.id, id));
    await logTicketOp(id, opId(req), "assigned", `分配给客服 ${assignee_id ?? "未分配"}`);
    return { code: 0, data: { success: true }, message: "已分配" };
  });

  // 5. 状态变更
  app.post("/admin/tickets/:id/status", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { status } = req.body as { status?: string };
    if (!["pending", "processing", "resolved", "closed"].includes(status ?? "")) return reply.code(400).send({ code: 400, error: "BAD_STATUS" });
    const upd: any = { status, updatedAt: new Date() };
    if (status === "resolved") upd.resolvedAt = new Date();
    if (status === "closed") upd.closedAt = new Date();
    await db.update(tickets).set(upd).where(eq(tickets.id, id));
    await logTicketOp(id, opId(req), "status_changed", `状态变更为 ${status}`);
    return { code: 0, data: { success: true, status }, message: "状态已更新" };
  });

  // 6. 优先级变更
  app.post("/admin/tickets/:id/priority", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { priority } = req.body as { priority?: string };
    if (!["low", "normal", "high", "urgent"].includes(priority ?? "")) return reply.code(400).send({ code: 400, error: "BAD_PRIORITY" });
    await db.update(tickets).set({ priority, updatedAt: new Date() }).where(eq(tickets.id, id));
    await logTicketOp(id, opId(req), "priority_changed", `优先级变更为 ${priority}`);
    return { code: 0, data: { success: true, priority }, message: "优先级已更新" };
  });

  // 7. 标签
  app.post("/admin/tickets/:id/tags", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as any;
    const tk = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
    if (!tk[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    let cur: string[] = (tk[0].tags ?? "").split(",").filter(Boolean);
    if (b.add) { if (!cur.includes(b.add)) cur.push(b.add); }
    if (b.remove) cur = cur.filter((t) => t !== b.remove);
    await db.update(tickets).set({ tags: cur.join(","), updatedAt: new Date() }).where(eq(tickets.id, id));
    return { code: 0, data: { success: true, tags: cur }, message: "标签已更新" };
  });

  // 8. 内部备注（写入 operation_logs）
  app.post("/admin/tickets/:id/note", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { note } = req.body as { note?: string };
    if (!note) return reply.code(400).send({ code: 400, error: "BAD_PARAMS" });
    await logTicketOp(id, opId(req), "note_added", note);
    return { code: 0, data: { success: true }, message: "已添加备注" };
  });

  // 9. 工单统计（§26.6）
  app.get("/admin/tickets/stats", { onRequest: [admin] }, async (req) => {
    const q = req.query as any;
    const period = q.period ?? "month";
    const startFilter = period === "day" ? "CURRENT_DATE" : period === "week" ? "NOW() - interval '7 days'" : "date_trunc('month', NOW())";
    const totalQ = await pool.query(`SELECT COUNT(*)::int AS c FROM tickets WHERE created_at >= ${startFilter}`);
    const resolvedQ = await pool.query(`SELECT COUNT(*)::int AS c FROM tickets WHERE (status IN ('resolved','closed')) AND created_at >= ${startFilter}`);
    const avgResp = await pool.query(`SELECT AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)))::int AS v FROM tickets WHERE first_response_at IS NOT NULL AND created_at >= ${startFilter}`);
    const avgResolve = await pool.query(`SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)))::int AS v FROM tickets WHERE resolved_at IS NOT NULL AND created_at >= ${startFilter}`);
    const sat = await pool.query(`SELECT AVG(rating)::float AS v FROM ticket_satisfaction ts JOIN tickets t ON t.id=ts.ticket_id WHERE t.created_at >= ${startFilter}`);
    const categoryDist = await pool.query(`SELECT category, COUNT(*)::int AS c FROM tickets WHERE created_at >= ${startFilter} GROUP BY category ORDER BY c DESC`);
    const staffRank = await pool.query(
      `SELECT u.username, COUNT(DISTINCT tr.ticket_id) AS tickets,
              (SELECT AVG(ts2.rating)::float FROM ticket_satisfaction ts2 JOIN tickets t2 ON t2.id=ts2.ticket_id WHERE t2.assignee_id=u.id) AS satisfaction
       FROM users u LEFT JOIN ticket_replies tr ON tr.user_id=u.id AND tr.is_staff=true
       WHERE u.id IN (SELECT DISTINCT assignee_id FROM tickets WHERE assignee_id IS NOT NULL)
       GROUP BY u.id, u.username ORDER BY tickets DESC LIMIT 10`);
    const totalCount = Number(totalQ.rows[0]?.c ?? 0);
    return { code: 0, data: { total: totalCount, resolved: Number(resolvedQ.rows[0]?.c ?? 0), resolve_rate: totalCount > 0 ? Math.round((Number(resolvedQ.rows[0]?.c ?? 0) / totalCount) * 10000) / 100 : 0, avg_response_seconds: avgResp.rows[0]?.v ?? 0, avg_resolve_seconds: avgResolve.rows[0]?.v ?? 0, satisfaction: sat.rows[0]?.v ?? 0, category_distribution: categoryDist.rows, staff_ranking: staffRank.rows.map((r: any) => ({ ...r, satisfaction: Number(r.satisfaction ?? 0) })) }, message: "ok" };
  });

  // 10. 导出
  app.get("/admin/tickets/export", { onRequest: [admin] }, async (req, reply) => {
    const rows = await pool.query(`SELECT ticket_no, title, category, priority, status, created_at::date AS d FROM tickets WHERE is_spam=false ORDER BY created_at DESC LIMIT 1000`);
    let csv = "工单号,标题,分类,优先级,状态,日期\n";
    for (const r of rows.rows) {
      csv += `${r.ticket_no},${String(r.title).replace(/,/g, "，")},${r.category},${r.priority},${r.status},${r.d}\n`;
    }
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", "attachment; filename=tickets.csv");
    return reply.send("\uFEFF" + csv);
  });
}
