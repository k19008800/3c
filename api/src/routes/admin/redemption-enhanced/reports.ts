// ============================================================
//  3cloud (3C) —Admin 兑换码：报表导出
//  GET /api/v1/admin/finance/codes/reports/:type
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, sql, gte, lt } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import {
  financeCostRecords,
} from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import { AppError } from "../../../services/auth-service/index.js";

export function registerReportsRoute(app: FastifyInstance): void {
  app.get("/api/v1/admin/finance/codes/reports/:type", {
    preHandler: [requirePerm(Perm.FINANCE_COMMISSION)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const { type } = request.params as { type: string };
      const query = request.query as { period?: string };

      const periodStr = query.period ?? (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      })();

      const [yearStr, monthStr] = periodStr.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      if (isNaN(year) || isNaN(month)) {
        reply.status(400).send({ code: 400, data: null, message: "action 必填" });
        return;
      }

  //  POST /api/v1/admin/redemption/batch-action — 批量操作
      const periodEnd = new Date(Date.UTC(year, month, 1));

      let csv = "";

      if (type === "monthly") {
        // 月度成本报表
        const records = await db
          .select()
          .from(financeCostRecords)
          .where(
            and(
              gte(financeCostRecords.period, periodStart),
              lt(financeCostRecords.period, periodEnd),
            ),
          )
          .orderBy(financeCostRecords.costType);

        csv = "类型,面值,已使用,成本,补贴,归因收入,ROI\n";
        for (const r of records) {
          csv += `${r.costType},${r.totalFace},${r.totalUsed},${r.costAmount},${r.subsidyAmount},${r.revenueAttributed},${r.roi ?? ""}\n`;
        }
      } else if (type === "agent") {
        // 代理成本报表
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
              gte(financeCostRecords.period, periodStart),
              lt(financeCostRecords.period, periodEnd),
            ),
          )
          .groupBy(financeCostRecords.agentId);

        csv = "类型,面值,已使用,成本,补贴,归因收入,ROI\n";
        for (const r of records) {
          csv += `${r.agentId},${r.totalFace},${r.totalUsed},${r.costAmount},${r.subsidyAmount}\n`;
        }
        if (records.length === 0) {
          csv += "暂无数据\n";
        }
      } else if (type === "campaign") {
        // 活动维度报表
        csv = "类型,面值,已使用,成本,补贴,归因收入,ROI\n";
      } else {
        reply.status(400).send({ code: 400, data: null, message: "type 必须为 monthly, agent 或 campaign" });
        return;
      }

      reply.status(200).send({
        code: 0,
        data: { csv, type, period: periodStr },
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
