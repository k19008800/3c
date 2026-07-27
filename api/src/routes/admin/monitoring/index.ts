// ============================================================
//  3cloud (3C) — 实时监控告警路由
//  GET /api/v1/admin/monitoring/health   — 系统健康检查
//  GET /api/v1/admin/monitoring/metrics  — 实时指标
//  GET /api/v1/admin/monitoring/alerts   — 告警列表
//  POST /api/v1/admin/monitoring/rules   — 配置告警规则
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";
import { getDb } from "../../../db/index.js";
import { getRedis } from "../../../redis.js";
import { sql } from "drizzle-orm";
import { monitoringAlerts, monitoringRules } from "../../../db/schema.js";

// ──────────────────────────────────────────────
//  监控指标类型定义
// ──────────────────────────────────────────────

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  checks: {
    database: { status: boolean; latency?: number; message?: string };
    redis: { status: boolean; latency?: number; message?: string };
    disk: { status: boolean; usedPercent?: number; message?: string };
    memory: { status: boolean; usedPercent?: number; message?: string };
  };
}

interface MetricPoint {
  timestamp: string;
  value: number;
}

interface SystemMetrics {
  api: {
    p50: number;
    p95: number;
    p99: number;
    avgResponseTime: number;
    requestsPerMinute: number;
    errorRate: number;
  };
  database: {
    activeConnections: number;
    idleConnections: number;
    waitingCount: number;
    queryTime: number;
  };
  redis: {
    connectedClients: number;
    usedMemory: number;
    usedMemoryPeak: number;
    hitRate: number;
  };
  system: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    uptime: number;
  };
}

interface Alert {
  id: string;
  type: "api" | "database" | "redis" | "disk" | "memory" | "error_rate";
  severity: "critical" | "warning" | "info";
  message: string;
  value: number;
  threshold: number;
  timestamp: string;
  acknowledged: boolean;
}

// ──────────────────────────────────────────────
//  指标收集器（内存缓存）
// ──────────────────────────────────────────────

class MetricsCollector {
  private responseTimes: Array<{ time: number; timestamp: number }> = [];
  private errorCounts: Array<{ timestamp: number }> = [];
  private lastCleanup = Date.now();

  // 记录响应时间
  recordResponseTime(time: number) {
    this.responseTimes.push({ time, timestamp: Date.now() });
    this.cleanup();
  }

  // 记录错误
  recordError() {
    this.errorCounts.push({ timestamp: Date.now() });
    this.cleanup();
  }

  // 清理过期数据（保留最近 5 分钟）
  private cleanup() {
    const now = Date.now();
    if (now - this.lastCleanup < 60000) return; // 每分钟清理一次

    const cutoff = now - 5 * 60 * 1000;
    this.responseTimes = this.responseTimes.filter(r => r.timestamp > cutoff);
    this.errorCounts = this.errorCounts.filter(e => e.timestamp > cutoff);
    this.lastCleanup = now;
  }

  // 计算百分位响应时间
  getPercentiles() {
    const times = this.responseTimes.map(r => r.time).sort((a, b) => a - b);
    if (times.length === 0) {
      return { p50: 0, p95: 0, p99: 0, avg: 0 };
    }

    const percentile = (p: number) => {
      const idx = Math.ceil(times.length * p) - 1;
      return times[Math.max(0, idx)];
    };

    const avg = times.reduce((a, b) => a + b, 0) / times.length;

    return {
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      avg,
    };
  }

  // 获取每分钟请求数
  getRequestsPerMinute() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    return this.responseTimes.filter(r => r.timestamp > oneMinuteAgo).length;
  }

  // 获取错误率
  getErrorRate() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentRequests = this.responseTimes.filter(r => r.timestamp > oneMinuteAgo).length;
    const recentErrors = this.errorCounts.filter(e => e.timestamp > oneMinuteAgo).length;

    if (recentRequests === 0) return 0;
    return (recentErrors / recentRequests) * 100;
  }
}

