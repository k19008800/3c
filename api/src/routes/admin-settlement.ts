import type { FastifyInstance } from "fastify";
import { pool } from "../db/index";
import { generateSettlementCycle, confirmSettlement, adjustSettlement } from "../services/settlement/index";

/**
 * 管理端代理结算对账路由
 * 对齐 docs/sprint-1/03-settlement-overview.md §4
 * - 全部需 admin / super_admin 权限
 */

function toNum(v: any): number {
  if (v == null) return 0;
  return Number(v);
}

export function adminSettlementRoutes(app: FastifyInstance) {
  const requireAdmin = async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED", message: "未认证或凭证已失效" });
    }
    const role = (req as any).user?.role;
    if (role !== "admin" && role !== "super_admin") {
      return reply.code(403).send({ code: 403, error: "FORBIDDEN", message: "仅管理员可操作" });
    }
  };

  // ===== 1. 结算周期列表 =====
  // GET /admin/finance/settlement-cycles
  app.get(
    "/admin/finance/settlement-cycles",
    { onRequest: [requireAdmin] },
    async (req) => {
      const query = req.query as any;
      const status = query.status as string | undefined;
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
      const offset = Math.max(0, Number(query.offset) || 0);

      let sql = `SELECT sc.*,
        (SELECT COUNT(*) FROM agent_settlements WHERE cycle_id = sc.id)::int AS total_bills,
        (SELECT COUNT(*) FROM agent_settlements WHERE cycle_id = sc.id AND status='pending')::int AS pending_bills,
        (SELECT COUNT(*) FROM agent_settlements WHERE cycle_id = sc.id AND status='settled')::int AS settled_bills
        FROM settlement_cycles sc`;
      const params: any[] = [];
      if (status && ["open", "closed", "settled"].includes(status)) {
        sql += ` WHERE sc.status = $${params.length + 1}`;
        params.push(status);
      }
      sql += " ORDER BY sc.id DESC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
      params.push(limit, offset);

      const totalR = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM settlement_cycles" + (params.length > 2 ? " WHERE status=$1" : ""),
        status && ["open", "closed", "settled"].includes(status) ? [status] : [],
      );

      const r = await pool.query(sql, params);
      return {
        code: 0,
        data: { rows: r.rows, total: totalR.rows[0]?.cnt ?? 0 },
        message: "ok",
      };
    },
  );

  // ===== 2. 手动关账 =====
  // POST /admin/finance/settlement-cycles/generate
  app.post(
    "/admin/finance/settlement-cycles/generate",
    {
      onRequest: [requireAdmin],
      schema: {
        body: {
          type: "object",
          required: ["periodStart", "periodEnd"],
          properties: {
            periodStart: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            periodEnd: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          },
        },
      },
    },
    async (req, reply) => {
      const { periodStart, periodEnd } = req.body as { periodStart: string; periodEnd: string };
      try {
        const result = await generateSettlementCycle(periodStart, periodEnd);
        return reply.send({ code: 0, message: "结算周期创建成功", data: result });
      } catch (e: any) {
        const statusCode = e.statusCode ?? 500;
        return reply.code(statusCode).send({ code: statusCode, error: e.code ?? "INTERNAL", message: e.message });
      }
    },
  );

  // ===== 3. 结算单列表 =====
  // GET /admin/finance/settlements
  app.get(
    "/admin/finance/settlements",
    { onRequest: [requireAdmin] },
    async (req) => {
      const query = req.query as any;
      const cycleId = Number(query.cycle_id);
      const status = query.status as string | undefined;
      const search = ((query.search as string) ?? "").slice(0, 50);
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
      const offset = Math.max(0, Number(query.offset) || 0);

      const conditions: string[] = [];
      const params: any[] = [];

      if (!isNaN(cycleId) && cycleId > 0) {
        conditions.push(`as.cycle_id = $${params.length + 1}`);
        params.push(cycleId);
      }
      if (status && ["pending", "settled"].includes(status)) {
        conditions.push(`as.status = $${params.length + 1}`);
        params.push(status);
      }
      if (search) {
        conditions.push(`(u.username ILIKE $${params.length + 1} OR u.email ILIKE $${params.length + 1})`);
        params.push(`%${search}%`);
      }

      const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
      const whereCount = conditions.length > 0 ? where : "";

      const [rowsR, totalR] = await Promise.all([
        pool.query(
          `SELECT as.*, u.username AS agent_name, u.email AS agent_email
           FROM agent_settlements as
           JOIN users u ON u.id = as.agent_user_id
           ${where}
           ORDER BY as.id DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset],
        ),
        pool.query(
          `SELECT COUNT(*)::int AS cnt FROM agent_settlements as JOIN users u ON u.id = as.agent_user_id ${whereCount}`,
          params,
        ),
      ]);

      return {
        code: 0,
        data: { rows: rowsR.rows, total: totalR.rows[0]?.cnt ?? 0 },
        message: "ok",
      };
    },
  );

  // ===== 4. 结算单详情 =====
  // GET /admin/finance/settlements/:id
  app.get(
    "/admin/finance/settlements/:id",
    { onRequest: [requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const settlementId = Number(id);

      const sR = await pool.query(
        `SELECT as.*, u.username AS agent_name, u.email AS agent_email
         FROM agent_settlements as
         JOIN users u ON u.id = as.agent_user_id
         WHERE as.id = $1`,
        [settlementId],
      );
      if (!sR.rows[0]) {
        return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "结算单不存在" });
      }

      const cycleR = await pool.query(
        "SELECT id, period_start, period_end, status FROM settlement_cycles WHERE id=$1",
        [sR.rows[0].cycle_id],
      );
      const logsR = await pool.query(
        "SELECT * FROM settlement_confirm_logs WHERE settlement_id=$1 ORDER BY id",
        [settlementId],
      );

      return {
        code: 0,
        data: {
          settlement: sR.rows[0],
          cycle: cycleR.rows[0] ?? null,
          logs: logsR.rows,
        },
        message: "ok",
      };
    },
  );

  // ===== 5. 结算明细 =====
  // GET /admin/finance/settlements/:id/details
  app.get(
    "/admin/finance/settlements/:id/details",
    { onRequest: [requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const settlementId = Number(id);
      const query = req.query as any;
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
      const offset = Math.max(0, Number(query.offset) || 0);

      const [rowsR, sumR] = await Promise.all([
        pool.query(
          `SELECT sd.*, u.username AS client_name
           FROM settlement_details sd
           LEFT JOIN users u ON u.id = sd.client_user_id
           WHERE sd.settlement_id = $1
           ORDER BY sd.id
           LIMIT $2 OFFSET $3`,
          [settlementId, limit, offset],
        ),
        pool.query(
          `SELECT SUM(sd.amount)::numeric AS total_amount,
                  COALESCE(SUM(sd.tokens), 0)::int AS total_tokens,
                  COUNT(DISTINCT sd.model)::int AS model_count
           FROM settlement_details sd
           WHERE sd.settlement_id = $1`,
          [settlementId],
        ),
      ]);

      return {
        code: 0,
        data: {
          rows: rowsR.rows,
          summary: sumR.rows[0] ?? { total_amount: "0", total_tokens: 0, model_count: 0 },
        },
        message: "ok",
      };
    },
  );

  // ===== 6. 导出 CSV =====
  // GET /admin/finance/settlements/:id/export
  app.get(
    "/admin/finance/settlements/:id/export",
    { onRequest: [requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const settlementId = Number(id);

      const rows = await pool.query(
        `SELECT sd.created_at::date AS date, sd.client_user_id, u.username AS client_name,
                sd.model, sd.tokens, sd.amount, sd.commission_rate
         FROM settlement_details sd
         LEFT JOIN users u ON u.id = sd.client_user_id
         WHERE sd.settlement_id = $1
         ORDER BY sd.id`,
        [settlementId],
      );

      const header = "日期,客户ID,客户姓名,模型,Token数,佣金金额(元),佣金率";
      const lines = rows.rows.map((r: any) =>
        `${r.date?.toISOString?.()?.slice(0, 10) ?? r.date},${r.client_user_id},"${r.client_name ?? ""}",${r.model ?? ""},${toNum(r.tokens)},${toNum(r.amount).toFixed(2)},${r.commission_rate ? r.commission_rate + "%" : ""}`,
      );

      const csv = "\uFEFF" + header + "\n" + lines.join("\n");
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="settlement_${settlementId}_details.csv"`);
      return reply.send(csv);
    },
  );

  // ===== 7. 调整金额 =====
  // POST /admin/finance/settlements/:id/adjust
  app.post(
    "/admin/finance/settlements/:id/adjust",
    {
      onRequest: [requireAdmin],
      schema: {
        body: {
          type: "object",
          required: ["adjustmentAmount", "reason"],
          properties: {
            adjustmentAmount: { type: "number" },
            reason: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const settlementId = Number(id);
      const { adjustmentAmount, reason } = req.body as { adjustmentAmount: number; reason: string };
      const adminUserId = Number((req as any).user.sub);

      try {
        const result = await adjustSettlement(settlementId, adjustmentAmount, reason, adminUserId);
        return reply.send({ code: 0, message: "结算金额已调整", data: result });
      } catch (e: any) {
        const statusCode = e.statusCode ?? 500;
        return reply.code(statusCode).send({ code: statusCode, error: e.code ?? "INTERNAL", message: e.message });
      }
    },
  );
}
