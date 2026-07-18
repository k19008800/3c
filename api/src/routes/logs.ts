// ============================================================
//  3cloud (3C) — 调用日志路由
//  GET /api/v1/logs — 用户查看自己的调用记录
//  GET /api/v1/logs/:id — 查看单条调用详情
//  增强：附带 GeoIP 地理位置信息
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, asc, gte, lte, lt, like, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { callLogs } from "../db/schema.js";
import { authenticateJWT } from "../middleware/auth.js";
import { logFilterSchema } from "../schemas.js";
import { AppError } from "../services/auth-service/index.js";
import { getCallGeoEnrichment, lookupGeo } from "../services/geo-check.js";

// ── 带 Geo 富化的调用记录项 ──

interface CallLogItem {
  id: number;
  modelName: string | null;
  vendorName: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: string;
  durationMs: number | null;
  status: string;
  isStreaming: boolean;
  errorMessage: string | null;
  requestIp: string | null;
  createdAt: string;
  /** 城市（来自 GeoIP 缓存或实时查询） */
  geoCity: string;
  /** 国家（来自 GeoIP 缓存或实时查询） */
  geoCountry: string;
  /** 是否为匿名代理/VPN */
  isProxy: boolean;
}

interface CallLogDetail extends CallLogItem {
  apiKeyId: number | null;
  modelId: number | null;
  vendorModelId: number | null;
  userAgent: string | null;
}

// ── Geo 富化类型 ──

interface IpEnrichment {
  geoCity: string;
  geoCountry: string;
  isProxy: boolean;
}

const EMPTY_ENRICHMENT: IpEnrichment = { geoCity: "", geoCountry: "", isProxy: false };

// ── Geo 富化 helper ──

async function enrichIp(ip: string | null, userId: number): Promise<IpEnrichment> {
  if (!ip) return EMPTY_ENRICHMENT;

  // 优先用 proxy 路由写入的缓存（最低开销，仅 Redis get）
  const cached = await getCallGeoEnrichment(ip, userId).catch(() => null);
  if (cached) {
    return {
      geoCity: cached.city,
      geoCountry: cached.country,
      isProxy: cached.isProxy,
    };
  }

  // 缓存 miss → 实时查 MMDB（结果会被 lookupGeo 缓存 24h）
  const geo = await lookupGeo(ip).catch(() => null);
  if (geo) {
    return {
      geoCity: geo.city,
      geoCountry: geo.countryName,
      isProxy: false,
    };
  }

  return EMPTY_ENRICHMENT;
}

async function enrichIpList(
  ips: (string | null)[],
  userId: number,
): Promise<Map<string, IpEnrichment>> {
  const unique = [...new Set(ips.filter((ip): ip is string => !!ip))];
  const results = await Promise.all(
    unique.map(async (ip) => {
      const enriched = await enrichIp(ip, userId);
      return [ip, enriched] as const;
    }),
  );
  return new Map(results);
}

