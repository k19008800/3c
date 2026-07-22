// ============================================================
//  3cloud (3C) — Admin Dashboard 趋势数据
//  GET /api/v1/admin/dashboard/trends/hourly     — 小时级下钻
//  GET /api/v1/admin/dashboard/trends             — 多日趋势（支持筛选）
//  GET /api/v1/admin/dashboard/trends/compare     — 同期对比
//  GET /api/v1/admin/dashboard/trends/filters     — 可用筛选选项
// ============================================================

import { FastifyInstance } from "fastify";
import { and, gte, lt, sql, eq, or } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { getRedis } from "../../../redis.js";
import { callLogs, users, rechargeOrders, models as modelsTable, vendors } from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";

/* ── 复用的筛选构建 ── */

function buildFilters(query: Record<string, string>) {
  const filters: any[] = [];
  if (query.modelName) {
    const names = query.modelName.split(",").map((s) => s.trim()).filter(Boolean);
    if (names.length === 1) {
      filters.push(eq(callLogs.modelName, names[0]));
    } else if (names.length > 1) {
      filters.push(sql`${callLogs.modelName} = ANY(${names}::varchar[])`);
    }
  }
  if (query.vendorName) {
    const names = query.vendorName.split(",").map((s) => s.trim()).filter(Boolean);
    if (names.length === 1) {
      filters.push(eq(callLogs.vendorName, names[0]));
    } else if (names.length > 1) {
      filters.push(sql`${callLogs.vendorName} = ANY(${names}::varchar[])`);
    }
  }
  if (query.userType) {
    filters.push(sql`${callLogs.userId} IN (SELECT id FROM users WHERE user_type = ${query.userType})`);
  }
  if (query.userId) {
    filters.push(eq(callLogs.userId, parseInt(query.userId, 10)));
  }
  return filters;
}

/* ── 生成日期范围桶 ── */

function buildDayRanges(days: number): { label: string; start: Date; end: Date }[] {
  const now = new Date();
  const ranges: { label: string; start: Date; end: Date }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const end = new Date(d.getTime() + 86400000);
    ranges.push({ label: d.toISOString().slice(0, 10), start: d, end });
  }
  return ranges;
}

function buildHourRanges(startDate: Date, endDate: Date): { label: string; start: Date; end: Date }[] {
  const ranges: { label: string; start: Date; end: Date }[] = [];
  const cursor = new Date(startDate);
  cursor.setMinutes(0, 0, 0);
  while (cursor < endDate) {
    const hourEnd = new Date(cursor.getTime() + 3600000);
    // 生成北京时间标签（UTC +8）
    const utcHour = cursor.getUTCHours();
    const beijingHour = (utcHour + 8) % 24;
    const datePart = cursor.toISOString().slice(0, 10);
    const label = `${datePart} ${beijingHour.toString().padStart(2, '0')}:00`;
    ranges.push({ label, start: new Date(cursor), end: hourEnd });
    cursor.setTime(cursor.getTime() + 3600000);
  }
  return ranges;
}

/* ── 按天查询趋势 ── */

async function queryDaySeries(
  db: ReturnType<typeof getDb>,
  dayStart: Date,
  dayEnd: Date,
  extraFilters: any[],
) {
  const dateFilter = and(gte(callLogs.createdAt, dayStart), lt(callLogs.createdAt, dayEnd));
  const combinedFilter = extraFilters.length > 0
    ? and(dateFilter as any, ...extraFilters)
    : dateFilter;

  const callsTrend = await db
    .select({
      date: sql<string>`${callLogs.createdAt}::date::text`,
      total: sql<number>`count(*)::int`,
      success: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
      failed: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
      timedout: sql<number>`count(*) filter (where ${callLogs.status} = 'timeout')::int`,
      totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
      avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
    })
    .from(callLogs)
    .where(combinedFilter as any)
    .groupBy(sql`${callLogs.createdAt}::date`)
    .orderBy(sql`${callLogs.createdAt}::date asc`);

  const callsMap = new Map<string, any>(callsTrend.map((r) => [r.date, r]));
  return callsMap;
}

