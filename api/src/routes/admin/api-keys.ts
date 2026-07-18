// ============================================================
//  3cloud (3C) — API Key 管理（管理员视角）
//  GET    /api/v1/admin/users/:id/api-keys              — 用户API Key列表
//  PATCH  /api/v1/admin/users/:id/api-keys/:keyId       — 更新Key
//  DELETE /api/v1/admin/users/:id/api-keys/:keyId       — 删除Key
//  GET    /api/v1/admin/users/:id/api-keys/:keyId/call-stats — Key调用统计
//  GET    /api/v1/admin/users/:id/api-keys/:keyId/call-trends — Key调用趋势
//  GET    /api/v1/admin/users/:id/api-keys/:keyId/call-logs — Key调用日志
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql, gte, lt } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { apiKeys, callLogs, auditLogs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

export async function adminApiKeyRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/api-keys — API Key 列表
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/users/:id/api-keys", {
    preHandler: [requirePerm(Perm.USER_LIST)]
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        status: apiKeys.status,
        quotaBalance: apiKeys.quotaBalance,
        expiresAt: apiKeys.expiresAt,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt));

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({
          ...r,
          expiresAt: r.expiresAt?.toISOString() ?? null,
          lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  PATCH /api/v1/admin/users/:id/api-keys/:keyId — 更新 API Key
  // ──────────────────────────────────────────────
  app.patch("/api/v1/admin/users/:id/api-keys/:keyId", {
    preHandler: [requirePerm(Perm.USER_EDIT)]
  }, async (request, reply) => {
    const db = getDb();
    const { id, keyId } = request.params as { id: string; keyId: string };
    const userId = parseInt(id, 10);
    const kId = parseInt(keyId, 10);

    if (isNaN(userId) || isNaN(kId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的参数" });
      return;
    }

    const { name, status } = request.body as { name?: string; status?: boolean };

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (status !== undefined) updateData.status = status;

    if (Object.keys(updateData).length === 0) {
      reply.status(400).send({ code: 400, data: null, message: "没有要更新的字段" });
      return;
    }

    const [existing] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.id, kId), eq(apiKeys.userId, userId)))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: "API Key 不存在" });
      return;
    }

    await db.update(apiKeys).set(updateData).where(eq(apiKeys.id, kId));

    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "user_update",
      targetType: "api_key",
      targetId: kId,
      before: { name: existing.name, status: existing.status },
      after: updateData,
      ip: request.ip,
      description: `更新用户 #${userId} 的 API Key #${kId}`,
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "API Key 已更新",
    });
  });

  // ──────────────────────────────────────────────
  //  DELETE /api/v1/admin/users/:id/api-keys/:keyId — 删除 API Key
  // ──────────────────────────────────────────────
  app.delete("/api/v1/admin/users/:id/api-keys/:keyId", {
    preHandler: [requirePerm(Perm.USER_DELETE)]
  }, async (request, reply) => {
    const db = getDb();
    const { id, keyId } = request.params as { id: string; keyId: string };
    const userId = parseInt(id, 10);
    const kId = parseInt(keyId, 10);

    if (isNaN(userId) || isNaN(kId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的参数" });
      return;
    }

    const [existing] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.id, kId), eq(apiKeys.userId, userId)))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: "API Key 不存在" });
      return;
    }

    await db.update(apiKeys).set({ status: false }).where(eq(apiKeys.id, kId));

    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "user_update",
      targetType: "api_key",
      targetId: kId,
      before: { name: existing.name },
      ip: request.ip,
      description: `删除用户 #${userId} 的 API Key: ${existing.name}`,
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "API Key 已删除",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/api-keys/:keyId/call-stats — Key调用统计
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/users/:id/api-keys/:keyId/call-stats", {
    preHandler: [requirePerm(Perm.USER_LIST)]
  }, async (request, reply) => {
    const db = getDb();
    const { id, keyId } = request.params as { id: string; keyId: string };
    const userId = parseInt(id, 10);
    const kId = parseInt(keyId, 10);

    if (isNaN(userId) || isNaN(kId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的参数" });
      return;
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayStats] = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
        successCount: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        failedCount: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
      })
      .from(callLogs)
      .where(
        and(
          eq(callLogs.userId, userId),
          eq(callLogs.apiKeyId, kId),
          gte(callLogs.createdAt, todayStart)
        )
      );

    const [monthStats] = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
      })
      .from(callLogs)
      .where(
        and(
          eq(callLogs.userId, userId),
          eq(callLogs.apiKeyId, kId),
          gte(callLogs.createdAt, thisMonthStart)
        )
      );

    reply.status(200).send({
      code: 0,
      data: {
        today: {
          count: todayStats?.count ?? 0,
          totalTokens: Number(todayStats?.totalTokens ?? 0),
          totalCost: todayStats?.totalCost ?? "0",
          successCount: todayStats?.successCount ?? 0,
          failedCount: todayStats?.failedCount ?? 0,
        },
        thisMonth: {
          count: monthStats?.count ?? 0,
          totalTokens: Number(monthStats?.totalTokens ?? 0),
          totalCost: monthStats?.totalCost ?? "0",
        },
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/api-keys/:keyId/call-trends — Key调用趋势
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/users/:id/api-keys/:keyId/call-trends", {
    preHandler: [requirePerm(Perm.USER_LIST)]
  }, async (request, reply) => {
    const db = getDb();
    const { id, keyId } = request.params as { id: string; keyId: string };
    const userId = parseInt(id, 10);
    const kId = parseInt(keyId, 10);

    if (isNaN(userId) || isNaN(kId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的参数" });
      return;
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);

    const rows = await db
      .select({
        date: sql<string>`${callLogs.createdAt}::date::text`,
        count: sql<number>`count(*)::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
      })
      .from(callLogs)
      .where(
        and(
          eq(callLogs.userId, userId),
          eq(callLogs.apiKeyId, kId),
          gte(callLogs.createdAt, sevenDaysAgo)
        )
      )
      .groupBy(sql`${callLogs.createdAt}::date`)
      .orderBy(sql`${callLogs.createdAt}::date asc`);

    reply.status(200).send({
      code: 0,
      data: {
        list: rows,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/api-keys/:keyId/call-logs — Key调用日志
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/users/:id/api-keys/:keyId/call-logs", {
    preHandler: [requirePerm(Perm.USER_LIST)]
  }, async (request, reply) => {
    const db = getDb();
    const { id, keyId } = request.params as { id: string; keyId: string };
    const query = request.query as {
      page?: string;
      pageSize?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
    };

    const userId = parseInt(id, 10);
    const kId = parseInt(keyId, 10);
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    if (isNaN(userId) || isNaN(kId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的参数" });
      return;
    }

    const conditions = [
      eq(callLogs.userId, userId),
      eq(callLogs.apiKeyId, kId),
    ];

    if (query.status) {
      conditions.push(eq(callLogs.status, query.status as any));
    }
    if (query.startDate) {
      conditions.push(gte(callLogs.createdAt, new Date(query.startDate)));
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(lt(callLogs.createdAt, end));
    }

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(callLogs)
      .where(and(...conditions));

    const total = totalResult?.count ?? 0;

    const rows = await db
      .select({
        id: callLogs.id,
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
      })
      .from(callLogs)
      .where(and(...conditions))
      .orderBy(desc(callLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    reply.status(200).send({
      code: 0,
      data: {
        list: rows,
        total,
        page,
        pageSize,
      },
      message: "ok",
    });
  });
}
