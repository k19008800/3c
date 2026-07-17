// ============================================================
//  C. 代理商结算对账
//  GET /api/v1/admin/finance/codes/agent-settlement
//  params: period (YYYY-MM)
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

export async function agentSettlementRoutes(app: FastifyInstance) {

  app.get("/api/v1/admin/finance/codes/agent-settlement", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const q = request.query as {
        period?: string;
        search?: string;
        page?: string;
        pageSize?: string;
      };
      const periodStr = q.period ?? (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      })();

      const [yearStr, monthStr] = periodStr.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        reply.status(400).send({ code: 400, data: null, message: "无效的月份格式，请使用 YYYY-MM" });
        return;
      }

      const periodStart = new Date(Date.UTC(year, month - 1, 1));
      const periodEnd = new Date(Date.UTC(year, month, 1));

      const db = getDb();

      // 获取所有活跃 agent
      const allAgents = await db
        .select({
          id: agents.id,
          userId: agents.userId,
          frozenAmount: agents.frozenAmount,
          email: users.email,
          nickname: users.nickname,
        })
        .from(agents)
        .innerJoin(users, eq(agents.userId, users.id))
        .where(eq(agents.status, true));

      // 获取 ledger 中本月各 agent 的汇总
      // NOTE: sum(bigint) 在 PG 中返回 numeric，pg 驱动以 string 返回
      // 必须使用 sql<string> 并显式 Number() 转换，避免 string 拼接导致的 BigInt 溢出
      const ledgerSummary = await db
        .select({
          agentId: agentBalanceLedger.agentId,
          balanceType: agentBalanceLedger.balanceType,
          changeType: agentBalanceLedger.changeType,
          totalAmount: sql<string>`coalesce(sum(${agentBalanceLedger.amount})::text, '0')`,
        })
        .from(agentBalanceLedger)
        .where(
          and(
            sql`${agentBalanceLedger.createdAt} >= ${periodStart}::timestamptz`,
            sql`${agentBalanceLedger.createdAt} < ${periodEnd}::timestamptz`,
          )
        )
        .groupBy(agentBalanceLedger.agentId, agentBalanceLedger.balanceType, agentBalanceLedger.changeType);

      // 按 agentId 聚合
      const agentSummaryMap = new Map<number, {
        deduction: number;
        freeze: number;
        unfreeze: number;
        refund: number;
      }>();
      for (const ls of ledgerSummary) {
        if (!agentSummaryMap.has(ls.agentId)) {
          agentSummaryMap.set(ls.agentId, { deduction: 0, freeze: 0, unfreeze: 0, refund: 0 });
        }
        const sum = agentSummaryMap.get(ls.agentId)!;
        // 显式 Number() 转换：pg driver 将 numeric sum 以 string 返回，
        // 若用 += 直接拼接则产生 string 拼接而非数学加法
        const amt = Number(ls.totalAmount);
        if (ls.changeType === "deduction") sum.deduction += amt;
        else if (ls.changeType === "freeze") sum.freeze += amt;
        else if (ls.changeType === "unfreeze") sum.unfreeze += amt;
        else if (ls.changeType === "refund") sum.refund += amt;
      }

      // 获取该 period 上个月底的余额快照
      const settlements = await Promise.all(allAgents.map(async (agent) => {
        const [lastBefore] = await db
          .select({ balanceAfter: agentBalanceLedger.balanceAfter })
          .from(agentBalanceLedger)
          .where(
            and(
              eq(agentBalanceLedger.agentId, agent.id),
              eq(agentBalanceLedger.balanceType, "available"),
              sql`${agentBalanceLedger.createdAt} < ${periodStart}::timestamptz`,
            )
          )
          .orderBy(desc(agentBalanceLedger.createdAt))
          .limit(1);

        const [lastFrozenBefore] = await db
          .select({ balanceAfter: agentBalanceLedger.balanceAfter })
          .from(agentBalanceLedger)
          .where(
            and(
              eq(agentBalanceLedger.agentId, agent.id),
              eq(agentBalanceLedger.balanceType, "frozen"),
              sql`${agentBalanceLedger.createdAt} < ${periodStart}::timestamptz`,
            )
          )
          .orderBy(desc(agentBalanceLedger.createdAt))
          .limit(1);

        const openingBalance = lastBefore?.balanceAfter ?? 0;
        const openingFrozen = lastFrozenBefore?.balanceAfter ?? 0;
        const sum = agentSummaryMap.get(agent.id) ?? { deduction: 0, freeze: 0, unfreeze: 0, refund: 0 };
        const closingBalance = openingBalance - sum.deduction + sum.unfreeze + sum.refund;
        const closingFrozen = Math.max(0, openingFrozen + sum.freeze - sum.unfreeze);

        return {
          agentId: agent.id,
          agentName: agent.nickname ?? agent.email ?? `代理商 #${agent.id}`,
          email: agent.email,
          openingBalance,
          openingFrozen,
          monthDeduction: sum.deduction,
          monthFreeze: sum.freeze,
          monthUnfreeze: sum.unfreeze,
          monthRefund: sum.refund,
          closingBalance,
          closingFrozen,
        };
      }));

      // 搜索过滤
      let filtered = settlements;
      if (q.search) {
        const s = q.search.toLowerCase();
        filtered = settlements.filter(
          a => a.agentName.toLowerCase().includes(s) || a.email.toLowerCase().includes(s)
        );
      }

      // 计算汇总
      const summary = {
        totalAgents: filtered.length,
        totalOpeningAvailable: filtered.reduce((s, a) => s + a.openingBalance, 0),
        totalOpeningFrozen: filtered.reduce((s, a) => s + a.openingFrozen, 0),
        totalConsumption: filtered.reduce((s, a) => s + a.monthDeduction, 0),
        totalFrozen: filtered.reduce((s, a) => s + a.monthFreeze, 0),
        totalUnfreeze: filtered.reduce((s, a) => s + a.monthUnfreeze, 0),
        totalRefund: filtered.reduce((s, a) => s + a.monthRefund, 0),
        totalClosingAvailable: filtered.reduce((s, a) => s + a.closingBalance, 0),
        totalClosingFrozen: filtered.reduce((s, a) => s + a.closingFrozen, 0),
      };

      // 分页
      const page = Math.max(1, parseInt(q.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize ?? "20", 10) || 20));
      const total = filtered.length;
      const offset = (page - 1) * pageSize;
      const paged = filtered.slice(offset, offset + pageSize);

      reply.status(200).send({
        code: 0,
        data: {
          period: periodStr,
          summary,
          items: paged,
          total,
          page,
          pageSize,
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