/* ── 按小时查询趋势（支持跨多天） ── */

async function queryHourSeries(
  db: ReturnType<typeof getDb>,
  dayStart: Date,
  dayEnd: Date,
  extraFilters: any[],
) {
  const dateFilter = and(gte(callLogs.createdAt, dayStart), lt(callLogs.createdAt, dayEnd));
  const combinedFilter = extraFilters.length > 0
    ? and(dateFilter as any, ...extraFilters)
    : dateFilter;

  const hourlyCalls = await db
    .select({
      bucket: sql<string>`date_trunc('hour', ${callLogs.createdAt})::text`,
      total: sql<number>`count(*)::int`,
      success: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
      failed: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
      timedout: sql<number>`count(*) filter (where ${callLogs.status} = 'timeout')::int`,
      totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
      avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
    })
    .from(callLogs)
    .where(combinedFilter as any)
    .groupBy(sql`date_trunc('hour', ${callLogs.createdAt})`)
    .orderBy(sql`date_trunc('hour', ${callLogs.createdAt}) asc`);

  const callsMap = new Map<string, any>(hourlyCalls.map((r) => { 
    // date_trunc 返回 UTC 时间，需要转换为北京时间
    // 格式: "2026-07-14 08:00:00+00" → 提取小时并 +8
    const utcHour = parseInt(r.bucket.slice(11, 13), 10);
    const beijingHour = (utcHour + 8) % 24;
    // 重新构造北京时间标签
    const datePart = r.bucket.slice(0, 10);
    const bucket = `${datePart} ${beijingHour.toString().padStart(2, '0')}:00`;
    return [bucket, { ...r, bucket }];
  }));
  return callsMap;
}

/* ── 通用查询（自动选择粒度） ── */

