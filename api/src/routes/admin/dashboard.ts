// ============================================================
//  3cloud (3C) — Admin Dashboard 统计
//  GET /api/v1/admin/dashboard/stats — 今天和昨日统计
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { checkDbConnection } from "../../db/index.js";
import { checkRedisConnection } from "../../redis.js";
import { users, callLogs, rechargeOrders, balanceLogs, vendors, vendorModels, models, systemConfigs } from "../../db/schema.js";
import { authenticateJWT, requireRole } from "../../middleware/auth.js";

export async function adminDashboardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);
  app.addHook("preHandler", requireRole("super_admin", "admin"));

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/dashboard/stats
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/dashboard/stats", async (request, reply) => {
    const db = getDb();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);

    // 1. 用户统计
    const [totalUsers] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.deletedAt} IS NULL`);

    const [todayNewUsers] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(
          gte(users.createdAt, todayStart),
          lt(users.createdAt, todayEnd),
          sql`${users.deletedAt} IS NULL`
        )
      );

    const [yesterdayNewUsers] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(
          gte(users.createdAt, yesterdayStart),
          lt(users.createdAt, todayStart),
          sql`${users.deletedAt} IS NULL`
        )
      );

    // 2. 调用统计（call_logs 是分区表，直接查）
    const todayCalls = await db
      .select({
        total: sql<number>`count(*)::int`,
        success: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        failed: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
        timedout: sql<number>`count(*) filter (where ${callLogs.status} = 'timeout')::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
        totalDuration: sql<number>`coalesce(sum(${callLogs.durationMs}), 0)::bigint`,
      })
      .from(callLogs)
      .where(
        and(gte(callLogs.createdAt, todayStart), lt(callLogs.createdAt, todayEnd))
      );

    const yesterdayCalls = await db
      .select({
        total: sql<number>`count(*)::int`,
        success: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}), '0')`,
      })
      .from(callLogs)
      .where(
        and(gte(callLogs.createdAt, yesterdayStart), lt(callLogs.createdAt, todayStart))
      );

    // 3. 充值统计
    const [todayRecharge] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${rechargeOrders.amount}), '0')`,
      })
      .from(rechargeOrders)
      .where(
        and(
          gte(rechargeOrders.createdAt, todayStart),
          lt(rechargeOrders.createdAt, todayEnd),
          eq(rechargeOrders.status, "paid")
        )
      );

    const [pendingRecharge] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${rechargeOrders.amount}), '0')`,
      })
      .from(rechargeOrders)
      .where(eq(rechargeOrders.status, "pending"));

    // 4. 实名审核待办
    const [pendingRealName] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.realNameStatus, "pending_review"));

    // 5. 模型调用分布（今日 Top 5）
    const topModels = await db
      .select({
        modelName: callLogs.modelName,
        total: sql<number>`count(*)::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      })
      .from(callLogs)
      .where(
        and(gte(callLogs.createdAt, todayStart), lt(callLogs.createdAt, todayEnd))
      )
      .groupBy(callLogs.modelName)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    // 6. 安全统计
    let security = { unacknowledgedHighRisk: 0, activeCircuits: 0, bannedIps: 0, bannedUsers: 0 };
    try {
      const { getUnacknowledgedHighRiskCount, getBannedIpCount, getBannedUserCount } =
        await import("../../services/security-event.js");
      const { getActiveCircuitCount } = await import("../../services/circuit-breaker.js");
      const [unack, circuits, ips, bannedUsers] = await Promise.all([
        getUnacknowledgedHighRiskCount(),
        getActiveCircuitCount(),
        getBannedIpCount(),
        getBannedUserCount(),
      ]);
      security = { unacknowledgedHighRisk: unack, activeCircuits: circuits, bannedIps: ips, bannedUsers };
    } catch (err) {
      // 安全统计失败不阻塞主流程
    }

    reply.send({
      code: 0,
      data: {
        users: {
          total: totalUsers.count,
          todayNew: todayNewUsers.count,
          yesterdayNew: yesterdayNewUsers.count,
        },
        calls: {
          today: {
            total: todayCalls[0].total,
            success: todayCalls[0].success,
            failed: todayCalls[0].failed,
            timeout: todayCalls[0].timedout,
            totalTokens: Number(todayCalls[0].totalTokens),
            totalCost: todayCalls[0].totalCost,
            avgDuration: todayCalls[0].total > 0
              ? Math.round(todayCalls[0].totalDuration / todayCalls[0].total)
              : 0,
          },
          yesterday: {
            total: yesterdayCalls[0].total,
            success: yesterdayCalls[0].success,
            totalTokens: Number(yesterdayCalls[0].totalTokens),
            totalCost: yesterdayCalls[0].totalCost,
          },
        },
        revenue: {
          todayRecharge: todayRecharge.total,
          todayRechargeCount: todayRecharge.count,
          pendingRecharge: pendingRecharge.total,
          pendingRechargeCount: pendingRecharge.count,
        },
        pendingRealName: pendingRealName.count,
        topModels,
        security,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/dashboard/recent-activity
  //  最近活跃用户 + 最近充值
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/dashboard/recent-activity", async (request, reply) => {
    const db = getDb();

    // 最近 10 条充值
    const recentRecharges = await db
      .select({
        id: rechargeOrders.id,
        userId: rechargeOrders.userId,
        orderNo: rechargeOrders.orderNo,
        amount: rechargeOrders.amount,
        channel: rechargeOrders.channel,
        status: rechargeOrders.status,
        createdAt: rechargeOrders.createdAt,
        email: users.email,
        nickname: users.nickname,
      })
      .from(rechargeOrders)
      .leftJoin(users, eq(rechargeOrders.userId, users.id))
      .orderBy(sql`${rechargeOrders.createdAt} desc`)
      .limit(10);

    // 最近 10 次调用
    const recentCalls = await db
      .select({
        id: callLogs.id,
        userId: callLogs.userId,
        modelName: callLogs.modelName,
        status: callLogs.status,
        totalTokens: callLogs.totalTokens,
        cost: callLogs.cost,
        durationMs: callLogs.durationMs,
        createdAt: callLogs.createdAt,
        email: users.email,
      })
      .from(callLogs)
      .leftJoin(users, eq(callLogs.userId, users.id))
      .orderBy(sql`${callLogs.createdAt} desc`)
      .limit(10);

    reply.send({
      code: 0,
      data: {
        recentRecharges,
        recentCalls,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/dashboard/health
  //  系统健康全景：厂商状态、限流水位、近期失败、系统连通性
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/dashboard/health", async (request, reply) => {
    const db = getDb();
    const redis = getRedis();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);

    // ── 1. 系统连通性 ──
    const dbOk = await checkDbConnection();
    const redisOk = await checkRedisConnection();

    // ── 2. 厂商健康概览 ──
    const vendorStatusCounts = await db
      .select({
        status: vendors.status,
        count: sql<number>`count(*)::int`,
      })
      .from(vendors)
      .groupBy(vendors.status)
      .orderBy(vendors.status);

    const [healthStats] = await db
      .select({
        avgScore: sql<string>`coalesce(avg(${vendorModels.healthScore}::numeric), 0)::numeric(5,2)`,
        totalModels: sql<number>`count(*)::int`,
        downModels: sql<number>`count(*) filter (where ${vendorModels.isDown} = true)::int`,
      })
      .from(vendorModels)
      .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
      .where(eq(vendors.status, "active"));

    // 降级/宕机的厂商-模型列表（含健康评分、最近检测时间）
    const unhealthyModels = await db
      .select({
        vendorModelId: vendorModels.id,
        vendorName: vendors.name,
        modelName: models.name,
        upstreamModelName: vendorModels.upstreamModelName,
        healthScore: vendorModels.healthScore,
        isDown: vendorModels.isDown,
        consecutiveSuccess: vendorModels.consecutiveSuccess,
        lastHealthCheckAt: vendorModels.lastHealthCheckAt,
        healthSamples: vendorModels.healthSamples,
      })
      .from(vendorModels)
      .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
      .innerJoin(models, eq(vendorModels.modelId, models.id))
      .where(
        sql`(${vendorModels.isDown} = true OR ${vendorModels.healthScore}::numeric < 0.70)`
      )
      .orderBy(sql`${vendorModels.healthScore}::numeric asc`)
      .limit(20);

    // ── 3. 限流水位（Redis 滑动窗口当前计数） ──
    let rateLimit: {
      globalRpm: { current: number; limit: number };
      globalTpm: { current: number; limit: number };
    } = { globalRpm: { current: 0, limit: 30 }, globalTpm: { current: 0, limit: 50000 } };

    try {
      const nowMs = Date.now();
      const cutoff = nowMs - 60000;

      // 获取全局 RPM 配置
      const [globalRpmCfg] = await db
        .select({ value: systemConfigs.value })
        .from(systemConfigs)
        .where(eq(systemConfigs.key, "rate_limit_global_rpm"))
        .limit(1);

      const [globalTpmCfg] = await db
        .select({ value: systemConfigs.value })
        .from(systemConfigs)
        .where(eq(systemConfigs.key, "rate_limit_global_tpm"))
        .limit(1);

      // 清理过期并计数
      await redis.zremrangebyscore("rl:rpm:global:0", 0, cutoff);
      const rpmCurrent = await redis.zcard("rl:rpm:global:0");

      const tpmMembers = await redis.zrange("rl:tpm:global:0", 0, -1, "WITHSCORES");
      await redis.zremrangebyscore("rl:tpm:global:0", 0, cutoff);
      let tpmSum = 0;
      for (let i = 1; i < tpmMembers.length; i += 2) {
        tpmSum += parseInt(tpmMembers[i] ?? "0");
      }

      rateLimit = {
        globalRpm: {
          current: Math.min(rpmCurrent, 99999),
          limit: parseInt(globalRpmCfg?.value ?? "30"),
        },
        globalTpm: {
          current: Math.min(tpmSum, 99999999),
          limit: parseInt(globalTpmCfg?.value ?? "50000"),
        },
      };
    } catch (err: any) {
      // Redis 不可用时返回 0
      console.warn("[Dashboard/Health] 限流查询失败:", err.message);
    }

    // ── 4. 近期失败统计（过去 1 小时） ──
    const [recentFailures] = await db
      .select({
        failed: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
        timeout: sql<number>`count(*) filter (where ${callLogs.status} = 'timeout')::int`,
        cancelled: sql<number>`count(*) filter (where ${callLogs.status} = 'cancelled')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(callLogs)
      .where(gte(callLogs.createdAt, oneHourAgo));

    // 过去 1 小时 Top 10 错误
    const topErrors = await db
      .select({
        modelName: callLogs.modelName,
        errorMessage: callLogs.errorMessage,
        count: sql<number>`count(*)::int`,
      })
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, oneHourAgo),
          sql`${callLogs.status} IN ('failed', 'timeout')`,
          sql`${callLogs.errorMessage} IS NOT NULL`
        )
      )
      .groupBy(callLogs.modelName, callLogs.errorMessage)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    // ── 5. 等待恢复中的厂商（consecutive_success > 0 且 isDown=true） ──
    const recovering = await db
      .select({
        vendorName: vendors.name,
        modelName: models.name,
        upstreamModelName: vendorModels.upstreamModelName,
        consecutiveSuccess: vendorModels.consecutiveSuccess,
        healthScore: vendorModels.healthScore,
      })
      .from(vendorModels)
      .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
      .innerJoin(models, eq(vendorModels.modelId, models.id))
      .where(
        and(
          eq(vendorModels.isDown, true),
          sql`${vendorModels.consecutiveSuccess} > 0`
        )
      )
      .orderBy(sql`${vendorModels.consecutiveSuccess} desc`);

    reply.send({
      code: 0,
      data: {
        system: {
          uptime: process.uptime(),
          db: dbOk,
          redis: redisOk,
          timestamp: now.toISOString(),
        },
        vendors: {
          statusDistribution: vendorStatusCounts.reduce(
            (acc, r) => { acc[r.status] = r.count; return acc; },
            {} as Record<string, number>,
          ),
          avgHealthScore: healthStats?.avgScore ?? "0.00",
          totalActiveModels: healthStats?.totalModels ?? 0,
          downModelCount: healthStats?.downModels ?? 0,
          // 不健康列表（降级 + 宕机）
          unhealthyModels: unhealthyModels.map((m) => ({
            vendorName: m.vendorName,
            modelName: m.modelName,
            upstreamModelName: m.upstreamModelName,
            healthScore: m.healthScore,
            isDown: m.isDown,
            consecutiveSuccess: m.consecutiveSuccess,
            lastCheckAgo: m.lastHealthCheckAt
              ? Math.round((Date.now() - m.lastHealthCheckAt.getTime()) / 1000)
              : null,
            samples: m.healthSamples,
          })),
          // 恢复中的厂商
          recovering: recovering.map((r) => ({
            vendorName: r.vendorName,
            modelName: r.modelName,
            upstreamModelName: r.upstreamModelName,
            consecutiveSuccess: r.consecutiveSuccess,
            healthScore: r.healthScore,
          })),
        },
        rateLimit,
        recentFailures: {
          oneHourAgo: oneHourAgo.toISOString(),
          total: recentFailures.total,
          failed: recentFailures.failed,
          timeout: recentFailures.timeout,
          cancelled: recentFailures.cancelled,
          errorRate: recentFailures.total > 0
            ? Number((((recentFailures.failed + recentFailures.timeout) / recentFailures.total) * 100).toFixed(2))
            : 0,
          topErrors,
        },
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/dashboard/trends/hourly?date=2026-06-26
  //  小时级下钻：某天 24 小时调用分布 + Top 模型
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/dashboard/trends/hourly", async (request, reply) => {
    const db = getDb();
    const query = request.query as { date?: string };
    const dateStr = query.date;
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return reply.status(400).send({ code: 1, message: "请提供有效的日期参数 (YYYY-MM-DD)" });
    }
    const dayStart = new Date(dateStr + "T00:00:00+08:00");
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    // ── 24 小时调用分布 ──
    const hourlyCalls = await db
      .select({
        hour: sql<number>`extract(hour from ${callLogs.createdAt})::int`,
        total: sql<number>`count(*)::int`,
        success: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        failed: sql<number>`count(*) filter (where ${callLogs.status} = 'failed')::int`,
        timedout: sql<number>`count(*) filter (where ${callLogs.status} = 'timeout')::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
      })
      .from(callLogs)
      .where(
        and(gte(callLogs.createdAt, dayStart), lt(callLogs.createdAt, dayEnd))
      )
      .groupBy(sql`extract(hour from ${callLogs.createdAt})`)
      .orderBy(sql`extract(hour from ${callLogs.createdAt}) asc`);

    // ── 当天 Top 10 模型 ──
    const topModels = await db
      .select({
        modelName: callLogs.modelName,
        total: sql<number>`count(*)::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      })
      .from(callLogs)
      .where(
        and(gte(callLogs.createdAt, dayStart), lt(callLogs.createdAt, dayEnd))
      )
      .groupBy(callLogs.modelName)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    // ── 填满 24 小时空槽 ──
    const hourMap = new Map(hourlyCalls.map((r) => [r.hour, r]));
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

    // 找到峰值时段
    const peakHour = hours.reduce((a, b) => (a.total >= b.total ? a : b));
    // 找到 peakHour 所在时段的 top 3 模型
    const peakHourStart = new Date(dayStart.getTime() + peakHour.hour * 3600000);
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
          lt(callLogs.createdAt, peakHourEnd)
        )
      )
      .groupBy(callLogs.modelName)
      .orderBy(sql`count(*) desc`)
      .limit(3);

    reply.send({
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
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/dashboard/trends?days=7
  //  趋势数据：每日调用量、Token、收入、新增用户、成功率
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/dashboard/trends", async (request, reply) => {
    const db = getDb();
    const query = request.query as { days?: string };
    const days = Math.min(30, Math.max(1, parseInt(query.days ?? "7", 10) || 7));

    const now = new Date();
    // 生成 N 个日范围，从今天往前
    const dayRanges: { label: string; start: Date; end: Date }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const end = new Date(d.getTime() + 86400000);
      dayRanges.push({
        label: d.toISOString().slice(0, 10),
        start: d,
        end,
      });
    }

    // 一次性查询 N 天的所有数据，避免 N 次往返
    const dayStart = dayRanges[0].start;
    const dayEnd = dayRanges[days - 1].end;

    // ── 调用日志趋势 ──
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
      .where(
        and(gte(callLogs.createdAt, dayStart), lt(callLogs.createdAt, dayEnd))
      )
      .groupBy(sql`${callLogs.createdAt}::date`)
      .orderBy(sql`${callLogs.createdAt}::date asc`);

    // ── 新增用户趋势 ──
    const usersTrend = await db
      .select({
        date: sql<string>`${users.createdAt}::date::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(
        and(
          gte(users.createdAt, dayStart),
          lt(users.createdAt, dayEnd),
          sql`${users.deletedAt} IS NULL`
        )
      )
      .groupBy(sql`${users.createdAt}::date`)
      .orderBy(sql`${users.createdAt}::date asc`);

    // ── 充值收入趋势 ──
    const revenueTrend = await db
      .select({
        date: sql<string>`${rechargeOrders.createdAt}::date::text`,
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
      })
      .from(rechargeOrders)
      .where(
        and(
          gte(rechargeOrders.createdAt, dayStart),
          lt(rechargeOrders.createdAt, dayEnd),
          eq(rechargeOrders.status, "paid")
        )
      )
      .groupBy(sql`${rechargeOrders.createdAt}::date`)
      .orderBy(sql`${rechargeOrders.createdAt}::date asc`);

    // ── 组装成按日对齐的完整数组 ──
    const callsMap = new Map(callsTrend.map((r) => [r.date, r]));
    const usersMap = new Map(usersTrend.map((r) => [r.date, r]));
    const revenueMap = new Map(revenueTrend.map((r) => [r.date, r]));

    const series = dayRanges.map((dr) => {
      const c = callsMap.get(dr.label);
      const u = usersMap.get(dr.label);
      const r = revenueMap.get(dr.label);
      const total = c?.total ?? 0;
      const success = c?.success ?? 0;
      return {
        date: dr.label,
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

    reply.send({
      code: 0,
      data: {
        days,
        series,
      },
      message: "ok",
    });
  });
}
