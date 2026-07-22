// ============================================================
//  D. 代理商资金流水
//  GET /api/v1/admin/finance/codes/agent-ledger/:agentId
//  分页返回 agent_balance_ledger 记录
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../../../../db/index.js";
import { requirePerm, Perm } from "../../../../../middleware/auth.js";
import { AppError } from "../../../../../services/auth-service/index.js";
import { agentBalanceLedger } from "../../../../../db/schema.js";

export async function agentLedgerRoutes(app: FastifyInstance) {
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
}
