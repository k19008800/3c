// ============================================================
//  F. Code 成本分页列表
//  GET /api/v1/admin/finance/code-cost?period=YYYY-MM&page=&pageSize=
//  按 period 聚合兑换码（redemption_logs）成本数据
//  权限: FINANCE_VIEW
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
  users,
} from "../../../../../db/schema.js";

export async function codeCostRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/finance/code-cost", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    try {
      const q = request.query as { period?: string; page?: string; pageSize?: string };
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

      const page = Math.max(1, parseInt(q.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize ?? "20", 10) || 20));
      const offset = (page - 1) * pageSize;

      const db = getDb();
      const ADMIN_COST_RATE = 0.7;
      const AGENT_COST_RATE = 0.85;

      // 总量统计
      const [agg] = await db
        .select({
          totalCount: sql<number>`count(*)::int`,
          totalAmount: sql<string>`coalesce(sum(${redemptionLogs.amount}), 0)`,
        })
        .from(redemptionLogs)
        .where(
          and(
            sql`${redemptionLogs.createdAt} >= ${periodStart}::timestamptz`,
            sql`${redemptionLogs.createdAt} < ${periodEnd}::timestamptz`,
          )
        );

      // 分页明细
      const rows = await db
        .select({
          id: redemptionLogs.id,
          codeId: redemptionLogs.codeId,
          userId: redemptionLogs.userId,
          amount: redemptionLogs.amount,
          batchId: redemptionLogs.batchId,
          createdAt: redemptionLogs.createdAt,
          batchName: redemptionBatches.name,
          batchStatus: redemptionBatches.status,
          batchAmount: redemptionBatches.amount,
          batchCreatorId: redemptionBatches.creatorId,
        })
        .from(redemptionLogs)
        .leftJoin(redemptionCodes, eq(redemptionLogs.codeId, redemptionCodes.id))
        .leftJoin(redemptionBatches, eq(redemptionCodes.batchId, redemptionBatches.id))
        .where(
          and(
            sql`${redemptionLogs.createdAt} >= ${periodStart}::timestamptz`,
            sql`${redemptionLogs.createdAt} < ${periodEnd}::timestamptz`,
          )
        )
        .orderBy(desc(redemptionLogs.createdAt))
        .limit(pageSize)
        .offset(offset);

      // 获取 batch creator 角色来判断成本类型
      const creatorIds = [...new Set(rows.map(r => r.batchCreatorId).filter(Boolean))] as number[];
      let creatorRoleMap = new Map<number, string>();
      if (creatorIds.length > 0) {
        const creatorRows = await db
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(sql`${users.id} = ANY(ARRAY[${sql.join(creatorIds, sql`, `)}]::int[])`);
        creatorRoleMap = new Map(creatorRows.map(c => [c.id, c.role]));
      }

      // 组装成本数据
      const items = rows.map(r => {
        const amountNum = parseFloat(String(r.amount));
        const role = r.batchCreatorId ? creatorRoleMap.get(r.batchCreatorId) : null;
        const isAgent = role === "agent";
        const costRate = isAgent ? AGENT_COST_RATE : ADMIN_COST_RATE;
        const costValue = amountNum * costRate;
        const subsidyValue = amountNum - costValue;
        return {
          id: r.id,
          codeId: r.codeId,
          userId: r.userId,
          amount: r.amount,
          batchId: r.batchId,
          batchName: r.batchName,
          batchStatus: r.batchStatus,
          costType: isAgent ? "agent_cost" : "admin_marketing",
          costRate,
          costAmount: costValue.toFixed(6),
          subsidyAmount: subsidyValue.toFixed(6),
          createdAt: r.createdAt.toISOString(),
        };
      });

      reply.status(200).send({
        code: 0,
        data: {
          period: periodStr,
          summary: {
            totalCount: agg?.totalCount ?? 0,
            totalAmount: agg?.totalAmount ?? "0",
          },
          items,
          total: agg?.totalCount ?? 0,
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
