import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index";
import { staffTestKeys } from "../db/schema/staff-test-keys";
import { detectIntent, diagnoseUser, createTestKey, simulateCall } from "../services/smart-support";

/**
 * 智能客服辅助 + 测试工具 对齐 SPEC-§28/§27.2
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

export function adminSupportRoutes(app: FastifyInstance) {
  const admin = requireAdmin(app);

  // ===== 28.1.1 意图识别 =====
  app.post("/admin/support/assist/intent", { onRequest: [admin] }, async (req, reply) => {
    const { text } = req.body as { text?: string };
    if (!text) return reply.code(400).send({ code: 400, error: "BAD_PARAMS", message: "text 必填" });
    const r = detectIntent(text);
    return { code: 0, data: r, message: "ok" };
  });

  // ===== 28.1.3 自动诊断 =====
  app.get("/admin/support/assist/diagnose/:userId", { onRequest: [admin] }, async (req, reply) => {
    const userId = Number((req.params as any).userId);
    if (!userId) return reply.code(400).send({ code: 400, error: "BAD_PARAMS" });
    const r = await diagnoseUser(userId);
    if (!r.user) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: r, message: "ok" };
  });

  // ===== 28.2.3 临时测试 Key =====
  app.post("/admin/support/test-key", { onRequest: [admin] }, async (req) => {
    const staffId = Number((req as any).user.sub);
    const b = req.body as { associated_user_id?: number; name?: string };
    const r = await createTestKey(staffId, b.associated_user_id ? Number(b.associated_user_id) : null, b.name);
    return { code: 0, data: r, message: "测试 Key 已生成（24 小时有效）" };
  });

  app.get("/admin/support/test-keys", { onRequest: [admin] }, async (req) => {
    const q = req.query as any;
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.limit ?? 20), 50);
    const offset = (page - 1) * pageSize;
    const staffId = Number((req as any).user.sub);
    const rows = await pool.query(
      `SELECT id, staff_id, key_prefix, name, associated_user_id, token_limit, cost_limit, used_tokens, used_cost, status, expires_at, created_at
       FROM staff_test_keys WHERE staff_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [staffId, pageSize, offset]);
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM staff_test_keys WHERE staff_id=$1`, [staffId]);
    return { code: 0, data: { list: rows.rows.map((r: any) => ({ ...r, token_limit: Number(r.token_limit), used_tokens: Number(r.used_tokens), cost_limit: Number(r.cost_limit), used_cost: Number(r.used_cost) })), pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.c ?? 0) } }, message: "ok" };
  });

  app.post("/admin/support/test-key/:id/revoke", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const r = await db.update(staffTestKeys).set({ status: "revoked", revokedAt: new Date() }).where(eq(staffTestKeys.id, id));
    if (!r.rowCount) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { success: true }, message: "测试 Key 已撤销" };
  });

  // ===== 28.2.1 模拟调用 =====
  app.post("/admin/support/simulate-call", { onRequest: [admin] }, async (req, reply) => {
    const b = req.body as any;
    const userId = Number(b.userId);
    if (!userId || !b.model) return reply.code(400).send({ code: 400, error: "BAD_PARAMS", message: "userId 和 model 必填" });
    const r = await simulateCall(userId, b.model, b.messages ?? []);
    if (!r.user) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    // 记录审计
    await pool.query(`INSERT INTO operation_logs (user_id, action, detail, created_at) VALUES ($1,'simulate_call','模拟调用 user=${userId} model=${b.model}',NOW())`, [Number((req as any).user.sub)]);
    return { code: 0, data: r, message: "模拟调用环境已就绪" };
  });

  // ===== 27.2 客服绩效统计 =====
  app.get("/admin/support/stats", { onRequest: [admin] }, async (req) => {
    const q = req.query as any;
    const period = q.period ?? "month";
    const startAnchor = period === "day" ? "CURRENT_DATE" : period === "week" ? "NOW() - interval '7 days'" : "date_trunc('month', NOW())";
    // 团队概览
    const tickets = await pool.query(`SELECT COUNT(*)::int AS c FROM tickets WHERE created_at >= ${startAnchor}`);
    const chats = await pool.query(`SELECT COUNT(*)::int AS c FROM chat_sessions WHERE created_at >= ${startAnchor}`);
    const avgResp = await pool.query(`SELECT AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)))::int AS v FROM tickets WHERE first_response_at IS NOT NULL AND created_at >= ${startAnchor}`);
    const sat = await pool.query(`SELECT AVG(rating)::float AS v FROM ticket_satisfaction ts JOIN tickets t ON t.id=ts.ticket_id WHERE t.created_at >= ${startAnchor}`);
    // 客服排名（工单 + 会话 + 满意度）
    const staff = await pool.query(
      `SELECT u.id, u.username,
              (SELECT COUNT(DISTINCT tr.ticket_id) FROM ticket_replies tr WHERE tr.user_id=u.id AND tr.is_staff=true) AS tickets,
              (SELECT COUNT(*) FROM chat_messages cm WHERE cm.sender_id=u.id AND cm.sender_type='staff') AS chat_msgs,
              (SELECT AVG(ts2.rating)::float FROM ticket_satisfaction ts2 JOIN tickets t2 ON t2.id=ts2.ticket_id WHERE t2.assignee_id=u.id) AS satisfaction
       FROM users u
       WHERE u.role IN ('admin','super_admin')
       ORDER BY tickets DESC LIMIT 10`);
    return { code: 0, data: { team_overview: { tickets: Number(tickets.rows[0]?.c ?? 0), chat_sessions: Number(chats.rows[0]?.c ?? 0), avg_response_seconds: avgResp.rows[0]?.v ?? 0, satisfaction: sat.rows[0]?.v ?? 0 }, staff_ranking: staff.rows.map((r: any) => ({ username: r.username, tickets: Number(r.tickets ?? 0), chat_messages: Number(r.chat_msgs ?? 0), satisfaction: Number(r.satisfaction ?? 0) })) }, message: "ok" };
  });

  // ===== 27.3 客服操作审计 =====
  app.get("/admin/support/audit-logs", { onRequest: [admin] }, async (req) => {
    const q = req.query as any;
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.limit ?? 20), 50);
    const offset = (page - 1) * pageSize;
    let where = "WHERE 1=1";
    const params: any[] = [];
    const pp = (v: any) => { params.push(v); return `$${params.length}`; };
    if (q.operatorId) where += ` AND o.user_id=${pp(Number(q.operatorId))}`;
    if (q.action) where += ` AND o.action ILIKE ${pp(`%${q.action}%`)}`;
    const rows = await pool.query(
      `SELECT o.*, u.username FROM operation_logs o LEFT JOIN users u ON u.id=o.user_id ${where} ORDER BY o.created_at DESC LIMIT ${pp(pageSize)} OFFSET ${pp(offset)}`,
      params);
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM operation_logs o ${where}`, params.slice(0, params.length - 2));
    return { code: 0, data: { list: rows.rows, pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.c ?? 0) } }, message: "ok" };
  });
}