const metricsCollector = new MetricsCollector();

// ──────────────────────────────────────────────
//  告警检查器
// ──────────────────────────────────────────────

async function checkAlerts(
  metrics: SystemMetrics,
  rules: Array<{ type: string; threshold: number; severity: string }>
): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const now = new Date().toISOString();

  for (const rule of rules) {
    let value = 0;
    let message = "";

    switch (rule.type) {
      case "api":
        value = metrics.api.p95;
        message = `API P95 响应时间 ${value.toFixed(0)}ms 超过阈值 ${rule.threshold}ms`;
        break;
      case "database":
        value = metrics.database.queryTime;
        message = `数据库查询时间 ${value.toFixed(0)}ms 超过阈值 ${rule.threshold}ms`;
        break;
      case "redis":
        value = metrics.redis.usedMemory / 1024 / 1024; // MB
        message = `Redis 内存使用 ${value.toFixed(0)}MB 超过阈值 ${rule.threshold}MB`;
        break;
      case "disk":
        value = metrics.system.diskUsage;
        message = `磁盘使用率 ${value.toFixed(1)}% 超过阈值 ${rule.threshold}%`;
        break;
      case "memory":
        value = metrics.system.memoryUsage;
        message = `内存使用率 ${value.toFixed(1)}% 超过阈值 ${rule.threshold}%`;
        break;
      case "error_rate":
        value = metrics.api.errorRate;
        message = `错误率 ${value.toFixed(2)}% 超过阈值 ${rule.threshold}%`;
        break;
    }

    if (value > rule.threshold) {
      alerts.push({
        id: `${rule.type}-${Date.now()}`,
        type: rule.type as Alert["type"],
        severity: rule.severity as Alert["severity"],
        message,
        value,
        threshold: rule.threshold,
        timestamp: now,
        acknowledged: false,
      });
    }
  }

  return alerts;
}

// ──────────────────────────────────────────────
//  路由实现
// ──────────────────────────────────────────────

