import type { FastifyInstance } from "fastify";
import { pool } from "../db/index";
import { listMyCustomers, getCustomerDetail, updateCustomerStatus, addContact, assignCustomer, listTags, setCustomerTags, listReminders, createReminder, completeReminder, getPerformance, listAllSalesPersons } from "../services/crm";

function requireAuth(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch { return reply.code(401).send({ code: 401, error: "UNAUTHORIZED" }); }
  };
}

export function crmRoutes(app: FastifyInstance) {
  const auth = requireAuth(app);
  const uid = (req: any) => Number((req as any).user.sub);

  // ===== 我的客户 =====
  app.get("/me/customers", { onRequest: [auth] }, async (req) => {
    const q = req.query as any;
    return { code: 0, data: await listMyCustomers(uid(req), {
      status: q.status, tag: q.tag, search: q.search, page: Number(q.page) || 1, pageSize: Number(q.page_size) || 20,
    }), message: "ok" };
  });

  app.get("/me/customers/:userId", { onRequest: [auth] }, async (req, reply) => {
    const userId = Number((req.params as any).userId);
    const detail = await getCustomerDetail(userId, uid(req));
    if (!detail) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: detail, message: "ok" };
  });

  app.post("/me/customers/:userId/assign", { onRequest: [auth], schema: { body: { type: "object", additionalProperties: true } } }, async (req) => {
    const userId = Number((req.params as any).userId);
    const r = await assignCustomer(userId, uid(req));
    return { code: 0, data: r, message: r.assigned ? (r.updated ? "已更新归属" : "已分配客户") : "已分配客户" };
  });

  app.put("/me/customers/:userId/status", { onRequest: [auth], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const userId = Number((req.params as any).userId);
    const b = req.body as { status?: string; reason?: string };
    if (!b.status) return reply.code(400).send({ code: 400, error: "MISSING_STATUS" });
    const r = await updateCustomerStatus(userId, uid(req), b.status, b.reason);
    return { code: 0, data: r, message: "状态已更新" };
  });

  app.post("/me/customers/:userId/contacts", { onRequest: [auth], schema: { body: { type: "object", additionalProperties: true } } }, async (req) => {
    const userId = Number((req.params as any).userId);
    const b = req.body as { method?: string; summary?: string; next_follow_up?: string };
    const r = await addContact(userId, uid(req), { method: b.method || "other", summary: b.summary || "", nextFollowUp: b.next_follow_up ? new Date(b.next_follow_up) : undefined });
    return { code: 0, data: r, message: "联系记录已添加" };
  });

  app.put("/me/customers/:userId/tags", { onRequest: [auth], schema: { body: { type: "object", additionalProperties: true } } }, async (req) => {
    const userId = Number((req.params as any).userId);
    const b = req.body as { tag_ids?: number[] };
    const r = await setCustomerTags(userId, uid(req), b.tag_ids || []);
    return { code: 0, data: { tags: r }, message: "标签已更新" };
  });

  // ===== 标签 =====
  app.get("/me/customer-tags", { onRequest: [auth] }, async () => {
    const tags = await listTags();
    return { code: 0, data: { list: tags }, message: "ok" };
  });

  // ===== 跟进提醒 =====
  app.get("/me/follow-reminders", { onRequest: [auth] }, async (req) => {
    const q = req.query as any;
    const list = await listReminders(uid(req), q.status);
    return { code: 0, data: { list }, message: "ok" };
  });

  app.post("/me/follow-reminders", { onRequest: [auth], schema: { body: { type: "object", additionalProperties: true } } }, async (req) => {
    const b = req.body as { user_id?: number; title?: string; description?: string; due_at?: string };
    const r = await createReminder(uid(req), { userId: b.user_id || 0, title: b.title || "", description: b.description, dueAt: new Date(b.due_at || Date.now()) });
    return { code: 0, data: r, message: "提醒已创建" };
  });

  app.post("/me/follow-reminders/:id/complete", { onRequest: [auth] }, async (req) => {
    const id = Number((req.params as any).id);
    await completeReminder(id, uid(req));
    return { code: 0, data: { ok: true }, message: "已完成" };
  });

  // ===== 业绩看板 =====
  app.get("/me/sales-performance", { onRequest: [auth] }, async (req) => {
    const q = req.query as any;
    const data = await getPerformance(uid(req), q.period_start, q.period_end);
    return { code: 0, data, message: "ok" };
  });

  // ===== 管理端 =====
  app.get("/admin/sales-persons", { onRequest: [auth] }, async () => {
    return { code: 0, data: { list: await listAllSalesPersons() }, message: "ok" };
  });

  app.get("/admin/customers", { onRequest: [auth] }, async (req) => {
    const q = req.query as any;
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Number(q.page_size) || 20);
    const offset = (page - 1) * pageSize;
    let where = "1=1";
    const params: any[] = [];
    let idx = 1;
    if (q.status) { params.push(q.status); where += " AND c.status=$" + idx++; }
    if (q.search) { params.push("%" + q.search + "%"); where += " AND (u.email ILIKE $" + idx + " OR u.username ILIKE $" + idx + ")"; idx++; }
    if (q.salesperson_id) { params.push(Number(q.salesperson_id)); where += " AND c.salesperson_id=$" + idx++; }
    const total = (await pool.query("SELECT count(*)::int c FROM customers c JOIN users u ON u.id=c.user_id WHERE " + where, params)).rows[0].c;
    const list = (await pool.query(
      "SELECT c.*, u.email, u.username, sp.email AS salesperson_email, sp.username AS salesperson_name" +
      " FROM customers c JOIN users u ON u.id=c.user_id LEFT JOIN users sp ON sp.id=c.salesperson_id" +
      " WHERE " + where + " ORDER BY c.updated_at DESC LIMIT " + pageSize + " OFFSET " + offset,
      params,
    )).rows;
    return { code: 0, data: { list, pagination: { page, page_size: pageSize, total } }, message: "ok" };
  });
}
