// ============================================================
//  3cloud (3C) — 智能路由推荐
//  GET /api/v1/admin/routing/recommendations — 分析历史数据推荐最优供应商/模型组合
//  POST /api/v1/admin/routing/recommendations/apply — 应用推荐配置
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { callLogs, vendorModels, vendors, models } from "../../db/schema.js";
import { getDb } from "../../db/index.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";

// 推荐结果接口
interface Recommendation {
  vendorId: number;
  vendorName: string;
  modelId: number;
  modelName: string;
  upstreamModelName: string;
  // 评分
  costScore: number;      // 0-100
  latencyScore: number;   // 0-100
  reliabilityScore: number; // 0-100
  overallScore: number;   // 综合得分
  // 原始数据
  avgCostPerCall: number;
  avgLatencyMs: number;
  successRate: number;
  totalCalls: number;
  // 推荐理由
  reasons: string[];
  // 当前配置对比
  currentConfig?: {
    weight: number;
    status: boolean;
    isDown: boolean;
  };
}

export async function adminRoutingRecommendationsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── GET /api/v1/admin/routing/recommendations — 获取智能推荐 ──
  app.get("/api/v1/admin/routing/recommendations", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as Record<string, string | undefined>;

    // 参数
    const days = Math.min(30, Math.max(1, parseInt(query.days ?? "7", 10) || 7));
    const modelName = query.modelName?.trim(); // 可选：指定模型
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? "20", 10) || 20));

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // ── 1. 查询历史调用数据 ──
    // 按 vendor_model_id 聚合统计
    const statsQuery = db
      .select({
        vendorModelId: callLogs.vendorModelId,
        vendorName: callLogs.vendorName,
        modelName: callLogs.modelName,
        totalCalls: sql<number>`count(*)`,
        successCalls: sql<number>`sum(case when ${callLogs.status} = 'success' then 1 else 0 end)`,
        totalCost: sql<number>`sum(${callLogs.cost})`,
        totalDurationMs: sql<number>`sum(coalesce(${callLogs.durationMs}, 0))`,
        avgLatencyMs: sql<number>`avg(coalesce(${callLogs.durationMs}, 0))`,
      })
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, since),
          modelName ? eq(callLogs.modelName, modelName) : undefined
        )
      )
      .groupBy(callLogs.vendorModelId, callLogs.vendorName, callLogs.modelName)
      .having(sql`count(*) >= 10`) as any; // 至少 10 次调用才纳入分析

    const stats = await statsQuery;

    if (stats.length === 0) {
      reply.status(200).send({
        code: 0,
        data: {
          recommendations: [],
          analysisPeriod: { days, since: since.toISOString() },
          message: "最近无足够调用数据进行分析（需要每个供应商至少 10 次调用）",
        },
        message: "ok",
      });
      return;
    }

    // ── 2. 查询 vendor_models 配置 ──
    const vendorModelIds = stats
      .map((s: any) => s.vendorModelId)
      .filter((id: number | null) => id !== null) as number[];

    const vmConfigs = await db
      .select({
        id: vendorModels.id,
        vendorId: vendorModels.vendorId,
        modelId: vendorModels.modelId,
        upstreamModelName: vendorModels.upstreamModelName,
        costPriceInput: vendorModels.costPriceInput,
        costPriceOutput: vendorModels.costPriceOutput,
        sellPriceInput: vendorModels.sellPriceInput,
        sellPriceOutput: vendorModels.sellPriceOutput,
        weight: vendorModels.weight,
        status: vendorModels.status,
        isDown: vendorModels.isDown,
        healthScore: vendorModels.healthScore,
      })
      .from(vendorModels)
      .where(sql`${vendorModels.id} = ANY(ARRAY[${sql.join(vendorModelIds.map(id => sql`${id}`), sql`, `)}])`);

    const vmConfigMap = new Map(vmConfigs.map((vm) => [vm.id, vm]));

    // ── 3. 查询供应商信息 ──
    const vendorIds = [...new Set(vmConfigs.map((vm) => vm.vendorId))];
    const vendorList = await db
      .select({ id: vendors.id, name: vendors.name, status: vendors.status })
      .from(vendors)
      .where(sql`${vendors.id} = ANY(ARRAY[${sql.join(vendorIds.map(id => sql`${id}`), sql`, `)}])`);

    const vendorMap = new Map(vendorList.map((v) => [v.id, v]));

    // ── 4. 查询模型信息 ──
    const modelIds = [...new Set(vmConfigs.map((vm) => vm.modelId))];
    const modelList = await db
      .select({ id: models.id, name: models.name })
      .from(models)
      .where(sql`${models.id} = ANY(ARRAY[${sql.join(modelIds.map(id => sql`${id}`), sql`, `)}])`);

    const modelMap = new Map(modelList.map((m) => [m.id, m]));

    // ── 5. 计算评分 ──
    const recommendations: Recommendation[] = [];

    // 归一化参数（用于计算 0-100 分）
    const costs = stats.map((s: any) => Number(s.totalCost) / Number(s.totalCalls));
    const latencies = stats.map((s: any) => Number(s.avgLatencyMs));
    const successRates = stats.map((s: any) => Number(s.successCalls) / Number(s.totalCalls));

    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);

    for (const stat of stats as any[]) {
      const vmId = stat.vendorModelId;
      if (!vmId) continue;

      const vmConfig = vmConfigMap.get(vmId);
      if (!vmConfig) continue;

      const vendor = vendorMap.get(vmConfig.vendorId);
      const model = modelMap.get(vmConfig.modelId);
      if (!vendor || !model) continue;

      const totalCalls = Number(stat.totalCalls);
      const successCalls = Number(stat.successCalls);
      const totalCost = Number(stat.totalCost);
      const avgLatency = Number(stat.avgLatencyMs);
      const avgCost = totalCost / totalCalls;
      const successRate = successCalls / totalCalls;

      // ── 评分模型 ──
      // 成本得分：价格越低得分越高（反向归一化）
      let costScore = 100;
      if (maxCost > minCost) {
        costScore = Math.round(100 * (1 - (avgCost - minCost) / (maxCost - minCost)));
      }

      // 延迟得分：延迟越低得分越高（反向归一化）
      let latencyScore = 100;
      if (maxLatency > minLatency) {
        latencyScore = Math.round(100 * (1 - (avgLatency - minLatency) / (maxLatency - minLatency)));
      }

      // 可靠性得分：成功率直接映射
      const reliabilityScore = Math.round(successRate * 100);

      // 综合得分 = 0.4*成本 + 0.3*延迟 + 0.3*可靠性
      const overallScore = Math.round(0.4 * costScore + 0.3 * latencyScore + 0.3 * reliabilityScore);

      // ── 推荐理由 ──
      const reasons: string[] = [];

      if (costScore >= 80) reasons.push(`成本优势明显（平均 ¥${avgCost.toFixed(4)}/次）`);
      else if (costScore >= 60) reasons.push(`成本适中（平均 ¥${avgCost.toFixed(4)}/次）`);
      else reasons.push(`成本较高（平均 ¥${avgCost.toFixed(4)}/次）`);

      if (latencyScore >= 80) reasons.push(`响应迅速（平均 ${Math.round(avgLatency)}ms）`);
      else if (latencyScore >= 60) reasons.push(`延迟适中（平均 ${Math.round(avgLatency)}ms）`);
      else reasons.push(`延迟较高（平均 ${Math.round(avgLatency)}ms）`);

      if (reliabilityScore >= 99) reasons.push(`可靠性极高（成功率 ${(successRate * 100).toFixed(2)}%）`);
      else if (reliabilityScore >= 95) reasons.push(`可靠性良好（成功率 ${(successRate * 100).toFixed(2)}%）`);
      else reasons.push(`可靠性一般（成功率 ${(successRate * 100).toFixed(2)}%）`);

      if (vmConfig.isDown) reasons.push(`⚠️ 当前标记为宕机`);
      if (!vmConfig.status) reasons.push(`⚠️ 当前已禁用`);

      recommendations.push({
        vendorId: vendor.id,
        vendorName: vendor.name,
        modelId: model.id,
        modelName: model.name,
        upstreamModelName: vmConfig.upstreamModelName,
        costScore,
        latencyScore,
        reliabilityScore,
        overallScore,
        avgCostPerCall: avgCost,
        avgLatencyMs: avgLatency,
        successRate,
        totalCalls,
        reasons,
        currentConfig: {
          weight: vmConfig.weight,
          status: vmConfig.status,
          isDown: vmConfig.isDown ?? false,
        },
      });
    }

    // ── 6. 按综合得分排序 ──
    recommendations.sort((a, b) => b.overallScore - a.overallScore);

    // ── 7. 按模型分组，每个模型只保留 Top 3 推荐 ──
    const groupedByModel = new Map<string, Recommendation[]>();
    for (const rec of recommendations) {
      const key = rec.modelName;
      if (!groupedByModel.has(key)) groupedByModel.set(key, []);
      const group = groupedByModel.get(key)!;
      if (group.length < 3) group.push(rec);
    }

    const topRecommendations = [...groupedByModel.values()].flat().slice(0, limit);

    reply.status(200).send({
      code: 0,
      data: {
        recommendations: topRecommendations,
        analysisPeriod: {
          days,
          since: since.toISOString(),
          until: new Date().toISOString(),
        },
        totalAnalyzed: stats.length,
        modelCount: groupedByModel.size,
      },
      message: "ok",
    });
  });

  // ── POST /api/v1/admin/routing/recommendations/apply — 应用推荐 ──
  app.post("/api/v1/admin/routing/recommendations/apply", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const body = request.body as {
      vendorModelId: number;
      action: "enable" | "disable" | "set_weight" | "clear_down";
      weight?: number;
    };

    if (!body.vendorModelId || !body.action) {
      reply.status(400).send({ code: 400, data: null, message: "vendorModelId 和 action 必填" });
      return;
    }

    const vmId = body.vendorModelId;
    const action = body.action;

    // 查询当前配置
    const [vm] = await db
      .select({
        id: vendorModels.id,
        vendorId: vendorModels.vendorId,
        modelId: vendorModels.modelId,
        upstreamModelName: vendorModels.upstreamModelName,
        status: vendorModels.status,
        weight: vendorModels.weight,
        isDown: vendorModels.isDown,
      })
      .from(vendorModels)
      .where(eq(vendorModels.id, vmId))
      .limit(1);

    if (!vm) {
      reply.status(404).send({ code: 404, data: null, message: "供应商模型配置不存在" });
      return;
    }

    const updates: Record<string, any> = {};
    const operatorId = request.user!.userId;

    switch (action) {
      case "enable":
        updates.status = true;
        updates.isDown = false;
        break;
      case "disable":
        updates.status = false;
        break;
      case "set_weight":
        if (typeof body.weight !== "number" || body.weight < 0 || body.weight > 1000) {
          reply.status(400).send({ code: 400, data: null, message: "weight 必须在 0-1000 之间" });
          return;
        }
        updates.weight = body.weight;
        break;
      case "clear_down":
        updates.isDown = false;
        break;
      default:
        reply.status(400).send({ code: 400, data: null, message: `未知操作: ${action}` });
        return;
    }

    const [updated] = await db
      .update(vendorModels)
      .set(updates)
      .where(eq(vendorModels.id, vmId))
      .returning();

    // 记录审计日志
    const { auditLogs } = await import("../../db/schema.js");
    await db.insert(auditLogs).values({
      operatorId,
      action: "routing_recommendation_apply",
      targetType: "vendor_model",
      targetId: vmId,
      before: { status: vm.status, weight: vm.weight, isDown: vm.isDown },
      after: updates,
      ip: request.ip,
      description: `应用智能路由推荐: ${vm.upstreamModelName} - ${action}`,
    });

    reply.status(200).send({
      code: 0,
      data: updated,
      message: `已应用: ${action}`,
    });
  });

  // ── GET /api/v1/admin/routing/recommendations/compare — 对比供应商性能 ──
  app.get("/api/v1/admin/routing/recommendations/compare", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as Record<string, string | undefined>;

    const modelName = query.modelName?.trim();
    if (!modelName) {
      reply.status(400).send({ code: 400, data: null, message: "modelName 必填" });
      return;
    }

    const days = Math.min(30, Math.max(1, parseInt(query.days ?? "7", 10) || 7));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // 查询指定模型的所有供应商调用数据
    const stats = await db
      .select({
        vendorModelId: callLogs.vendorModelId,
        vendorName: callLogs.vendorName,
        totalCalls: sql<number>`count(*)`,
        successCalls: sql<number>`sum(case when ${callLogs.status} = 'success' then 1 else 0 end)`,
        totalCost: sql<number>`sum(${callLogs.cost})`,
        totalTokens: sql<number>`sum(${callLogs.totalTokens})`,
        avgLatencyMs: sql<number>`avg(coalesce(${callLogs.durationMs}, 0))`,
      })
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, since),
          eq(callLogs.modelName, modelName)
        )
      )
      .groupBy(callLogs.vendorModelId, callLogs.vendorName)
      .orderBy(desc(sql`count(*)`));

    reply.status(200).send({
      code: 0,
      data: {
        modelName,
        vendors: stats.map((s: any) => ({
          vendorName: s.vendorName,
          vendorModelId: s.vendorModelId,
          totalCalls: Number(s.totalCalls),
          successCalls: Number(s.successCalls),
          successRate: Number(s.successCalls) / Number(s.totalCalls),
          totalCost: Number(s.totalCost),
          avgCostPerCall: Number(s.totalCost) / Number(s.totalCalls),
          totalTokens: Number(s.totalTokens),
          avgLatencyMs: Math.round(Number(s.avgLatencyMs)),
        })),
        analysisPeriod: { days, since: since.toISOString() },
      },
      message: "ok",
    });
  });
}
