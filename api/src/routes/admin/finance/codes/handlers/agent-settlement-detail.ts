// ============================================================
//  C. 单个 Agent 结算明细
//  GET /api/v1/admin/finance/codes/agent-settlement/:agentId
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../../../../db/index.js";
import { requirePerm, Perm } from "../../../../../middleware/auth.js";
import { AppError } from "../../../../../services/auth-service/index.js";
import {
  agents,
  users,
  agentBalanceLedger,
} from "../../../../../db/schema.js";

export async function agentSettlementDetailRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/finance/codes/agent-settlement/:agentId", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const { agentId } = request.params as { agentId: string };
      const aId = parseInt(agentId, 10);
      if (isNaN(aId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的代理商 ID" });
        return;
      }

      const query = request.query as { period?: string };
      const periodStr = query.period ?? (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      })();

      const [yearStr, monthStr] = periodStr.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const periodStart = new Date(Date.UTC(year, month - 1, 1));
      const periodEnd = new Date(Date.UTC(year, month, 1));

      const db = getDb();

      // Verify agent exists
      const [agent] = await db
        .select({
          id: agents.id,
          userId: agents.userId,
          frozenAmount: agents.frozenAmount,
          email: users.email,
          nickname: users.nickname,
        })
        .from(agents)
        .innerJoin(users, eq(agents.userId, users.id))
        .where(eq(agents.id, aId))
        .limit(1);

      if (!agent) {
        reply.status(404).send({ code: 404, data: null, message: "代理商不存在" });
        return;
      }

      // 期初余额
      const [lastBefore] = await db
        .select({ balanceAfter: agentBalanceLedger.balanceAfter })
        .from(agentBalanceLedger)
        .where(
          and(
            eq(agentBalanceLedger.agentId, aId),
            eq(agentBalanceLedger.balanceType, "available"),
            sql`${agentBalanceLedger.createdAt} < ${periodStart}::timestamptz`,
          )
        )
        .orderBy(desc(agentBalanceLedger.createdAt))
        .limit(1);

      const openingBalance = lastBefore?.balanceAfter ?? 0;

      // 本月流水明细
      const ledgerEntries = await db
        .select()
        .from(agentBalanceLedger)
        .where(
          and(
            eq(agentBalanceLedger.agentId, aId),
            sql`${agentBalanceLedger.createdAt} >= ${periodStart}::timestamptz`,
            sql`${agentBalanceLedger.createdAt} < ${periodEnd}::timestamptz`,
          )
        )
        .orderBy(desc(agentBalanceLedger.createdAt));

      // 本月汇总
      let monthDeduction = 0;
      let monthFreeze = 0;
      let monthUnfreeze = 0;
      let monthRefund = 0;
      for (const entry of ledgerEntries) {
        if (entry.changeType === "deduction") monthDeduction += entry.amount;
        else if (entry.changeType === "freeze") monthFreeze += entry.amount;
        else if (entry.changeType === "unfreeze") monthUnfreeze += entry.amount;
        else if (entry.changeType === "refund") monthRefund += entry.amount;
      }

      const closingBalance = openingBalance - monthDeduction + monthUnfreeze + monthRefund;

      reply.status(200).send({
        code: 0,
        data: {
          period: periodStr,
          agentId: aId,
          agentName: agent.nickname ?? agent.email ?? `代理商 #${aId}`,
          email: agent.email,
          openingBalance,
          monthDeduction,
          monthFreeze,
          monthUnfreeze,
          monthRefund,
          closingBalance,
          entries: ledgerEntries.map(e => ({
            id: e.id,
            balanceType: e.balanceType,
            changeType: e.changeType,
            amount: e.amount,
            balanceBefore: e.balanceBefore,
            balanceAfter: e.balanceAfter,
            refType: e.refType,
            refId: e.refId,
            refCodeId: e.refCodeId,
            remark: e.remark,
            createdAt: e.createdAt.toISOString(),
          })),
        },
        message: "ok",
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });
}
