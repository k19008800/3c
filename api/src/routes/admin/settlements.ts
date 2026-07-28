// ============================================================
//  3cloud (3C) — 管理员结算周期管理
//  GET    /api/v1/admin/finance/settlement-cycles  — 周期列表
//  POST   /api/v1/admin/finance/settlement-cycles/generate — 手动关账生成账单
//  GET    /api/v1/admin/finance/settlements        — 结算单列表
//  GET    /api/v1/admin/finance/settlements/:id    — 结算单详情
//  GET    /api/v1/admin/finance/settlements/:id/details — 结算明细
//  GET    /api/v1/admin/finance/settlements/:id/export — 导出CSV
//  POST   /api/v1/admin/finance/settlements/:id/adjust -- 调整
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  settlementCycles,
  agentSettlements,
  settlementDetails,
  settlementConfirmLogs,
  agents,
  users,
} from "../../db/schema.js";
import { authenticateJWT } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  generateSettlementCycle,
  adjustSettlement,
} from "../../services/settlement-cycle.js";

export async function adminSettlementRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);
  app.addHook("preHandler", requireRole(["super_admin", "admin", "finance"]));

  // ── 结算周期列表 ──
  app.get("/api/v1/admin/finance/settlement-cycles", async (request, reply) => {
    const db = getDb();
    const { status, limit = "20", offset = "0" } = request.query as {
      status?: string;
      limit?: string;
      offset?: string;
    };

    const where = status ? eq(settlementCycles.status, status) : undefined;

    const rows = await db
      .select()
      .from(settlementCycles)
      .where(where)
      .orderBy(desc(settlementCycles.periodStart))
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    // 各周期代理账单数量
    const counts = await db.execute(
      sql`SELECT cycle_id, COUNT(*) as cnt FROM agent_settlements GROUP BY cycle_id`
    );
    const countMap: Record<number, number> = {};
    for (const row of counts.rows) {
      countMap[(row as any).cycle_id] = parseInt((row as any).cnt || "0");
    }

    return reply.status(200).send({
      code: 0,
      data: rows.map((r) => ({
        ...r,
        agentBillCount: countMap[r.id] || 0,
      })),
    });
  });

  // ── 手动关账生成账单 ──
  app.post("/api/v1/admin/finance/settlement-cycles/generate", async (request, reply) => {
    const { periodStart, periodEnd } = request.body as {
      periodStart: string;
      periodEnd: string;
    };

    if (!periodStart || !periodEnd) {
      return reply.status(400).send({
        code: 400,
        error: "INVALID_PARAMS",
        message: "请提供 periodStart 和 periodEnd",
      });
    }

    try {
      const result = await generateSettlementCycle(periodStart, periodEnd);
      return reply.status(200).send({
        code: 0,
        message: `结算周期创建成功，生成 ${result.agentBillCount} 个代理账单`,
        data: result,
      });
    } catch (err: any) {
      return reply.status(400).send({
        code: 400,
        error: "GENERATE_FAILED",
        message: err.message,
      });
    }
  });

  // ── 结算单列表 ──
  app.get("/api/v1/admin/finance/settlements", async (request, reply) => {
    const db = getDb();
    const { status, cycle_id, agent_id, limit = "20", offset = "0" } =
      request.query as {
        status?: string;
        cycle_id?: string;
        agent_id?: string;
        limit?: string;
        offset?: string;
      };

    let where = sql`1=1`;
    if (status) where = sql`${where} AND ${eq(agentSettlements.status, status)}`;
    if (cycle_id) where = sql`${where} AND ${eq(agentSettlements.cycleId, parseInt(cycle_id))}`;
    if (agent_id) where = sql`${where} AND ${eq(agentSettlements.agentId, parseInt(agent_id))}`;

    const rows = await db
      .select({
        id: agentSettlements.id,
        cycleId: agentSettlements.cycleId,
        agentId: agentSettlements.agentId,
        agentName: users.nickname,
        totalCommission: agentSettlements.totalCommission,
        settledAmount: agentSettlements.settledAmount,
        adjustmentAmount: agentSettlements.adjustmentAmount,
        status: agentSettlements.status,
        confirmedAt: agentSettlements.confirmedAt,
        settledAt: agentSettlements.settledAt,
        createdAt: agentSettlements.createdAt,
      })
      .from(agentSettlements)
      .leftJoin(agents, eq(agentSettlements.agentId, agents.id))
      .leftJoin(users, eq(agents.userId, users.id))
      .where(where)
      .orderBy(desc(agentSettlements.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    return reply.status(200).send({ code: 0, data: rows });
  });

  // ── 结算单详情 ──
  app.get("/api/v1/admin/finance/settlements/:id", async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };

    const [settlement] = await db
      .select({
        id: agentSettlements.id,
        cycleId: agentSettlements.cycleId,
        agentId: agentSettlements.agentId,
        agentName: users.nickname,
        agentEmail: users.email,
        totalCommission: agentSettlements.totalCommission,
        settledAmount: agentSettlements.settledAmount,
        adjustmentAmount: agentSettlements.adjustmentAmount,
        adjustmentReason: agentSettlements.adjustmentReason,
        status: agentSettlements.status,
        confirmedAt: agentSettlements.confirmedAt,
        settledAt: agentSettlements.settledAt,
        createdAt: agentSettlements.createdAt,
        updatedAt: agentSettlements.updatedAt,
      })
      .from(agentSettlements)
      .leftJoin(agents, eq(agentSettlements.agentId, agents.id))
      .leftJoin(users, eq(agents.userId, users.id))
      .where(eq(agentSettlements.id, parseInt(id)))
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

    // 操作日志
    const logs = await db
      .select()
      .from(settlementConfirmLogs)
      .where(eq(settlementConfirmLogs.settlementId, settlement.id))
      .orderBy(desc(settlementConfirmLogs.createdAt));

    return reply.status(200).send({
      code: 0,
      data: { ...settlement, cycle, logs },
    });
  });

  // ── 结算明细 ──
  app.get("/api/v1/admin/finance/settlements/:id/details", async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };

    const rows = await db
      .select()
      .from(settlementDetails)
      .where(eq(settlementDetails.settlementId, parseInt(id)))
      .orderBy(desc(settlementDetails.createdAt));

    return reply.status(200).send({ code: 0, data: rows });
  });

  // ── 导出 CSV ──
  app.get("/api/v1/admin/finance/settlements/:id/export", async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };

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
      `attachment; filename="settlement_${id}.csv"`
    );
    return header + csv;
  });

  // ── 调整结算金额 ──
  app.post("/api/v1/admin/finance/settlements/:id/adjust", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { adjustmentAmount, reason } = request.body as {
      adjustmentAmount: number;
      reason: string;
    };
    const adminUserId = request.user!.userId;

    if (adjustmentAmount === undefined || !reason) {
      return reply.status(400).send({
        code: 400,
        error: "INVALID_PARAMS",
        message: "请提供 adjustmentAmount 和 reason",
      });
    }

    try {
      await adjustSettlement(parseInt(id), adjustmentAmount, reason, adminUserId);
      return reply.status(200).send({
        code: 0,
        message: "结算金额已调整",
      });
    } catch (err: any) {
      return reply.status(400).send({
        code: 400,
        error: "ADJUST_FAILED",
        message: err.message,
      });
    }
  });
}
