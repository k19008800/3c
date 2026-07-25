// ============================================================
//  3cloud (3C) — Admin 调用日志
//  GET /api/v1/admin/logs — 所有用户的调用日志（管理员视角）
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lt, like, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { callLogs, users, vendorKeyGroupItems } from "../../db/schema.js";
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
        keyGroupItemId: callLogs.keyGroupItemId,
        keyPrefix: vendorKeyGroupItems.apiKeyPrefix,
      })
      .from(callLogs)
      .leftJoin(users, eq(callLogs.userId, users.id))
      .leftJoin(vendorKeyGroupItems, eq(callLogs.keyGroupItemId, vendorKeyGroupItems.id))
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

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/logs/analytics — 日志分析摘要
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/logs/analytics", {
    preHandler: [requirePerm(Perm.LOG_VIEW)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const query = request.query as { limit?: string };
      const limit = Math.min(10000, Math.max(100, parseInt(query.limit ?? "1000", 10) || 1000));

      const now = new Date();
      const since24h = new Date(now.getTime() - 86400000);

      // 24h summary
      const [summary] = await db
        .select({
          totalCalls: sql<number>`count(*)::int`,
          successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
          failedCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
          totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
          totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        })
        .from(callLogs)
        .where(and(gte(callLogs.createdAt, since24h), lt(callLogs.createdAt, now)));

      // Error pattern analysis
      const errors = await db
        .select({
          errorMessage: callLogs.errorMessage,
          count: sql<number>`count(*)::int`,
        })
        .from(callLogs)
        .where(and(
          gte(callLogs.createdAt, since24h),
          eq(callLogs.status, "failed"),
          sql`${callLogs.errorMessage} IS NOT NULL`,
        ))
        .groupBy(callLogs.errorMessage)
        .orderBy(sql`count(*)::int desc`)
        .limit(10);

      // Hourly distribution
      const hourly = await db
        .select({
          hour: sql<number>`extract(hour from ${callLogs.createdAt})::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(callLogs)
        .where(and(gte(callLogs.createdAt, since24h), lt(callLogs.createdAt, now)))
        .groupBy(sql`extract(hour from ${callLogs.createdAt})`)
        .orderBy(sql`extract(hour from ${callLogs.createdAt}) asc`);

      // Top consumers
      const topConsumers = await db
        .select({
          email: users.email,
          totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
          totalCalls: sql<number>`count(*)::int`,
        })
        .from(callLogs)
        .innerJoin(users, eq(callLogs.userId, users.id))
        .where(and(gte(callLogs.createdAt, since24h), lt(callLogs.createdAt, now)))
        .groupBy(users.id, users.email)
        .orderBy(sql`coalesce(sum(${callLogs.totalTokens}), 0) desc`)
        .limit(limit);

      // Day-over-day trend
      const trend = await db
        .select({
          date: sql<string>`${callLogs.createdAt}::date::text`,
          totalCalls: sql<number>`count(*)::int`,
        })
        .from(callLogs)
        .where(and(
          gte(callLogs.createdAt, new Date(now.getTime() - 7 * 86400000)),
          lt(callLogs.createdAt, now),
        ))
        .groupBy(sql`${callLogs.createdAt}::date`)
        .orderBy(sql`${callLogs.createdAt}::date asc`);

      reply.send({
        code: 0,
        data: {
          summary: {
            totalCalls: summary?.totalCalls ?? 0,
            successCalls: summary?.successCalls ?? 0,
            failedCalls: summary?.failedCalls ?? 0,
            totalTokens: Number(summary?.totalTokens ?? 0),
            totalCost: summary?.totalCost ?? "0",
            successRate: summary && summary.totalCalls > 0
              ? Number(((summary.successCalls / summary.totalCalls) * 100).toFixed(2))
              : 100,
          },
          errors: errors.map(e => ({ message: e.errorMessage, count: e.count })),
          hourly: hourly.map(h => ({ hour: h.hour, count: h.count })),
          topConsumers: topConsumers.map(c => ({
            email: c.email,
            totalTokens: Number(c.totalTokens),
            totalCalls: Number(c.totalCalls),
          })),
          trend: trend.map(t => ({ date: t.date, totalCalls: t.totalCalls })),
        },
        message: "ok",
      });
    } catch (err) {
      reply.status(500).send({ code: 500, data: null, message: "分析查询失败" });
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/logs/analytics/export — 导出分析 CSV（流式优化）
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/logs/analytics/export", {
    preHandler: [requirePerm(Perm.LOG_VIEW)],
  }, async (request, reply) => {
    try {
      const db = getDb();
      const query = request.query as { tab?: string };
      const tab = query.tab ?? "summary";
      const now = new Date();
      const since24h = new Date(now.getTime() - 86400000);

      // 设置响应头
      reply.raw.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="logs-analytics-${tab}.csv"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });

      // 设置5分钟超时
      reply.raw.setTimeout(300000, () => {
        reply.raw.destroy();
      });

      // 写入BOM
      reply.raw.write('\uFEFF');

      // 逐行写入函数
      const writeLine = (line: string) => {
        reply.raw.write(line + '\n');
      };

      if (tab === "errors") {
        const errors = await db
          .select({
            errorMessage: callLogs.errorMessage,
            count: sql<number>`count(*)::int`,
          })
          .from(callLogs)
          .where(and(
            gte(callLogs.createdAt, since24h),
            eq(callLogs.status, "failed"),
            sql`${callLogs.errorMessage} IS NOT NULL`,
          ))
          .groupBy(callLogs.errorMessage)
          .orderBy(sql`count(*)::int desc`);

        writeLine("错误信息,次数");
        for (const e of errors) {
          const escapedError = (e.errorMessage ?? "").replace(/"/g, '""');
          writeLine(`"${escapedError}",${e.count}`);
        }
      } else if (tab === "hourly") {
        const hourly = await db
          .select({
            hour: sql<number>`extract(hour from ${callLogs.createdAt})::int`,
            count: sql<number>`count(*)::int`,
          })
          .from(callLogs)
          .where(and(gte(callLogs.createdAt, since24h), lt(callLogs.createdAt, now)))
          .groupBy(sql`extract(hour from ${callLogs.createdAt})`)
          .orderBy(sql`extract(hour from ${callLogs.createdAt}) asc`);

        writeLine("小时,调用量");
        for (const h of hourly) {
          writeLine(`${h.hour},${h.count}`);
        }
      } else if (tab === "top") {
        const top = await db
          .select({
            email: users.email,
            totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
            totalCalls: sql<number>`count(*)::int`,
          })
          .from(callLogs)
          .innerJoin(users, eq(callLogs.userId, users.id))
          .where(and(gte(callLogs.createdAt, since24h), lt(callLogs.createdAt, now)))
          .groupBy(users.id, users.email)
          .orderBy(sql`coalesce(sum(${callLogs.totalTokens}), 0) desc`)
          .limit(100);

        writeLine("邮箱,Token数,调用量");
        for (const t of top) {
          writeLine(`${t.email},${t.totalTokens},${t.totalCalls}`);
        }
      } else {
        // summary
        const [summary] = await db
          .select({
            totalCalls: sql<number>`count(*)::int`,
            successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
            failedCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
            totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
            totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
          })
          .from(callLogs)
          .where(and(gte(callLogs.createdAt, since24h), lt(callLogs.createdAt, now)));

        writeLine("指标,值");
        writeLine(`总调用量,${summary?.totalCalls ?? 0}`);
        writeLine(`成功调用量,${summary?.successCalls ?? 0}`);
        writeLine(`失败调用量,${summary?.failedCalls ?? 0}`);
        writeLine(`总Token,${summary?.totalTokens ?? 0}`);
        writeLine(`总花费,${summary?.totalCost ?? "0"}`);
      }

      reply.raw.end();
    } catch (err) {
      console.error('[LogsAnalyticsExport] 导出失败:', err);
      
      try {
        if (!reply.raw.headersSent) {
          reply.status(500).send({ code: 500, data: null, message: "导出失败" });
        } else {
          reply.raw.destroy();
        }
      } catch {
        // 忽略响应发送失败的错误
      }
    }
  });
}
