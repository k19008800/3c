// ============================================================
//  A. 成本看板
//  GET /api/v1/admin/finance/codes/cost-overview
//  params: period (YYYY-MM, e.g. 2026-07)
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../../../../db/index.js";
import { requirePerm, Perm } from "../../../../../middleware/auth.js";
import { AppError } from "../../../../../services/auth-service/index.js";
import {
  redemptionBatches,
  redemptionCodes,
  redemptionLogs,
  campaignCodes,
  financeCostRecords,
  users,
  agents,
} from "../../../../../db/schema.js";

export async function costOverviewRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/finance/codes/cost-overview", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as { period?: string };
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

      const db = getDb();

      // 先查已 finalize 的记录
      const finalizedRecords = await db
        .select({
          costType: financeCostRecords.costType,
          totalFace: sql<string>`coalesce(sum(${financeCostRecords.totalFace})::text, '0')`,
          totalUsed: sql<string>`coalesce(sum(${financeCostRecords.totalUsed})::text, '0')`,
          costAmount: sql<string>`coalesce(sum(${financeCostRecords.costAmount})::text, '0')`,
          subsidyAmount: sql<string>`coalesce(sum(${financeCostRecords.subsidyAmount})::text, '0')`,
          revenueAttributed: sql<string>`coalesce(sum(${financeCostRecords.revenueAttributed})::text, '0')`,
          roi: sql<string>`coalesce(avg(${financeCostRecords.roi}), 0)`,
        })
        .from(financeCostRecords)
        .where(
          and(
            eq(financeCostRecords.status, "finalized"),
            sql`${financeCostRecords.period} >= ${periodStart}::timestamptz`,
            sql`${financeCostRecords.period} < ${periodEnd}::timestamptz`,
          )
        )
        .groupBy(financeCostRecords.costType);

      if (finalizedRecords.length > 0) {
        let platformCost = 0;
        let adminCost = 0;
        let agentCost = 0;
        let platformSubsidy = 0;
        let adminSubsidy = 0;
        let agentSubsidy = 0;
        let revenue = 0;

        for (const r of finalizedRecords) {
          const cost = Number(r.costAmount);
          const sub = Number(r.subsidyAmount);
          const rev = Number(r.revenueAttributed);
          platformCost += cost;
          platformSubsidy += sub;
          revenue += rev;
          if (r.costType === "admin_marketing") {
            adminCost += cost;
            adminSubsidy += sub;
          } else if (r.costType === "agent_cost") {
            agentCost += cost;
            agentSubsidy += sub;
          } else if (r.costType === "platform_subsidy") {
            // 补贴单独统计
          }
        }

        const roi = platformCost > 0
          ? Number((((revenue - platformCost) / platformCost) * 100).toFixed(2))
          : 0;

        const totalCost = String(platformCost);
        const subsidyAmount = String(platformSubsidy);
        const subsidyRatio = platformCost > 0 ? platformSubsidy / platformCost : 0;

        reply.status(200).send({
          code: 0,
          data: {
            period: periodStr,
            totalCost,
            adminCost: String(adminCost),
            agentCost: String(agentCost),
            subsidyAmount,
            subsidyRatio,
            adminVsAgent: {
              admin: { cost: String(adminCost), subsidy: String(adminSubsidy), revenue: "0", netEffect: String(-adminCost) },
              agent: { cost: String(agentCost), subsidy: String(agentSubsidy), revenue: "0", netEffect: String(-agentCost) },
            },
            platformTotalCost: platformCost,
            platformSubsidy,
            revenueAttributed: revenue,
            roi,
            source: "finalized",
          },
          message: "ok",
        });
        return;
      }

      // ── 实时计算 ──
      const logs = await db
        .select({
          id: redemptionLogs.id,
          codeId: redemptionLogs.codeId,
          amount: redemptionLogs.amount,
          createdAt: redemptionLogs.createdAt,
          userId: redemptionLogs.userId,
        })
        .from(redemptionLogs)
        .where(
          and(
            sql`${redemptionLogs.createdAt} >= ${periodStart}::timestamptz`,
            sql`${redemptionLogs.createdAt} < ${periodEnd}::timestamptz`,
          )
        );

      if (logs.length === 0) {
        reply.status(200).send({
          code: 0,
          data: {
            period: periodStr,
            adminCost: "0",
            agentCost: "0",
            subsidyAmount: "0",
            subsidyRatio: 0,
            adminVsAgent: {
              admin: { cost: "0", subsidy: "0", revenue: "0", netEffect: "0" },
              agent: { cost: "0", subsidy: "0", revenue: "0", netEffect: "0" },
            },
            platformTotalCost: 0,
            platformSubsidy: 0,
            revenueAttributed: 0,
            roi: 0,
            source: "computed",
          },
          message: "ok",
        });
        return;
      }

      const codeIds = [...new Set(logs.map(l => l.codeId))];
      let codesInfo: { id: number; batchId: number; amount: string }[] = [];
      if (codeIds.length > 0) {
        codesInfo = await db
          .select({
            id: redemptionCodes.id,
            batchId: redemptionCodes.batchId,
            amount: redemptionCodes.amount,
          })
          .from(redemptionCodes)
          .where(sql`${redemptionCodes.id} = ANY(ARRAY[${sql.join(codeIds, sql`, `)}]::int[])`);
      }
      const codeBatchMap = new Map(codesInfo.map(c => [c.id, { batchId: c.batchId, amount: parseFloat(c.amount) }]));

      const batchIds = [...new Set(codesInfo.map(c => c.batchId))];
      let batchesInfo: { id: number; creatorId: number; amount: string }[] = [];
      if (batchIds.length > 0) {
        batchesInfo = await db
          .select({
            id: redemptionBatches.id,
            creatorId: redemptionBatches.creatorId,
            amount: redemptionBatches.amount,
          })
          .from(redemptionBatches)
          .where(sql`${redemptionBatches.id} = ANY(ARRAY[${sql.join(batchIds, sql`, `)}]::int[])`);
      }
      const batchCreatorMap = new Map(batchesInfo.map(b => [b.id, { creatorId: b.creatorId, amount: parseFloat(b.amount) }]));

      const creatorIds = [...new Set(batchesInfo.map(b => b.creatorId))];
      let creators: { id: number; role: string }[] = [];
      if (creatorIds.length > 0) {
        creators = await db
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(sql`${users.id} = ANY(ARRAY[${sql.join(creatorIds, sql`, `)}]::int[])`);
      }
      const creatorRoleMap = new Map(creators.map(c => [c.id, c.role]));

      // 获取 campaign_codes 来关联 agent
      await db
        .select({
          campaignId: campaignCodes.campaignId,
          agentId: campaignCodes.agentId,
        })
        .from(campaignCodes);

      let adminFaceValue = 0;
      let agentFaceValue = 0;
      let adminUsedValue = 0;
      let agentUsedValue = 0;

      for (const log of logs) {
        const codeInfo = codeBatchMap.get(log.codeId);
        if (!codeInfo) continue;
        const batchInfo = batchCreatorMap.get(codeInfo.batchId);
        if (!batchInfo) continue;

        const creatorRole = creatorRoleMap.get(batchInfo.creatorId) ?? "user";
        const faceValue = parseFloat(String(log.amount));
        const usedAmount = faceValue;

        if (creatorRole === "agent") {
          agentFaceValue += faceValue;
          agentUsedValue += usedAmount;
        } else {
          adminFaceValue += faceValue;
          adminUsedValue += usedAmount;
        }
      }

      const ADMIN_COST_RATE = 0.7;
      const AGENT_COST_RATE = 0.85;

      const adminCost = Math.round(adminUsedValue * ADMIN_COST_RATE * 100);
      const agentCost = Math.round(agentUsedValue * AGENT_COST_RATE * 100);
      const platformTotalCost = adminCost + agentCost;
      const adminSubsidy = Math.round(adminUsedValue * (1 - ADMIN_COST_RATE) * 100);
      const agentSubsidy = Math.round(agentUsedValue * (1 - AGENT_COST_RATE) * 100);
      const platformSubsidy = adminSubsidy + agentSubsidy;

      const roi = platformTotalCost > 0
        ? Number((((0 - platformTotalCost) / platformTotalCost) * 100).toFixed(2))
        : 0;

      const totalCostStr = String(platformTotalCost);
      const adminCostStr = String(adminCost);
      const agentCostStr = String(agentCost);
      const subsidyAmountStr = String(platformSubsidy);
      const subsidyRatioComputed = platformTotalCost > 0 ? platformSubsidy / platformTotalCost : 0;

      reply.status(200).send({
        code: 0,
        data: {
          period: periodStr,
          totalCost: totalCostStr,
          adminCost: adminCostStr,
          agentCost: agentCostStr,
          subsidyAmount: subsidyAmountStr,
          subsidyRatio: subsidyRatioComputed,
          adminVsAgent: {
            admin: { cost: adminCostStr, subsidy: String(adminSubsidy), revenue: "0", netEffect: String(-adminCost) },
            agent: { cost: agentCostStr, subsidy: String(agentSubsidy), revenue: "0", netEffect: String(-agentCost) },
          },
          platformTotalCost,
          platformSubsidy,
          revenueAttributed: 0,
          roi,
          source: "computed",
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
