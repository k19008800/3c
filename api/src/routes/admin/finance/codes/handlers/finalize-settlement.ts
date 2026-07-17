// ============================================================
//  C. POST 锁定当月结算�?//  POST /api/v1/admin/finance/codes/finalize-settlement
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
  financeCostRecords,
  users,
} from "../../../../../db/schema.js";

export async function finalizeSettlementRoutes(app: FastifyInstance) {
  app.post("/api/v1/admin/finance/codes/finalize-settlement", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const body = request.body as { period?: string } || {};
      const periodStr = body.period ?? (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      })();

      const [yearStr, monthStr] = periodStr.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        reply.status(400).send({ code: 400, data: null, message: "无效的月份格式，请使�?YYYY-MM" });
        return;
      }

      const periodDate = new Date(Date.UTC(year, month - 1, 1));
      const periodStart = periodDate;
      const periodEnd = new Date(Date.UTC(year, month, 1));

      const db = getDb();
      const userId = request.user!.userId;

      // 检查是否已存在 finalized 记录
      const existing = await db
        .select({ id: financeCostRecords.id })
        .from(financeCostRecords)
        .where(
          and(
            eq(financeCostRecords.status, "finalized"),
            eq(financeCostRecords.period, periodDate as any),
          )
        )
        .limit(1);

      if (existing.length > 0) {
        reply.status(400).send({ code: 400, data: null, message: `月份 ${periodStr} 的结算单已锁定，不能重复锁定` });
        return;
      }

      // ── 实时计算成本数据 ──
      // 1. Admin 营销成本
      const adminLogs = await db
        .select({ amount: redemptionLogs.amount })
        .from(redemptionLogs)
        .innerJoin(redemptionCodes, eq(redemptionLogs.codeId, redemptionCodes.id))
        .innerJoin(redemptionBatches, eq(redemptionCodes.batchId, redemptionBatches.id))
        .innerJoin(users, eq(redemptionBatches.creatorId, users.id))
        .where(
          and(
            sql`${users.role} != 'agent'`,
            sql`${redemptionLogs.createdAt} >= ${periodStart}::timestamptz`,
            sql`${redemptionLogs.createdAt} < ${periodEnd}::timestamptz`,
          )
        );

      let adminUsedTotal = 0;
      for (const l of adminLogs) {
        adminUsedTotal += parseFloat(String(l.amount));
      }

      // 2. Agent 成本
      const agentLogsData = await db
        .select({
          amount: redemptionLogs.amount,
          batchId: redemptionCodes.batchId,
        })
        .from(redemptionLogs)
        .innerJoin(redemptionCodes, eq(redemptionLogs.codeId, redemptionCodes.id))
        .innerJoin(redemptionBatches, eq(redemptionCodes.batchId, redemptionBatches.id))
        .innerJoin(users, eq(redemptionBatches.creatorId, users.id))
        .where(
          and(
            eq(users.role, "agent"),
            sql`${redemptionLogs.createdAt} >= ${periodStart}::timestamptz`,
            sql`${redemptionLogs.createdAt} < ${periodEnd}::timestamptz`,
          )
        );

      let agentUsedTotal = 0;
      for (const l of agentLogsData) {
        agentUsedTotal += parseFloat(String(l.amount));
      }

      const ADMIN_COST_RATE = 0.7;
      const AGENT_COST_RATE = 0.85;
      const adminCostAmount = Math.round(adminUsedTotal * ADMIN_COST_RATE * 100);
      const agentCostAmount = Math.round(agentUsedTotal * AGENT_COST_RATE * 100);
      const adminSubsidy = Math.round(adminUsedTotal * (1 - ADMIN_COST_RATE) * 100);
      const agentSubsidy = Math.round(agentUsedTotal * (1 - AGENT_COST_RATE) * 100);

      const records: typeof financeCostRecords.$inferInsert[] = [];

      // Admin cost record
      if (adminUsedTotal > 0) {
        records.push({
          costType: "admin_marketing",
          period: periodDate,
          campaignId: null,
          agentId: null,
          totalFace: Math.round(adminUsedTotal * 100),
          totalUsed: Math.round(adminUsedTotal * 100),
          costAmount: adminCostAmount,
          subsidyAmount: adminSubsidy,
          revenueAttributed: 0,
          roi: adminCostAmount > 0 ? (((0 - adminCostAmount) / adminCostAmount) * 100).toFixed(2) : null,
          status: "finalized",
          createdBy: userId,
        });
      }

      // Agent cost record
      if (agentUsedTotal > 0) {
        records.push({
          costType: "agent_cost",
          period: periodDate,
          campaignId: null,
          agentId: null,
          totalFace: Math.round(agentUsedTotal * 100),
          totalUsed: Math.round(agentUsedTotal * 100),
          costAmount: agentCostAmount,
          subsidyAmount: agentSubsidy,
          revenueAttributed: 0,
          roi: agentCostAmount > 0 ? (((0 - agentCostAmount) / agentCostAmount) * 100).toFixed(2) : null,
          status: "finalized",
          createdBy: userId,
        });
      }

      // Platform subsidy record (汇�?
      const totalSubsidy = adminSubsidy + agentSubsidy;
      if (totalSubsidy > 0) {
        records.push({
          costType: "platform_subsidy",
          period: periodDate,
          campaignId: null,
          agentId: null,
          totalFace: Math.round(adminUsedTotal * 100) + Math.round(agentUsedTotal * 100),
          totalUsed: Math.round(adminUsedTotal * 100) + Math.round(agentUsedTotal * 100),
          costAmount: totalSubsidy,
          subsidyAmount: totalSubsidy,
          revenueAttributed: 0,
          roi: null,
          status: "finalized",
          createdBy: userId,
        });
      }

      if (records.length > 0) {
        await db.insert(financeCostRecords).values(records);
      }

      reply.status(200).send({
        code: 0,
        data: {
          period: periodStr,
          finalizedCount: records.length,
          adminCost: adminCostAmount,
          agentCost: agentCostAmount,
          totalSubsidy,
        },
        message: `月份 ${periodStr} 结算单已锁定`,
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
