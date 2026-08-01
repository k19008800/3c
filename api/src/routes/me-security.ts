import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, pool } from "../db/index";
import { users } from "../db/schema/users";
import { apiKeys } from "../db/schema/api-keys";
import { userBudgetSettings, budgetBlockLogs } from "../db/schema/user-budget";
import { keyPermissionChanges } from "../db/schema/key-permission-changes";
import { generateTwoFactorSetup, verifyTotp, generateRecoveryCodes, remainingRecoveryCodes } from "../services/two-factor";
import { getOrCreateBudget, unblockUser } from "../services/budget-engine";

/**
 * 用户端安全与预算 对齐 SPEC-§20
 * 20.1 预算设置 / 20.2 2FA / 20.3 设备 / 20.4 Key权限 / 20.5 登录异常
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

export function meSecurityRoutes(app: FastifyInstance) {
  const auth = requireAuth(app);
  const uid = (req: any) => Number((req as any).user.sub);

  // ============ §20.1 预算设置 ============
  app.get("/me/budget/settings", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const s = await getOrCreateBudget(userId);
    return { code: 0, data: { ...s, monthly_budget: Number(s.monthlyBudget), daily_budget: Number(s.dailyBudget), current_month_spent: Number(s.currentMonthSpent), current_day_spent: Number(s.currentDaySpent) }, message: "ok" };
  });

  app.put("/me/budget/settings", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const b = req.body as any;
    const s = await getOrCreateBudget(userId);
    const monthlyBudget = b.monthlyBudget !== undefined ? String(b.monthlyBudget) : s.monthlyBudget;
    const dailyBudget = b.dailyBudget !== undefined ? String(b.dailyBudget) : s.dailyBudget;
    const budgetType = b.budgetType ?? s.budgetType;
    const autoBlock = b.autoBlock !== undefined ? b.autoBlock : s.autoBlock;
    const exemptKeys = b.exemptKeys !== undefined ? JSON.stringify(b.exemptKeys || []) : s.exemptKeys;
    const alertThresholds = b.alertThresholds !== undefined ? (Array.isArray(b.alertThresholds) ? b.alertThresholds.join(",") : String(b.alertThresholds)) : s.alertThresholds;
    // 若降低预算且当前消费已超新预算 → 立即熔断
    const currentMonthSpent = Number(s.currentMonthSpent);
    const newMonthly = Number(monthlyBudget);
    let blocked = s.blocked;
    if (newMonthly > 0 && budgetType === "hard" && autoBlock && currentMonthSpent >= newMonthly) {
      blocked = true;
      await db.update(userBudgetSettings).set({ blocked: true, blockedAt: new Date(), updatedAt: new Date() }).where(eq(userBudgetSettings.id, s.id));
      await db.insert(budgetBlockLogs).values({ userId, budgetSettingsId: s.id, action: "blocked", reason: "降低预算超限触发熔断", previousMonthlyBudget: s.monthlyBudget, newMonthlyBudget: monthlyBudget });
    }
    await db.update(userBudgetSettings).set({ monthlyBudget, dailyBudget, budgetType, autoBlock, exemptKeys, alertThresholds, blocked, periodStart: s.periodStart ?? new Date(), updatedAt: new Date() }).where(eq(userBudgetSettings.id, s.id));
    const upd = await db.select().from(userBudgetSettings).where(eq(userBudgetSettings.id, s.id)).limit(1);
    return { code: 0, data: { ...upd[0]!, monthly_budget: Number(upd[0]!.monthlyBudget), daily_budget: Number(upd[0]!.dailyBudget) }, message: "保存成功" };
  });

  app.get("/me/budget/status", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const s = await getOrCreateBudget(userId);
    const monthlyBudget = Number(s.monthlyBudget);
    const dailyBudget = Number(s.dailyBudget);
    const monthSpent = Number(s.currentMonthSpent);
    const daySpent = Number(s.currentDaySpent);
    const spentPercent = monthlyBudget > 0 ? Math.round((monthSpent / monthlyBudget) * 10000) / 100 : 0;
    const dailyPercent = dailyBudget > 0 ? Math.round((daySpent / dailyBudget) * 10000) / 100 : 0;
    // 预估本月消费
    const day = new Date().getDate();
    const estimated = day > 0 ? Math.round((monthSpent / day) * 30 * 100) / 100 : 0;
    const remainingDays = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate();
    return { code: 0, data: { monthly_budget: monthlyBudget, current_month_spent: monthSpent, spent_percent: spentPercent, daily_budget: dailyBudget, current_day_spent: daySpent, daily_percent: dailyPercent, blocked: !!s.blocked, blocked_at: s.blockedAt, remaining_days: remainingDays, estimated_month_spent: estimated }, message: "ok" };
  });

  app.post("/me/budget/unblock", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const b = req.body as any;
    await unblockUser(userId, userId, "unblocked", b.reason ?? "用户手动解除");
    return { code: 0, data: { success: true }, message: "已解除熔断" };
  });

  app.get("/me/budget/alerts", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const rows = await pool.query(
      `SELECT * FROM budget_alert_logs WHERE user_id=$1 ORDER BY alerted_at DESC LIMIT 50`, [userId]);
    return { code: 0, data: { list: rows.rows.map(r => ({ ...r, current_spent: Number(r.current_spent), monthly_budget: Number(r.monthly_budget) })) }, message: "ok" };
  });

  // ============ §20.2 双因素认证 ============
  app.get("/auth/2fa/status", { onRequest: [auth] }, async (req, reply) => {
    const userId = uid(req);
    const u = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!u) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const remain = await remainingRecoveryCodes(userId);
    return { code: 0, data: { enabled: !!u.twoFactorEnabled, verified: !!u.twoFactorVerified, enabled_at: u.twoFactorEnabledAt, has_recovery_codes: remain > 0, remaining_recovery_codes: remain }, message: "ok" };
  });

  app.post("/auth/2fa/setup", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const u = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    const { secret, otpauth, manualKey } = generateTwoFactorSetup(u!.email);
    // 暂存 secret（未启用，verify 通过后才落库）
    await db.update(users).set({ twoFactorSecret: secret }).where(eq(users.id, userId));
    return { code: 0, data: { secret, otpauth, manual_key: manualKey }, message: "ok" };
  });

  app.post("/auth/2fa/verify", { onRequest: [auth] }, async (req, reply) => {
    const userId = uid(req);
    const { code } = req.body as { code?: string };
    const u = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!u!.twoFactorSecret) return reply.code(400).send({ code: 400, error: "TWO_FACTOR_INVALID", message: "请先初始化 2FA" });
    if (!verifyTotp(u!.twoFactorSecret, code ?? "")) return reply.code(400).send({ code: 400, error: "TWO_FACTOR_INVALID", message: "验证码错误" });
    await db.update(users).set({ twoFactorEnabled: true, twoFactorVerified: true, twoFactorEnabledAt: new Date(), twoFactorFailedAttempts: 0 }).where(eq(users.id, userId));
    const codes = await generateRecoveryCodes(userId);
    // 记录操作日志
    await pool.query(`INSERT INTO operation_logs (user_id, action, detail, created_at) VALUES ($1,'2fa_enable','启用双因素认证',NOW())`, [userId]);
    return { code: 0, data: { success: true, recovery_codes: codes }, message: "2FA 已启用" };
  });

  app.post("/auth/2fa/disable", { onRequest: [auth] }, async (req, reply) => {
    const userId = uid(req);
    const { code } = req.body as { code?: string };
    const u = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!verifyTotp(u!.twoFactorSecret ?? "", code ?? "")) return reply.code(400).send({ code: 400, error: "TWO_FACTOR_INVALID", message: "验证码错误" });
    await db.update(users).set({ twoFactorEnabled: false, twoFactorVerified: false, twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorFailedAttempts: 0 }).where(eq(users.id, userId));
    await pool.query(`UPDATE user_recovery_codes SET used=true, used_at=NOW() WHERE user_id=$1 AND used=false`, [userId]);
    await pool.query(`INSERT INTO operation_logs (user_id, action, detail, created_at) VALUES ($1,'2fa_disable','禁用双因素认证',NOW())`, [userId]);
    return { code: 0, data: { success: true }, message: "2FA 已禁用" };
  });

  app.post("/auth/2fa/recovery-codes", { onRequest: [auth] }, async (req, reply) => {
    const userId = uid(req);
    const { code } = req.body as { code?: string };
    const u = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!verifyTotp(u!.twoFactorSecret ?? "", code ?? "")) return reply.code(400).send({ code: 400, error: "TWO_FACTOR_INVALID", message: "验证码错误" });
    const codes = await generateRecoveryCodes(userId);
    return { code: 0, data: { recovery_codes: codes }, message: "恢复码已重新生成" };
  });

  // ============ §20.3 设备管理 ============
  app.get("/me/devices", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const rows = await pool.query(
      `SELECT * FROM user_devices WHERE user_id=$1 AND is_active=true ORDER BY last_active_at DESC LIMIT 50`, [userId]);
    const fingerprint = req.headers["x-device-fingerprint"] ?? "";
    return { code: 0, data: { devices: rows.rows.map(r => ({ ...r, is_current: r.is_current ? true : (fingerprint && r.fingerprint === fingerprint) })), total: rows.rowCount }, message: "ok" };
  });

  app.post("/me/devices/:id/logout", { onRequest: [auth] }, async (req, reply) => {
    const userId = uid(req);
    const id = Number((req.params as any).id);
    const r = await pool.query(`UPDATE user_devices SET is_active=false, logged_out_at=NOW(), logged_out_by='user' WHERE id=$1 AND user_id=$2 RETURNING id`, [id, userId]);
    if (r.rowCount === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { success: true }, message: "已登出该设备" };
  });

  app.post("/me/devices/logout-all", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const fp = req.headers["x-device-fingerprint"] ?? "";
    const r = await pool.query(
      `UPDATE user_devices SET is_active=false, logged_out_at=NOW(), logged_out_by='user'
       WHERE user_id=$1 AND is_active=true AND (fingerprint IS NULL OR fingerprint <> $2) RETURNING id`,
      [userId, String(fp)]);
    return { code: 0, data: { success: true, logged_out_count: r.rowCount }, message: "已登出其他设备" };
  });

  app.post("/me/devices/:id/trust", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const id = Number((req.params as any).id);
    await pool.query(`UPDATE user_devices SET risk_level='normal', risk_rule=NULL WHERE id=$1 AND user_id=$2`, [id, userId]);
    return { code: 0, data: { success: true }, message: "已标记为可信设备" };
  });

  // ============ §20.4 API Key 权限控制 ============
  app.get("/me/api-keys/:id/permissions", { onRequest: [auth] }, async (req, reply) => {
    const userId = uid(req);
    const id = Number((req.params as any).id);
    const k = await db.select().from(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId))).limit(1);
    if (!k[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: parseKeyPerms(k[0]), message: "ok" };
  });

  app.put("/me/api-keys/:id/permissions", { onRequest: [auth] }, async (req, reply) => {
    const userId = uid(req);
    const id = Number((req.params as any).id);
    const k = await db.select().from(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId))).limit(1);
    if (!k[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    const b = req.body as any;
    const old = parseKeyPerms(k[0]);
    const changes: any[] = [];
    const setters: any = {};
    if (b.modelPermissions !== undefined) { setters.modelWhitelist = JSON.stringify(b.modelPermissions); changes.push({ field: "modelPermissions", oldValue: old.model_permissions, newValue: b.modelPermissions }); }
    if (b.ipWhitelist !== undefined) { setters.ipWhitelist = JSON.stringify(b.ipWhitelist); changes.push({ field: "ipWhitelist", oldValue: old.ip_whitelist, newValue: b.ipWhitelist }); }
    if (b.domainWhitelist !== undefined) { setters.domainWhitelist = JSON.stringify(b.domainWhitelist); changes.push({ field: "domainWhitelist", oldValue: old.domain_whitelist, newValue: b.domainWhitelist }); }
    if (b.dailyTokenLimit !== undefined) { setters.dailyTokenLimit = Number(b.dailyTokenLimit); changes.push({ field: "dailyTokenLimit", oldValue: old.daily_token_limit, newValue: b.dailyTokenLimit }); }
    if (b.dailyCallLimit !== undefined) { setters.dailyCallLimit = Number(b.dailyCallLimit); changes.push({ field: "dailyCallLimit", oldValue: old.daily_call_limit, newValue: b.dailyCallLimit }); }
    if (Object.keys(setters).length) {
      await db.update(apiKeys).set({ ...setters, updatedAt: new Date() }).where(eq(apiKeys.id, id));
      for (const c of changes) {
        await db.insert(keyPermissionChanges).values({ keyId: id, userId, field: c.field, oldValue: JSON.stringify(c.oldValue), newValue: JSON.stringify(c.newValue) });
      }
    }
    const upd = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    return { code: 0, data: parseKeyPerms(upd[0]), message: "权限已更新" };
  });

  app.get("/me/api-keys/:id/permissions/history", { onRequest: [auth] }, async (req) => {
    const id = Number((req.params as any).id);
    const rows = await pool.query(
      `SELECT * FROM key_permission_changes WHERE key_id=$1 ORDER BY changed_at DESC LIMIT 20`, [id]);
    return { code: 0, data: { list: rows.rows }, message: "ok" };
  });

  // ============ §20.5 登录历史 + 安全汇总 ============
  app.get("/me/login-history", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const q = req.query as any;
    const page = Math.max(Number(q.page ?? 1), 1);
    const limit = Math.min(Number(q.limit ?? 20), 100);
    const offset = (page - 1) * limit;
    let where = "WHERE user_id=$1";
    if (q.riskLevel) where += ` AND risk_level=${Number(q.riskLevel) ? q.riskLevel : `'${q.riskLevel}'`}`;
    const rows = await pool.query(`SELECT * FROM login_history ${where} ORDER BY login_at DESC LIMIT $2 OFFSET $3`, [userId, limit, offset]);
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM login_history ${where}`, [userId]);
    return { code: 0, data: { records: rows.rows, total: total.rows[0]?.c ?? 0 }, message: "ok" };
  });

  app.post("/me/login-history/:id/confirm", { onRequest: [auth] }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const r = await pool.query(`UPDATE login_history SET confirmed_by_user=true, confirmed_at=NOW() WHERE id=$1 RETURNING id`, [id]);
    if (r.rowCount === 0) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    return { code: 0, data: { success: true }, message: "已确认为本人" };
  });

  app.post("/me/login-history/:id/report", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    // 紧急响应：登出其他设备 + 记录安全事件
    await pool.query(`UPDATE user_devices SET is_active=false, logged_out_at=NOW(), logged_out_by='user' WHERE user_id=$1 AND is_active=true`, [userId]);
    await pool.query(`INSERT INTO security_events (user_id, type, detail, ip, created_at) VALUES ($1,'account_compromised','用户报告非本人登录', $2, NOW())`, [userId, req.ip]);
    return { code: 0, data: { success: true, action_taken: ["登出所有设备", "记录安全事件", "建议修改密码"] }, message: "已采取措施保护账户" };
  });

  app.get("/me/security/summary", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const r = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM login_history WHERE user_id=$1 AND login_at >= NOW() - interval '7 days' AND risk_level <> 'normal')::int AS anomaly,
         (SELECT COUNT(*) FROM login_history WHERE user_id=$1 AND is_blocked=true)::int AS blocked,
         (SELECT two_factor_enabled FROM users WHERE id=$1)::bool AS twofa`, [userId]);
    const daily = await pool.query(
      `SELECT to_char(login_at::date,'MM-DD') AS d, COUNT(*)::int AS c FROM login_history
       WHERE user_id=$1 AND risk_level<>'normal' AND login_at >= NOW()-interval '7 days' GROUP BY d ORDER BY d`, [userId]);
    const recent = await pool.query(
      `SELECT id, login_at, city, risk_rule, is_blocked, confirmed_by_user FROM login_history
       WHERE user_id=$1 AND risk_level<>'normal' ORDER BY login_at DESC LIMIT 5`, [userId]);
    return { code: 0, data: { anomaly_count: r.rows[0]?.anomaly ?? 0, blocked_count: r.rows[0]?.blocked ?? 0, two_factor_enabled: !!r.rows[0]?.twofa, daily_counts: daily.rows, recent_events: recent.rows }, message: "ok" };
  });
}

function parseKeyPerms(k: any) {
  const j = (s: string | null, def: any) => { try { return s ? JSON.parse(s) : def; } catch { return def; } };
  return {
    model_permissions: j(k.modelWhitelist, []),
    ip_whitelist: j(k.ipWhitelist, []),
    domain_whitelist: j(k.domainWhitelist, []),
    daily_token_limit: Number(k.dailyTokenLimit ?? 0),
    daily_call_limit: Number(k.dailyCallLimit ?? 0),
    daily_cost_limit: Number(k.dailyCostLimit ?? 0),
  };
}
