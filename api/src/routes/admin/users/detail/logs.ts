import { eq, and, desc, lt, gte, sql } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { getDb } from "../../../../db/index.js";
import {
  auditLogs,
  userLoginHistory,
  callLogs,
} from "../../../../db/schema.js";
import { requirePerm, Perm } from "../../../../middleware/auth.js";
import { validateUserId, type PageQuery, type CallLogsQuery, type CallStatsQuery, type CallTrendsQuery } from "./types.js";

export function registerLogsRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/audit-logs — 审计日志
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/users/:id/audit-logs", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = validateUserId(id, reply);
    if (!userId) return;

    const query = request.query as PageQuery;
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const useCursor = !!query.cursor;
    const offset = useCursor ? 0 : (page - 1) * pageSize;

    const conditions = [eq(auditLogs.targetType, "user"), eq(auditLogs.targetId, userId)];
    if (useCursor && query.cursor) {
      conditions.push(lt(auditLogs.createdAt, new Date(query.cursor)));
    }

    let total = 0;
    if (!useCursor) {
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(auditLogs)
        .where(eq(auditLogs.targetId, userId));
      total = Number(totalResult?.count ?? 0);
    }

    const queryBuilder = db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        operatorId: auditLogs.operatorId,
        before: auditLogs.before,
        after: auditLogs.after,
        description: auditLogs.description,
        ip: auditLogs.ip,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize);

    const rows = useCursor ? await queryBuilder : await queryBuilder.offset(offset);
    const nextCursor = useCursor && rows.length === pageSize
      ? rows[rows.length - 1].createdAt.toISOString()
      : undefined;

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
        total,
        page,
        pageSize,
        nextCursor,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/login-history — 登录历史
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/users/:id/login-history", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = validateUserId(id, reply);
    if (!userId) return;

    const query = request.query as PageQuery;
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const useCursor = !!query.cursor;
    const offset = useCursor ? 0 : (page - 1) * pageSize;

    const conditions = [eq(userLoginHistory.userId, userId)];
    if (useCursor && query.cursor) {
      conditions.push(lt(userLoginHistory.createdAt, new Date(query.cursor)));
    }

    let total = 0;
    if (!useCursor) {
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userLoginHistory)
        .where(eq(userLoginHistory.userId, userId));
      total = Number(totalResult?.count ?? 0);
    }

    const queryBuilder = db
      .select()
      .from(userLoginHistory)
      .where(and(...conditions))
      .orderBy(desc(userLoginHistory.createdAt))
      .limit(pageSize);

    const rows = useCursor ? await queryBuilder : await queryBuilder.offset(offset);
    const nextCursor = useCursor && rows.length === pageSize
      ? rows[rows.length - 1].createdAt.toISOString()
      : undefined;

    reply.status(200).send({
      code: 0,
      data: {
        list: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
        total,
        page,
        pageSize,
        nextCursor,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/call-stats — 调用统计
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/users/:id/call-stats", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = validateUserId(id, reply);
    if (!userId) return;

    const query = request.query as CallStatsQuery;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hours24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const conditions = [eq(callLogs.userId, userId)];
    if (query.startDate) conditions.push(sql`${callLogs.createdAt} >= ${new Date(query.startDate)}`);
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(sql`${callLogs.createdAt} < ${end}`);
    }

    const [summary] = await db
      .select({
        totalCalls: sql<number>`count(*)::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::int`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost})::text, '0.000000')`,
        successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        failedCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
        avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs}), 0)::int`,
      }).from(callLogs).where(and(...conditions));

    const [today] = await db
      .select({
        calls: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        cost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
        successCount: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        failedCount: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
      }).from(callLogs).where(and(eq(callLogs.userId, userId), gte(callLogs.createdAt, todayStart)));

    const byModel = await db
      .select({
        modelName: callLogs.modelName,
        calls: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::int`,
        cost: sql<string>`coalesce(sum(${callLogs.cost})::text, '0.000000')`,
        successCount: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        failedCount: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
      }).from(callLogs).where(and(...conditions))
      .groupBy(callLogs.modelName).orderBy(sql`count(*) desc`).limit(20);

    const trends = await db
      .select({
        date: sql<string>`to_char(${callLogs.createdAt}, 'MM-DD')`,
        calls: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        cost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
      }).from(callLogs).where(and(eq(callLogs.userId, userId), gte(callLogs.createdAt, sevenDaysAgo)))
      .groupBy(sql`to_char(${callLogs.createdAt}, 'MM-DD')`).orderBy(sql`to_char(${callLogs.createdAt}, 'MM-DD')`);

    const hourly = await db
      .select({
        hour: sql<number>`extract(hour from ${callLogs.createdAt})::int`,
        calls: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      }).from(callLogs).where(and(eq(callLogs.userId, userId), gte(callLogs.createdAt, hours24Ago)))
      .groupBy(sql`extract(hour from ${callLogs.createdAt})`).orderBy(sql`extract(hour from ${callLogs.createdAt})`);

    const byKey = await db
      .select({
        apiKeyId: callLogs.apiKeyId,
        calls: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::int`,
        cost: sql<string>`coalesce(sum(${callLogs.cost})::text, '0.000000')`,
      }).from(callLogs).where(and(...conditions))
      .groupBy(callLogs.apiKeyId).orderBy(sql`count(*) desc`).limit(10);

    reply.status(200).send({
      code: 0,
      data: {
        summary: {
          totalCalls: summary?.totalCalls ?? 0, totalTokens: summary?.totalTokens ?? 0,
          totalCost: summary?.totalCost ?? "0.000000", successCalls: summary?.successCalls ?? 0,
          failedCalls: summary?.failedCalls ?? 0, avgDuration: summary?.avgDuration ?? 0,
        },
        today: { calls: today?.calls ?? 0, tokens: Number(today?.tokens ?? 0), cost: today?.cost ?? '0', successCount: today?.successCount ?? 0, failedCount: today?.failedCount ?? 0 },
        byModel: byModel.map((m) => ({ modelName: m.modelName, calls: m.calls, tokens: m.tokens, cost: m.cost, successCount: m.successCount, failedCount: m.failedCount })),
        byKey: byKey.map((k) => ({ apiKeyId: k.apiKeyId, calls: k.calls, tokens: k.tokens, cost: k.cost })),
        trends, hourly,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/call-logs — 调用明细
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/users/:id/call-logs", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = validateUserId(id, reply);
    if (!userId) return;

    const query = request.query as CallLogsQuery;
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions = [eq(callLogs.userId, userId)];
    if (query.startDate) conditions.push(sql`${callLogs.createdAt} >= ${new Date(query.startDate)}`);
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(sql`${callLogs.createdAt} < ${end}`);
    }
    if (query.modelName) conditions.push(sql`${callLogs.modelName} ILIKE ${`%${query.modelName}%`}`);
    if (query.status) conditions.push(eq(callLogs.status, query.status as any));

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(callLogs)
      .where(and(...conditions));

    const total = Number(totalResult?.count ?? 0);

    const rows = await db
      .select({
        id: callLogs.id,
        modelId: callLogs.modelId,
        apiKeyId: callLogs.apiKeyId,
        modelName: callLogs.modelName,
        vendorName: callLogs.vendorName,
        promptTokens: callLogs.promptTokens,
        completionTokens: callLogs.completionTokens,
        totalTokens: callLogs.totalTokens,
        cost: callLogs.cost,
        durationMs: callLogs.durationMs,
        status: callLogs.status,
        isStreaming: callLogs.isStreaming,
        errorMessage: callLogs.errorMessage,
        ip: callLogs.ip,
        userAgent: callLogs.userAgent,
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
        list: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
        total,
        page,
        pageSize,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/users/:id/call-trends — 调用趋势
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/users/:id/call-trends", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = validateUserId(id, reply);
    if (!userId) return;

    const query = request.query as CallTrendsQuery;
    const days = Math.min(90, Math.max(1, parseInt(query.days ?? "7", 10) || 7));
    const granularity = query.granularity === "hour" ? "hour" : "day";

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    const trunc = granularity === "hour"
      ? sql`date_trunc('hour', ${callLogs.createdAt})`
      : sql`date_trunc('day', ${callLogs.createdAt})`;

    const rows = await db
      .select({
        date: sql<string>`${trunc}::text`,
        totalCalls: sql<number>`count(*)::int`,
        successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        failedCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::int`,
        promptTokens: sql<number>`coalesce(sum(${callLogs.promptTokens}), 0)::int`,
        completionTokens: sql<number>`coalesce(sum(${callLogs.completionTokens}), 0)::int`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost})::text, '0.000000')`,
        avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs}), 0)::int`,
      })
      .from(callLogs)
      .where(and(
        eq(callLogs.userId, userId),
        sql`${callLogs.createdAt} >= ${start}`,
        sql`${callLogs.createdAt} < ${end}`,
      ))
      .groupBy(trunc)
      .orderBy(sql`1`);

    const series = rows.map((r) => ({
      date: r.date,
      calls: {
        total: r.totalCalls,
        success: r.successCalls,
        failed: r.failedCalls,
        successRate: r.totalCalls > 0
          ? parseFloat(((r.successCalls / r.totalCalls) * 100).toFixed(1))
          : 100,
      },
      tokens: {
        total: r.totalTokens,
        prompt: r.promptTokens,
        completion: r.completionTokens,
      },
      cost: r.totalCost,
      avgDuration: r.avgDuration,
    }));

    reply.status(200).send({
      code: 0,
      data: { days, series },
      message: "ok",
    });
  });
}
