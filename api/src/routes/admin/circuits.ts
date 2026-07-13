// ============================================================
//  3cloud (3C) — Admin 熔断器管理路由
//  GET  /api/v1/admin/circuit-breakers              — 熔断状态看板
//  POST /api/v1/admin/circuit-breakers/:id/reset    — 手动恢复熔断
//  GET  /api/v1/admin/circuit-breakers/history      — 熔断历史记录
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, sql, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { vendorModels, vendors, models, circuitHistory } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { getCircuitHistory, getCircuitDetail } from "../../services/circuit-breaker.js";
import { getCircuitConfig, updateCircuitConfig } from "../../services/circuit-breaker-config.js";

export async function adminCircuitRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/circuit-breakers — 熔断看板
  //  返回所有 vendor_model 的熔断状态
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/circuit-breakers", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as { state?: string; vendor_id?: string };

    const conditions: any[] = [];

    if (query.state) {
      conditions.push(eq(vendorModels.circuitState, query.state as any));
    }

    if (query.vendor_id) {
      conditions.push(eq(vendorModels.vendorId, parseInt(query.vendor_id, 10)));
    }

    const rows = await db
      .select({
        vendorModelId: vendorModels.id,
        vendorId: vendorModels.vendorId,
        vendorName: vendors.name,
        modelId: vendorModels.modelId,
        modelName: models.name,
        upstreamModelName: vendorModels.upstreamModelName,
        circuitState: vendorModels.circuitState,
        circuitOpenedAt: vendorModels.circuitOpenedAt,
        circuitRetryAfter: vendorModels.circuitRetryAfter,
        circuitFailCount: vendorModels.circuitFailCount,
        weight: vendorModels.weight,
        isDown: vendorModels.isDown,
        healthScore: vendorModels.healthScore,
        status: vendorModels.status,
      })
      .from(vendorModels)
      .innerJoin(vendors, eq(vendorModels.vendorId, vendors.id))
      .innerJoin(models, eq(vendorModels.modelId, models.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        sql`CASE ${vendorModels.circuitState}
          WHEN 'dead' THEN 0
          WHEN 'half_open' THEN 1
          WHEN 'closed' THEN 2
          ELSE 3
        END`,
        sql`${vendorModels.circuitFailCount} desc`
      );

    // 统计
    const stats = await db
      .select({
        state: vendorModels.circuitState,
        count: sql<number>`count(*)::int`,
      })
      .from(vendorModels)
      .groupBy(vendorModels.circuitState);

    const stateCount: Record<string, number> = {};
    for (const s of stats) {
      stateCount[s.state] = s.count;
    }

    reply.send({
      code: 0,
      data: {
        items: rows.map(r => ({
          ...r,
          circuitOpenedAt: r.circuitOpenedAt?.toISOString() ?? null,
          circuitRetryAfter: r.circuitRetryAfter?.toISOString() ?? null,
        })),
        summary: {
          total: rows.length,
          byState: stateCount,
        },
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/circuit-breakers/:id/reset — 手动恢复
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/circuit-breakers/:id/reset", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const vmId = parseInt(id, 10);

    if (!vmId) {
      return reply.status(400).send({ code: 1, message: "无效的 vendorModelId" });
    }

    try {
      const { resetCircuit } = await import("../../services/circuit-breaker.js");
      await resetCircuit(vmId);

      reply.send({
        code: 0,
        data: { vendorModelId: vmId },
        message: "熔断已手动恢复",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `恢复失败: ${err.message}`,
      });
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/circuit-breakers/history — 熔断历史
  //  Query: vendor_model_id, limit, offset
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/circuit-breakers/history", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const query = request.query as { vendor_model_id?: string; limit?: string; offset?: string };
    const db = getDb();

    const conditions: any[] = [];
    const vmId = query.vendor_model_id ? parseInt(query.vendor_model_id, 10) : undefined;
    const limit = Math.min(200, Math.max(1, parseInt(query.limit ?? "100", 10)));
    const offset = Math.max(0, parseInt(query.offset ?? "0", 10));

    try {
      const history = await getCircuitHistory(limit, offset, vmId);

      const [totalResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(circuitHistory)
        .where(vmId ? eq(circuitHistory.vendorModelId, vmId) : undefined);

      reply.send({
        code: 0,
        data: {
          items: history,
          total: totalResult?.count ?? 0,
          limit,
          offset,
        },
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `查询失败: ${err.message}`,
      });
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/circuit-breakers/:id — 熔断详情
  //  返回单个 vendor_model 的熔断状态 + Redis 实时计数器
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/circuit-breakers/:id", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const vmId = parseInt(id, 10);

    if (!vmId || isNaN(vmId)) {
      return reply.status(400).send({ code: 1, message: "无效的 vendorModelId" });
    }

    try {
      const detail = await getCircuitDetail(vmId);
      if (!detail) {
        return reply.status(404).send({ code: 1, message: "该通道不存在" });
      }

      // 获取覆盖配置
      const overrides = await getCircuitConfig(vmId);

      reply.send({
        code: 0,
        data: {
          ...detail,
          overrides,
        },
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `查询失败: ${err.message}`,
      });
    }
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/circuit-breakers/:id/config — 修改熔断配置
  //  Body: { openMs?, halfOpenMs?, level1Threshold?, level2Threshold?, level3ProbeLimit? }
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/circuit-breakers/:id/config", {
    preHandler: [requirePerm(Perm.SECURITY_ACTION)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const vmId = parseInt(id, 10);

    if (!vmId || isNaN(vmId)) {
      return reply.status(400).send({ code: 1, message: "无效的 vendorModelId" });
    }

    const body = request.body as any;
    if (!body || Object.keys(body).length === 0) {
      return reply.status(400).send({ code: 1, message: "请提供至少一个配置项" });
    }

    try {
      const result = await updateCircuitConfig(vmId, {
        openMs: body.openMs,
        halfOpenMs: body.halfOpenMs,
        level1Threshold: body.level1Threshold,
        level2Threshold: body.level2Threshold,
        level3ProbeLimit: body.level3ProbeLimit,
      });

      if (!result.success) {
        return reply.status(404).send({ code: 1, message: result.message });
      }

      reply.send({
        code: 0,
        data: { vendorModelId: vmId },
        message: result.message,
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `配置更新失败: ${err.message}`,
      });
    }
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/circuit-breakers/summary — 熔断汇总
  //  快速返回各状态计数和严重级别
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/circuit-breakers/summary", {
    preHandler: [requirePerm(Perm.DASHBOARD_VIEW)],
  }, async (request, reply) => {
    const db = getDb();

    const stats = await db
      .select({
        state: vendorModels.circuitState,
        count: sql<number>`count(*)::int`,
        totalFailCount: sql<number>`coalesce(sum(${vendorModels.circuitFailCount}), 0)::int`,
      })
      .from(vendorModels)
      .groupBy(vendorModels.circuitState);

    const stateMap = new Map(stats.map(s => [s.state, s]));

    reply.send({
      code: 0,
      data: {
        byState: {
          closed: stateMap.get("closed") ?? { state: "closed", count: 0, totalFailCount: 0 },
          half_open: stateMap.get("half_open") ?? { state: "half_open", count: 0, totalFailCount: 0 },
          dead: stateMap.get("dead") ?? { state: "dead", count: 0, totalFailCount: 0 },
        },
        criticalCount: (stateMap.get("dead")?.count ?? 0) + (stateMap.get("half_open")?.count ?? 0),
      },
      message: "ok",
    });
  });
}
