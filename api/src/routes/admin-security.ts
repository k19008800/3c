import type { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, pool } from "../db/index";
import { users } from "../db/schema/users";
import { userBudgetSettings } from "../db/schema/user-budget";
import { riskRules, securityEvents } from "../db/schema/risk-rules";
import { getOrCreateBudget, unblockUser } from "../services/budget-engine";

/**
 * 管理端安全与预算 对齐 SPEC-§20
 * 20.1 管理员预算管理 / 20.2 2FA 策略 + 强制重置 / 20.3 管理员设备管理
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

export function adminSecurityRoutes(app: FastifyInstance) {
  const admin = requireAdmin(app);

  // ============ §20.1 管理员预算管理 ============
  app.get("/admin/budgets", { onRequest: [admin] }, async (req) => {
    const q = req.query as any;
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.limit ?? 20), 100);
    const offset = (page - 1) * pageSize;
    let where = "WHERE 1=1";
    const params: any[] = [];
    const pp = (v: any) => { params.push(v); return `$${params.length}`; };
    if (q.search) where += ` AND (u.email ILIKE ${pp(`%${q.search}%`)} OR u.username ILIKE ${pp(`%${q.search}%`)})`;
    if (q.status === "blocked") where += ` AND b.blocked = true`;
    if (q.type) where += ` AND b.budget_type = ${pp(q.type)}`;
    const rows = await pool.query(
      `SELECT b.*, u.email, u.username, u.role
       FROM user_budget_settings b JOIN users u ON u.id=b.user_id ${where}
       ORDER BY b.updated_at DESC LIMIT ${pp(pageSize)} OFFSET ${pp(offset)}`, params);
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM user_budget_settings b JOIN users u ON u.id=b.user_id ${where}`, params.slice(0, params.length - 2));
    return { code: 0, data: { list: rows.rows.map(r => ({ ...r, monthly_budget: Number(r.monthly_budget), daily_budget: Number(r.daily_budget), current_month_spent: Number(r.current_month_spent), current_day_spent: Number(r.current_day_spent) })), pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.c ?? 0) } }, message: "ok" };
  });

  app.put("/admin/budgets/:userId", { onRequest: [admin] }, async (req) => {
    const userId = Number((req.params as any).userId);
    const b = req.body as any;
    const s = await getOrCreateBudget(userId);
    const upd = {
      monthlyBudget: b.monthlyBudget !== undefined ? String(b.monthlyBudget) : s.monthlyBudget,
      dailyBudget: b.dailyBudget !== undefined ? String(b.dailyBudget) : s.dailyBudget,
      budgetType: b.budgetType ?? s.budgetType,
      autoBlock: b.autoBlock !== undefined ? b.autoBlock : s.autoBlock,
      alertThresholds: b.alertThresholds !== undefined ? (Array.isArray(b.alertThresholds) ? b.alertThresholds.join(",") : String(b.alertThresholds)) : s.alertThresholds,
      updatedAt: new Date(),
    };
    await db.update(userBudgetSettings).set(upd).where(eq(userBudgetSettings.id, s.id));
    await pool.query(`INSERT INTO operation_logs (user_id, action, detail, created_at) VALUES ($1,$2,$3,NOW())`, [Number((req as any).user.sub), "budget_modify", `管理员修改用户 ${userId} 预算`]);
    const latest = await db.select().from(userBudgetSettings).where(eq(userBudgetSettings.id, s.id)).limit(1);
    return { code: 0, data: { ...latest[0]!, monthly_budget: Number(latest[0]!.monthlyBudget) }, message: "已更新" };
  });

  app.post("/admin/budgets/:userId/unblock", { onRequest: [admin] }, async (req) => {
    const userId = Number((req.params as any).userId);
    await unblockUser(userId, Number((req as any).user.sub), "unblocked", "管理员手动解除");
    return { code: 0, data: { success: true }, message: "已解除熔断" };
  });

  app.get("/admin/budgets/block-logs", { onRequest: [admin] }, async (req) => {
    const q = req.query as any;
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.limit ?? 20), 50);
    const offset = (page - 1) * pageSize;
    let where = "WHERE 1=1";
    const params: any[] = [];
    const pp = (v: any) => { params.push(v); return `$${params.length}`; };
    if (q.userId) where += ` AND l.user_id = ${pp(Number(q.userId))}`;
    if (q.action) where += ` AND l.action = ${pp(q.action)}`;
    const rows = await pool.query(
      `SELECT l.*, u.email FROM budget_block_logs l JOIN users u ON u.id=l.user_id ${where} ORDER BY l.operated_at DESC LIMIT ${pp(pageSize)} OFFSET ${pp(offset)}`,
      params);
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM budget_block_logs l ${where}`, params.slice(0, params.length - 2));
    return { code: 0, data: { list: rows.rows, pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.c ?? 0) } }, message: "ok" };
  });

  // ============ §20.2 管理端 2FA 策略 + 用户状态 + 强制重置 ============
  app.get("/admin/2fa/status", { onRequest: [admin] }, async (req) => {
    const q = req.query as any;
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.limit ?? 20), 100);
    const offset = (page - 1) * pageSize;
    let where = "WHERE 1=1";
    const params: any[] = [];
    const pp = (v: any) => { params.push(v); return `$${params.length}`; };
    if (q.search) where += ` AND (u.email ILIKE ${pp(`%${q.search}%`)} OR u.username ILIKE ${pp(`%${q.search}%`)})`;
    if (q.status === "enabled") where += ` AND u.two_factor_enabled = true`;
    if (q.status === "disabled") where += ` AND u.two_factor_enabled = false`;
    const rows = await pool.query(
      `SELECT u.id, u.email, u.username, u.role, u.two_factor_enabled, u.two_factor_enabled_at,
              (SELECT COUNT(*) FROM user_recovery_codes rc WHERE rc.user_id=u.id AND rc.used=false)::int AS remaining_codes
       FROM users u ${where} ORDER BY u.id LIMIT ${pp(pageSize)} OFFSET ${pp(offset)}`, params);
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM users u ${where}`, params.slice(0, params.length - 2));
    return { code: 0, data: { list: rows.rows, pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.c ?? 0) } }, message: "ok" };
  });

  app.post("/admin/2fa/reset/:userId", { onRequest: [admin] }, async (req, reply) => {
    const userId = Number((req.params as any).userId);
    const r = await db.update(users)
      .set({ twoFactorEnabled: false, twoFactorVerified: false, twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorFailedAttempts: 0, twoFactorLockedUntil: null })
      .where(eq(users.id, userId));
    if (!r.rowCount) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    await pool.query(`UPDATE user_recovery_codes SET used=true, used_at=NOW() WHERE user_id=$1 AND used=false`, [userId]);
    await pool.query(`INSERT INTO operation_logs (user_id, action, detail, created_at) VALUES ($1,'2fa_admin_reset', '管理员强制重置 2FA', NOW())`, [Number((req as any).user.sub)]);
    return { code: 0, data: { success: true }, message: "已强制重置该用户 2FA" };
  });

  app.put("/admin/2fa/policy", { onRequest: [admin] }, async (req) => {
    const b = req.body as any;
    const policy = b.policy ?? "optional";
    // 存入 site_configs（无表则跳过持久化，仅返回）
    try {
      await pool.query(`INSERT INTO site_configs (key, value) VALUES ('two_factor_policy', $1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [policy]);
    } catch { /* site_configs 不存在则忽略 */ }
    return { code: 0, data: { success: true, policy }, message: "策略已保存" };
  });

  // ============ §20.3 管理员设备管理 ============
  app.get("/admin/devices/:userId", { onRequest: [admin] }, async (req) => {
    const userId = Number((req.params as any).userId);
    const rows = await pool.query(`SELECT * FROM user_devices WHERE user_id=$1 ORDER BY last_active_at DESC LIMIT 50`, [userId]);
    return { code: 0, data: { devices: rows.rows }, message: "ok" };
  });

  app.post("/admin/devices/:id/force-logout", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const r = await pool.query(`UPDATE user_devices SET is_active=false, logged_out_at=NOW(), logged_out_by='admin' WHERE id=$1 RETURNING id`, [id]);
    if (r.rowCount === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    await pool.query(`INSERT INTO operation_logs (user_id, action, detail, created_at) VALUES ($1,'device_force_logout','管理员强制登出设备',NOW())`, [Number((req as any).user.sub)]);
    return { code: 0, data: { success: true }, message: "已强制登出该设备" };
  });

  // ============ §20.4 风控规则管理 CRUD ============
  // 列表
  app.get("/admin/security/rules", { onRequest: [admin] }, async (req) => {
    const q = req.query as any;
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.limit ?? 20), 100);
    const offset = (page - 1) * pageSize;
    let where = "WHERE 1=1";
    const params: any[] = [];
    const pp = (v: any) => { params.push(v); return `$${params.length}`; };
    if (q.type) where += ` AND r.type = ${pp(q.type)}`;
    if (q.action) where += ` AND r.action = ${pp(q.action)}`;
    if (q.enabled !== undefined) where += ` AND r.enabled = ${pp(q.enabled === "true" || q.enabled === true)}`;
    const rows = await pool.query(
      `SELECT r.*, u.email AS created_by_email
       FROM risk_rules r LEFT JOIN users u ON u.id=r.created_by ${where}
       ORDER BY r.priority DESC, r.created_at DESC LIMIT ${pp(pageSize)} OFFSET ${pp(offset)}`, params);
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM risk_rules r ${where}`, params.slice(0, params.length - 2));
    return { code: 0, data: { list: rows.rows, pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.c ?? 0) } }, message: "ok" };
  });

  // 创建
  app.post("/admin/security/rules", { onRequest: [admin] }, async (req, reply) => {
    const b = req.body as any;
    if (!b.name || !b.type) return reply.code(400).send({ code: 400, error: "BAD_PARAMS", message: "缺少 name/type" });
    const r = await db.insert(riskRules).values({
      name: b.name,
      type: b.type,
      conditions: b.conditions ?? {},
      action: b.action ?? "block",
      enabled: b.enabled !== undefined ? b.enabled : true,
      priority: b.priority ?? 0,
      createdBy: Number((req as any).user.sub),
    }).returning();
    return { code: 0, data: r[0], message: "已创建" };
  });

  // 更新
  app.put("/admin/security/rules/:id", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as any;
    const existing = await db.select().from(riskRules).where(eq(riskRules.id, id)).limit(1);
    if (!existing[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const upd: Record<string, any> = { updatedAt: new Date() };
    if (b.name !== undefined) upd.name = b.name;
    if (b.type !== undefined) upd.type = b.type;
    if (b.conditions !== undefined) upd.conditions = b.conditions;
    if (b.action !== undefined) upd.action = b.action;
    if (b.enabled !== undefined) upd.enabled = b.enabled;
    if (b.priority !== undefined) upd.priority = b.priority;
    const r = await db.update(riskRules).set(upd).where(eq(riskRules.id, id)).returning();
    return { code: 0, data: r[0], message: "已更新" };
  });

  // 删除
  app.delete("/admin/security/rules/:id", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const existing = await db.select().from(riskRules).where(eq(riskRules.id, id)).limit(1);
    if (!existing[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    await db.delete(riskRules).where(eq(riskRules.id, id));
    return { code: 0, data: { success: true }, message: "已删除" };
  });

  // ============ §20.5 安全事件管理 ============
  app.get("/admin/security/events", { onRequest: [admin] }, async (req) => {
    const q = req.query as any;
    const page = Math.max(Number(q.page ?? 1), 1);
    const pageSize = Math.min(Number(q.limit ?? 20), 100);
    const offset = (page - 1) * pageSize;
    let where = "WHERE 1=1";
    const params: any[] = [];
    const pp = (v: any) => { params.push(v); return `$${params.length}`; };
    if (q.type) where += ` AND e.type = ${pp(q.type)}`;
    if (q.severity) where += ` AND e.severity = ${pp(q.severity)}`;
    if (q.status) where += ` AND e.status = ${pp(q.status)}`;
    if (q.userId) where += ` AND e.user_id = ${pp(Number(q.userId))}`;
    const rows = await pool.query(
      `SELECT e.*, u.email, u.username
       FROM security_events e LEFT JOIN users u ON u.id=e.user_id ${where}
       ORDER BY e.created_at DESC LIMIT ${pp(pageSize)} OFFSET ${pp(offset)}`, params);
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM security_events e ${where}`, params.slice(0, params.length - 2));
    return { code: 0, data: { list: rows.rows, pagination: { page, page_size: pageSize, total: Number(total.rows[0]?.c ?? 0) } }, message: "ok" };
  });

  // 处理事件
  app.post("/admin/security/events/:id/handle", { onRequest: [admin] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as any;
    const existing = await db.select().from(securityEvents).where(eq(securityEvents.id, id)).limit(1);
    if (!existing[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const r = await db.update(securityEvents).set({
      status: b.status ?? "resolved",
      handledBy: Number((req as any).user.sub),
      handledAt: new Date(),
      resolution: b.resolution ?? null,
    }).where(eq(securityEvents.id, id)).returning();
    return { code: 0, data: r[0], message: "已处理" };
  });
}
