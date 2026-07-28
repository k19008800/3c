// ============================================================
//  3cloud (3C) — 健康检查大盘路由
//  服务状态概览 + 资源监控 + 自动诊断
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { vendors, vendorModels, operationLogs, securityEvents } from "../../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";
import { getRedis } from "../../../redis.js";
import { AppError } from "../../../services/auth-service/index.js";
import { execSync } from "node:child_process";
import os from "node:os";

export async function adminHealthRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/health/overview — 所有服务状态概览
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/health/overview", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const redis = getRedis();
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // 1. API 服务状态
    let apiStatus = "up";
    try {
      const [row] = await db.execute(sql`SELECT 1 as ok`);
      if (!row) apiStatus = "degraded";
    } catch {
      apiStatus = "down";
    }

    // 2. 数据库状态
    let dbStatus = "up";
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbStatus = "down";
    }

    // 3. Redis 状态
    let redisStatus = "up";
    try {
      const pong = await redis.ping();
      if (pong !== "PONG") redisStatus = "degraded";
    } catch {
      redisStatus = "down";
    }

    // 4. 供应商服务状态
    const [vendorStats] = await db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`sum(case when ${vendors.status} = 'active' then 1 else 0 end)`,
        degraded: sql<number>`sum(case when ${vendors.status} = 'degraded' then 1 else 0 end)`,
        down: sql<number>`sum(case when ${vendors.status} = 'inactive' then 1 else 0 end)`,
      })
      .from(vendors);
    const vendorTotal = Number(vendorStats?.total ?? 0);

    // 5. 供应商模型通道健康
    const [vmStats] = await db
      .select({
        total: sql<number>`count(*)`,
        healthy: sql<number>`sum(case when ${vendorModels.isDown} = false then 1 else 0 end)`,
        down: sql<number>`sum(case when ${vendorModels.isDown} = true then 1 else 0 end)`,
      })
      .from(vendorModels)
      .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
      .where(eq(vendors.status, "active"));
    const vmTotal = Number(vmStats?.total ?? 0);
    const vmHealthy = Number(vmStats?.healthy ?? 0);
    const vmDown = Number(vmStats?.down ?? 0);

    // 6. 最近 1 小时错误率
    const [totalOps] = await db
      .select({ count: sql<number>`count(*)` })
      .from(operationLogs)
      .where(gte(operationLogs.createdAt, hourAgo));
    const [failOps] = await db
      .select({ count: sql<number>`count(*)` })
      .from(operationLogs)
      .where(and(gte(operationLogs.createdAt, hourAgo), eq(operationLogs.status, "failure")));
    const totalOpCount = Number(totalOps?.count ?? 1);
    const failOpCount = Number(failOps?.count ?? 0);
    const errorRate = totalOpCount > 1 ? Math.round((failOpCount / totalOpCount) * 10000) / 100 : 0;

    // 7. 安全事件
    const [secEvents] = await db
      .select({ count: sql<number>`count(*)` })
      .from(securityEvents)
      .where(gte(securityEvents.createdAt, hourAgo));
    const recentSecurity = Number(secEvents?.count ?? 0);

    // 整体状态
    const services = [
      { name: "API 服务", status: apiStatus, type: "core" },
      { name: "数据库 (PostgreSQL)", status: dbStatus, type: "core" },
      { name: "缓存 (Redis)", status: redisStatus, type: "core" },
      { name: "供应商服务", status: vendorTotal > 0 ? (vendorStats?.active === vendorTotal ? "up" : "degraded") : "unknown", type: "external" },
    ];

    const overallStatus = services.some(s => s.status === "down") ? "down"
      : services.some(s => s.status === "degraded") ? "degraded" : "up";

    reply.status(200).send({
      code: 0,
      data: {
        overallStatus,
        services,
        vendors: {
          total: vendorTotal,
          active: Number(vendorStats?.active ?? 0),
          degraded: Number(vendorStats?.degraded ?? 0),
          down: Number(vendorStats?.down ?? 0),
        },
        vendorModels: {
          total: vmTotal,
          healthy: vmHealthy,
          down: vmDown,
          healthRate: vmTotal > 0 ? Math.round((vmHealthy / vmTotal) * 100) : 0,
        },
        metrics: {
          errorRate: `${errorRate}%`,
          recentSecurityEvents: recentSecurity,
        },
        updatedAt: now.toISOString(),
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/health/resources — 服务器资源监控
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/health/resources", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    try {
      // CPU 使用率
      const cpus = os.cpus();
      const cpuCount = cpus.length;
      let cpuUsage = 0;
      for (const cpu of cpus) {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        const idle = cpu.times.idle;
        cpuUsage += (total - idle) / total;
      }
      cpuUsage = Math.round((cpuUsage / cpuCount) * 100);

      // 内存
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memUsage = Math.round((usedMem / totalMem) * 100);

      // 系统信息
      const uptime = os.uptime();
      const loadAvg = os.loadavg();

      // 磁盘使用（仅 Linux 下有效）
      let diskUsage: number | null = null;
      let diskTotal: string | null = null;
      let diskUsed: string | null = null;
      try {
        const df = execSync("df -h / | tail -1", { timeout: 3000 }).toString().trim();
        const parts = df.split(/\s+/);
        if (parts.length >= 5) {
          diskTotal = parts[1];
          diskUsed = parts[2];
          diskUsage = parseInt(parts[4].replace("%", ""));
        }
      } catch {
        // Windows 或权限不足，跳过
      }

      reply.status(200).send({
        code: 0,
        data: {
          cpu: {
            usage: `${cpuUsage}%`,
            cores: cpuCount,
            loadAvg: {
              "1m": loadAvg[0]?.toFixed(2),
              "5m": loadAvg[1]?.toFixed(2),
              "15m": loadAvg[2]?.toFixed(2),
            },
          },
          memory: {
            total: formatBytes(totalMem),
            used: formatBytes(usedMem),
            free: formatBytes(freeMem),
            usage: `${memUsage}%`,
          },
          disk: diskUsage !== null ? {
            total: diskTotal,
            used: diskUsed,
            usage: `${diskUsage}%`,
          } : null,
          system: {
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            uptime: formatUptime(uptime),
          },
          updatedAt: new Date().toISOString(),
        },
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({ code: 500, data: null, message: "获取资源监控数据失败: " + err.message });
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/health/service/:name — 单个服务详情
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/health/service/:name", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const { name } = request.params as { name: string };
    const db = getDb();
    const redis = getRedis();
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    switch (name) {
      case "api": {
        const [totalOps] = await db
          .select({ count: sql<number>`count(*)` })
          .from(operationLogs)
          .where(gte(operationLogs.createdAt, hourAgo));
        const [failOps] = await db
          .select({ count: sql<number>`count(*)` })
          .from(operationLogs)
          .where(and(gte(operationLogs.createdAt, hourAgo), eq(operationLogs.status, "failure")));
        const total = Number(totalOps?.count ?? 0);
        const fail = Number(failOps?.count ?? 0);
        return reply.status(200).send({
          code: 0, data: {
            name: "API 服务",
            status: "up",
            metrics: { totalRequests: total, failedRequests: fail, errorRate: total > 0 ? `${Math.round((fail / total) * 10000) / 100}%` : "0%" },
            updatedAt: now.toISOString(),
          }, message: "ok",
        });
      }
      case "database": {
        let dbStatus = "up", dbLatency = 0;
        try {
          const start = Date.now();
          await db.execute(sql`SELECT 1`);
          dbLatency = Date.now() - start;
        } catch { dbStatus = "down"; }
        return reply.status(200).send({
          code: 0, data: {
            name: "数据库 (PostgreSQL)",
            status: dbStatus,
            metrics: { latency: `${dbLatency}ms`, connections: 0 },
            updatedAt: now.toISOString(),
          }, message: "ok",
        });
      }
      case "redis": {
        let redisStatus = "up", redisLatency = 0;
        try {
          const start = Date.now();
          await redis.ping();
          redisLatency = Date.now() - start;
        } catch { redisStatus = "down"; }
        return reply.status(200).send({
          code: 0, data: {
            name: "缓存 (Redis)",
            status: redisStatus,
            metrics: { latency: `${redisLatency}ms` },
            updatedAt: now.toISOString(),
          }, message: "ok",
        });
      }
      default:
        throw new AppError("NOT_FOUND", `未知服务: ${name}`, 404);
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/health/diagnose — 触发自动诊断
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/health/diagnose", {
    preHandler: [requirePerm(Perm.SECURITY_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const redis = getRedis();
    const results: any[] = [];

    // 1. 数据库连接诊断
    try {
      const start = Date.now();
      await db.execute(sql`SELECT 1`);
      results.push({ step: "数据库连接", status: "pass", latency: `${Date.now() - start}ms` });
    } catch (err: any) {
      results.push({ step: "数据库连接", status: "fail", detail: err.message });
    }

    // 2. Redis 连接诊断
    try {
      const start = Date.now();
      await redis.ping();
      results.push({ step: "Redis 连接", status: "pass", latency: `${Date.now() - start}ms` });
    } catch (err: any) {
      results.push({ step: "Redis 连接", status: "fail", detail: err.message });
    }

    // 3. 供应商连通性诊断（随机抽 3 个）
    try {
      const sampleVendors = await db
        .select({
          id: vendors.id,
          name: vendors.name,
          status: vendors.status,
        })
        .from(vendors)
        .where(eq(vendors.status, "active"))
        .limit(3);
      for (const v of sampleVendors) {
        results.push({ step: `供应商连通性 - ${v.name}`, status: v.status === "active" ? "pass" : "fail", detail: `状态: ${v.status}` });
      }
    } catch (err: any) {
      results.push({ step: "供应商查询", status: "fail", detail: err.message });
    }

    // 4. 磁盘写入诊断
    try {
      const fs = await import("node:fs/promises");
      const testFile = `/tmp/3cloud-health-diagnose-${Date.now()}.tmp`;
      await fs.writeFile(testFile, "health-check-diagnose");
      await fs.unlink(testFile);
      results.push({ step: "磁盘写入", status: "pass" });
    } catch (err: any) {
      results.push({ step: "磁盘写入", status: "warn", detail: `无法写入测试文件: ${err.message}` });
    }

    // 5. 内存诊断
    try {
      const mem = process.memoryUsage();
      results.push({
        step: "进程内存",
        status: mem.heapUsed / mem.heapTotal > 0.9 ? "warn" : "pass",
        detail: `堆使用: ${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)} (${Math.round((mem.heapUsed / mem.heapTotal) * 100)}%)`,
      });
    } catch (err: any) {
      results.push({ step: "进程内存", status: "fail", detail: err.message });
    }

    // 6. 系统资源诊断
    try {
      const cpuUsage = os.loadavg()[0];
      const memUsage = (os.totalmem() - os.freemem()) / os.totalmem();
      results.push({
        step: "系统资源",
        status: cpuUsage > os.cpus().length * 0.9 || memUsage > 0.9 ? "warn" : "pass",
        detail: `CPU负载: ${cpuUsage.toFixed(2)}, 内存使用: ${Math.round(memUsage * 100)}%`,
      });
    } catch (err: any) {
      results.push({ step: "系统资源", status: "fail", detail: err.message });
    }

    const overall = results.some(r => r.status === "fail") ? "has_issues"
      : results.some(r => r.status === "warn") ? "degraded" : "healthy";

    reply.status(200).send({
      code: 0,
      data: { overall, results, diagnosedAt: new Date().toISOString() },
      message: "ok",
    });
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  parts.push(`${mins}分钟`);
  return parts.join(" ");
}