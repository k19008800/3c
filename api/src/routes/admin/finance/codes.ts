// ============================================================
//  3cloud (3C) — 财务成本核算路由（管理员）
//
//  A. 成本看板
//  B. 成本明细
//  C. 代理商结算对账
//  D. 代理商资金流水
//  E. Agent 成本明细（新）
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, sum, count, like, or, asc } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";
import { AppError } from "../../../services/auth-service.js";
import {
  agents,
  users,
  redemptionBatches,
  redemptionCodes,
  redemptionLogs,
  campaigns,
  campaignCodes,
  financeCostRecords,
  agentBalanceLedger,
} from "../../../db/schema.js";

export async function adminFinanceCodeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ════════════════════════════════════════════════════════════
  //  A. 成本看板
  // ════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/codes/cost-overview
  //  params: period (YYYY-MM, e.g. 2026-07)
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/codes/cost-overview", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const query = request.query as { period?: string };
      const periodStr = query.period ?? (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      })();

      // 解析月份范围
      const [yearStr, monthStr] = periodStr.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        reply.status(400).send({ code: 400, data: null, message: "无效的月份格式，请使用 YYYY-MM" });
        return;
      }

      const periodStart = new Date(Date.UTC(year, month - 1, 1));
      const periodEnd = new Date(Date.UTC(year, month, 1)); // exclusive end

      const db = getDb();

      // 先查已 finalize 的记录
      const finalizedRecords = await db
        .select({
          costType: financeCostRecords.costType,
          totalFace: sql<number>`coalesce(sum(${financeCostRecords.totalFace}), 0)`,
          totalUsed: sql<number>`coalesce(sum(${financeCostRecords.totalUsed}), 0)`,
          costAmount: sql<number>`coalesce(sum(${financeCostRecords.costAmount}), 0)`,
          subsidyAmount: sql<number>`coalesce(sum(${financeCostRecords.subsidyAmount}), 0)`,
          revenueAttributed: sql<number>`coalesce(sum(${financeCostRecords.revenueAttributed}), 0)`,
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
        // 已有 finalize 记录，直接返回汇总
        let platformCost = 0;
        let adminCost = 0;
        let agentCost = 0;
        let platformSubsidy = 0;
        let adminSubsidy = 0;
        let agentSubsidy = 0;
        let revenue = 0;

        for (const r of finalizedRecords) {
          platformCost += r.costAmount;
          platformSubsidy += r.subsidyAmount;
          revenue += r.revenueAttributed;
          if (r.costType === "admin_marketing") {
            adminCost += r.costAmount;
            adminSubsidy += r.subsidyAmount;
          } else if (r.costType === "agent_cost") {
            agentCost += r.costAmount;
            agentSubsidy += r.subsidyAmount;
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
      // 查询该月份的所有 redemption logs
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
            totalCost: "0",
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

      // 获取所有涉及 code 的 batch/agent 信息
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

      // 获取 admin 用户的角色来判断 batch 创建者角色
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
      const campaignAllocs = await db
        .select({
          campaignId: campaignCodes.campaignId,
          agentId: campaignCodes.agentId,
        })
        .from(campaignCodes);

      // 构建 batch → campaign/agent 映射（一个 batch 属于一个 campaign）
      // 简化处理：如果 batch 的 name 包含 campaign 关键词，则通过关联查找
      // 更准确的方式是通过批次名称前段匹配活动 ID
      let batchCampaignMap = new Map<number, { campaignId: number | null; agentId: number | null }>();

      // 从 campaignCodes 获取每个 campaign 关联的所有 agent
      const campaignAgentMap = new Map<number, number | null>();
      for (const alloc of campaignAllocs) {
        if (!campaignAgentMap.has(alloc.campaignId)) {
          // 取第一个 agent 记录（一个 campaign 可能发给多个 agent）
          // 这里用 aggregate
        }
      }

      // 简化：直接通过 redemptionBatches 来区分 admin vs agent
      // admin 角色创建的 batch = admin_marketing
      // agent 角色创建的 batch = agent_cost

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
        const usedAmount = faceValue; // 已兑换即已使用

        if (creatorRole === "agent") {
          agentFaceValue += faceValue;
          agentUsedValue += usedAmount;
        } else {
          // admin / super_admin 等
          adminFaceValue += faceValue;
          adminUsedValue += usedAmount;
        }
      }

      // 成本计算：
      // Admin 成本 = 面值 * 成本系数（简化：假设成本价 = 面值 * 0.7）
      // Agent 成本 = 面值 * 成本系数（简化：假设成本价 = 面值 * 0.85）
      // 平台补贴 = 面值 - 成本价
      const ADMIN_COST_RATE = 0.7;
      const AGENT_COST_RATE = 0.85;

      // 转换为分单位
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

  // ════════════════════════════════════════════════════════════
  //  B. 成本明细
  // ════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/codes/cost-detail/:type
  //  type = 'admin' | 'agent'
  //  admin: 按活动维度汇总各活动的成本
  //  agent: 按代理维度汇总各代理的成本
  // ──────────────────────────────────────────────

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
            totalFace: sql<number>`coalesce(sum(${financeCostRecords.totalFace}), 0)`,
            totalUsed: sql<number>`coalesce(sum(${financeCostRecords.totalUsed}), 0)`,
            costAmount: sql<number>`coalesce(sum(${financeCostRecords.costAmount}), 0)`,
            subsidyAmount: sql<number>`coalesce(sum(${financeCostRecords.subsidyAmount}), 0)`,
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
          totalFace: r.totalFace,
          totalUsed: r.totalUsed,
          costAmount: r.costAmount,
          subsidyAmount: r.subsidyAmount,
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

  // ════════════════════════════════════════════════════════════
  //  C. 代理商结算对账
  // ════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/codes/agent-settlement
  //  params: period (YYYY-MM)
  //  返回每个 agent 的期初余额、本月消耗、本月冻结、解冻返还、期末余额
  // ──────────────────────────────────────────────

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
      const ledgerSummary = await db
        .select({
          agentId: agentBalanceLedger.agentId,
          balanceType: agentBalanceLedger.balanceType,
          changeType: agentBalanceLedger.changeType,
          totalAmount: sql<number>`coalesce(sum(${agentBalanceLedger.amount}), 0)`,
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
        if (ls.changeType === "deduction") sum.deduction += ls.totalAmount;
        else if (ls.changeType === "freeze") sum.freeze += ls.totalAmount;
        else if (ls.changeType === "unfreeze") sum.unfreeze += ls.totalAmount;
        else if (ls.changeType === "refund") sum.refund += ls.totalAmount;
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

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/codes/agent-settlement/:agentId
  //  单个 agent 的结算明细
  // ──────────────────────────────────────────────

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

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/finance/codes/finalize-settlement
  //  锁定当月结算单 → 写入 finance_cost_records（status=finalized）
  // ──────────────────────────────────────────────

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
        reply.status(400).send({ code: 400, data: null, message: "无效的月份格式，请使用 YYYY-MM" });
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

      // Platform subsidy record (汇总)
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

  // ════════════════════════════════════════════════════════════
  //  D. 代理商资金流水
  // ════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/codes/agent-ledger/:agentId
  //  分页返回 agent_balance_ledger 记录
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/finance/codes/agent-ledger/:agentId", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const { agentId } = request.params as { agentId: string };
      const aId = parseInt(agentId, 10);
      if (isNaN(aId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的代理商 ID" });
        return;
      }

      const query = request.query as {
        page?: string;
        pageSize?: string;
        balanceType?: string;
        changeType?: string;
        startDate?: string;
        endDate?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
      const offset = (page - 1) * pageSize;

      const db = getDb();
      const conditions: any[] = [eq(agentBalanceLedger.agentId, aId)];

      if (query.balanceType) {
        conditions.push(eq(agentBalanceLedger.balanceType, query.balanceType));
      }
      if (query.changeType) {
        conditions.push(eq(agentBalanceLedger.changeType, query.changeType));
      }
      if (query.startDate) {
        conditions.push(sql`${agentBalanceLedger.createdAt} >= ${new Date(query.startDate)}::timestamptz`);
      }
      if (query.endDate) {
        conditions.push(sql`${agentBalanceLedger.createdAt} < ${new Date(query.endDate + "T23:59:59Z")}::timestamptz`);
      }

      const [totalResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(agentBalanceLedger)
        .where(and(...conditions));

      const rows = await db
        .select()
        .from(agentBalanceLedger)
        .where(and(...conditions))
        .orderBy(desc(agentBalanceLedger.createdAt))
        .limit(pageSize)
        .offset(offset);

      reply.status(200).send({
        code: 0,
        data: {
          list: rows.map(r => ({
            id: r.id,
            agentId: r.agentId,
            balanceType: r.balanceType,
            changeType: r.changeType,
            amount: r.amount,
            balanceBefore: r.balanceBefore,
            balanceAfter: r.balanceAfter,
            refType: r.refType,
            refId: r.refId,
            refCodeId: r.refCodeId,
            remark: r.remark,
            createdAt: r.createdAt.toISOString(),
          })),
          total: totalResult?.count ?? 0,
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

  // ════════════════════════════════════════════════════════════
  //  E. Agent 成本明细
  // ════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/finance/agent-cost
  //  params: period, page, pageSize, search, sortBy, sortDir
  //  按代理维度汇总：面值累计、消耗成本、平台补贴、ROI
  // ──────────────────────────────────────────────

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

      // 成本系数（可配置，后续可接入供应商实际定价）
      const AGENT_COST_RATE = 0.85;

      // ── 1. 查出所有活跃的代理商（仅 role='agent' 的）──
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
        const s = `%${query.search}%`;
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
        totalFaceValue: number;   // 所有批次的面值总和（分）
        totalConsumed: number;    // 该月实际被兑换的金额（分）
        consumeRate: number;
        costAmount: number;       // 消耗成本 = 消耗 × 成本系数
        subsidyAmount: number;    // 平台补贴 = 消耗 - 成本
        subsidyRate: number;      // 补贴率
        roi: number;              // ROI（占位，后续完善）
        batches: Array<{
          batchId: number;
          batchName: string;
          totalCount: number;
          usedCount: number;
          usageRate: number;
          faceValue: number;     // 批次面值×数量（分）
          costAmount: number;
          subsidyAmount: number;
          createdAt: string;
        }>;
      };

      const rows: AgentCostRow[] = [];

      for (const agent of agentsList) {
        // 查出该 agent 在该月份之前创建的所有批次（批次是资产，消耗跨月）
        // 实际上应该查该 agent 创建的所有活跃批次 + 当月消耗
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
        const batchIdArr: number[] = batchIds;

        // 查这些批次中在当月被兑换的记录
        let monthlyLogTotal = 0;
        if (batchIdArr.length > 0) {
          const logResult = await db
            .select({
              totalAmount: sql<string>`coalesce(sum(${redemptionLogs.amount}), '0')`,
            })
            .from(redemptionLogs)
            .where(
              and(
                sql`${redemptionLogs.batchId} = ANY(ARRAY[${sql.join(batchIdArr.map(id => sql`${id}::int`), sql`, `)}])`,
                sql`${redemptionLogs.createdAt} >= ${periodStart}::timestamptz`,
                sql`${redemptionLogs.createdAt} < ${periodEnd}::timestamptz`,
              )
            );
          monthlyLogTotal = Math.round(parseFloat(logResult[0]?.totalAmount ?? "0") * 100);
        }

        // 面值总和 = batch.totalCount × batch.amount（分）
        let totalFaceValue = 0;
        for (const b of batches) {
          totalFaceValue += Math.round(b.totalCount * parseFloat(b.amount as string) * 100);
        }

        const totalConsumed = monthlyLogTotal;
        const consumeRate = totalFaceValue > 0 ? totalConsumed / totalFaceValue : 0;
        const costAmount = Math.round(totalConsumed * AGENT_COST_RATE);
        const subsidyAmount = totalConsumed - costAmount;
        const subsidyRate = costAmount > 0 ? subsidyAmount / costAmount : 0;
        const roi = costAmount > 0 ? (0 - costAmount) / costAmount : 0; // 占位

        // 批次明细
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
