// ============================================================
//  3cloud (3C) — 价格变更历史 API
//  GET  /api/v1/admin/prices/history — 查询价格变更历史
//  POST /api/v1/admin/prices/change  — 记录价格变更
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, sql, desc } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { priceChangeHistory, vendorModels, models, users } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

export async function adminPriceChangeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 查询价格变更历史 ──
  app.get("/api/v1/admin/prices/history", {
    preHandler: [requirePerm(Perm.PRICE_MANAGE)],
  }, async (request, reply) => {
    const query = request.query as { targetType?: string; targetId?: string; page?: string; pageSize?: string };
    const targetType = query.targetType;
    const targetId = query.targetId ? Number(query.targetId) : undefined;
    const page = Number(query.page || "1");
    const pageSize = Math.min(100, Number(query.pageSize || "20"));

    try {
      const db = getDb();
      const conditions: any[] = [];
      if (targetType) conditions.push(eq(priceChangeHistory.targetType, targetType));
      if (targetId !== undefined) conditions.push(eq(priceChangeHistory.targetId, targetId));

      const whereClause = conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined;

      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(priceChangeHistory)
        .where(whereClause);

      const total = Number(totalResult?.count ?? 0);

      const rows = await db
        .select({
          id: priceChangeHistory.id,
          operatorId: priceChangeHistory.operatorId,
          changeType: priceChangeHistory.changeType,
          targetType: priceChangeHistory.targetType,
          targetId: priceChangeHistory.targetId,
          oldValue: priceChangeHistory.beforeValue,
          newValue: priceChangeHistory.afterValue,
          reason: priceChangeHistory.reason,
          createdAt: priceChangeHistory.createdAt,
          operatorName: users.nickname,
          modelName: models.displayName,
          vendorModelName: vendorModels.modelSlug,
        })
        .from(priceChangeHistory)
        .leftJoin(users, eq(priceChangeHistory.operatorId, users.id))
        .leftJoin(vendorModels, eq(priceChangeHistory.targetId, vendorModels.id))
        .leftJoin(models, eq(vendorModels.modelId, models.id))
        .where(whereClause)
        .orderBy(desc(priceChangeHistory.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      reply.send({
        code: 0,
        data: {
          list: rows.map(r => ({
            id: r.id,
            modelName: r.modelName || r.vendorModelName || `模型 #${r.targetId ?? "?"}`,
            action: r.changeType,
            oldValue: r.oldValue ? Number(r.oldValue).toFixed(6) : null,
            newValue: r.newValue ? Number(r.newValue).toFixed(6) : null,
            reason: r.reason,
            operator: r.operatorName || `用户 #${r.operatorId}`,
            createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
          })),
          total,
          page,
          pageSize,
        },
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({ code: 1, message: `查询失败: ${err.message}` });
    }
  });

  // ── 记录价格变更 ──
  app.post("/api/v1/admin/prices/change", {
    preHandler: [requirePerm(Perm.PRICE_MANAGE)],
  }, async (request, reply) => {
    const body = request.body as {
      targetType: string
      targetId: number
      changeType: string
      oldValue?: string
      newValue?: string
      reason?: string
    };
    const userId = request.user!.userId;

    try {
      const db = getDb();
      await db.insert(priceChangeHistory).values({
        operatorId: userId,
        changeType: body.changeType,
        targetType: body.targetType,
        targetId: body.targetId,
        beforeValue: body.oldValue || null,
        afterValue: body.newValue || null,
        reason: body.reason || null,
      });

      reply.send({ code: 0, data: null, message: "记录成功" });
    } catch (err: any) {
      reply.status(500).send({ code: 1, message: `记录失败: ${err.message}` });
    }
  });
}