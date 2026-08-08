import type { FastifyInstance } from "fastify";
import { pool } from "../db/index";

/**
 * 客户生命周期管理端 对齐 SPEC-§11
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

export function adminCustomerLifecycleRoutes(app: FastifyInstance) {
  const admin = requireAdmin(app);

  /**
   * 客户阶段分布统计
   * 阶段定义：new(注册≤7天) | active(活跃) | at_risk(30天未调用) | dormant(90天未调用) | churned(180天+)
   */
  app.get("/admin/customers/lifecycle", { onRequest: [admin] }, async () => {
    const now = new Date();
    const thresholds = {
      newDays: 7,
      activeDays: 30,
      atRiskDays: 90,
      dormantDays: 180,
    };

    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE u.created_at >= $1) AS new_users,
        COUNT(*) FILTER (WHERE u.created_at < $1
          AND (last_call.last_call_at IS NULL OR last_call.last_call_at >= $2)) AS active_users,
        COUNT(*) FILTER (WHERE last_call.last_call_at < $2 AND last_call.last_call_at >= $3) AS at_risk_users,
        COUNT(*) FILTER (WHERE last_call.last_call_at < $3 AND last_call.last_call_at >= $4) AS dormant_users,
        COUNT(*) FILTER (WHERE last_call.last_call_at < $4 OR (last_call.last_call_at IS NULL AND u.created_at <= $4)) AS churned_users,
        COUNT(*) AS total_users
      FROM users u
      LEFT JOIN LATERAL (
        SELECT MAX(cl.created_at) AS last_call_at
        FROM call_logs cl
        WHERE cl.user_id = u.id
      ) last_call ON true
      WHERE u.role = 'user'
    `, [
      new Date(now.getTime() - thresholds.newDays * 86400_000),
      new Date(now.getTime() - thresholds.activeDays * 86400_000),
      new Date(now.getTime() - thresholds.atRiskDays * 86400_000),
      new Date(now.getTime() - thresholds.dormantDays * 86400_000),
    ]);

    const r = result.rows[0] ?? {};
    const stages = [
      { stage: "new", label: "新用户", count: Number(r.new_users ?? 0) },
      { stage: "active", label: "活跃用户", count: Number(r.active_users ?? 0) },
      { stage: "at_risk", label: "流失预警", count: Number(r.at_risk_users ?? 0) },
      { stage: "dormant", label: "休眠用户", count: Number(r.dormant_users ?? 0) },
      { stage: "churned", label: "已流失", count: Number(r.churned_users ?? 0) },
    ];

    return { code: 0, data: { stages, total: Number(r.total_users ?? 0), thresholds }, message: "ok" };
  });

  /**
   * 转化漏斗数据
   * 注册 → 首次调用 → 首次充值 → 二次充值 → 活跃用户
   */
  app.get("/admin/customers/lifecycle/funnel", { onRequest: [admin] }, async () => {
    const result = await pool.query(`
      SELECT
        COUNT(*) AS registered,
        COUNT(*) FILTER (WHERE has_call = true) AS first_call,
        COUNT(*) FILTER (WHERE has_recharge = true) AS first_recharge,
        COUNT(*) FILTER (WHERE recharge_count >= 2) AS second_recharge,
        COUNT(*) FILTER (WHERE call_count >= 10) AS active_user
      FROM (
        SELECT
          u.id,
          COALESCE(cs.call_count, 0) AS call_count,
          COALESCE(cs.call_count, 0) > 0 AS has_call,
          COALESCE(rs.recharge_count, 0) AS recharge_count,
          COALESCE(rs.recharge_count, 0) > 0 AS has_recharge
        FROM users u
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS call_count FROM call_logs cl WHERE cl.user_id = u.id
        ) cs ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS recharge_count
          FROM recharge_orders ro
          WHERE ro.user_id = u.id AND ro.status = 'paid'
        ) rs ON true
        WHERE u.role = 'user'
      ) sub
    `);

    const r = result.rows[0] ?? {};
    const registered = Number(r.registered ?? 0);

    const funnel = [
      { stage: "registered", label: "注册用户", count: registered, rate: 100 },
      { stage: "first_call", label: "首次调用", count: Number(r.first_call ?? 0), rate: registered > 0 ? Math.round((Number(r.first_call) / registered) * 100) : 0 },
      { stage: "first_recharge", label: "首次充值", count: Number(r.first_recharge ?? 0), rate: registered > 0 ? Math.round((Number(r.first_recharge) / registered) * 100) : 0 },
      { stage: "second_recharge", label: "二次充值", count: Number(r.second_recharge ?? 0), rate: registered > 0 ? Math.round((Number(r.second_recharge) / registered) * 100) : 0 },
      { stage: "active_user", label: "活跃用户(≥10次调用)", count: Number(r.active_user ?? 0), rate: registered > 0 ? Math.round((Number(r.active_user) / registered) * 100) : 0 },
    ];

    return { code: 0, data: { funnel }, message: "ok" };
  });
}
