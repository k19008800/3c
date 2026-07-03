// ============================================================
//  3cloud (3C) — Admin 调用日志
//  GET /api/v1/admin/logs — 所有用户的调用日志（管理员视角）
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lt, like, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { callLogs, users } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

export async function adminLogRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/logs — 调用日志列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/logs", {
    preHandler: [requirePerm(Perm.LOG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      page?: string;
      pageSize?: string;
      cursor?: string;
      keyword?: string;     // 搜索用户邮箱
      modelName?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    };

    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const useCursor = !!query.cursor;
    const offset = useCursor ? 0 : (page - 1) * pageSize;

    const conditions: any[] = [sql`1=1`];

    // 游标分页条件
    if (useCursor && query.cursor) {
      conditions.push(lt(callLogs.createdAt, new Date(query.cursor)));
    }

    if (query.keyword) {
      // 通过子查询匹配用户邮箱
      conditions.push(
        sql`${callLogs.userId} IN (SELECT id FROM ${users} WHERE ${users.email}::text ILIKE ${`%${query.keyword}%`})`
      );
    }
    if (query.modelName) {
      conditions.push(like(callLogs.modelName, `%${query.modelName}%`));
    }
    if (query.status) {
      conditions.push(eq(callLogs.status, query.status as any));
    }
    if (query.startDate) {
      conditions.push(gte(callLogs.createdAt, new Date(query.startDate)));
    }
    if (query.endDate) {
      // endDate 包含当天
      const end = new Date(query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(lt(callLogs.createdAt, end));
    }

    let count = 0;
    if (!useCursor) {
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(callLogs)
        .where(and(...conditions));
      count = countResult.count;
    }

    const queryBuilder = db
      .select({
        id: callLogs.id,
        userId: callLogs.userId,
        modelId: callLogs.modelId,
        modelName: callLogs.modelName,
        vendorName: callLogs.vendorName,
        promptTokens: callLogs.promptTokens,
        completionTokens: callLogs.completionTokens,
        totalTokens: callLogs.totalTokens,
        cost: callLogs.cost,
        status: callLogs.status,
        duration: callLogs.durationMs,
        errorMessage: callLogs.errorMessage,
        createdAt: callLogs.createdAt,
        userEmail: users.email,
      })
      .from(callLogs)
      .leftJoin(users, eq(callLogs.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(callLogs.createdAt))
      .limit(pageSize);

    const rows = useCursor ? await queryBuilder : await queryBuilder.offset(offset);
    const nextCursor = useCursor && rows.length === pageSize
      ? rows[rows.length - 1].createdAt.toISOString()
      : undefined;

    reply.send({
      code: 0,
      data: {
        list: rows,
        total: count,
        page,
        pageSize,
        nextCursor,
      },
      message: "ok",
    });
  });
}
