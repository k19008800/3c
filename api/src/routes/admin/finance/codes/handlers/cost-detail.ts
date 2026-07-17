// ============================================================
//  B. 成本明细
//  GET /api/v1/admin/finance/codes/cost-detail/:type
//  type = 'admin' | 'agent'
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../../../../db/index.js";
import { requirePerm, Perm } from "../../../../../middleware/auth.js";
import { AppError } from "../../../../../services/auth-service/index.js";
import {
  redemptionBatches,
  redemptionCodes,
  redemptionLogs,
  campaigns,
  financeCostRecords,
  agents,
  users,
} from "../../../../../db/schema.js";

export async function costDetailRoutes(app: FastifyInstance) {

  app.get("/api/v1/admin/finance/codes/cost-detail/:type", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const { type } = request.params as { type: string };
      if (type !== "admin" && type !== "agent") {
        reply.status(400).send({ code: 400, data: null, message: "type 必须为 admin 或 agent" });
        return;
      }

      const db = getDb();
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

      if (type === "admin") {
        const queryParams = request.query as Record<string, string | undefined>;
        const page = Math.max(1, parseInt(queryParams.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(queryParams.pageSize ?? "20", 10) || 20));
        const offset = (page - 1) * pageSize;
        const search = queryParams.search;
        const ADMIN_COST_RATE = 0.7;

        // ── 从日志实时计算 Admin 成本 ──
        // 查询该月份 admin 角色创建的批次下的所有兑换日志
        const adminLogs = await db
          .select({
            logId: redemptionLogs.id,
            logAmount: redemptionLogs.amount,
            createdAt: redemptionLogs.createdAt,
            batchId: redemptionBatches.id,
            batchName: redemptionBatches.name,
            batchTotalCount: redemptionBatches.totalCount,
            batchUsedCount: redemptionBatches.usedCount,
            codeId: redemptionCodes.id,
            codeAmount: redemptionCodes.amount,
          })
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
          )
          .orderBy(desc(redemptionLogs.createdAt));

        // ── 按活动分组（从批次名提取 campaignId）──
        // batch 名格式："活动 #${campaignId} - ${campaign.name}"
        const campaignMap = new Map<number, any>();
        const uncategorized: any = {
          campaignId: 0,
          campaignName: "未关联活动",
          issuedCount: 0,
          usedCount: 0,
          totalFaceValue: 0,
          costAmount: 0,
          subsidyAmount: 0,
          batches: new Map<number, any>(),
        };

        for (const log of adminLogs) {
          const logAmountNum = parseFloat(String(log.logAmount));
          const match = log.batchName?.match(/活动\s*#(\d+)/);
          const cid = match ? parseInt(match[1], 10) : 0;
          const grp: any = cid > 0
            ? (campaignMap.has(cid)
                ? campaignMap.get(cid)
                : campaignMap.set(cid, {
                    campaignId: cid,
                    campaignName: `活动 #${cid}`,
                    issuedCount: 0, usedCount: 0,
                    totalFaceValue: 0, costAmount: 0, subsidyAmount: 0,
                    batches: new Map<number, any>(),
                  }).get(cid))
            : uncategorized;

          grp.usedCount++;
          grp.totalFaceValue += logAmountNum;
          const cost = Math.round(logAmountNum * ADMIN_COST_RATE * 100) / 100;
          const subsidy = Math.round(logAmountNum * (1 - ADMIN_COST_RATE) * 100) / 100;
          grp.costAmount += cost;
          grp.subsidyAmount += subsidy;

          if (!grp.batches.has(log.batchId)) {
            grp.batches.set(log.batchId, {
              batchId: log.batchId,
              batchName: log.batchName ?? `批次 #${log.batchId}`,
              count: log.batchTotalCount,
              usedCount: 0, faceValue: 0, costAmount: 0, subsidyAmount: 0,
            });
          }
          const b = grp.batches.get(log.batchId);
          b.usedCount++;
          b.faceValue += logAmountNum;
          b.costAmount += cost;
          b.subsidyAmount += subsidy;
        }

        // ── 获取活动名称 + 预算 ──
        const allCids = [...campaignMap.keys()];
        const campaignMeta = new Map<number, { name: string; budgetAmount: number }>();
        if (allCids.length > 0) {
          const rows = await db
            .select({ id: campaigns.id, name: campaigns.name, budgetAmount: campaigns.budgetAmount })
            .from(campaigns)
            .where(sql`${campaigns.id} = ANY(ARRAY[${sql.join(allCids, sql`, `)}]::int[])`);
          for (const r of rows) {
            campaignMeta.set(r.id, { name: r.name, budgetAmount: r.budgetAmount ?? 0 });
          }
        }

        // ── 发放量 + 活动名称填充 ──
        for (const [cid, grp] of campaignMap.entries()) {
          const meta = campaignMeta.get(cid);
          if (meta) grp.campaignName = meta.name;
          let totalIssued = 0;
          for (const b of grp.batches.values()) totalIssued += b.count;
          grp.issuedCount = totalIssued;
        }

        // ── 合成列表 ──
        let allItems: any[] = [];
        for (const [, grp] of campaignMap.entries()) {
          const meta = campaignMeta.get(grp.campaignId);
          const budgetAmount = meta?.budgetAmount ?? 0;
          const costInCents = Math.round(grp.costAmount * 100);
          const budgetInCents = budgetAmount;
          allItems.push({
            campaignId: grp.campaignId,
            campaignName: grp.campaignName,
            issuedCount: grp.issuedCount,
            usedCount: grp.usedCount,
            usageRate: grp.issuedCount > 0 ? Number((grp.usedCount / grp.issuedCount).toFixed(4)) : 0,
            totalFaceValue: Math.round(grp.totalFaceValue * 100),
            costAmount: costInCents,
            subsidyAmount: Math.round(grp.subsidyAmount * 100),
            budgetAmount: budgetInCents,
            budgetExecutionRate: budgetInCents > 0 ? Number((costInCents / budgetInCents).toFixed(4)) : 0,
            batches: [...grp.batches.values()].map((b: any) => ({
              batchId: b.batchId,
              batchName: b.batchName,
              count: b.count,
              usedCount: b.usedCount,
              faceValue: Math.round(b.faceValue * 100),
              costAmount: Math.round(b.costAmount * 100),
              subsidyAmount: Math.round(b.subsidyAmount * 100),
            })),
          });
        }

        if (uncategorized.usedCount > 0) {
          allItems.push({
            campaignId: 0,
            campaignName: "未关联活动",
            issuedCount: uncategorized.issuedCount,
            usedCount: uncategorized.usedCount,
            usageRate: 0,
            totalFaceValue: Math.round(uncategorized.totalFaceValue * 100),
            costAmount: Math.round(uncategorized.costAmount * 100),
            subsidyAmount: Math.round(uncategorized.subsidyAmount * 100),
            budgetAmount: 0,
            budgetExecutionRate: 0,
            batches: [...uncategorized.batches.values()].map((b: any) => ({
              batchId: b.batchId,
              batchName: b.batchName,
              count: b.count,
              usedCount: b.usedCount,
              faceValue: Math.round(b.faceValue * 100),
              costAmount: Math.round(b.costAmount * 100),
              subsidyAmount: Math.round(b.subsidyAmount * 100),
            })),
          });
        }

        // ── 搜索过滤 + 排序 + 汇总 ──
        if (search) {
          allItems = allItems.filter(i => i.campaignName.toLowerCase().includes(search.toLowerCase()));
        }
        allItems.sort((a, b) => b.costAmount - a.costAmount);
        const totalFaceAll = allItems.reduce((s, i) => s + i.totalFaceValue, 0);
        const totalCostAll = allItems.reduce((s, i) => s + i.costAmount, 0);
        const totalSubsidyAll = allItems.reduce((s, i) => s + i.subsidyAmount, 0);

        // ── 分页 ──
        const total = allItems.length;
        const paged = allItems.slice(offset, offset + pageSize);

        reply.status(200).send({
          code: 0,
          data: {
            period: periodStr,
            summary: {
              totalFaceValue: totalFaceAll,
              totalCost: totalCostAll,
              totalSubsidy: totalSubsidyAll,
              costExecutionRate: totalFaceAll > 0 ? Number((totalCostAll / totalFaceAll).toFixed(4)) : 0,
              campaignCount: total,
            },
            list: paged,
            total,
            page,
            pageSize,
          },
          message: "ok",
        });
      } else {
        // agent: 按代理维度汇总
        const records = await db
          .select({
            agentId: financeCostRecords.agentId,
            totalFace: sql<string>`coalesce(sum(${financeCostRecords.totalFace})::text, '0')`,
            totalUsed: sql<string>`coalesce(sum(${financeCostRecords.totalUsed})::text, '0')`,
            costAmount: sql<string>`coalesce(sum(${financeCostRecords.costAmount})::text, '0')`,
            subsidyAmount: sql<string>`coalesce(sum(${financeCostRecords.subsidyAmount})::text, '0')`,
          })
          .from(financeCostRecords)
          .where(
            and(
              eq(financeCostRecords.costType, "agent_cost"),
              sql`${financeCostRecords.period} >= ${periodStart}::timestamptz`,
              sql`${financeCostRecords.period} < ${periodEnd}::timestamptz`,
            )
          )
          .groupBy(financeCostRecords.agentId);

        // 获取 agent 名称
        const agentIds = records.map(r => r.agentId).filter((id): id is number => id !== null);
        let agentNames = new Map<number, string>();
        if (agentIds.length > 0) {
          const agentsInfo = await db
            .select({
              id: agents.id,
              email: users.email,
              nickname: users.nickname,
            })
            .from(agents)
            .innerJoin(users, eq(agents.userId, users.id))
            .where(sql`${agents.id} = ANY(ARRAY[${sql.join(agentIds, sql`, `)}]::int[])`);
          agentNames = new Map(agentsInfo.map(a => [a.id, a.nickname ?? a.email ?? `代理商 #${a.id}`]));
        }

        const detail = records.map(r => ({
          agentId: r.agentId,
          agentName: r.agentId ? agentNames.get(r.agentId) ?? `代理商 #${r.agentId}` : "未关联代理",
          totalFace: Number(r.totalFace),
          totalUsed: Number(r.totalUsed),
          costAmount: Number(r.costAmount),
          subsidyAmount: Number(r.subsidyAmount),
        }));

        reply.status(200).send({
          code: 0,
          data: { period: periodStr, type, items: detail },
          message: "ok",
        });
      }
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

}
