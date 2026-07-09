// ============================================================
//  3cloud (3C) — Admin Dashboard 统计
//  GET /api/v1/admin/dashboard/stats — 今天和昨日统计
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lt, sql, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { checkDbConnection } from "../../db/index.js";
import { checkRedisConnection } from "../../redis.js";
import { users, callLogs, rechargeOrders, vendors, vendorModels, models, systemConfigs, agents, balanceLogs, securityEvents, withdrawOrders, agents as agentsTable } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

export async function adminDashboardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/dashboard/stats
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/dashboard/stats", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();

    // 缓存命中直接返回（30秒 TTL）
    try {
      const cached = await redis.get("dashboard:stats");
      if (cached) {
        return reply.send(JSON.parse(cached));
      }
    } catch {
      // Redis 不可用时降级
    }

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

    // ════════════════════════════════════════════
    //  新增：日间看板增强指标
    // ════════════════════════════════════════════

    // 7. 实名漏斗全量
    const realNameFunnel = await db
      .select({
        status: users.realNameStatus,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(sql`${users.deletedAt} IS NULL`)
      .groupBy(users.realNameStatus);

    // 8. 代理商摘要
    const [agentSummary] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${agents.status} = true)::int`,
        totalCommission: sql<string>`coalesce(sum(${agents.totalCommission}::numeric), 0)`,
        pendingWithdraw: sql<string>`coalesce(sum(${agents.pendingWithdraw}::numeric), 0)`,
      })
      .from(agents);

    // 9. 系统运行指标
    const [systemMetrics] = await db
      .select({
        activeVendors: sql<number>`count(*) filter (where ${vendors.status} = 'active')::int`,
        downVendors: sql<number>`count(*) filter (where ${vendors.status} = 'down')::int`,
      })
      .from(vendors);

    // 10. 昨日活跃用户数（有调用记录）
    const [dauYesterday] = await db
      .select({ count: sql<number>`count(distinct ${callLogs.userId})::int` })
      .from(callLogs)
      .where(
        and(gte(callLogs.createdAt, yesterdayStart), lt(callLogs.createdAt, todayStart))
      );

    // 11. 低余额用户（余额 < 10）
    const [lowBalanceUsers] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(
          sql`${users.balance}::numeric < 10`,
          sql`${users.deletedAt} IS NULL`,
          eq(users.status, "active")
        )
      );

    // 12. 今日平均响应时长
    const todayAvgDuration = todayCalls[0].total > 0
      ? Math.round(todayCalls[0].totalDuration / todayCalls[0].total)
      : 0;

    // 13. 今日失败率
    const todayErrorRate = todayCalls[0].total > 0
      ? Number((((todayCalls[0].failed + todayCalls[0].timedout) / todayCalls[0].total) * 100).toFixed(2))
      : 0;

    // 14. 平台总余额
    const [platformBalance] = await db
      .select({ total: sql<string>`coalesce(sum(${users.balance}::numeric), 0)` })
      .from(users)
      .where(sql`${users.deletedAt} IS NULL`);

    const statsResult = {
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
        // 增强统计
        realNameFunnel: Object.fromEntries(
          realNameFunnel.map((r) => [r.status, r.count])
        ),
        agents: agentSummary,
        system: systemMetrics,
        yesterdayDau: dauYesterday.count,
        lowBalanceUsers: lowBalanceUsers.count,
        todayAvgDuration,
        todayErrorRate,
        platformBalance: platformBalance.total,
      },
      message: "ok",
    };

    // 写缓存（非阻塞）
    redis.setex("dashboard:stats", 30, JSON.stringify(statsResult)).catch(() => {});

    reply.send(statsResult);
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/dashboard/recent-activity
  //  最近活跃用户 + 最近充值
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/dashboard/recent-activity", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
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

  app.get("/api/v1/admin/dashboard/health", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
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

  app.get("/api/v1/admin/dashboard/trends/hourly", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();
    const query = request.query as { date?: string };
    const dateStr = query.date;
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return reply.status(400).send({ code: 1, message: "请提供有效的日期参数 (YYYY-MM-DD)" });
    }

    // 缓存命中直接返回（300秒 TTL）
    const hourlyCacheKey = `dashboard:hourly:${dateStr}`;
    try {
      const cached = await redis.get(hourlyCacheKey);
      if (cached) {
        return reply.send(JSON.parse(cached));
      }
    } catch {
      // Redis 不可用时降级
    }

    const db = getDb();
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

  // ──────────────────────────────────────────────
  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/dashboard/trends?days=30
  //  趋势数据：每日调用量、Token、收入、新增用户、成功率
  //  支持 7/14/30/90 天，默认 30 天
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/dashboard/trends", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();
    const query = request.query as { days?: string; userType?: string; userId?: string };
    const days = Math.min(90, Math.max(1, parseInt(query.days ?? "30", 10) || 30));
    const userType = query.userType; // 'enterprise' | undefined
    const userId = query.userId;      // 具体企业用户 ID

    // 缓存命中直接返回（300秒 TTL）
    let cacheSuffix = ':all';
    if (userId) cacheSuffix = `:uid:${userId}`;
    else if (userType) cacheSuffix = `:${userType}`;
    const trendsCacheKey = `dashboard:trends:${days}${cacheSuffix}`;
    try {
      const cached = await redis.get(trendsCacheKey);
      if (cached) {
        return reply.send(JSON.parse(cached));
      }
    } catch {
      // Redis 不可用时降级
    }

    const db = getDb();

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
    const dateFilter = and(
      gte(callLogs.createdAt, dayStart),
      lt(callLogs.createdAt, dayEnd)
    );

    const userFilter = userId
      ? sql`${callLogs.userId} = ${parseInt(userId, 10)}`
      : userType
        ? sql`${callLogs.userId} IN (SELECT id FROM users WHERE user_type = ${userType})`
        : undefined;

    const combinedFilter = userFilter ? and(dateFilter as any, userFilter as any) : dateFilter;

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

    const trendsResult = {
      code: 0,
      data: {
        days,
        series,
      },
      message: "ok",
    };

    redis.setex(trendsCacheKey, 300, JSON.stringify(trendsResult)).catch(() => {});
    reply.send(trendsResult);
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/dashboard/revenue-analysis
  //  营收分析：模型类型拆收入、成本 vs 售价、支付渠道分布
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/dashboard/revenue-analysis", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();

    try {
      const cached = await redis.get("dashboard:revenue");
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. 今日营收按模型类型分组
    const revenueByType = await db
      .select({
        modelName: callLogs.modelName,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        count: sql<number>`count(*)::int`,
      })
      .from(callLogs)
      .where(
        and(gte(callLogs.createdAt, todayStart), lt(callLogs.createdAt, todayEnd))
      )
      .groupBy(callLogs.modelName)
      .orderBy(sql`sum(${callLogs.cost}::numeric) desc`);

    // 模型类型映射（从 models 表匹配）
    const allModels = await db
      .select({ name: models.name, type: models.type, displayName: models.displayName })
      .from(models);
    const typeMap = new Map(allModels.map((m) => [m.name, { type: m.type, displayName: m.displayName }]));

    // 按类型聚合
    const typeBuckets: Record<string, { cost: number; tokens: number; count: number; models: string[] }> = {};
    for (const r of revenueByType) {
      const modelInfo = typeMap.get(r.modelName ?? "") ?? { type: "chat", displayName: null };
      const bucket = typeBuckets[modelInfo.type] ?? { cost: 0, tokens: 0, count: 0, models: [] };
      bucket.cost += Number(r.totalCost);
      bucket.tokens += r.totalTokens;
      bucket.count += r.count;
      if (!bucket.models.includes(r.modelName ?? "")) bucket.models.push(r.modelName ?? "");
      typeBuckets[modelInfo.type] = bucket;
    }

    // 2. 今日支付渠道分布
    const channelRevenue = await db
      .select({
        channel: rechargeOrders.channel,
        total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(rechargeOrders)
      .where(
        and(
          gte(rechargeOrders.createdAt, todayStart),
          lt(rechargeOrders.createdAt, todayEnd),
          eq(rechargeOrders.status, "paid")
        )
      )
      .groupBy(rechargeOrders.channel);

    // 3. 本月每日营收趋势（简化版，按天取 recharge 收入）
    const monthlyRevenueTrend = await db
      .select({
        date: sql<string>`${rechargeOrders.createdAt}::date::text`,
        total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(rechargeOrders)
      .where(
        and(
          gte(rechargeOrders.createdAt, monthStart),
          lt(rechargeOrders.createdAt, todayEnd),
          eq(rechargeOrders.status, "paid")
        )
      )
      .groupBy(sql`${rechargeOrders.createdAt}::date`)
      .orderBy(sql`${rechargeOrders.createdAt}::date asc`);

    // 4. 本月累计调用成本（用于毛利率计算）
    const [monthCallCost] = await db
      .select({ total: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)` })
      .from(callLogs)
      .where(
        and(gte(callLogs.createdAt, monthStart), lt(callLogs.createdAt, todayEnd))
      );

    const [monthRecharge] = await db
      .select({ total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)` })
      .from(rechargeOrders)
      .where(
        and(
          gte(rechargeOrders.createdAt, monthStart),
          lt(rechargeOrders.createdAt, todayEnd),
          eq(rechargeOrders.status, "paid")
        )
      );

    const monthRevenue = Number(monthRecharge.total);
    const monthCostVal = Number(monthCallCost.total);

    const result = {
      code: 0,
      data: {
        today: {
          byType: Object.entries(typeBuckets).map(([type, data]) => ({
            type,
            cost: data.cost.toFixed(6),
            tokens: data.tokens,
            count: data.count,
            models: data.models,
          })),
          byChannel: channelRevenue.map((r) => ({
            channel: r.channel,
            total: r.total,
            count: r.count,
          })),
        },
        month: {
          startDate: monthStart.toISOString().slice(0, 10),
          revenue: monthRevenue.toFixed(6),
          cost: monthCostVal.toFixed(6),
          profitRate: monthRevenue > 0
            ? Number((((monthRevenue - monthCostVal) / monthRevenue) * 100).toFixed(1))
            : 0,
          revenueTrend: monthlyRevenueTrend.map((r) => ({
            date: r.date,
            total: r.total,
            count: r.count,
          })),
        },
      },
      message: "ok",
    };

    redis.setex("dashboard:revenue", 300, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/dashboard/top-consumers
  //  消费排行 + 低余额提醒
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/dashboard/top-consumers", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();

    try {
      const cached = await redis.get("dashboard:top-consumers");
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Top 20 消费用户
    const topConsumers = await db
      .select({
        userId: callLogs.userId,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        totalCalls: sql<number>`count(*)::int`,
      })
      .from(callLogs)
      .groupBy(callLogs.userId)
      .orderBy(sql`sum(${callLogs.cost}::numeric) desc`)
      .limit(20);

    // 本月的消费
    const monthTopConsumers = await db
      .select({
        userId: callLogs.userId,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        totalCalls: sql<number>`count(*)::int`,
      })
      .from(callLogs)
      .where(gte(callLogs.createdAt, monthStart))
      .groupBy(callLogs.userId);

    const monthCostMap = new Map(monthTopConsumers.map((r) => [r.userId, r]));

    // 获取用户详细信息
    const userIds = topConsumers.map((r) => r.userId);
    const consumerUsers = userIds.length > 0
      ? await db
        .select({
          id: users.id,
          email: users.email,
          nickname: users.nickname,
          userType: users.userType,
          balance: users.balance,
          status: users.status,
          companyName: users.companyName,
        })
        .from(users)
        .where(inArray(users.id, userIds))
      : [];

    const userMap = new Map(consumerUsers.map((u) => [u.id, u]));

    // 2. 低余额用户（余额 < 10 的活跃用户）
    const lowBalanceList = await db
      .select({
        id: users.id,
        email: users.email,
        nickname: users.nickname,
        companyName: users.companyName,
        balance: users.balance,
        userType: users.userType,
        realNameStatus: users.realNameStatus,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(
        and(
          sql`${users.balance}::numeric < 10`,
          sql`${users.deletedAt} IS NULL`,
          eq(users.status, "active")
        )
      )
      .orderBy(sql`${users.balance}::numeric asc`)
      .limit(10);

    const result = {
      code: 0,
      data: {
        topConsumers: topConsumers.map((r) => {
          const u = userMap.get(r.userId);
          const m = monthCostMap.get(r.userId);
          return {
            userId: r.userId,
            email: u?.email ?? "unknown",
            nickname: u?.nickname ?? null,
            userType: u?.userType ?? "personal",
            companyName: u?.companyName ?? null,
            totalConsumption: r.totalCost,
            totalCalls: r.totalCalls,
            monthConsumption: m?.totalCost ?? "0",
            balance: u?.balance ?? "0",
          };
        }),
        lowBalanceUsers: lowBalanceList.map((u) => ({
          id: u.id,
          email: u.email,
          nickname: u.nickname,
          companyName: u.companyName,
          balance: u.balance,
          userType: u.userType,
        })),
        lowBalanceCount: lowBalanceList.length,
      },
      message: "ok",
    };

    redis.setex("dashboard:top-consumers", 120, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/dashboard/todo-queue
  //  运营待办队列
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/dashboard/todo-queue", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();

    try {
      const cached = await redis.get("dashboard:todo-queue");
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);

    // 1. 实名待审
    const [pendingRealName] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.realNameStatus, "pending_review"));

    // 2. 对公转账待审（pending 且 3 天内）
    const [bankTransferPending] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
      })
      .from(rechargeOrders)
      .where(
        and(
          eq(rechargeOrders.status, "pending"),
          eq(rechargeOrders.channel, "bank_transfer"),
          gte(rechargeOrders.createdAt, threeDaysAgo)
        )
      );

    // 3. 对公转账待一审（first_confirmed_by IS NULL）
    const [firstReviewBank] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
      })
      .from(rechargeOrders)
      .where(
        and(
          eq(rechargeOrders.channel, "bank_transfer"),
          sql`${rechargeOrders.status} IN ('pending', 'paid')`,
          sql`${rechargeOrders.firstConfirmedBy} IS NULL`
        )
      );

    // 4. 对公转账待二审（first set 但 second IS NULL）
    const [secondReviewBank] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
      })
      .from(rechargeOrders)
      .where(
        and(
          eq(rechargeOrders.channel, "bank_transfer"),
          sql`${rechargeOrders.firstConfirmedBy} IS NOT NULL`,
          sql`${rechargeOrders.secondConfirmedBy} IS NULL`
        )
      );

    // 5. 提现待一审
    const [withdrawFirst] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${withdrawOrders.amount}::numeric), 0)`,
      })
      .from(withdrawOrders)
      .where(eq(withdrawOrders.status, "pending_first_review"));

    // 6. 提现待二审
    const [withdrawSecond] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${withdrawOrders.amount}::numeric), 0)`,
      })
      .from(withdrawOrders)
      .where(eq(withdrawOrders.status, "pending_second_review"));

    // 7. 未确认的高风险安全事件
    let securityEventCount = 0;
    try {
      const { getUnacknowledgedHighRiskCount } = await import("../../services/security-event.js");
      securityEventCount = await getUnacknowledgedHighRiskCount();
    } catch {}

    const result = {
      code: 0,
      data: {
        realNamePending: pendingRealName.count,
        bankTransfer: {
          pending: { count: bankTransferPending.count, totalAmount: bankTransferPending.total },
          needFirstReview: { count: firstReviewBank.count, totalAmount: firstReviewBank.total },
          needSecondReview: { count: secondReviewBank.count, totalAmount: secondReviewBank.total },
        },
        withdraws: {
          needFirstReview: { count: withdrawFirst.count, totalAmount: withdrawFirst.total },
          needSecondReview: { count: withdrawSecond.count, totalAmount: withdrawSecond.total },
        },
        unacknowledgedSecurityEvents: securityEventCount,
      },
      message: "ok",
    };

    redis.setex("dashboard:todo-queue", 60, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/dashboard/enterprise-users
  //  企业用户列表（供前端趋势图下拉选择）
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/dashboard/enterprise-users", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as { keyword?: string; limit?: string; status?: string };
    const keyword = query.keyword;
    const status = query.status;
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? "20", 10) || 20));

    const conditions: any[] = [
      eq(users.userType, "enterprise"),
      sql`${users.deletedAt} IS NULL`,
    ];

    if (keyword) {
      conditions.push(
        sql`(${users.companyName}::text ILIKE ${`%${keyword}%`} OR ${users.email}::text ILIKE ${`%${keyword}%`})`
      );
    }

    if (status) {
      conditions.push(eq(users.status, status as any));
    }

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        nickname: users.nickname,
        companyName: users.companyName,
        balance: users.balance,
        lastLoginAt: users.lastLoginAt,
        status: users.status,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(users.companyName, users.email)
      .limit(limit);

    reply.send({
      code: 0,
      data: rows.map((r) => ({
        id: r.id,
        email: r.email,
        nickname: r.nickname,
        companyName: r.companyName,
        balance: r.balance,
        lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
        status: r.status,
      })),
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/dashboard/enterprise-overview
  //  企业总体看板：总数、总余额、月活跃数、月消费、月充值
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/dashboard/enterprise-overview", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();

    try {
      const cached = await redis.get("dashboard:enterprise-overview");
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);

    // 1. 企业总数 & 总余额
    const [enterpriseStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        totalBalance: sql<string>`coalesce(sum(${users.balance}::numeric), 0)`,
      })
      .from(users)
      .where(
        and(
          eq(users.userType, "enterprise"),
          sql`${users.deletedAt} IS NULL`
        )
      );

    // 2. 本月新增企业
    const [monthNew] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(
          eq(users.userType, "enterprise"),
          gte(users.createdAt, monthStart),
          sql`${users.deletedAt} IS NULL`
        )
      );

    // 3. 本月活跃企业数（本月有调用记录的企业用户数）
    const [activeEnterprises] = await db
      .select({ count: sql<number>`count(DISTINCT ${callLogs.userId})::int` })
      .from(callLogs)
      .where(gte(callLogs.createdAt, monthStart));

    // 4. 本月企业总消费
    const [monthConsumption] = await db
      .select({
        totalCalls: sql<number>`count(*)::int`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      })
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, monthStart),
          sql`${callLogs.userId} IN (SELECT id FROM ${users} WHERE user_type = 'enterprise' AND deleted_at IS NULL)`
        )
      );

    // 5. 本月企业总充值
    const [monthRecharge] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
      })
      .from(rechargeOrders)
      .where(
        and(
          gte(rechargeOrders.createdAt, monthStart),
          eq(rechargeOrders.status, "paid"),
          sql`${rechargeOrders.userId} IN (SELECT id FROM ${users} WHERE user_type = 'enterprise' AND deleted_at IS NULL)`
        )
      );

    // 6. 昨日企业消费（用于计算环比）
    const [yesterdayConsumption] = await db
      .select({
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
      })
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, yesterdayStart),
          lt(callLogs.createdAt, todayStart),
          sql`${callLogs.userId} IN (SELECT id FROM ${users} WHERE user_type = 'enterprise' AND deleted_at IS NULL)`
        )
      );

    // 7. 低余额企业数（余额 < 10）
    const [lowBalance] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(
          eq(users.userType, "enterprise"),
          eq(users.status, "active"),
          sql`${users.balance}::numeric < 10`,
          sql`${users.deletedAt} IS NULL`
        )
      );

    // 8. 低余额企业列表
    const lowBalanceEnterpriseList = await db
      .select({
        id: users.id,
        email: users.email,
        nickname: users.nickname,
        companyName: users.companyName,
        balance: users.balance,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(
        and(
          eq(users.userType, "enterprise"),
          eq(users.status, "active"),
          sql`${users.balance}::numeric < 10`,
          sql`${users.deletedAt} IS NULL`
        )
      )
      .orderBy(sql`${users.balance}::numeric asc`)
      .limit(10);

    const result = {
      code: 0,
      data: {
        totalEnterprises: enterpriseStats.total,
        totalBalance: enterpriseStats.totalBalance,
        monthNewEnterprises: monthNew.count,
        activeEnterprises: activeEnterprises.count,
        monthConsumption: {
          totalCalls: monthConsumption.totalCalls,
          totalCost: monthConsumption.totalCost,
          totalTokens: Number(monthConsumption.totalTokens),
        },
        monthRecharge: {
          count: monthRecharge.count,
          total: monthRecharge.total,
        },
        yesterdayConsumption: yesterdayConsumption.totalCost,
        lowBalanceEnterpriseCount: lowBalance.count,
        lowBalanceEnterpriseList: lowBalanceEnterpriseList.map(u => ({
          id: u.id,
          email: u.email,
          nickname: u.nickname,
          companyName: u.companyName,
          balance: u.balance,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        })),
      },
      message: "ok",
    };

    redis.setex("dashboard:enterprise-overview", 300, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/dashboard/enterprise-model-breakdown
  //  企业模型用量分解：按模型分组统计调用量、Token、费用、耗时、成功率
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/dashboard/enterprise-model-breakdown", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();
    const query = request.query as { userId?: string; days?: string };
    const userId = parseInt(query.userId ?? "0", 10);
    const days = Math.min(90, Math.max(1, parseInt(query.days ?? "30", 10) || 30));

    if (!userId) {
      return reply.status(400).send({ code: 1, data: null, message: "userId is required" });
    }

    const cacheKey = `dashboard:enterprise-model-breakdown:${userId}:${days}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);

    // 从 call_logs 按 model_name 分组统计
    const breakdown = await db
      .select({
        modelName: callLogs.modelName,
        totalCalls: sql<number>`count(*)::int`,
        successCalls: sql<number>`count(*) filter (where ${callLogs.status} = 'success')::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
        totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        avgDuration: sql<number>`coalesce(avg(${callLogs.durationMs})::int, 0)`,
        promptTokens: sql<number>`coalesce(sum(${callLogs.promptTokens}), 0)::bigint`,
        completionTokens: sql<number>`coalesce(sum(${callLogs.completionTokens}), 0)::bigint`,
      })
      .from(callLogs)
      .where(
        and(
          sql`${callLogs.userId} = ${userId}`,
          gte(callLogs.createdAt, dayStart),
          sql`${callLogs.modelName} IS NOT NULL`
        )
      )
      .groupBy(callLogs.modelName)
      .orderBy(sql`count(*)::int desc`);

    // 从 models 表获取显示名和类型
    const modelRows = breakdown.map(r => r.modelName).filter(Boolean) as string[];
    const modelInfos = modelRows.length > 0
      ? await db
        .select({
          name: models.name,
          displayName: models.displayName,
          type: models.type,
        })
        .from(models)
        .where(inArray(models.name, modelRows))
      : [];

    const modelInfoMap = new Map(modelInfos.map(m => [m.name, { displayName: m.displayName, type: m.type }]));

    const result = {
      code: 0,
      data: breakdown.map(r => {
        const info = modelInfoMap.get(r.modelName ?? "");
        return {
          modelName: r.modelName,
          displayName: info?.displayName ?? r.modelName,
          type: info?.type ?? "chat",
          totalCalls: r.totalCalls,
          successCalls: r.successCalls,
          successRate: r.totalCalls > 0 ? Number((r.successCalls / r.totalCalls * 100).toFixed(1)) : 100,
          totalTokens: Number(r.totalTokens),
          promptTokens: Number(r.promptTokens),
          completionTokens: Number(r.completionTokens),
          totalCost: r.totalCost,
          avgDuration: r.avgDuration,
        };
      }),
      message: "ok",
    };

    redis.setex(cacheKey, 300, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/dashboard/enterprise-finance
  //  企业财务流水：余额趋势 + 充值/消费流水明细
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/dashboard/enterprise-finance", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();
    const query = request.query as { userId?: string; days?: string };
    const userId = parseInt(query.userId ?? "0", 10);
    const days = Math.min(90, Math.max(1, parseInt(query.days ?? "30", 10) || 30));

    if (!userId) {
      return reply.status(400).send({ code: 1, data: null, message: "userId is required" });
    }

    const cacheKey = `dashboard:enterprise-finance:${userId}:${days}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);

    // 1. 每日余额趋势：取 balance_logs 中每天最后一条记录
    const balanceTrend = await db.execute(sql`
      SELECT DISTINCT ON (date_trunc('day', created_at))
        date_trunc('day', created_at)::date AS day,
        balance_after
      FROM balance_logs
      WHERE user_id = ${userId}
        AND created_at >= ${dayStart}
      ORDER BY date_trunc('day', created_at) DESC, created_at DESC
    `);

    // 2. 流水明细：balance_logs 最近的 200 条
    const balanceEvents = await db
      .select({
        id: balanceLogs.id,
        amount: balanceLogs.amount,
        balanceAfter: balanceLogs.balanceAfter,
        type: balanceLogs.type,
        description: balanceLogs.description,
        createdAt: balanceLogs.createdAt,
      })
      .from(balanceLogs)
      .where(
        and(
          eq(balanceLogs.userId, userId),
          gte(balanceLogs.createdAt, dayStart)
        )
      )
      .orderBy(sql`${balanceLogs.createdAt} desc`)
      .limit(200);

    // 3. 同一期间的充值记录
    const rechargeEvents = await db
      .select({
        id: rechargeOrders.id,
        amount: rechargeOrders.amount,
        channel: rechargeOrders.channel,
        status: rechargeOrders.status,
        createdAt: rechargeOrders.createdAt,
      })
      .from(rechargeOrders)
      .where(
        and(
          eq(rechargeOrders.userId, userId),
          gte(rechargeOrders.createdAt, dayStart)
        )
      )
      .orderBy(sql`${rechargeOrders.createdAt} desc`)
      .limit(100);

    // 4. 汇总统计
    const [financeSummary] = await db
      .select({
        totalRecharge: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric) filter (where ${rechargeOrders.status} = 'paid'), 0)`,
        rechargeCount: sql<number>`count(*) filter (where ${rechargeOrders.status} = 'paid')::int`,
        totalConsumption: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        callCount: sql<number>`count(*)::int`,
      })
      .from(callLogs)
      .leftJoin(rechargeOrders, eq(callLogs.userId, rechargeOrders.userId))
      .where(
        and(
          eq(callLogs.userId, userId),
          gte(callLogs.createdAt, dayStart)
        )
      );

    // 补一份充值单独统计（上面的 join 可能不准，因为 leftJoin 会重复）
    const [rechargeStats] = await db
      .select({
        total: sql<string>`coalesce(sum(${rechargeOrders.amount}::numeric), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(rechargeOrders)
      .where(
        and(
          eq(rechargeOrders.userId, userId),
          eq(rechargeOrders.status, "paid"),
          gte(rechargeOrders.createdAt, dayStart)
        )
      );

    const balanceTrendData = (balanceTrend.rows ?? []).map((r: any) => ({
      day: r.day ? new Date(r.day).toISOString().slice(0, 10) : null,
      balanceAfter: r.balance_after?.toString() ?? "0",
    }));

    // 生成完整天数序列（填充缺失天）
    const dateList: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      dateList.push(d.toISOString().slice(0, 10));
    }

    const balanceMap = new Map(balanceTrendData.filter((d: any) => d.day).map((d: any) => [d.day, d.balanceAfter]));
    let lastBalance = "0";
    const fullBalanceTrend = dateList.map(day => {
      if (balanceMap.has(day)) lastBalance = balanceMap.get(day);
      return { day, balance: lastBalance };
    });

    // 合并流水（balance_logs 作为统一视图，用 type 区分）
    const events = balanceEvents.map(e => ({
      id: e.id,
      time: e.createdAt.toISOString(),
      type: e.type,
      amount: e.amount,
      balanceAfter: e.balanceAfter,
      description: e.description,
    }));

    const result = {
      code: 0,
      data: {
        balanceTrend: fullBalanceTrend,
        events,
        rechargeEvents: rechargeEvents.map(r => ({
          id: r.id,
          amount: r.amount,
          channel: r.channel,
          status: r.status,
          time: r.createdAt.toISOString(),
        })),
        summary: {
          totalRecharge: rechargeStats.total,
          rechargeCount: rechargeStats.count,
          totalConsumption: financeSummary.totalConsumption,
          callCount: financeSummary.callCount,
        },
      },
      message: "ok",
    };

    redis.setex(cacheKey, 300, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/dashboard/enterprise-activity
  //  企业活跃记录：活跃热力图、IP 分布、常用模型、活跃时段
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/dashboard/enterprise-activity", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();
    const query = request.query as { userId?: string; days?: string };
    const userId = parseInt(query.userId ?? "0", 10);
    const days = Math.min(90, Math.max(1, parseInt(query.days ?? "30", 10) || 30));

    if (!userId) {
      return reply.status(400).send({ code: 1, data: null, message: "userId is required" });
    }

    const cacheKey = `dashboard:enterprise-activity:${userId}:${days}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const db = getDb();
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);

    // 1. 每日活跃热度（用于热力图）
    const dailyActivity = await db
      .select({
        day: sql<string>`${callLogs.createdAt}::date::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(callLogs)
      .where(
        and(
          eq(callLogs.userId, userId),
          gte(callLogs.createdAt, dayStart)
        )
      )
      .groupBy(sql`${callLogs.createdAt}::date`)
      .orderBy(sql`${callLogs.createdAt}::date asc`);

    // 2. 小时分布
    const hourlyDistribution = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${callLogs.createdAt})::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(callLogs)
      .where(
        and(
          eq(callLogs.userId, userId),
          gte(callLogs.createdAt, dayStart)
        )
      )
      .groupBy(sql`EXTRACT(HOUR FROM ${callLogs.createdAt})`)
      .orderBy(sql`EXTRACT(HOUR FROM ${callLogs.createdAt}) asc`);

    // 3. IP 分布
    const ipDistribution = await db
      .select({
        ip: callLogs.ip,
        count: sql<number>`count(*)::int`,
      })
      .from(callLogs)
      .where(
        and(
          eq(callLogs.userId, userId),
          gte(callLogs.createdAt, dayStart),
          sql`${callLogs.ip} IS NOT NULL`
        )
      )
      .groupBy(callLogs.ip)
      .orderBy(sql`count(*)::int desc`)
      .limit(15);

    // 4. 常用模型排行（从 model-breakdown 复用逻辑，轻量查询）
    const modelRanking = await db
      .select({
        modelName: callLogs.modelName,
        count: sql<number>`count(*)::int`,
        totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
      })
      .from(callLogs)
      .where(
        and(
          eq(callLogs.userId, userId),
          gte(callLogs.createdAt, dayStart),
          sql`${callLogs.modelName} IS NOT NULL`
        )
      )
      .groupBy(callLogs.modelName)
      .orderBy(sql`count(*)::int desc`)
      .limit(10);

    const result = {
      code: 0,
      data: {
        dailyActivity: dailyActivity.map(r => ({ day: r.day, count: r.count })),
        hourlyDistribution: hourlyDistribution.map(r => ({ hour: r.hour, count: r.count })),
        ipDistribution: ipDistribution.map(r => ({ ip: r.ip, count: r.count })),
        modelRanking: modelRanking.map(r => ({ modelName: r.modelName, count: r.count, totalTokens: Number(r.totalTokens) })),
      },
      message: "ok",
    };

    redis.setex(cacheKey, 300, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/dashboard/scheduling-realtime?minutes=30
  //  模型调度实时监控（分钟级 RPM/TPM 曲线）
  //  数据源：Redis 实时计数器（零 PostgreSQL 开销）
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/dashboard/scheduling-realtime", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const redis = getRedis();
    const query = request.query as { minutes?: string };
    const minutes = Math.min(120, Math.max(5, parseInt(query.minutes ?? "30", 10) || 30));

    // 10 秒缓存，多管理员同频查看时复用
    const cacheKey = `dashboard:scheduling-realtime:${minutes}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    } catch {}

    const now = new Date();
    const series: Array<{
      time: string;
      rpm: number;
      tpm: number;
      avgLatencyMs: number;
      models: Array<{ modelName: string; rpm: number; tpm: number }>;
      vendors: Array<{ vendorName: string; rpm: number; tpm: number }>;
    }> = [];

    let allModels = new Set<string>();
    let allVendors = new Set<string>();

    for (let i = minutes - 1; i >= 0; i--) {
      const t = new Date(now.getTime() - i * 60000);
      const bucket =
        `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, "0")}${String(t.getDate()).padStart(2, "0")}` +
        `${String(t.getHours()).padStart(2, "0")}${String(t.getMinutes()).padStart(2, "0")}`;

      let rpmHash: Record<string, string> = {};
      let tpmHash: Record<string, string> = {};
      let latHash: Record<string, string> = {};
      try {
        [rpmHash, tpmHash, latHash] = await Promise.all([
          redis.hgetall(`scheduling:rpm:${bucket}`),
          redis.hgetall(`scheduling:tpm:${bucket}`),
          redis.hgetall(`scheduling:lat:${bucket}`),
        ]);
      } catch {
        // Redis 不可用时返回空数据
      }

      const time = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;

      if (Object.keys(rpmHash).length === 0) {
        series.push({ time, rpm: 0, tpm: 0, avgLatencyMs: 0, models: [], vendors: [] });
        continue;
      }

      const modelMap = new Map<string, { rpm: number; tpm: number; latTotal: number; latCnt: number }>();
      const vendorMap = new Map<string, { rpm: number; tpm: number }>();

      for (const [field, val] of Object.entries(rpmHash)) {
        const sepIdx = field.lastIndexOf("::");
        if (sepIdx === -1) continue;
        const model = field.slice(0, sepIdx);
        const vendor = field.slice(sepIdx + 2);

        const rpm = parseInt(val) || 0;
        const tpm = parseInt(tpmHash[field] ?? "0") || 0;
        const latRaw = parseInt(latHash[`${field}::lat`] ?? "0") || 0;
        const latCnt = parseInt(latHash[`${field}::cnt`] ?? "0") || 0;
        const avgLat = latCnt > 0 ? Math.round(latRaw / latCnt) : 0;

        const m = modelMap.get(model) ?? { rpm: 0, tpm: 0, latTotal: 0, latCnt: 0 };
        m.rpm += rpm;
        m.tpm += tpm;
        m.latTotal += avgLat * rpm;
        m.latCnt += rpm;
        modelMap.set(model, m);

        const v = vendorMap.get(vendor) ?? { rpm: 0, tpm: 0 };
        v.rpm += rpm;
        v.tpm += tpm;
        vendorMap.set(vendor, v);

        allModels.add(model);
        allVendors.add(vendor);
      }

      const totalRpm = Array.from(modelMap.values()).reduce((a, m) => a + m.rpm, 0);
      const totalTpm = Array.from(modelMap.values()).reduce((a, m) => a + m.tpm, 0);
      const totalLatTotal = Array.from(modelMap.values()).reduce((a, m) => a + m.latTotal, 0);
      const avgLatencyMs = totalRpm > 0 ? Math.round(totalLatTotal / totalRpm) : 0;

      series.push({
        time,
        rpm: totalRpm,
        tpm: totalTpm,
        avgLatencyMs,
        models: Array.from(modelMap.entries()).map(([name, d]) => ({
          modelName: name,
          rpm: d.rpm,
          tpm: d.tpm,
        })),
        vendors: Array.from(vendorMap.entries()).map(([name, d]) => ({
          vendorName: name,
          rpm: d.rpm,
          tpm: d.tpm,
        })),
      });
    }

    // 当前调度决策快照（最新1分钟）
    const latest = series[series.length - 1] ?? null;
    const currentDistribution = latest
      ? Array.from(
          series[series.length - 1].vendors.reduce((acc, v) => {
            const existing = acc.get(v.vendorName);
            if (existing) {
              existing.rpm += v.rpm;
            } else {
              acc.set(v.vendorName, { vendorName: v.vendorName, rpm: v.rpm });
            }
            return acc;
          }, new Map<string, { vendorName: string; rpm: number }>())
        ).map(([vendorName, v]) => ({
          vendorName,
          rpm: v.rpm,
          percentage: latest.rpm > 0 ? Math.round((v.rpm / latest.rpm) * 100) : 0,
          avgLatencyMs: latest.avgLatencyMs,
          topModels: Array.from(
            series[series.length - 1].models
              .filter((m) => m.rpm > 0)
              .sort((a, b) => b.rpm - a.rpm)
              .slice(0, 3)
          ),
        }))
      : [];

    // 全局摘要
    const allRpms = series.map((s) => s.rpm);
    const allTpms = series.map((s) => s.tpm);
    const allLats = series.filter((s) => s.avgLatencyMs > 0).map((s) => s.avgLatencyMs);
    const latestEntry = series[series.length - 1] ?? null;

    const result = {
      code: 0,
      data: {
        minutes,
        series,
        currentDistribution,
        lastUpdated: new Date().toISOString(),
        summary: {
          totalRpm: latestEntry?.rpm ?? 0,
          totalTpm: latestEntry?.tpm ?? 0,
          avgLatencyMs: latestEntry?.avgLatencyMs ?? 0,
          peakRpm: allRpms.length > 0 ? Math.max(...allRpms) : 0,
          peakTpm: allTpms.length > 0 ? Math.max(...allTpms) : 0,
          avgLatencyRecent: allLats.length > 0 ? Math.round(allLats.reduce((a, b) => a + b, 0) / allLats.length) : 0,
          vendorCount: allVendors.size,
          modelCount: allModels.size,
        },
      },
      message: "ok",
    };

    redis.setex(cacheKey, 10, JSON.stringify(result)).catch(() => {});
    reply.send(result);
  });
}
