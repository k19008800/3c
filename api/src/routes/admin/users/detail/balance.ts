import { eq, and, desc, lt, sql } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { getDb } from "../../../../db/index.js";
import { balanceLogs } from "../../../../db/schema.js";
import { requirePerm, Perm } from "../../../../middleware/auth.js";
import { validateUserId, type PageQuery } from "./types.js";

export function registerBalanceRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/balance-logs — 余额流水
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/users/:id/balance-logs", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = validateUserId(id, reply);
    if (!userId) return;

    const query = request.query as PageQuery & { type?: string };
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const useCursor = !!query.cursor;
    const offset = useCursor ? 0 : (page - 1) * pageSize;

    const conditions = [eq(balanceLogs.userId, userId)];
    if (useCursor && query.cursor) {
      conditions.push(lt(balanceLogs.createdAt, new Date(query.cursor)));
    }
    if (query.type) {
      conditions.push(eq(balanceLogs.type, query.type as any));
    }

    let total = 0;
    if (!useCursor) {
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(balanceLogs)
        .where(and(...conditions));
      total = Number(totalResult?.count ?? 0);
    }

    const queryBuilder = db
      .select()
      .from(balanceLogs)
      .where(and(...conditions))
      .orderBy(desc(balanceLogs.createdAt))
      .limit(pageSize);

    const rows = useCursor ? await queryBuilder : await queryBuilder.offset(offset);
    const nextCursor = useCursor && rows.length === pageSize
      ? rows[rows.length - 1].createdAt.toISOString()
      : undefined;

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize,
        nextCursor,
      },
      message: "ok",
    });
  });
}
