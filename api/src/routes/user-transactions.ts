// ============================================================
//  3cloud (3C) — 用户交易流水路由
//  GET /api/v1/user/transactions  — 用户自己的交易流水
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { balanceLogs } from "../db/schema/billing.js";
import { authenticateJWT } from "../middleware/auth.js";

const TYPE_MAP: Record<string, string> = {
  recharge: "recharge",
  deduction: "consumption",
  refund: "refund",
  commission: "commission",
};

export async function userTransactionRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────────────────────
  //  GET /api/v1/user/transactions
  //  Query: page, pageSize, type (recharge|deduction|refund|commission), startDate, endDate
  //  从 balance_logs 表查询，按时间倒序分页
  //  返回: { code: 0, data: { list, total, page, pageSize } }
  //  权限: 登录用户自己查看自己的流水
  // ──────────────────────────────────────────────────────────────

  app.get("/api/v1/user/transactions", {
    preHandler: [authenticateJWT],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        type?: string;
        startDate?: string;
        endDate?: string;
      };

      const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
      const offset = (page - 1) * pageSize;
      const userId = request.user!.userId;

      const db = getDb();
      const conditions: any[] = [eq(balanceLogs.userId, userId)];

      // Type filter: map frontend types to DB enum
      if (query.type) {
        const dbType = TYPE_MAP[query.type];
        if (dbType) {
          conditions.push(eq(balanceLogs.type, dbType as any));
        }
      }

      // Date range filter
      if (query.startDate) {
        conditions.push(gte(balanceLogs.createdAt, new Date(query.startDate)));
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(balanceLogs.createdAt, end));
      }

      // Total count
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(balanceLogs)
        .where(and(...conditions));

      const total = totalResult?.count ?? 0;

      // Paginated list
      const rows = await db
        .select({
          id: balanceLogs.id,
          userId: balanceLogs.userId,
          amount: balanceLogs.amount,
          balanceAfter: balanceLogs.balanceAfter,
          type: balanceLogs.type,
          refType: balanceLogs.refType,
          refId: balanceLogs.refId,
          description: balanceLogs.description,
          createdAt: balanceLogs.createdAt,
        })
        .from(balanceLogs)
        .where(and(...conditions))
        .orderBy(desc(balanceLogs.createdAt))
        .limit(pageSize)
        .offset(offset);

      reply.status(200).send({
        code: 0,
        data: {
          list: rows.map(r => ({
            ...r,
            amount: r.amount,
            balanceAfter: r.balanceAfter,
            createdAt: r.createdAt.toISOString(),
          })),
          total,
          page,
          pageSize,
        },
        message: "ok",
      });
    } catch (err: any) {
      request.log.error({ err }, "user transactions error");
      throw err;
    }
  });
}
