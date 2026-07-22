// ============================================================
//  E. Agent 成本明细
//  GET /api/v1/admin/finance/agent-cost
//  params: period, page, pageSize, search, sortBy, sortDir
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../../../../db/index.js";
import { requirePerm, Perm } from "../../../../../middleware/auth.js";
import { AppError } from "../../../../../services/auth-service/index.js";
import {
  agents,
  users,
  redemptionBatches,
  redemptionLogs,
} from "../../../../../db/schema.js";

export async function agentCostRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/finance/agent-cost", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const query = request.query as {
        period?: string;
        page?: string;
        pageSize?: string;
        search?: string;
        sortBy?: string;
        sortDir?: string;
      };

      const periodStr = query.period ?? (() => {
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

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));

      const AGENT_COST_RATE = 0.85;

      // ── 1. 查出所有活跃的代理商（即 role='agent' 的）──
      let agentsList = await db
        .select({
          agentId: agents.id,
          userId: agents.userId,
          agentName: users.nickname,
          agentEmail: users.email,
        })
        .from(agents)
        .innerJoin(users, eq(agents.userId, users.id))
        .where(
          and(
            eq(agents.status, true),
            eq(users.role, "agent")
          )
        );

      // 搜索过滤
      if (query.search) {
        agentsList = agentsList.filter(
          (a) =>
            (a.agentName?.toLowerCase().includes(query.search!.toLowerCase()) ?? false) ||
            (a.agentEmail?.toLowerCase().includes(query.search!.toLowerCase()) ?? false) ||
            String(a.agentId).includes(query.search!)
        );
        if (agentsList.length === 0) {
          reply.status(200).send({
            code: 0,
            data: { period: periodStr, summary: { agentCount: 0, totalFaceValue: 0, totalCost: 0, totalSubsidy: 0 }, list: [], total: 0, page, pageSize },
            message: "ok",
          });
          return;
        }
      }

      // ── 2. 为每个 agent 聚合批次和消耗数据 ──
      type AgentCostRow = {
        agentId: number;
        agentName: string;
        agentEmail: string;
        batchCount: number;
        totalFaceValue: number;
        totalConsumed: number;
        consumeRate: number;
        costAmount: number;
        subsidyAmount: number;
        subsidyRate: number;
        roi: number;
        batches: Array<{
          batchId: number;
          batchName: string;
          totalCount: number;
          usedCount: number;
          usageRate: number;
          faceValue: number;
          costAmount: number;
          subsidyAmount: number;
          createdAt: string;
        }>;
      };

      const rows: AgentCostRow[] = [];

      for (const agent of agentsList) {
        const batches = await db
          .select({
            id: redemptionBatches.id,
            name: redemptionBatches.name,
            amount: redemptionBatches.amount,
            totalCount: redemptionBatches.totalCount,
            usedCount: redemptionBatches.usedCount,
            createdAt: redemptionBatches.createdAt,
          })
          .from(redemptionBatches)
          .where(eq(redemptionBatches.creatorId, agent.userId))
          .orderBy(desc(redemptionBatches.createdAt));

        if (batches.length === 0) {
          rows.push({
            agentId: agent.agentId,
            agentName: agent.agentName ?? "",
            agentEmail: agent.agentEmail ?? "",
            batchCount: 0,
            totalFaceValue: 0,
            totalConsumed: 0,
            consumeRate: 0,
            costAmount: 0,
            subsidyAmount: 0,
            subsidyRate: 0,
            roi: 0,
            batches: [],
          });
          continue;
        }

        const batchIds = batches.map(b => b.id);

        // 查这些批次中在当月被兑换的记录        let monthlyLogTotal = 0;
        if (batchIds.length > 0) {
          const logResult = await db
            .select({
              totalAmount: sql<string>`coalesce(sum(${redemptionLogs.amount}), '0')`,
            })
            .from(redemptionLogs)
            .where(
              and(
                sql`${redemptionLogs.batchId} = ANY(ARRAY[${sql.join(batchIds.map(id => sql`${id}::int`), sql`, `)}])`,
                sql`${redemptionLogs.createdAt} >= ${periodStart}::timestamptz`,
                sql`${redemptionLogs.createdAt} < ${periodEnd}::timestamptz`,
              )
            );
          monthlyLogTotal = Math.round(parseFloat(logResult[0]?.totalAmount ?? "0") * 100);
        }

        let totalFaceValue = 0;
        for (const b of batches) {
          totalFaceValue += Math.round(b.totalCount * parseFloat(b.amount as string) * 100);
        }

        const totalConsumed = monthlyLogTotal;
        const consumeRate = totalFaceValue > 0 ? totalConsumed / totalFaceValue : 0;
        const costAmount = Math.round(totalConsumed * AGENT_COST_RATE);
        const subsidyAmount = totalConsumed - costAmount;
        const subsidyRate = costAmount > 0 ? subsidyAmount / costAmount : 0;
        const roi = costAmount > 0 ? (0 - costAmount) / costAmount : 0;

        const batchDetails = batches.map(b => {
          const bFaceValue = Math.round(b.totalCount * parseFloat(b.amount as string) * 100);
          const bCostAmount = Math.round(bFaceValue * AGENT_COST_RATE);
          const bSubsidyAmount = bFaceValue - bCostAmount;
          return {
            batchId: b.id,
            batchName: b.name,
            totalCount: b.totalCount,
            usedCount: b.usedCount,
            usageRate: b.totalCount > 0 ? b.usedCount / b.totalCount : 0,
            faceValue: bFaceValue,
            costAmount: bCostAmount,
            subsidyAmount: bSubsidyAmount,
            createdAt: b.createdAt.toISOString(),
          };
        });

        rows.push({
          agentId: agent.agentId,
          agentName: agent.agentName ?? "",
          agentEmail: agent.agentEmail ?? "",
          batchCount: batches.length,
          totalFaceValue,
          totalConsumed,
          consumeRate,
          costAmount,
          subsidyAmount,
          subsidyRate,
          roi,
          batches: batchDetails,
        });
      }

      // ── 3. 排序 ──
      const sortBy = query.sortBy ?? "totalFaceValue";
      const sortDir = query.sortDir ?? "desc";
      const sortMultiplier = sortDir === "asc" ? 1 : -1;

      rows.sort((a, b) => {
        const aVal = (a as any)[sortBy] ?? 0;
        const bVal = (b as any)[sortBy] ?? 0;
        return sortMultiplier * (aVal - bVal);
      });

      // ── 4. 汇总 ──
      const summary = {
        agentCount: rows.length,
        totalFaceValue: rows.reduce((sum, r) => sum + r.totalFaceValue, 0),
        totalCost: rows.reduce((sum, r) => sum + r.costAmount, 0),
        totalSubsidy: rows.reduce((sum, r) => sum + r.subsidyAmount, 0),
      };

      // ── 5. 分页 ──
      const total = rows.length;
      const offset = (page - 1) * pageSize;
      const pagedRows = rows.slice(offset, offset + pageSize);

      reply.status(200).send({
        code: 0,
        data: {
          period: periodStr,
          summary,
          list: pagedRows,
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
