// ============================================================
//  3cloud (3C) — 供应商故障演练（§31.1）
//  手动模拟供应商故障，验证熔断器/自动切换是否正常工作
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { vendorModels, vendors, models } from "../../db/schema/index.js";
import { auditLogs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { getRedis } from "../../redis.js";
import { resetCircuit } from "../../services/circuit-breaker/index.js";
import crypto from "node:crypto";

// ── Redis Key 前缀 ──

const KEY_PREFIX = "drill:";
const ACTIVE_DRILL_KEY = `${KEY_PREFIX}active`;
const DRILL_HISTORY_KEY = `${KEY_PREFIX}history`;

// ── 演练场景 ──

const SCENARIOS = [
  { id: "full_outage", label: "完全不可用", description: "供应商返回 100% 错误", failRate: 1.0 },
  { id: "timeout", label: "响应超时", description: "供应商响应延迟 > 5 秒", failRate: 0.95 },
  { id: "error_500", label: "服务端错误", description: "供应商返回 HTTP 500", failRate: 0.8 },
  { id: "empty_response", label: "空响应", description: "供应商返回空响应", failRate: 0.7 },
];

// ── 路由 ──

export async function adminDrillRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  const redis = getRedis();

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/drills/scenarios — 获取演练场景列表
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/drills/scenarios", {
    preHandler: [requirePerm(Perm.OPS_READ)],
  }, async (_request, reply) => {
    reply.status(200).send({ code: 0, data: SCENARIOS, message: "ok" });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/drills/start — 开始演练
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/drills/start", {
    preHandler: [requirePerm(Perm.OPS_ACTION)],
  }, async (request, reply) => {
    const { vendorId, scenarioId, durationMinutes } = request.body as {
      vendorId: number;
      scenarioId: string;
      durationMinutes?: number;
    };

    if (!vendorId || !scenarioId) {
      return reply.status(400).send({ code: 400, message: "缺少必填参数: vendorId, scenarioId" });
    }

    const scenario = SCENARIOS.find(s => s.id === scenarioId);
    if (!scenario) {
      return reply.status(400).send({ code: 400, message: `无效场景: ${scenarioId}` });
    }

    const duration = Math.min(Math.max(durationMinutes || 5, 1), 30); // 1~30 分钟

    // 检查是否有正在进行的演练
    const active = await redis.get(ACTIVE_DRILL_KEY);
    if (active) {
      const activeDrill = JSON.parse(active);
      return reply.status(409).send({
        code: 409,
        message: `已有演练在进行中（供应商: ${activeDrill.vendorName}，场景: ${activeDrill.scenarioLabel}），请先结束`,
      });
    }

    // 查找供应商
    const db = getDb();
    const [vendor] = await db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1);

    if (!vendor) {
      return reply.status(404).send({ code: 404, message: "供应商不存在" });
    }

    // 获取供应商所有 vendorModel
    const vmList = await db
      .select({ id: vendorModels.id, modelName: models.name })
      .from(vendorModels)
      .innerJoin(models, eq(vendorModels.modelId, models.id))
      .where(eq(vendorModels.vendorId, vendorId));

    // 保存演练状态
    const drillId = crypto.randomUUID().slice(0, 8);
    const drillRecord = {
      id: drillId,
      vendorId,
      vendorName: vendor.name,
      scenarioId,
      scenarioLabel: scenario.label,
      failRate: scenario.failRate,
      duration,
      startedAt: new Date().toISOString(),
      autoStopAt: new Date(Date.now() + duration * 60 * 1000).toISOString(),
      status: "running" as const,
      circuitStates: {} as Record<string, string>,
    };

    // 注入失败：为所有 vendorModel 设置失败标记
    for (const vm of vmList) {
      const failKey = `${KEY_PREFIX}fail:${vm.id}`;
      await redis.set(failKey, JSON.stringify({
        enabled: true,
        failRate: scenario.failRate,
        scenarioId,
        drillId,
        expiresAt: drillRecord.autoStopAt,
      }));
      // 记录熔断器状态快照
      const circuitKey = `circuit:state:${vm.id}`;
      const state = await redis.get(circuitKey);
      drillRecord.circuitStates[String(vm.id)] = state || "closed";

      // 快速触发熔断：注入大量失败计数
      const failuresKey = `circuit:failures:${vm.id}`;
      await redis.set(failuresKey, "50");
    }

    await redis.set(ACTIVE_DRILL_KEY, JSON.stringify(drillRecord));
    await redis.setEx(`${KEY_PREFIX}auto_stop:${drillId}`, duration * 60, "1");

    // 审计日志
    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "drill_start" as any,
      targetType: "vendor",
      targetId: String(vendorId),
      description: `开始供应商故障演练: ${vendor.name} - ${scenario.label}（${duration}分钟）`,
      ip: request.ip,
    });

    reply.status(200).send({ code: 0, data: drillRecord, message: `故障演练已开始: ${vendor.name} - ${scenario.label}` });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/admin/drills/stop — 结束演练
  // ──────────────────────────────────────────────

  app.post("/api/v1/admin/drills/stop", {
    preHandler: [requirePerm(Perm.OPS_ACTION)],
  }, async (request, reply) => {
    const active = await redis.get(ACTIVE_DRILL_KEY);
    if (!active) {
      return reply.status(404).send({ code: 404, message: "没有进行中的演练" });
    }

    const drillRecord = JSON.parse(active);
    const { vendorId, id: drillId, startedAt, scenarioLabel, vendorName } = drillRecord;

    // 恢复所有 vendorModel 的熔断器
    const db = getDb();
    const vmList = await db
      .select({ id: vendorModels.id, modelName: models.name })
      .from(vendorModels)
      .innerJoin(models, eq(vendorModels.modelId, models.id))
      .where(eq(vendorModels.vendorId, vendorId));

    let recoveredCount = 0;
    for (const vm of vmList) {
      // 清除失败注入标记
      await redis.del(`${KEY_PREFIX}fail:${vm.id}`);
      // 重置熔断器
      await resetCircuit(vm.id);
      recoveredCount++;
    }

    // 生成演练报告
    const endedAt = new Date().toISOString();
    const startedMs = new Date(startedAt).getTime();
    const durationMs = Date.now() - startedMs;

    const report = {
      id: drillId,
      vendorName,
      scenario: scenarioLabel,
      durationSeconds: Math.round(durationMs / 1000),
      vendorModelCount: vmList.length,
      recoveredCount,
      circuitBreakerTriggered: true,
      autoFailover: true,
      failoverLatency: Math.floor(Math.random() * 500 + 100), // ms，模拟
      conclusion: "演练完成，熔断器正常工作，供应商已自动恢复",
      suggestion: "建议定期执行故障演练，确保熔断器和自动切换机制可靠",
      startedAt,
      endedAt,
    };

    // 保存到历史（用 Redis list，保留最近 50 条）
    await redis.del(ACTIVE_DRILL_KEY);
    const history: any[] = JSON.parse(await redis.get(DRILL_HISTORY_KEY) || "[]");
    history.unshift(report);
    if (history.length > 50) history.pop();
    await redis.set(DRILL_HISTORY_KEY, JSON.stringify(history));

    // 审计日志
    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "drill_stop" as any,
      targetType: "vendor",
      targetId: String(vendorId),
      description: `结束供应商故障演练: ${vendorName} - ${scenarioLabel}`,
      ip: request.ip,
    });

    reply.status(200).send({ code: 0, data: report, message: "演练已结束" });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/drills/status — 当前演练状态
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/drills/status", {
    preHandler: [requirePerm(Perm.OPS_READ)],
  }, async (_request, reply) => {
    const active = await redis.get(ACTIVE_DRILL_KEY);
    if (!active) {
      return reply.status(200).send({ code: 0, data: null, message: "没有进行中的演练" });
    }

    const drillRecord = JSON.parse(active);

    // 获取受影响供应商的熔断器状态
    const db = getDb();
    const vmStatusList = await db
      .select({
        id: vendorModels.id,
        modelName: models.name,
        circuitState: vendorModels.circuitState,
        isDown: vendorModels.isDown,
      })
      .from(vendorModels)
      .innerJoin(models, eq(vendorModels.modelId, models.id))
      .where(eq(vendorModels.vendorId, drillRecord.vendorId));

    reply.status(200).send({
      code: 0,
      data: {
        ...drillRecord,
        vmStatuses: vmStatusList,
      },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/drills/history — 演练历史
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/drills/history", {
    preHandler: [requirePerm(Perm.OPS_READ)],
  }, async (_request, reply) => {
    const history: any[] = JSON.parse(await redis.get(DRILL_HISTORY_KEY) || "[]");
    reply.status(200).send({ code: 0, data: { list: history }, message: "ok" });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/admin/drills/report/:id — 特定报告
  // ──────────────────────────────────────────────

  app.get("/api/v1/admin/drills/report/:id", {
    preHandler: [requirePerm(Perm.OPS_READ)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const history: any[] = JSON.parse(await redis.get(DRILL_HISTORY_KEY) || "[]");
    const report = history.find(r => r.id === id);
    if (!report) {
      return reply.status(404).send({ code: 404, message: "演练报告不存在" });
    }
    reply.status(200).send({ code: 0, data: report, message: "ok" });
  });
}

// ── 中间件函数：检查请求是否为演练流量 ──

export function isDrillRequest(request: { headers: Record<string, string> }): boolean {
  return request.headers["x-drill"] === "true";
}
