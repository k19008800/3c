// ============================================================
//  3cloud (3C) — 代理端结算对账
//  GET    /api/v1/agent/settlements           — 查看自己的结算单列表
//  GET    /api/v1/agent/settlements/:id       — 查看结算单详情
//  POST   /api/v1/agent/settlements/:id/confirm — 确认结算
//  GET    /api/v1/agent/settlements/:id/export-pdf — 导出(CSV)
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  settlementCycles,
  agentSettlements,
  settlementDetails,
  settlementConfirmLogs,
  agents,
} from "../../db/schema.js";
import { authenticateJWT } from "../../middleware/auth.js";
import { confirmSettlement } from "../../services/settlement-cycle.js";

export async function agentSettlementRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 代理权限检查 ──
  async function getAgent(userId: number) {
    const db = getDb();
    const [agent] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.userId, userId))
      .limit(1);
    return agent || null;
  }

  // ── 结算单列表 ──
  app.get("/api/v1/agent/settlements", async (request, reply) => {
    const db = getDb();
    const agent = await getAgent(request.user!.userId);
    if (!agent) {
      return reply.status(403).send({
        code: 403,
        error: "NOT_AGENT",
        message: "仅代理商可用",
      });
    }

    const { status, limit = "20", offset = "0" } = request.query as {
      status?: string;
      limit?: string;
      offset?: string;
    };

    let where = eq(agentSettlements.agentId, agent.id);
    if (status) where = and(where, eq(agentSettlements.status, status))!;

    const rows = await db
      .select({
        id: agentSettlements.id,
        cycleId: agentSettlements.cycleId,
        periodStart: settlementCycles.periodStart,
        periodEnd: settlementCycles.periodEnd,
        totalCommission: agentSettlements.totalCommission,
        settledAmount: agentSettlements.settledAmount,
        adjustmentAmount: agentSettlements.adjustmentAmount,
        status: agentSettlements.status,
        confirmedAt: agentSettlements.confirmedAt,
        settledAt: agentSettlements.settledAt,
        createdAt: agentSettlements.createdAt,
      })
      .from(agentSettlements)
      .leftJoin(
        settlementCycles,
        eq(agentSettlements.cycleId, settlementCycles.id)
      )
      .where(where)
      .orderBy(desc(agentSettlements.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    // 统计
    const statsResult = await db.execute(
      sql`SELECT status, COUNT(*) as cnt FROM agent_settlements
          WHERE agent_id = ${agent.id}
          GROUP BY status`
    );
    const stats: Record<string, number> = {};
    for (const row of statsResult.rows) {
      stats[(row as any).status] = parseInt((row as any).cnt || "0");
    }

    return reply.status(200).send({ code: 0, data: { rows, stats } });
  });

  // ── 结算单详情 ──
  app.get("/api/v1/agent/settlements/:id", async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const agent = await getAgent(request.user!.userId);
    if (!agent) {
      return reply.status(403).send({
        code: 403,
        error: "NOT_AGENT",
        message: "仅代理商可用",
      });
    }

    const [settlement] = await db
      .select()
      .from(agentSettlements)
      .where(
        and(
          eq(agentSettlements.id, parseInt(id)),
          eq(agentSettlements.agentId, agent.id)
        )
      )
      .limit(1);

    if (!settlement) {
      return reply.status(404).send({
        code: 404,
        error: "NOT_FOUND",
        message: "结算单不存在",
      });
    }

    // 周期信息
    const [cycle] = await db
      .select()
      .from(settlementCycles)
      .where(eq(settlementCycles.id, settlement.cycleId))
      .limit(1);

    // 明细
    const details = await db
      .select()
      .from(settlementDetails)
      .where(eq(settlementDetails.settlementId, settlement.id))
      .orderBy(desc(settlementDetails.createdAt));

    // 日志
    const logs = await db
      .select()
      .from(settlementConfirmLogs)
      .where(eq(settlementConfirmLogs.settlementId, settlement.id))
      .orderBy(desc(settlementConfirmLogs.createdAt));

    return reply.status(200).send({
      code: 0,
      data: { ...settlement, cycle, details, logs },
    });
  });

  // ── 确认结算单 ──
  app.post("/api/v1/agent/settlements/:id/confirm", async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = await getAgent(request.user!.userId);
    if (!agent) {
      return reply.status(403).send({
        code: 403,
        error: "NOT_AGENT",
        message: "仅代理商可用",
      });
    }

    try {
      await confirmSettlement(parseInt(id), request.user!.userId);
      return reply.status(200).send({
        code: 0,
        message: "结算单已确认，金额已转入可提现余额",
      });
    } catch (err: any) {
      return reply.status(400).send({
        code: 400,
        error: "CONFIRM_FAILED",
        message: err.message,
      });
    }
  });

  // ── 导出 CSV（代理端也可导）──
  app.get("/api/v1/agent/settlements/:id/export-csv", async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const agent = await getAgent(request.user!.userId);
    if (!agent) {
      return reply.status(403).send({
        code: 403,
        error: "NOT_AGENT",
        message: "仅代理商可用",
      });
    }

    // 验证归属
    const [s] = await db
      .select({ id: agentSettlements.id })
      .from(agentSettlements)
      .where(
        and(
          eq(agentSettlements.id, parseInt(id)),
          eq(agentSettlements.agentId, agent.id)
        )
      )
      .limit(1);
    if (!s) {
      return reply.status(404).send({ code: 404, error: "NOT_FOUND", message: "结算单不存在" });
    }

    const rows = await db
      .select({
        createdAt: settlementDetails.createdAt,
        clientUserId: settlementDetails.clientUserId,
        model: settlementDetails.model,
        tokens: settlementDetails.tokens,
        amount: settlementDetails.amount,
        commissionRate: settlementDetails.commissionRate,
      })
      .from(settlementDetails)
      .where(eq(settlementDetails.settlementId, parseInt(id)))
      .orderBy(settlementDetails.createdAt);

    const header = "日期,客户ID,模型,Token数,佣金,佣金率\n";
    const csv = rows
      .map(
        (r) =>
          `${r.createdAt},${r.clientUserId},${r.model || ""},${r.tokens || 0},${r.amount},${r.commissionRate || ""}`
      )
      .join("\n");

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header(
      "Content-Disposition",
      `attachment; filename="agent_settlement_${id}.csv"`
    );
    return header + csv;
  });
}
