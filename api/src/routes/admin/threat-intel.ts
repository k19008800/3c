// ============================================================
//  3cloud (3C) — 威胁情报管理
//  IP 信誉查询、外部威胁情报集成、黑名单管理
// ============================================================

import { FastifyInstance } from "fastify";
import { and, eq, desc, gte, like, sql, inArray, ne } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { securityEvents, users, auditLogs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { getRedis } from "../../redis.js";

// ── 威胁类型标签 ──

const THREAT_CATEGORIES: Record<string, { name: string; severity: string }> = {
  brute_force: { name: "暴力破解", severity: "high" },
  unusual_location: { name: "异地登录", severity: "medium" },
  new_device: { name: "新设备登录", severity: "low" },
  ip_banned: { name: "IP 封禁", severity: "high" },
  user_banned: { name: "账号封禁", severity: "high" },
  user_captcha: { name: "验证码挑战", severity: "low" },
  circuit_trip: { name: "厂商熔断", severity: "high" },
  circuit_recovery: { name: "熔断恢复", severity: "low" },
  vendor_failure: { name: "厂商失败", severity: "medium" },
  risk_detected: { name: "风控检测", severity: "medium" },
  sensitive_word: { name: "敏感词触发", severity: "medium" },
  abnormal_ip: { name: "异常IP", severity: "medium" },
  batch_operation: { name: "批量操作", severity: "low" },
  repeat_operation: { name: "重复操作", severity: "low" },
  risk_control: { name: "风控模型", severity: "medium" },
};

// ── 外部威胁情报源（配置化） ──

interface ThreatIntelSource {
  key: string;
  name: string;
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  description: string;
}

const DEFAULT_INTEL_SOURCES: ThreatIntelSource[] = [
  { key: "abuseipdb", name: "AbuseIPDB", enabled: false, apiUrl: "https://api.abuseipdb.com/api/v2/check", apiKey: "", description: "全球 IP 黑名单数据库" },
  { key: "virustotal", name: "VirusTotal", enabled: false, apiUrl: "https://www.virustotal.com/api/v3/ip_addresses", apiKey: "", description: "多引擎威胁检测平台" },
  { key: "alienvault", name: "AlienVault OTX", enabled: false, apiUrl: "https://otx.alienvault.com/api/v1/indicators/IPv4", apiKey: "", description: "开源威胁情报社区" },
];

const INTEL_CACHE_KEY = "threat:intel:config";
const INTEL_CACHE_TTL = 86400;

export async function adminThreatIntelRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  威胁情报概览
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/threat-intel/overview
  app.get("/api/v1/admin/threat-intel/overview", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const db = getDb();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totalEvents, threatByType, uniqueIps, uniqueUsers] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(securityEvents)
        .where(gte(securityEvents.createdAt, thirtyDaysAgo)),
      db.select({
        eventType: securityEvents.eventType,
        count: sql<number>`count(*)::int`,
      }).from(securityEvents)
        .where(gte(securityEvents.createdAt, thirtyDaysAgo))
        .groupBy(securityEvents.eventType)
        .orderBy(desc(sql`count(*)`)),
      db.select({ count: sql<number>`count(DISTINCT ip)::int` }).from(securityEvents)
        .where(and(
          gte(securityEvents.createdAt, thirtyDaysAgo),
          sql`ip IS NOT NULL`,
          ne(securityEvents.ip, "" as any),
        )),
      db.select({ count: sql<number>`count(DISTINCT user_id)::int` }).from(securityEvents)
        .where(gte(securityEvents.createdAt, thirtyDaysAgo)),
    ]);

    reply.status(200).send({
      code: 0,
      data: {
        totalEvents: Number(totalEvents[0]?.count ?? 0),
        threatByType,
        uniqueIps: Number(uniqueIps[0]?.count ?? 0),
        uniqueUsers: Number(uniqueUsers[0]?.count ?? 0),
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  疑似恶意 IP 列表（基于安全事件统计）
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/threat-intel/suspicious-ips
  app.get("/api/v1/admin/threat-intel/suspicious-ips", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const query = request.query as any;
    const page = parseInt(query.page || "1", 10);
    const pageSize = parseInt(query.pageSize || "20", 10);
    const db = getDb();

    const [ips, total] = await Promise.all([
      db.select({
        ip: securityEvents.ip,
        eventCount: sql<number>`count(*)::int`,
        criticalCount: sql<number>`count(*) FILTER (WHERE risk_level = 'critical')::int`,
        highCount: sql<number>`count(*) FILTER (WHERE risk_level = 'high')::int`,
        lastSeen: sql<string>`max(created_at)`,
        eventTypes: sql<string>`array_to_string(array_agg(DISTINCT event_type), ', ')`,
      }).from(securityEvents)
        .where(and(
          sql`${securityEvents.ip} IS NOT NULL`,
          ne(securityEvents.ip, "" as any),
          gte(securityEvents.createdAt, sql`CURRENT_DATE - INTERVAL '90 days'`),
        ))
        .groupBy(securityEvents.ip)
        .orderBy(desc(sql`count(*)`))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(DISTINCT ip)::int` }).from(securityEvents)
        .where(and(
          sql`${securityEvents.ip} IS NOT NULL`,
          ne(securityEvents.ip, "" as any),
          gte(securityEvents.createdAt, sql`CURRENT_DATE - INTERVAL '90 days'`),
        )),
    ]);

    reply.status(200).send({
      code: 0,
      data: {
        list: ips.filter(r => r.ip),
        total: Number(total[0]?.count ?? 0),
        page,
        pageSize,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  IP 信誉查询（本地规则+缓存）
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/threat-intel/ip-lookup/:ip
  app.get("/api/v1/admin/threat-intel/ip-lookup/:ip", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const { ip } = request.params as { ip: string };
    if (!ip) {
      return reply.status(400).send({ code: 400, message: "IP 地址不能为空" });
    }

    const redis = getRedis();
    const cacheKey = `threat:intel:ip:${ip}`;

    // 尝试从缓存读取
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return reply.status(200).send({
          code: 0,
          data: JSON.parse(cached),
          message: "ok（缓存）",
        });
      }
    } catch { /* 缓存不可用 */ }

    const db = getDb();

    // 查询该 IP 在 security_events 中的记录
    const [eventStats, relatedUsers, bannedCheck] = await Promise.all([
      db.select({
        eventCount: sql<number>`count(*)::int`,
        criticalCount: sql<number>`count(*) FILTER (WHERE risk_level = 'critical')::int`,
        highCount: sql<number>`count(*) FILTER (WHERE risk_level = 'high')::int`,
        firstSeen: sql<string>`min(created_at)`,
        lastSeen: sql<string>`max(created_at)`,
        eventTypes: sql<string>`array_to_string(array_agg(DISTINCT event_type), ', ')`,
        riskLevels: sql<string>`array_to_string(array_agg(DISTINCT risk_level), ', ')`,
      }).from(securityEvents)
        .where(eq(securityEvents.ip, ip)),
      db.select({
        userId: securityEvents.userId,
        count: sql<number>`count(*)::int`,
      }).from(securityEvents)
        .where(and(eq(securityEvents.ip, ip), sql`user_id IS NOT NULL`))
        .groupBy(securityEvents.userId)
        .orderBy(desc(sql`count(*)`))
        .limit(10),
      // 检查是否在 Redis 封禁列表中
      (async () => {
        try {
          const banned = await redis.get(`risk:ban:ip:${ip}`);
          return !!banned;
        } catch { return false; }
      })(),
    ]);

    // 计算信誉评分（0-100，越高越可疑）
    let reputationScore = 0;
    if (eventStats) {
      reputationScore += Math.min(40, (eventStats.eventCount || 0) * 5);
      reputationScore += (eventStats.criticalCount || 0) * 15;
      reputationScore += (eventStats.highCount || 0) * 10;
      reputationScore = Math.min(100, reputationScore);
    }
    if (bannedCheck) reputationScore = Math.max(reputationScore, 60);

    const threatLevel = reputationScore >= 70 ? "high" : reputationScore >= 40 ? "medium" : reputationScore >= 10 ? "low" : "clean";

    const result = {
      ip,
      reputationScore,
      threatLevel,
      isBanned: bannedCheck,
      eventStats: eventStats ? {
        eventCount: eventStats.eventCount ?? 0,
        criticalCount: eventStats.criticalCount ?? 0,
        highCount: eventStats.highCount ?? 0,
        firstSeen: eventStats.firstSeen ?? null,
        lastSeen: eventStats.lastSeen ?? null,
        eventTypes: eventStats.eventTypes ?? "",
        riskLevels: eventStats.riskLevels ?? "",
      } : null,
      relatedUsers: relatedUsers || [],
    };

    // 缓存 5 分钟
    try {
      await redis.setex(cacheKey, 300, JSON.stringify(result));
    } catch { /* 缓存写入失败不影响 */ }

    reply.status(200).send({
      code: 0,
      data: result,
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  威胁情报源配置
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/threat-intel/sources
  app.get("/api/v1/admin/threat-intel/sources", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const redis = getRedis();
    let sources: ThreatIntelSource[];

    try {
      const cached = await redis.get(INTEL_CACHE_KEY);
      if (cached) {
        sources = JSON.parse(cached);
      } else {
        sources = DEFAULT_INTEL_SOURCES;
        await redis.setex(INTEL_CACHE_KEY, INTEL_CACHE_TTL, JSON.stringify(sources));
      }
    } catch {
      sources = DEFAULT_INTEL_SOURCES;
    }

    reply.status(200).send({
      code: 0,
      data: { list: sources },
      message: "ok",
    });
  });

  // PUT /api/v1/admin/threat-intel/sources
  app.put("/api/v1/admin/threat-intel/sources", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const { sources } = request.body as { sources: ThreatIntelSource[] };

    if (!Array.isArray(sources)) {
      return reply.status(400).send({ code: 400, message: "无效数据" });
    }

    const redis = getRedis();
    await redis.setex(INTEL_CACHE_KEY, INTEL_CACHE_TTL, JSON.stringify(sources));

    const db = getDb();
    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "config_update" as any,
      targetType: "threat_intel",
      ip: request.ip,
      description: "更新威胁情报源配置",
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "威胁情报配置已更新",
    });
  });

  // ──────────────────────────────────────────────
  //  威胁事件 7 天趋势
  // ──────────────────────────────────────────────

  // GET /api/v1/admin/threat-intel/trend
  app.get("/api/v1/admin/threat-intel/trend", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (_request, reply) => {
    const db = getDb();

    const trend = await db
      .select({
        date: sql<string>`to_char(created_at, 'MM-DD')`,
        critical: sql<number>`count(*) FILTER (WHERE risk_level = 'critical')::int`,
        high: sql<number>`count(*) FILTER (WHERE risk_level = 'high')::int`,
        medium: sql<number>`count(*) FILTER (WHERE risk_level = 'medium')::int`,
        low: sql<number>`count(*) FILTER (WHERE risk_level = 'low')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(securityEvents)
      .where(gte(securityEvents.createdAt, sql`CURRENT_DATE - INTERVAL '6 days'`))
      .groupBy(sql`to_char(created_at, 'MM-DD')`)
      .orderBy(sql`to_char(created_at, 'MM-DD')`);

    reply.status(200).send({
      code: 0,
      data: { list: trend },
      message: "ok",
    });
  });
}
