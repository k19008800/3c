// ============================================================
//  3cloud (3C) — Admin 请求记录（风险分析）API
//  所有接口需要 LOG_VIEW 权限
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lt, desc, sql, inArray, count } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { requestRecords, callLogs, users } from "../../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";
import { runAnalysis } from "../../../services/request-records/analysis/runner.js";
import { AppError } from "../../../services/auth-service/index.js";

export async function requestRecordsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/request-records — 列表
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/request-records", {
    preHandler: [requirePerm(Perm.LOG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      page?: string;
      pageSize?: string;
      cursor?: string;
      userId?: string;
      riskLevel?: string;
      modelName?: string;
      startDate?: string;
      endDate?: string;
      reviewed?: string;
    };

    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
    const useCursor = !!query.cursor;
    const offset = useCursor ? 0 : (page - 1) * pageSize;

    const conditions: any[] = [sql`1=1`];

    if (useCursor && query.cursor) {
      conditions.push(lt(requestRecords.createdAt, new Date(query.cursor)));
    }
    if (query.userId) {
      conditions.push(eq(requestRecords.userId, parseInt(query.userId, 10)));
    }
    if (query.riskLevel) {
      conditions.push(eq(requestRecords.riskLevel, query.riskLevel));
    }
    if (query.modelName) {
      conditions.push(sql`${requestRecords.modelName} ILIKE ${`%${query.modelName}%`}`);
    }
    if (query.startDate) {
      conditions.push(gte(requestRecords.createdAt, new Date(query.startDate)));
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(lt(requestRecords.createdAt, end));
    }
    if (query.reviewed !== undefined && query.reviewed !== "") {
      conditions.push(eq(requestRecords.reviewed, query.reviewed === "true"));
    }

    let total = 0;
    if (!useCursor) {
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(requestRecords)
        .where(and(...conditions));
      total = countResult.count;
    }

    const rows = await db
      .select({
        id: requestRecords.id,
        callLogId: requestRecords.callLogId,
        userId: requestRecords.userId,
        apiKeyId: requestRecords.apiKeyId,
        modelId: requestRecords.modelId,
        modelName: requestRecords.modelName,
        vendorName: requestRecords.vendorName,
        requestBodySize: requestRecords.requestBodySize,
        responseBodySize: requestRecords.responseBodySize,
        responseStatus: requestRecords.responseStatus,
        isStreaming: requestRecords.isStreaming,
        riskLevel: requestRecords.riskLevel,
        riskTags: requestRecords.riskTags,
        riskReason: requestRecords.riskReason,
        reviewed: requestRecords.reviewed,
        reviewedBy: requestRecords.reviewedBy,
        reviewedAt: requestRecords.reviewedAt,
        createdAt: requestRecords.createdAt,
        userEmail: users.email,
      })
      .from(requestRecords)
      .leftJoin(users, eq(requestRecords.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(requestRecords.createdAt))
      .limit(pageSize);

    const list = useCursor ? rows : await (async () => {
      const qb = db
        .select({
          id: requestRecords.id,
          callLogId: requestRecords.callLogId,
          userId: requestRecords.userId,
          apiKeyId: requestRecords.apiKeyId,
          modelId: requestRecords.modelId,
          modelName: requestRecords.modelName,
          vendorName: requestRecords.vendorName,
          requestBodySize: requestRecords.requestBodySize,
          responseBodySize: requestRecords.responseBodySize,
          responseStatus: requestRecords.responseStatus,
          isStreaming: requestRecords.isStreaming,
          riskLevel: requestRecords.riskLevel,
          riskTags: requestRecords.riskTags,
          riskReason: requestRecords.riskReason,
          reviewed: requestRecords.reviewed,
          reviewedBy: requestRecords.reviewedBy,
          reviewedAt: requestRecords.reviewedAt,
          createdAt: requestRecords.createdAt,
          userEmail: users.email,
        })
        .from(requestRecords)
        .leftJoin(users, eq(requestRecords.userId, users.id))
        .where(and(...conditions))
        .orderBy(desc(requestRecords.createdAt))
        .limit(pageSize);
      return qb.offset(offset);
    })();

    const nextCursor = useCursor && rows.length === pageSize
      ? rows[rows.length - 1].createdAt.toISOString()
      : undefined;

    reply.send({
      code: 0,
      data: { list, total, page, pageSize, nextCursor },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/request-records/:id — 单条详情
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/request-records/:id", {
    preHandler: [requirePerm(Perm.LOG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };

    const [record] = await db
      .select()
      .from(requestRecords)
      .where(eq(requestRecords.id, BigInt(id)))
      .limit(1);

    if (!record) {
      reply.status(404).send({ code: 404, data: null, message: "记录不存在" });
      return;
    }

    reply.send({ code: 0, data: record, message: "ok" });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/request-records/user/:userId — 按用户维度聚合
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/request-records/user/:userId", {
    preHandler: [requirePerm(Perm.LOG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { userId } = request.params as { userId: string };
    const uid = parseInt(userId, 10);
    const query = request.query as { startDate?: string; endDate?: string };

    const conditions: any[] = [eq(requestRecords.userId, uid)];
    if (query.startDate) {
      conditions.push(gte(requestRecords.createdAt, new Date(query.startDate)));
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(lt(requestRecords.createdAt, end));
    }

    // 聚合统计
    const [summary] = await db
      .select({
        totalRecords: sql<number>`count(*)::int`,
        highRiskCount: sql<number>`count(*) filter (where ${requestRecords.riskLevel} = 'high_risk')::int`,
        suspiciousCount: sql<number>`count(*) filter (where ${requestRecords.riskLevel} = 'suspicious')::int`,
        normalCount: sql<number>`count(*) filter (where ${requestRecords.riskLevel} = 'normal')::int`,
        reviewedCount: sql<number>`count(*) filter (where ${requestRecords.reviewed} = true)::int`,
      })
      .from(requestRecords)
      .where(and(...conditions));

    // 风险标签分布
    const tagDistribution = await db
      .select({
        tag: sql<string>`unnest(${requestRecords.riskTags})`,
        count: sql<number>`count(*)::int`,
      })
      .from(requestRecords)
      .where(and(...conditions, sql`${requestRecords.riskTags} IS NOT NULL`))
      .groupBy(sql`unnest(${requestRecords.riskTags})`)
      .orderBy(sql`count(*)::int desc`)
      .limit(20);

    // 近7天趋势
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const trend = await db
      .select({
        date: sql<string>`${requestRecords.createdAt}::date::text`,
        total: sql<number>`count(*)::int`,
        highRisk: sql<number>`count(*) filter (where ${requestRecords.riskLevel} = 'high_risk')::int`,
      })
      .from(requestRecords)
      .where(and(
        eq(requestRecords.userId, uid),
        gte(requestRecords.createdAt, sevenDaysAgo),
        lt(requestRecords.createdAt, now),
      ))
      .groupBy(sql`${requestRecords.createdAt}::date`)
      .orderBy(sql`${requestRecords.createdAt}::date asc`);

    reply.send({
      code: 0,
      data: {
        userId: uid,
        summary,
        tagDistribution,
        trend,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/request-records/analytics — 风险分析看板摘要
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/request-records/analytics", {
    preHandler: [requirePerm(Perm.LOG_VIEW)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const now = new Date();
      const since24h = new Date(now.getTime() - 86400000);
      const since7d = new Date(now.getTime() - 7 * 86400000);

      // 24h 风险概况
      const [riskSummary] = await db
        .select({
          totalRecords: sql<number>`count(*)::int`,
          highRisk: sql<number>`count(*) filter (where ${requestRecords.riskLevel} = 'high_risk')::int`,
          suspicious: sql<number>`count(*) filter (where ${requestRecords.riskLevel} = 'suspicious')::int`,
          reviewed: sql<number>`count(*) filter (where ${requestRecords.reviewed} = true)::int`,
        })
        .from(requestRecords)
        .where(and(gte(requestRecords.createdAt, since24h), lt(requestRecords.createdAt, now)));

      // 7天趋势
      const trend = await db
        .select({
          date: sql<string>`${requestRecords.createdAt}::date::text`,
          total: sql<number>`count(*)::int`,
          highRisk: sql<number>`count(*) filter (where ${requestRecords.riskLevel} = 'high_risk')::int`,
          suspicious: sql<number>`count(*) filter (where ${requestRecords.riskLevel} = 'suspicious')::int`,
        })
        .from(requestRecords)
        .where(and(gte(requestRecords.createdAt, since7d), lt(requestRecords.createdAt, now)))
        .groupBy(sql`${requestRecords.createdAt}::date`)
        .orderBy(sql`${requestRecords.createdAt}::date asc`);

      // 风险标签 TOP10
      const topTags = await db
        .select({
          tag: sql<string>`unnest(${requestRecords.riskTags})`,
          count: sql<number>`count(*)::int`,
        })
        .from(requestRecords)
        .where(and(
          gte(requestRecords.createdAt, since24h),
          sql`${requestRecords.riskTags} IS NOT NULL`,
        ))
        .groupBy(sql`unnest(${requestRecords.riskTags})`)
        .orderBy(sql`count(*)::int desc`)
        .limit(10);

      // 高风险用户 TOP10
      const highRiskUsers = await db
        .select({
          userId: requestRecords.userId,
          userEmail: users.email,
          highRiskCount: sql<number>`count(*)::int`,
        })
        .from(requestRecords)
        .leftJoin(users, eq(requestRecords.userId, users.id))
        .where(and(
          gte(requestRecords.createdAt, since24h),
          eq(requestRecords.riskLevel, "high_risk"),
        ))
        .groupBy(requestRecords.userId, users.email)
        .orderBy(sql`count(*)::int desc`)
        .limit(10);

      reply.send({
        code: 0,
        data: {
          riskSummary: {
            totalRecords: riskSummary?.totalRecords ?? 0,
            highRisk: riskSummary?.highRisk ?? 0,
            suspicious: riskSummary?.suspicious ?? 0,
            reviewed: riskSummary?.reviewed ?? 0,
            highRiskRate: riskSummary && riskSummary.totalRecords > 0
              ? Number(((riskSummary.highRisk / riskSummary.totalRecords) * 100).toFixed(2))
              : 0,
          },
          trend,
          topTags: topTags.map((t) => ({ tag: t.tag, count: t.count })),
          highRiskUsers: highRiskUsers.map((u) => ({
            userId: u.userId,
            userEmail: u.userEmail,
            highRiskCount: u.highRiskCount,
          })),
        },
        message: "ok",
      });
    } catch (err) {
      reply.status(500).send({ code: 500, data: null, message: "分析查询失败" });
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/request-records/:id/analyze — 手动触发重新分析
  // ──────────────────────────────────────────────
  app.post("/api/v1/admin/request-records/:id/analyze", {
    preHandler: [requirePerm(Perm.LOG_VIEW)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const recordId = BigInt(id);

    // 异步执行分析
    runAnalysis(recordId).catch((err) => {
      request.log.error({ err }, "手动分析失败");
    });

    reply.send({ code: 0, data: { id: recordId, status: "analyzing" }, message: "分析已触发" });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/request-records/:id/review — 人工审核标记
  // ──────────────────────────────────────────────
  app.post("/api/v1/admin/request-records/:id/review", {
    preHandler: [requirePerm(Perm.LOG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const body = request.body as {
      riskLevel?: string;
      riskTags?: string[];
      riskReason?: string;
    };

    const recordId = BigInt(id);

    // 确认记录存在
    const [record] = await db
      .select({ id: requestRecords.id })
      .from(requestRecords)
      .where(eq(requestRecords.id, recordId))
      .limit(1);

    if (!record) {
      reply.status(404).send({ code: 404, data: null, message: "记录不存在" });
      return;
    }

    const updateData: Record<string, unknown> = {
      reviewed: true,
      reviewedBy: request.user!.userId,
      reviewedAt: new Date(),
    };

    if (body.riskLevel) updateData.riskLevel = body.riskLevel;
    if (body.riskTags) updateData.riskTags = body.riskTags;
    if (body.riskReason) updateData.riskReason = body.riskReason;

    await db
      .update(requestRecords)
      .set(updateData as any)
      .where(eq(requestRecords.id, recordId));

    reply.send({ code: 0, data: { id: recordId, reviewed: true }, message: "审核完成" });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/request-records/token-rankings — Token 消耗排名（按用户聚合）
  // ──────────────────────────────────────────────
  app.get("/api/v1/admin/request-records/token-rankings", {
    preHandler: [requirePerm(Perm.LOG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as {
      limit?: string;
      startDate?: string;
      endDate?: string;
    };
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20", 10) || 20));

    const conditions: any[] = [sql`1=1`];
    if (query.startDate) {
      conditions.push(gte(requestRecords.createdAt, new Date(query.startDate)));
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(lt(requestRecords.createdAt, end));
    }

    // 从 call_logs 表获取 token 消耗
    const rankings = await db
      .select({
        userId: callLogs.userId,
        userEmail: users.email,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        totalCalls: sql<number>`count(*)::int`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        highRiskCount: sql<number>`(
          SELECT count(*)::int FROM ${requestRecords}
          WHERE ${requestRecords.userId} = ${callLogs.userId}
          AND ${requestRecords.riskLevel} = 'high_risk'
          AND ${requestRecords.createdAt} >= ${new Date(query.startDate ?? new Date(Date.now() - 86400000 * 30).toISOString())}
        )::int`,
      })
      .from(callLogs)
      .innerJoin(users, eq(callLogs.userId, users.id))
      .where(and(...conditions))
      .groupBy(callLogs.userId, users.email, users.id)
      .orderBy(sql`coalesce(sum(${callLogs.totalTokens}), 0) desc`)
      .limit(limit);

    reply.send({
      code: 0,
      data: rankings.map((r) => ({
        userId: r.userId,
        userEmail: r.userEmail,
        totalTokens: Number(r.totalTokens),
        totalCalls: r.totalCalls,
        totalCost: r.totalCost,
        highRiskCount: Number(r.highRiskCount),
      })),
      message: "ok",
    });
  });
}