async function queryFlexibleSeries(
  db: ReturnType<typeof getDb>,
  startDate: Date,
  endDate: Date,
  extraFilters: any[],
  granularity: "auto" | "hour" | "day",
) {
  const rangeHours = (endDate.getTime() - startDate.getTime()) / 3600000;
  const effectiveGranularity = granularity === "auto"
    ? (rangeHours <= 72 ? "hour" : "day")
    : granularity;

  let timeRanges: { label: string; start: Date; end: Date }[];
  let callsMap: Map<string, any>;
  let hasUserFilter: boolean;

  if (effectiveGranularity === "hour") {
    timeRanges = buildHourRanges(startDate, endDate);
    callsMap = await queryHourSeries(db, startDate, endDate, extraFilters);
    hasUserFilter = extraFilters.some((f) => (f as any)?.config?.fieldName === "user_id");
  } else {
    // 用原始的 start/end 确保范围准确
    // 使用本地时间构建日期范围，避免 UTC 时区问题
    timeRanges = [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const cursor = new Date(startDate);
    // 将 cursor 对齐到本地时间的 00:00
    cursor.setHours(0, 0, 0, 0);
    while (cursor < endDate) {
      const dayEnd = new Date(cursor.getTime() + 86400000);
      // 使用本地日期格式化，避免 UTC 时区问题
      const label = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      timeRanges.push({
        label,
        start: new Date(cursor),
        end: dayEnd,
      });
      cursor.setTime(cursor.getTime() + 86400000);
    }
    // 确保包含今天（如果 endDate 还在今天范围内）
    // 使用本地日期格式化，避免 UTC 时区问题
    const todayLabel = `${todayStart.getFullYear()}-${String(todayStart.getMonth() + 1).padStart(2, '0')}-${String(todayStart.getDate()).padStart(2, '0')}`;
    if (endDate > todayStart && !timeRanges.some(tr => tr.label === todayLabel)) {
      const todayEnd = new Date(todayStart.getTime() + 86400000);
      timeRanges.push({
        label: todayLabel,
        start: todayStart,
        end: todayEnd,
      });
    }
    callsMap = await queryDaySeries(db, startDate, endDate, extraFilters);
    hasUserFilter = extraFilters.some((f) => (f as any)?.config?.fieldName === "user_id");
  }

  // users + revenue 只在按天粒度时查询
  let usersTrend: { date: string; count: number }[] = [];
  let revenueTrend: { date: string; count: number; total: string }[] = [];
  if (effectiveGranularity === "day" && !hasUserFilter) {
    [usersTrend, revenueTrend] = await Promise.all([
      db
        .select({
          date: sql<string>`${users.createdAt}::date::text`,
          count: sql<number>`count(*)::int`,
        })
        .from(users)
        .where(
          and(
            gte(users.createdAt, startDate),
            lt(users.createdAt, endDate),
            sql`${users.deletedAt} IS NULL`,
          ),
        )
        .groupBy(sql`${users.createdAt}::date`)
        .orderBy(sql`${users.createdAt}::date asc`),
      db
        .select({
          date: sql<string>`${rechargeOrders.createdAt}::date::text`,
          count: sql<number>`count(*)::int`,
          total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
        })
        .from(rechargeOrders)
        .where(
          and(
            gte(rechargeOrders.createdAt, startDate),
            lt(rechargeOrders.createdAt, endDate),
            eq(rechargeOrders.status, "paid"),
          ),
        )
        .groupBy(sql`${rechargeOrders.createdAt}::date`)
        .orderBy(sql`${rechargeOrders.createdAt}::date asc`),
    ]);
  }

  const usersMap = new Map<string, any>(usersTrend.map((r) => [r.date, r]));
  const revenueMap = new Map<string, any>(revenueTrend.map((r) => [r.date, r]));

  const series = timeRanges.map((tr) => {
    const c = callsMap.get(tr.label);
    const u = usersMap.get(tr.label);
    const r = revenueMap.get(tr.label);
    const total = c?.total ?? 0;
    const success = c?.success ?? 0;
    return {
      date: tr.label,
      granularity: effectiveGranularity,
      calls: {
        total,
        success,
        failed: c?.failed ?? 0,
        timeout: c?.timedout ?? 0,
        successRate: total > 0 ? Number(((success / total) * 100).toFixed(1)) : 100,
        totalTokens: Number(c?.totalTokens ?? 0),
        totalCost: c?.totalCost ?? "0",
        avgDuration: c?.avgDuration ?? 0,
      },
      newUsers: u?.count ?? 0,
      revenue: {
        count: r?.count ?? 0,
        total: r?.total ?? "0",
      },
    };
  });

  return { series, granularity: effectiveGranularity };
}

/* ── 解析时间参数 ── */

function parseTimeRange(query: Record<string, string>): { startDate: Date; endDate: Date; rangeHours: number } {
  if (query.startDate && query.endDate) {
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);
    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
      return {
        startDate,
        endDate,
        rangeHours: (endDate.getTime() - startDate.getTime()) / 3600000,
      };
    }
  }
  // 回退到 days 参数
  const days = Math.min(365, Math.max(1, parseInt(query.days ?? "30", 10) || 30));
  const now = new Date();
  // days=1 表示"今日"，从今天 00:00 开始；days>1 表示过去 N 天
  const startDate = days === 1
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
  return { startDate, endDate: now, rangeHours: days * 24 };
}

function formatLabel(iso: string): string {
  return iso.slice(5); // "2026-07-14" → "07-14"
}

/* ════════════════════════════════════════════
   Routes
   ════════════════════════════════════════════ */