export async function adminMonitoringRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);
  app.addHook("preHandler", requirePerm(Perm.OPS_READ));

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/monitoring/health — 系统健康检查
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/monitoring/health", async (request, reply) => {
    const health: HealthStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        database: { status: false },
        redis: { status: false },
        disk: { status: false },
        memory: { status: false },
      },
    };

    // 检查数据库
    try {
      const db = getDb();
      const start = Date.now();
      await db.execute(sql`SELECT 1`);
      const latency = Date.now() - start;
      health.checks.database = { status: true, latency };
    } catch (err: any) {
      health.checks.database = { status: false, message: err.message };
      health.status = "unhealthy";
    }

    // 检查 Redis
    try {
      const redis = getRedis();
      const start = Date.now();
      await redis.ping();
      const latency = Date.now() - start;
      health.checks.redis = { status: true, latency };
    } catch (err: any) {
      health.checks.redis = { status: false, message: err.message };
      health.status = "degraded";
    }

    // 检查磁盘（简化版，仅检查进程内存）
    const memUsage = process.memoryUsage();
    const usedMemMB = memUsage.heapUsed / 1024 / 1024;
    const totalMemMB = memUsage.heapTotal / 1024 / 1024;
    const memPercent = (usedMemMB / totalMemMB) * 100;
    health.checks.memory = {
      status: memPercent < 90,
      usedPercent: memPercent,
    };
    if (memPercent >= 90) health.status = "degraded";

    // 磁盘检查（简化，假设总是健康）
    health.checks.disk = { status: true, usedPercent: 0 };

    reply.send({
      code: 0,
      data: health,
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/monitoring/metrics — 实时指标
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/monitoring/metrics", async (request, reply) => {
    try {
      const db = getDb();
      const redis = getRedis();

      // API 指标
      const percentiles = metricsCollector.getPercentiles();
      const apiMetrics = {
        p50: percentiles.p50,
        p95: percentiles.p95,
        p99: percentiles.p99,
        avgResponseTime: percentiles.avg,
        requestsPerMinute: metricsCollector.getRequestsPerMinute(),
        errorRate: metricsCollector.getErrorRate(),
      };

      // 数据库指标
      let dbMetrics = {
        activeConnections: 0,
        idleConnections: 0,
        waitingCount: 0,
        queryTime: 0,
      };
      try {
        const start = Date.now();
        const poolStats = await db.execute(sql`
          SELECT 
            count(*) FILTER (WHERE state = 'active') as active,
            count(*) FILTER (WHERE state = 'idle') as idle,
            count(*) FILTER (WHERE wait_event_type IS NOT NULL) as waiting
          FROM pg_stat_activity
          WHERE datname = current_database()
        `);
        const queryTime = Date.now() - start;

        if (poolStats.rows && poolStats.rows.length > 0) {
          dbMetrics = {
            activeConnections: Number(poolStats.rows[0].active) || 0,
            idleConnections: Number(poolStats.rows[0].idle) || 0,
            waitingCount: Number(poolStats.rows[0].waiting) || 0,
            queryTime,
          };
        }
      } catch (err) {
        // 忽略数据库指标错误
      }

      // Redis 指标
      let redisMetrics = {
        connectedClients: 0,
        usedMemory: 0,
        usedMemoryPeak: 0,
        hitRate: 0,
      };
      try {
        const info = await redis.info("memory clients stats");
        const lines = info.split("\r\n");
        let keyspaceHits = 0;
        let keyspaceMisses = 0;

        for (const line of lines) {
          if (line.startsWith("used_memory:")) {
            redisMetrics.usedMemory = parseInt(line.split(":")[1], 10);
          } else if (line.startsWith("used_memory_peak:")) {
            redisMetrics.usedMemoryPeak = parseInt(line.split(":")[1], 10);
          } else if (line.startsWith("connected_clients:")) {
            redisMetrics.connectedClients = parseInt(line.split(":")[1], 10);
          } else if (line.startsWith("keyspace_hits:")) {
            keyspaceHits = parseInt(line.split(":")[1], 10);
          } else if (line.startsWith("keyspace_misses:")) {
            keyspaceMisses = parseInt(line.split(":")[1], 10);
          }
        }

        const total = keyspaceHits + keyspaceMisses;
        redisMetrics.hitRate = total > 0 ? (keyspaceHits / total) * 100 : 0;
      } catch (err) {
        // 忽略 Redis 指标错误
      }

      // 系统指标
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      const systemMetrics = {
        cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // 转换为秒
        memoryUsage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
        diskUsage: 0, // 简化，需要额外实现
        uptime: process.uptime(),
      };

      const metrics: SystemMetrics = {
        api: apiMetrics,
        database: dbMetrics,
        redis: redisMetrics,
        system: systemMetrics,
      };

      reply.send({
        code: 0,
        data: metrics,
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `获取监控指标失败: ${err.message}`,
      });
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/monitoring/alerts — 告警列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/monitoring/alerts", async (request, reply) => {
    try {
      const db = getDb();
      const query = request.query as {
        limit?: string;
        offset?: string;
        severity?: string;
        acknowledged?: string;
      };

      const limit = parseInt(query.limit || "50", 10);
      const offset = parseInt(query.offset || "0", 10);

      // 从数据库获取告警记录
      const alerts = await db.execute(sql`
        SELECT 
          id, type, severity, message, value, threshold, 
          timestamp, acknowledged, created_at
        FROM monitoring_alerts
        WHERE 1=1
          ${query.severity ? sql`AND severity = ${query.severity}` : sql``}
          ${query.acknowledged !== undefined ? sql`AND acknowledged = ${query.acknowledged === 'true'}` : sql``}
        ORDER BY timestamp DESC
        LIMIT ${limit} OFFSET ${offset}
      `);

      const total = await db.execute(sql`
        SELECT count(*) as count FROM monitoring_alerts
        WHERE 1=1
          ${query.severity ? sql`AND severity = ${query.severity}` : sql``}
          ${query.acknowledged !== undefined ? sql`AND acknowledged = ${query.acknowledged === 'true'}` : sql``}
      `);

      reply.send({
        code: 0,
        data: {
          alerts: alerts.rows || [],
          total: Number(total.rows?.[0]?.count || 0),
          limit,
          offset,
        },
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `获取告警列表失败: ${err.message}`,
      });
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/monitoring/rules — 配置告警规则
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/monitoring/rules", async (request, reply) => {
    try {
      const db = getDb();
      const body = request.body as {
        type: string;
        name?: string;
        threshold: number;
        severity: "critical" | "warning" | "info";
        enabled?: boolean;
        duration?: number;
        silencePeriod?: number;
      };

      // 验证
      const validTypes = ["api", "database", "redis", "disk", "memory", "error_rate", "api_error_rate", "vendor_availability", "api_response_time", "platform_balance", "user_failure_rate", "cpu_usage"];
      if (!validTypes.includes(body.type)) {
        reply.status(400).send({
          code: 1,
          message: `无效的告警类型: ${body.type}`,
        });
        return;
      }

      const validSeverities = ["critical", "warning", "info"];
      if (!validSeverities.includes(body.severity)) {
        reply.status(400).send({
          code: 1,
          message: `无效的告警级别: ${body.severity}`,
        });
        return;
      }

      // 插入或更新规则
      const result = await db.execute(sql`
        INSERT INTO monitoring_rules (type, name, threshold, severity, enabled, duration, silence_period, created_at, updated_at)
        VALUES (${body.type}, ${body.name ?? body.type}, ${body.threshold}, ${body.severity}, ${body.enabled ?? true}, ${body.duration ?? 60}, ${body.silencePeriod ?? 300}, NOW(), NOW())
        ON CONFLICT (type) 
        DO UPDATE SET 
          name = ${body.name ?? body.type},
          threshold = ${body.threshold},
          severity = ${body.severity},
          enabled = ${body.enabled ?? true},
          duration = ${body.duration ?? 60},
          silence_period = ${body.silencePeriod ?? 300},
          updated_at = NOW()
        RETURNING *
      `);

      reply.send({
        code: 0,
        data: result.rows?.[0] || null,
        message: "告警规则已保存",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `保存告警规则失败: ${err.message}`,
      });
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/monitoring/rules — 获取告警规则
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/monitoring/rules", async (request, reply) => {
    try {
      const db = getDb();
      const rules = await db.execute(sql`
        SELECT id, type, name, description, threshold, severity, enabled, duration, silence_period, created_at, updated_at
        FROM monitoring_rules
        ORDER BY severity DESC, type ASC
      `);

      reply.send({
        code: 0,
        data: rules.rows || [],
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `获取告警规则失败: ${err.message}`,
      });
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/monitoring/alerts/:id/acknowledge — 确认告警
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/monitoring/alerts/:id/acknowledge", async (request, reply) => {
    try {
      const db = getDb();
      const alertId = (request.params as { id: string }).id;

      const result = await db.execute(sql`
        UPDATE monitoring_alerts
        SET acknowledged = true, acknowledged_at = NOW()
        WHERE id = ${alertId}
        RETURNING *
      `);

      if (!result.rows || result.rows.length === 0) {
        reply.status(404).send({
          code: 1,
          message: "告警不存在",
        });
        return;
      }

      reply.send({
        code: 0,
        data: result.rows[0],
        message: "告警已确认",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `确认告警失败: ${err.message}`,
      });
    }
  });
}

// 导出指标收集器供其他模块使用
export { metricsCollector };
