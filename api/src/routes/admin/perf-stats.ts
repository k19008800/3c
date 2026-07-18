// ============================================================
//  3cloud (3C) — 性能缓存统计
//  GET /api/v1/admin/perf-cache-stats
//  返回各性能优化 LRU 缓存的状态及命中情况
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

export async function adminPerfCacheStatsRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/perf-cache-stats", {
    preHandler: [authenticateJWT, requirePerm(Perm.CONFIG_VIEW)],
  }, async (_request, reply) => {
    const now = Date.now();
    const results: Record<string, any> = {};

    // Process memory (always available)
    const mem = process.memoryUsage();
    results.process = {
      rss: `${Math.round(mem.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(mem.external / 1024 / 1024)} MB`,
    };

    results.uptime = {
      seconds: Math.round(process.uptime()),
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    };

    // Try to get cache stats from each module (graceful fallback)
    const modules = [
      { name: "billing", importPath: "../../services/billing/index.js", fn: "getBillingCacheStats" },
      { name: "router_modelNameCache", importPath: "../../services/router.js", fn: "getModelNameCacheStats" },
      { name: "proxy", importPath: "../../routes/proxy.js", fn: "getProxyCacheStats" },
      { name: "rateLimit", importPath: "../../middleware/rate-limit.js", fn: "getRateLimitCacheStats" },
      { name: "circuitBreaker", importPath: "../../services/circuit-breaker.js", fn: "getCircuitBreakerCacheStats" },
      { name: "healthCheck", importPath: "../../services/health-check.js", fn: "getHealthCheckCacheStats" },
      { name: "dashboardStats", importPath: "../../services/dashboards/stats.js", fn: "getDashboardCacheStats" },
    ];

    for (const mod of modules) {
      try {
        const imported = await import(mod.importPath) as any;
        if (typeof imported[mod.fn] === "function") {
          const stats = await imported[mod.fn]();
          results[mod.name] = stats;
        } else {
          results[mod.name] = { status: "not_available", note: `${mod.fn} not exported` };
        }
      } catch (err: any) {
        results[mod.name] = { status: "not_available", note: err.message };
      }
    }

    const elapsed = Date.now() - now;
    reply.send({
      code: 0,
      data: results,
      message: `ok (${elapsed}ms)`,
    });
  });
}