export async function logRoutes(app: FastifyInstance) {
  // ── 所有日志路由需要 JWT 鉴权 ──
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/logs — 用户调用记录列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/logs", async (request, reply) => {
    try {
      const query = request.query as Record<string, string>;
      const parsed = logFilterSchema.parse(query);
      const userId = request.user!.userId;
      const cursor = query.cursor;

      const db = getDb();
      const useCursor = !!cursor;
      const offset = useCursor ? 0 : (parsed.page - 1) * parsed.pageSize;

      // 构建过滤条件
      const conditions = [eq(callLogs.userId, userId)];

      // 游标分页条件
      if (useCursor && cursor) {
        conditions.push(lt(callLogs.createdAt, new Date(cursor)));
      }

      if (parsed.modelId) {
        conditions.push(eq(callLogs.modelId, parsed.modelId));
      }
      if (parsed.vendorName) {
        conditions.push(eq(callLogs.vendorName, parsed.vendorName));
      }
      if (parsed.status) {
        conditions.push(eq(callLogs.status, parsed.status as any));
      }
      if (parsed.startDate) {
        conditions.push(gte(callLogs.createdAt, new Date(parsed.startDate)));
      }
      if (parsed.endDate) {
        conditions.push(lte(callLogs.createdAt, new Date(parsed.endDate)));
      }
      if (parsed.apiKeyId) {
        conditions.push(eq(callLogs.apiKeyId, parsed.apiKeyId));
      }
      if (parsed.modelName) {
        conditions.push(like(callLogs.modelName, `%${parsed.modelName}%`));
      }
      if (parsed.minDuration !== undefined) {
        conditions.push(gte(callLogs.durationMs, parsed.minDuration));
      }
      if (parsed.maxDuration !== undefined) {
        conditions.push(lte(callLogs.durationMs, parsed.maxDuration));
      }
      if (parsed.minTokens !== undefined) {
        conditions.push(gte(callLogs.totalTokens, parsed.minTokens));
      }
      if (parsed.maxTokens !== undefined) {
        conditions.push(lte(callLogs.totalTokens, parsed.maxTokens));
      }
      if (parsed.isStreaming !== undefined) {
        conditions.push(eq(callLogs.isStreaming, parsed.isStreaming));
      }

      let total = 0;
      if (!useCursor) {
        const [totalResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(callLogs)
          .where(and(...conditions));
        total = Number(totalResult?.count ?? 0);
      }

      // 构建排序
      const sortByMap: Record<string, any> = {
        createdAt: callLogs.createdAt,
        durationMs: callLogs.durationMs,
        totalTokens: callLogs.totalTokens,
        cost: callLogs.cost,
      };
      const orderColumn = sortByMap[parsed.sortBy] || callLogs.createdAt;
      const orderByFn = parsed.sortOrder === 'asc' ? asc : desc;

      // 查分页数据
      const queryBuilder = db
        .select({
          id: callLogs.id,
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
          requestIp: callLogs.ip,
          apiKeyId: callLogs.apiKeyId,
          createdAt: callLogs.createdAt,
        })
        .from(callLogs)
        .where(and(...conditions))
        .orderBy(orderByFn(orderColumn))
        .limit(parsed.pageSize);

      const rows = useCursor ? await queryBuilder : await queryBuilder.offset(offset);
      const nextCursor = useCursor && rows.length === parsed.pageSize
        ? rows[rows.length - 1].createdAt.toISOString()
        : undefined;

      // 批量 Geo 富化（去重 IP）
      const ips = rows.map((r) => r.requestIp);
      const geoMap = await enrichIpList(ips, userId);

      const list: CallLogItem[] = rows.map((r) => {
        const geo = (r.requestIp ? geoMap.get(r.requestIp) : undefined) ?? EMPTY_ENRICHMENT;
        return {
          id: r.id,
          modelName: r.modelName,
          vendorName: r.vendorName,
          promptTokens: r.promptTokens,
          completionTokens: r.completionTokens,
          totalTokens: r.totalTokens,
          cost: r.cost,
          durationMs: r.durationMs,
          status: r.status,
          isStreaming: r.isStreaming,
          errorMessage: r.errorMessage,
          requestIp: r.requestIp,
          createdAt: r.createdAt.toISOString(),
          geoCity: geo.geoCity,
          geoCountry: geo.geoCountry,
          isProxy: geo.isProxy,
        };
      });

      reply.status(200).send({
        code: 0,
        data: { list, total, page: parsed.page, pageSize: parsed.pageSize, nextCursor },
        message: "ok",
      });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        reply.status(400).send({ code: 400, data: null, message: err.errors?.[0]?.message || "参数校验失败" });
        return;
      }
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/logs/:id — 单条调用详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/logs/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const userId = request.user!.userId;
      const logId = parseInt(id, 10);

      if (isNaN(logId)) {
        reply.status(400).send({ code: 400, data: null, message: "无效的日志 ID" });
        return;
      }

      const db = getDb();

      const [log] = await db
        .select()
        .from(callLogs)
        .where(and(
          eq(callLogs.id, logId),
          eq(callLogs.userId, userId),
        ))
        .limit(1);

      if (!log) {
        reply.status(404).send({ code: 404, data: null, message: "日志不存在" });
        return;
      }

      // Geo 富化
      const geo = await enrichIp(log.ip, userId);

      const detail: CallLogDetail = {
        id: log.id,
        modelName: log.modelName,
        vendorName: log.vendorName,
        promptTokens: log.promptTokens,
        completionTokens: log.completionTokens,
        totalTokens: log.totalTokens,
        cost: log.cost,
        durationMs: log.durationMs,
        status: log.status,
        isStreaming: log.isStreaming,
        errorMessage: log.errorMessage,
        requestIp: log.ip,
        createdAt: log.createdAt.toISOString(),
        apiKeyId: log.apiKeyId,
        modelId: log.modelId,
        vendorModelId: log.vendorModelId,
        userAgent: log.userAgent,
        geoCity: geo.geoCity,
        geoCountry: geo.geoCountry,
        isProxy: geo.isProxy,
      };

      reply.status(200).send({
        code: 0,
        data: detail,
        message: "ok",
      });
    } catch (err) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
        return;
      }
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/logs/summary — 汇总统计
  // ──────────────────────────────────────────────

  app.get("/api/v1/logs/summary", async (request, reply) => {
    try {
      const userId = request.user!.userId;
      const db = getDb();

      const query = request.query as {
        startDate?: string;
        endDate?: string;
      };

      const conditions = [eq(callLogs.userId, userId)];

      if (query.startDate) {
        conditions.push(gte(callLogs.createdAt, new Date(query.startDate)));
      }
      if (query.endDate) {
        conditions.push(lte(callLogs.createdAt, new Date(query.endDate)));
      }

      const [summary] = await db
        .select({
          totalCalls: sql<number>`count(*)`,
          totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)`,
          totalCost: sql<string>`coalesce(sum(${callLogs.cost})::text, '0.000000')`,
          successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')`,
          failedCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')`,
          avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
        })
        .from(callLogs)
        .where(and(...conditions));

      reply.status(200).send({
        code: 0,
        data: {
          totalCalls: Number(summary?.totalCalls ?? 0),
          totalTokens: Number(summary?.totalTokens ?? 0),
          totalCost: summary?.totalCost ?? "0.000000",
          successCalls: Number(summary?.successCalls ?? 0),
          failedCalls: Number(summary?.failedCalls ?? 0),
          avgDuration: Number(summary?.avgDuration ?? 0),
          successRate: summary?.totalCalls
            ? Number((Number(summary?.successCalls) / Number(summary?.totalCalls) * 100).toFixed(1))
            : 100,
        },
        message: "ok",
      });
    } catch (err) {
      throw err;
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/logs/trends — 调用趋势（按日期聚合）
  // ──────────────────────────────────────────────

  app.get("/api/v1/logs/trends", async (request, reply) => {
    const userId = request.user!.userId;
    const query = request.query as { days?: string };
    const days = Math.min(90, Math.max(1, parseInt(query.days ?? "7", 10) || 7));
    const db = getDb();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const conditions = [
      eq(callLogs.userId, userId),
      gte(callLogs.createdAt, startDate),
    ];

    const rows = await db
      .select({
        date: sql<string>`${callLogs.createdAt}::date`,
        calls: sql<number>`count(*)::int`,
        successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        failedCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::int`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost})::text, '0.000000')`,
        avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
      })
      .from(callLogs)
      .where(and(...conditions))
      .groupBy(sql`${callLogs.createdAt}::date`)
      .orderBy(sql`${callLogs.createdAt}::date`);

    reply.status(200).send({
      code: 0,
      data: { days, series: rows },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/logs/stats/by-model — 按模型聚合统计
  // ──────────────────────────────────────────────

  app.get("/api/v1/logs/stats/by-model", async (request, reply) => {
    const userId = request.user!.userId;
    const query = request.query as { startDate?: string; endDate?: string; limit?: string };
    const db = getDb();
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? "10", 10) || 10));

    const conditions = [eq(callLogs.userId, userId)];
    if (query.startDate) conditions.push(gte(callLogs.createdAt, new Date(query.startDate)));
    if (query.endDate) conditions.push(lte(callLogs.createdAt, new Date(query.endDate)));

    const rows = await db
      .select({
        modelName: callLogs.modelName,
        calls: sql<number>`count(*)::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::int`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost})::text, '0.000000')`,
        avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
      })
      .from(callLogs)
      .where(and(...conditions))
      .groupBy(callLogs.modelName)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    reply.status(200).send({
      code: 0,
      data: { list: rows },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/logs/export — CSV 导出
  // ──────────────────────────────────────────────

  app.get("/api/v1/logs/export", async (request, reply) => {
    const userId = request.user!.userId;
    const query = request.query as Record<string, string>;
    const format = query.format || "csv";

    const db = getDb();
    const conditions = [eq(callLogs.userId, userId)];

    // 应用相同筛选条件
    if (query.modelName) conditions.push(like(callLogs.modelName, `%${query.modelName}%`));
    if (query.modelId) conditions.push(eq(callLogs.modelId, parseInt(query.modelId)));
    if (query.status) conditions.push(eq(callLogs.status, query.status as any));
    if (query.startDate) conditions.push(gte(callLogs.createdAt, new Date(query.startDate)));
    if (query.endDate) conditions.push(lte(callLogs.createdAt, new Date(query.endDate)));
    if (query.apiKeyId) conditions.push(eq(callLogs.apiKeyId, parseInt(query.apiKeyId)));
    if (query.vendorName) conditions.push(eq(callLogs.vendorName, query.vendorName));

    const rows = await db
      .select({
        id: callLogs.id,
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
      .orderBy(desc(callLogs.createdAt));

    if (format === "csv") {
      const headers = ["ID","模型","供应商","Prompt Token","Completion Token","总 Token","费用","耗时(ms)","状态","流式","错误信息","IP","User-Agent","时间"];
      const csvRows = rows.map((r) => [
        r.id,
        escapeCsv(String(r.modelName ?? "")),
        escapeCsv(String(r.vendorName ?? "")),
        r.promptTokens,
        r.completionTokens,
        r.totalTokens,
        String(r.cost),
        r.durationMs ?? "",
        r.status,
        r.isStreaming ? "是" : "否",
        escapeCsv(String(r.errorMessage ?? "")),
        r.ip ?? "",
        escapeCsv(String(r.userAgent ?? "")),
        r.createdAt.toISOString(),
      ]);

      const csv = [headers.join(","), ...csvRows.map((row) => row.join(","))].join("\r\n");

      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="call-logs-${new Date().toISOString().slice(0, 10)}.csv"`);
      reply.status(200).send(csv);
    } else {
      reply.status(400).send({ code: 400, data: null, message: "不支持的导出格式" });
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/logs/anomalies — 异常检测
  // ──────────────────────────────────────────────

  app.get("/api/v1/logs/anomalies", async (request, reply) => {
    const userId = request.user!.userId;
    const query = request.query as { days?: string };
    const days = Math.min(90, Math.max(1, parseInt(query.days ?? "7", 10) || 7));
    const db = getDb();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // 1. 按日聚合查找成本异常日期
    const dailyRows = await db
      .select({
        date: sql<string>`${callLogs.createdAt}::date`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost})::text, '0.000000')`,
        totalCalls: sql<number>`count(*)::int`,
        maxCost: sql<string>`coalesce(max(${callLogs.cost})::text, '0.000000')`,
      })
      .from(callLogs)
      .where(and(eq(callLogs.userId, userId), gte(callLogs.createdAt, startDate)))
      .groupBy(sql`${callLogs.createdAt}::date`)
      .orderBy(sql`${callLogs.createdAt}::date`);

    // 计算平均值和标准差
    const costs = dailyRows.map((r) => parseFloat(r.totalCost));
    const avgCost = costs.reduce((a, b) => a + b, 0) / (costs.length || 1);
    const stdDev = Math.sqrt(costs.reduce((sq, c) => sq + Math.pow(c - avgCost, 2), 0) / (costs.length || 1));

    const anomalies = dailyRows
      .filter((r) => {
        const cost = parseFloat(r.totalCost);
        return cost > avgCost + stdDev * 2 && cost > 0.01;
      })
      .map((r) => ({
        date: r.date,
        totalCost: r.totalCost,
        totalCalls: r.totalCalls,
        maxSingleCost: r.maxCost,
        reason: `当日消费 ¥${parseFloat(r.totalCost).toFixed(4)}，远超日均 ¥${avgCost.toFixed(4)}`,
      }));

    // 2. 查找单次高成本调用
    const avgCostPerCall = costs.length ? avgCost / (dailyRows.reduce((s, r) => s + r.totalCalls, 0) / costs.length || 1) : 0;
    const threshold = Math.max(avgCostPerCall * 5, 0.01);

    const expensiveCalls = await db
      .select({
        id: callLogs.id,
        modelName: callLogs.modelName,
        cost: callLogs.cost,
        promptTokens: callLogs.promptTokens,
        completionTokens: callLogs.completionTokens,
        totalTokens: callLogs.totalTokens,
        durationMs: callLogs.durationMs,
        createdAt: callLogs.createdAt,
      })
      .from(callLogs)
      .where(and(
        eq(callLogs.userId, userId),
        gte(callLogs.createdAt, startDate),
        sql`${callLogs.cost}::numeric > ${threshold}::numeric`,
      ))
      .orderBy(desc(callLogs.cost))
      .limit(10);

    reply.status(200).send({
      code: 0,
      data: {
        avgDailyCost: avgCost.toFixed(6),
        avgCostPerCall: avgCostPerCall.toFixed(6),
        costThreshold: threshold.toFixed(6),
        anomalies,
        expensiveCalls,
      },
      message: "ok",
    });
  });
}

// ── Helper: CSV 转义 ──

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
