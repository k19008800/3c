import type { FastifyInstance } from "fastify";
import { pool } from "../db/index";
import { confirmSettlement } from "../services/settlement/index";

/**
 * 代理端 — 结算对账路由
 * 对齐 docs/sprint-1/03-settlement-overview.md §5
 */

function toNum(v: any): number {
  if (v == null) return 0;
  return Number(v);
}

export function agentSettlementRoutes(app: FastifyInstance) {
  const requireAuth = async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch {
      return reply.code(401).send({ code: 401, error: "UNAUTHORIZED", message: "未认证或凭证已失效" });
    }
  };

  const requireAgent = async (req: any, reply: any) => {
    await requireAuth(req, reply);
    if (reply.sent) return;
    const userId = Number((req as any).user.sub);
    const agent = await pool.query(
      "SELECT id, level FROM agent_profiles WHERE user_id=$1 AND level IN ('level1','senior')",
      [userId],
    );
    if (!agent.rows[0]) {
      return reply.code(403).send({ code: 403, error: "AGENT_REQUIRED", message: "仅代理可操作" });
    }
    (req as any).agentProfile = agent.rows[0];
  };

  // ===== 1. 代理结算单列表 =====
  // GET /agent/settlements
  app.get(
    "/agent/settlements",
    { onRequest: [requireAgent] },
    async (req) => {
      const userId = Number((req as any).user.sub);
      const query = req.query as any;
      const status = query.status as string | undefined;
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
      const offset = Math.max(0, Number(query.offset) || 0);

      let sql = `SELECT as2.*, sc.period_start, sc.period_end, sc.status AS cycle_status
                 FROM agent_settlements as2
                 JOIN settlement_cycles sc ON sc.id = as2.cycle_id
                 WHERE as2.agent_user_id = $1`;
      const params: any[] = [userId];

      if (status && ["pending", "settled"].includes(status)) {
        sql += ` AND as2.status = $${params.length + 1}`;
        params.push(status);
      }
      sql += " ORDER BY as2.id DESC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
      params.push(limit, offset);

      const [rowsR, statsR] = await Promise.all([
        pool.query(sql, params),
        pool.query(
          "SELECT status, COUNT(*)::int AS cnt FROM agent_settlements WHERE agent_user_id=$1 GROUP BY status",
          [userId],
        ),
      ]);

      const stats: Record<string, number> = {};
      for (const r of statsR.rows) stats[r.status] = r.cnt;

      return {
        code: 0,
        data: { rows: rowsR.rows, stats },
        message: "ok",
      };
    },
  );

  // ===== 2. 代理结算单详情 =====
  // GET /agent/settlements/:id
  app.get(
    "/agent/settlements/:id",
    { onRequest: [requireAgent] },
    async (req, reply) => {
      const userId = Number((req as any).user.sub);
      const { id } = req.params as { id: string };
      const settlementId = Number(id);

      const sR = await pool.query(
        "SELECT * FROM agent_settlements WHERE id=$1 AND agent_user_id=$2",
        [settlementId, userId],
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

  // ===== 3. 确认结算 =====
  // POST /agent/settlements/:id/confirm
  app.post(
    "/agent/settlements/:id/confirm",
    { onRequest: [requireAgent] },
    async (req, reply) => {
      const userId = Number((req as any).user.sub);
      const { id } = req.params as { id: string };
      const settlementId = Number(id);

      try {
        await confirmSettlement(settlementId, userId, false);
        return reply.send({ code: 0, message: "结算单已确认，金额已转入可提现余额", data: { id: settlementId } });
      } catch (e: any) {
        const statusCode = e.statusCode ?? 500;
        return reply.code(statusCode).send({ code: statusCode, error: e.code ?? "INTERNAL", message: e.message });
      }
    },
  );

  // ===== 4. 导出 CSV（代理端不含客户姓名） =====
  // GET /agent/settlements/:id/export-csv
  app.get(
    "/agent/settlements/:id/export-csv",
    { onRequest: [requireAgent] },
    async (req, reply) => {
      const userId = Number((req as any).user.sub);
      const { id } = req.params as { id: string };
      const settlementId = Number(id);

      // 验证归属
      const sR = await pool.query(
        "SELECT id FROM agent_settlements WHERE id=$1 AND agent_user_id=$2",
        [settlementId, userId],
      );
      if (!sR.rows[0]) {
        return reply.code(404).send({ code: 404, error: "NOT_FOUND", message: "结算单不存在" });
      }

      const rows = await pool.query(
        `SELECT sd.created_at::date AS date, sd.client_user_id,
                sd.model, sd.tokens, sd.amount, sd.commission_rate
         FROM settlement_details sd
         WHERE sd.settlement_id = $1
         ORDER BY sd.id`,
        [settlementId],
      );

      // 代理端不含客户姓名（隐私保护）
      const header = "日期,客户ID,模型,Token数,佣金金额(元),佣金率";
      const lines = rows.rows.map((r: any) =>
        `${r.date?.toISOString?.()?.slice(0, 10) ?? r.date},${r.client_user_id},${r.model ?? ""},${toNum(r.tokens)},${toNum(r.amount).toFixed(2)},${r.commission_rate ? r.commission_rate + "%" : ""}`,
      );

      const csv = "\uFEFF" + header + "\n" + lines.join("\n");
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="settlement_${settlementId}_details.csv"`);
      return reply.send(csv);
    },
  );
}