export async function trendsRoutes(app: FastifyInstance) {
  // ──── 可用筛选选项 ────
  app.get("/api/v1/admin/dashboard/trends/filters", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (_request, reply) => {
    const db = getDb();
    const redis = getRedis();

    try {
      const cached = await redis.get("dashboard:trends:filters");
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    // 去重模型名
    const modelNames = await db
      .select({ name: callLogs.modelName })
      .from(callLogs)
      .where(sql`${callLogs.modelName} IS NOT NULL AND ${callLogs.modelName} != ''`)
      .groupBy(callLogs.modelName)
      .orderBy(sql`count(*) desc`)
      .limit(100);

    // 去重厂商名
    const vendorNames = await db
      .select({ name: callLogs.vendorName })
      .from(callLogs)
      .where(sql`${callLogs.vendorName} IS NOT NULL AND ${callLogs.vendorName} != ''`)
      .groupBy(callLogs.vendorName)
      .orderBy(sql`count(*) desc`)
      .limit(50);

    const result = {
      code: 0,
      data: {
        models: modelNames.map((m) => m.name).filter(Boolean),
        vendors: vendorNames.map((v) => v.name).filter(Boolean),
      },
      message: "ok",
    };

    redis.setex("dashboard:trends:filters", 600, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // ──── 小时级下钻 ────
  app.get("/api/v1/admin/dashboard/trends/hourly", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();
    const query = request.query as { date?: string; modelName?: string; vendorName?: string };
    const dateStr = query.date;
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return reply.status(400).send({ code: 1, message: "请提供有效的日期参数 (YYYY-MM-DD)" });
    }

    const filterSuffix = query.modelName ? `:m:${query.modelName}` : query.vendorName ? `:v:${query.vendorName}` : '';
    const hourlyCacheKey = `dashboard:hourly:${dateStr}${filterSuffix}`;
    try {
      const cached = await redis.get(hourlyCacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();
    const dayStart = new Date(dateStr + "T00:00:00+08:00");
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const extraFilters = buildFilters(query);

    const dateFilter = and(gte(callLogs.createdAt, dayStart), lt(callLogs.createdAt, dayEnd));
    const combinedFilter = extraFilters.length > 0
      ? and(dateFilter as any, ...extraFilters)
      : dateFilter;

    const hourlyCalls = await db
      .select({
        // 提取 UTC 小时，后续转换为北京时间
        hour: sql<number>`extract(hour from ${callLogs.createdAt})::int`,
        total: sql<number>`count(*)::int`,
        success: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        failed: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
        timedout: sql<number>`count(*) filter (where ${callLogs.status} = 'timeout')::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
      })
      .from(callLogs)
      .where(combinedFilter as any)
      .groupBy(sql`extract(hour from ${callLogs.createdAt})`)
      .orderBy(sql`extract(hour from ${callLogs.createdAt}) asc`);

    const topModels = await db
      .select({
        modelName: callLogs.modelName,
        total: sql<number>`count(*)::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      })
      .from(callLogs)
      .where(combinedFilter as any)
      .groupBy(callLogs.modelName)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    // 将 UTC 小时转换为北京时间小时（+8）
    const hourMap = new Map(hourlyCalls.map((r) => [(r.hour + 8) % 24, r]));
    const hours: {
      hour: number;
      total: number;
      success: number;
      failed: number;
      timedout: number;
      totalTokens: number;
      totalCost: string;
    }[] = [];
    for (let h = 0; h < 24; h++) {
      const e = hourMap.get(h);
      hours.push({
        hour: h,
        total: e?.total ?? 0,
        success: e?.success ?? 0,
        failed: e?.failed ?? 0,
        timedout: e?.timedout ?? 0,
        totalTokens: Number(e?.totalTokens ?? 0),
        totalCost: e?.totalCost ?? "0",
      });
    }

    const peakHour = hours.reduce((a, b) => (a.total >= b.total ? a : b));
    // peakHour.hour 是北京时间，需要转换回 UTC 来查询数据库
    const peakHourUtc = (peakHour.hour - 8 + 24) % 24;
    const peakHourStart = new Date(dayStart.getTime() + peakHourUtc * 3600000);
    const peakHourEnd = new Date(peakHourStart.getTime() + 3600000);
    const peakTopModels = await db
      .select({
        modelName: callLogs.modelName,
        total: sql<number>`count(*)::int`,
      })
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, peakHourStart),
          lt(callLogs.createdAt, peakHourEnd),
          ...(extraFilters.length > 0 ? extraFilters.map((f) => sql`${f}` as any) : []),
        ),
      )
      .groupBy(callLogs.modelName)
      .orderBy(sql`count(*) desc`)
      .limit(3);

    const hourlyResult = {
      code: 0,
      data: {
        date: dateStr,
        total: hours.reduce((a, h) => a + h.total, 0),
        hours,
        topModels,
        peakHour: {
          hour: peakHour.hour,
          total: peakHour.total,
          topModels: peakTopModels,
        },
      },
      message: "ok",
    };

    redis.setex(hourlyCacheKey, 300, JSON.stringify(hourlyResult)).catch(() => {});
    reply.send(hourlyResult);
  });

  // ──── 趋势主查询（支持 startDate/endDate + 自动粒度） ────
  app.get("/api/v1/admin/dashboard/trends", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();
    const query = request.query as Record<string, string>;
    const { startDate, endDate, rangeHours } = parseTimeRange(query);
    const granularity = (query.granularity as "auto" | "hour" | "day") || "auto";
    const extraFilters = buildFilters(query);

    const filterKey = query.modelName ? `m:${query.modelName}` : query.vendorName ? `v:${query.vendorName}` : 'all';
    const utKey = query.userType ? `ut:${query.userType}` : '';
    const gKey = query.granularity || 'auto';
    const cacheKey = `dashboard:trends:${startDate.toISOString().slice(0, 10)}:${endDate.toISOString().slice(0, 10)}:${gKey}:${filterKey}${utKey ? `:${utKey}` : ''}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();
    const { series, granularity: effectiveGranularity } = await queryFlexibleSeries(db, startDate, endDate, extraFilters, granularity);

    const trendsResult = {
      code: 0,
      data: {
        range: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          hours: Math.round(rangeHours * 10) / 10,
        },
        granularity: effectiveGranularity,
        series,
      },
      message: "ok",
    };

    redis.setex(cacheKey, 300, JSON.stringify(trendsResult)).catch(() => {});
    reply.send(trendsResult);
  });

  // ──── 同期对比 ────
  app.get("/api/v1/admin/dashboard/trends/compare", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();
    const query = request.query as Record<string, string>;
    const { startDate, endDate, rangeHours } = parseTimeRange(query);
    const granularity = (query.granularity as "auto" | "hour" | "day") || "auto";
    const extraFilters = buildFilters(query);

    const filterKey = query.modelName ? `m:${query.modelName}` : query.vendorName ? `v:${query.vendorName}` : 'all';
    const cacheKey = `dashboard:trends:compare:${startDate.toISOString().slice(0, 10)}:${endDate.toISOString().slice(0, 10)}:${filterKey}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();

    // 上期区间：往前推相同时间跨度
    const rangeMs = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - rangeMs);
    const prevEnd = new Date(startDate.getTime());

    const [{ series: currentSeries }, { series: prevSeries }] = await Promise.all([
      queryFlexibleSeries(db, startDate, endDate, extraFilters, granularity),
      queryFlexibleSeries(db, prevStart, prevEnd, extraFilters, granularity),
    ]);

    // 整合同一偏移量
    const merged = currentSeries.map((cur, i) => {
      const prev = prevSeries[i];
      const diffCalls = prev ? cur.calls.total - prev.calls.total : 0;
      const diffPct = prev && prev.calls.total > 0
        ? ((cur.calls.total - prev.calls.total) / prev.calls.total * 100).toFixed(1)
        : null;
      return {
        date: cur.date,
        current: cur,
        previous: prev ?? null,
        diff: { calls: diffCalls, callsPct: diffPct },
      };
    });

    const result = {
      code: 0,
      data: {
        currentLabel: "本期",
        previousLabel: "上期",
        merged,
        summary: {
          currentTotal: currentSeries.reduce((a, s) => a + s.calls.total, 0),
          previousTotal: prevSeries.reduce((a, s) => a + s.calls.total, 0),
          currentTokens: currentSeries.reduce((a, s) => a + s.calls.totalTokens, 0),
          previousTokens: prevSeries.reduce((a, s) => a + s.calls.totalTokens, 0),
          currentCost: currentSeries.reduce((a, s) => a + parseFloat(s.calls.totalCost), 0),
          previousCost: prevSeries.reduce((a, s) => a + parseFloat(s.calls.totalCost), 0),
        },
      },
      message: "ok",
    };

    redis.setex(cacheKey, 300, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });
}
