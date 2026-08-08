import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index";
import { balanceAlertRules } from "../db/schema/balance-alert-rules";

/**
 * 管理端余额预警 对齐 SPEC-§20
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

export function adminBalanceAlertRoutes(app: FastifyInstance) {
  const admin = requireAdmin(app);

  // 预警规则列表
  app.get("/admin/balance-alerts/rules", { onRequest: [admin] }, async (req) => {
    const q = req.query as any;
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.limit ?? 20), 50);
    const offset = (page - 1) * pageSize;
    let where = "WHERE 1=1";
    const params: any[] = [];
    const pp = (v: any) => { params.push(v); return `$${params.length}`; };
    if (q.enabled !== undefined) where += ` AND r.enabled = ${pp(q.enabled === "true" || q.enabled === true)}`;
    if (q.userId) where += ` AND r.user_id = ${pp(Number(q.userId))}`;
    const rows = await pool.query(
      `SELECT r.*, u.email, u.username
       FROM balance_alert_rules r LEFT JOIN users u ON u.id=r.user_id ${where}
       ORDER BY r.created_at DESC LIMIT ${pp(pageSize)} OFFSET ${pp(offset)}`, params);
    const total = await pool.query(
      `SELECT COUNT(*)::int AS c FROM balance_alert_rules r ${where}`,
      params.slice(0, params.length - 2),
    );
    return { code: 0, data: { list: rows.rows, pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.c ?? 0) } }, message: "ok" };
  });

  // 创建预警规则
  app.post("/admin/balance-alerts/rules", { onRequest: [admin] }, async (req, reply) => {
    const b = req.body as any;
    if (!b.name || b.thresholdPercent === undefined) {
      return reply.code(400).send({ code: 400, error: "BAD_PARAMS", message: "缺少 name/thresholdPercent" });
    }
    const r = await db.insert(balanceAlertRules).values({
      name: b.name,
      userId: b.userId ?? null,
      thresholdPercent: Number(b.thresholdPercent),
      channel: b.channel ?? "both",
      enabled: b.enabled !== undefined ? b.enabled : true,
    }).returning();
    return { code: 0, data: r[0], message: "已创建" };
  });

  // 预警记录（日志）
  app.get("/admin/balance-alerts/logs", { onRequest: [admin] }, async (req) => {
    const q = req.query as any;
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.limit ?? 20), 50);
    const offset = (page - 1) * pageSize;
    let where = "WHERE 1=1";
    const params: any[] = [];
    const pp = (v: any) => { params.push(v); return `$${params.length}`; };
    if (q.userId) where += ` AND l.user_id = ${pp(Number(q.userId))}`;
    if (q.channel) where += ` AND l.alert_channel = ${pp(q.channel)}`;
    const rows = await pool.query(
      `SELECT l.*, u.email, u.username
       FROM budget_alert_logs l LEFT JOIN users u ON u.id=l.user_id ${where}
       ORDER BY l.alerted_at DESC LIMIT ${pp(pageSize)} OFFSET ${pp(offset)}`, params);
    const total = await pool.query(
      `SELECT COUNT(*)::int AS c FROM budget_alert_logs l ${where}`,
      params.slice(0, params.length - 2),
    );
    const mapped = rows.rows.map((r: any) => ({
      ...r,
      current_spent: Number(r.current_spent),
      monthly_budget: Number(r.monthly_budget),
    }));
    return { code: 0, data: { list: mapped, pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.c ?? 0) } }, message: "ok" };
  });
}
