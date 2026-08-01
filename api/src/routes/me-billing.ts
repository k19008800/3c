import type { FastifyInstance } from "fastify";
import { pool } from "../db/index";

/**
 * 账单中心路由
 * 对齐 SPEC 账单部分（源自 ref-5.2-billing.md）
 * 数据源：billing_logs（记录 actual_cost 元 + user_id + created_at）
 * 按月聚合生成账单
 */

function requireAuth(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED", message: "未认证或凭证已失效" });
    }
  };
}

const toNum = (v: any) => (v == null ? 0 : Number(v));

export function meBillingRoutes(app: FastifyInstance) {
  const auth = requireAuth(app);

  // ===== 当前周期（本月）摘要 =====
  app.get("/me/billing/current", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);

    // 本月 1 号 0 点
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const rows = await pool.query(
      `SELECT
         COALESCE(SUM(actual_cost), 0)::float AS total_cost,
         COUNT(*)::int AS bill_count
       FROM billing_logs
       WHERE user_id = $1 AND created_at >= $2`,
      [userId, monthStart],
    );
    const totalCost = toNum(rows.rows[0]?.total_cost);

    // 本月剩余 / 下期倒计时
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysLeft = Math.max(0, Math.ceil((nextMonth.getTime() - now.getTime()) / 86400000));

    return {
      code: 0,
      data: {
        period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
        total_cost: totalCost,
        bill_count: rows.rows[0]?.bill_count ?? 0,
        days_left: daysLeft,
        next_billing_date: nextMonth.toISOString(),
      },
      message: "ok",
    };
  });

  // ===== 历史账单（按月聚合）=====
  app.get("/me/billing/history", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const rows = await pool.query(
      `SELECT
         to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
         COALESCE(SUM(actual_cost), 0)::float AS total_cost,
         COUNT(*)::int AS bill_count
       FROM billing_logs
       WHERE user_id = $1
       GROUP BY date_trunc('month', created_at)
       ORDER BY month DESC
       LIMIT 24`,
      [userId],
    );
    return {
      code: 0,
      data: { list: rows.rows },
      message: "ok",
    };
  });

  // ===== 指定月份账单详情（按模型聚合）=====
  app.get("/me/billing/history/:month", { onRequest: [auth] }, async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const { month } = req.params as { month: string }; // YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return reply.code(400).send({ code: 400, error: "BAD_MONTH", message: "月份格式应为 YYYY-MM" });
    }

    const detail = await pool.query(
      `SELECT
         COALESCE(price_source, 'unknown') AS price_source,
         COALESCE(SUM(actual_cost), 0)::float AS cost,
         COUNT(*)::int AS calls,
         COALESCE(SUM(refund_amount), 0)::float AS refund
       FROM billing_logs
       WHERE user_id = $1 AND to_char(date_trunc('month', created_at), 'YYYY-MM') = $2
       GROUP BY price_source
       ORDER BY cost DESC`,
      [userId, month],
    );

    const summary = await pool.query(
      `SELECT
         COALESCE(SUM(actual_cost), 0)::float AS total_cost,
         COALESCE(SUM(refund_amount), 0)::float AS total_refund,
         COUNT(*)::int AS total_calls
       FROM billing_logs
       WHERE user_id = $1 AND to_char(date_trunc('month', created_at), 'YYYY-MM') = $2`,
      [userId, month],
    );
    const s = summary.rows[0];

    return {
      code: 0,
      data: {
        month,
        summary: {
          total_cost: toNum(s?.total_cost),
          total_refund: toNum(s?.total_refund),
          total_calls: s?.total_calls ?? 0,
        },
        items: detail.rows,
      },
      message: "ok",
    };
  });

  // ===== 下载月份账单 CSV =====
  app.get("/me/billing/history/:month/download", { onRequest: [auth] }, async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const { month } = req.params as { month: string };
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return reply.code(400).send({ code: 400, error: "BAD_MONTH" });
    }

    const rows = await pool.query(
      `SELECT id, price_source, actual_cost, refund_amount, status, created_at
       FROM billing_logs
       WHERE user_id = $1 AND to_char(date_trunc('month', created_at), 'YYYY-MM') = $2
       ORDER BY created_at ASC`,
      [userId, month],
    );

    // 组装 CSV
    const header = ["id", "price_source", "actual_cost", "refund_amount", "status", "created_at"];
    const lines = [header.join(",")];
    for (const r of rows.rows) {
      lines.push([r.id, r.price_source, r.actual_cost, r.refund_amount, r.status, r.created_at].join(","));
    }
    const csv = "\uFEFF" + lines.join("\n"); // BOM for Excel

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="billing-${month}.csv"`);
    return reply.send(csv);
  });

  // ===== 本月消费明细（按天，供图表）=====
  app.get("/me/billing/current/daily", { onRequest: [auth] }, async (req) => {
    const userId = Number((req as any).user.sub);
    const rows = await pool.query(
      `SELECT
         to_char(created_at, 'YYYY-MM-DD') AS day,
         COALESCE(SUM(actual_cost), 0)::float AS cost
       FROM billing_logs
       WHERE user_id = $1 AND date_trunc('month', created_at) = date_trunc('month', now())
       GROUP BY day
       ORDER BY day ASC`,
      [userId],
    );
    return { code: 0, data: { list: rows.rows }, message: "ok" };
  });
}
