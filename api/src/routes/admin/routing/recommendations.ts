// ============================================================
//  3cloud (3C) — 智能路由推荐（增强版）
//  GET /api/v1/admin/routing/recommendations
//  分析最近 N 天的 call_logs 数据，对比 vendor_models 价格表，
//  推荐更优的供应商/模型组合，计算成本节约空间。
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, sql, desc, inArray } from "drizzle-orm";
import { callLogs, vendorModels, vendors, models } from "../../../db/schema/index.js";
import { getDb } from "../../../db/index.js";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";

// ── 类型定义 ──

interface CallStat {
  vendorModelId: number;
  vendorName: string;
  modelName: string;
  totalCalls: number;
  successCalls: number;
  totalCost: number;
  totalDurationMs: number;
  avgLatencyMs: number;
}

interface VendorModelConfig {
  id: number;
  vendorId: number;
  modelId: number;
  vendorName: string;
  upstreamModelName: string;
  costPriceInput: string;
  costPriceOutput: string;
  weight: number;
  status: boolean;
  isDown: boolean;
}

interface RecommendationItem {
  currentModel: string;
  currentVendor: string;
  recommendedModel: string;
  recommendedVendor: string;
  currentCost: number;
  recommendedCost: number;
  monthlySavings: number;
  confidence: number;
  reason: string;
}

interface AnalysisResult {
  totalModels: number;
  hasRecommendations: boolean;
  totalPotentialSavings: number;
}

interface RecommendResponse {
  recommendations: RecommendationItem[];
  analysis: AnalysisResult;
}

// ── 常量 ──

const SCORE_WEIGHTS = {
  COST: 0.4,
  LATENCY: 0.3,
  RELIABILITY: 0.3,
};

// 每小时平均调用次数估算（按总调用 / 总天数 / 24）
function estimateHourlyRate(totalCalls: number, days: number): number {
  return totalCalls / (days * 24);
}

// ── 路由注册 ──

export async function adminRoutingRecommendationsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  app.get("/api/v1/admin/routing/recommendations", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE)],
  }, async (request, reply) => {
    const db = getDb();
    const query = request.query as Record<string, string | undefined>;

    const days = Math.min(30, Math.max(1, parseInt(query.days ?? "7", 10) || 7));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? "20", 10) || 20));
    const minCalls = Math.max(1, parseInt(query.minCalls ?? "5", 10) || 5);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // ── 1. 从 call_logs 聚合最近 N 天的调用数据 ──
    const rawStats = await db
      .select({
        vendorModelId: callLogs.vendorModelId,
        vendorName: callLogs.vendorName,
        modelName: callLogs.modelName,
        totalCalls: sql<number>`count(*)`.as("total_calls"),
        successCalls: sql<number>`sum(case when ${callLogs.status} = 'success' then 1 else 0 end)`.as("success_calls"),
        totalCost: sql<number>`sum(${callLogs.cost})`.as("total_cost"),
        totalDurationMs: sql<number>`sum(coalesce(${callLogs.durationMs}, 0))`.as("total_duration"),
        avgLatencyMs: sql<number>`avg(coalesce(${callLogs.durationMs}, 0))`.as("avg_latency"),
      })
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, since),
          sql`${callLogs.vendorModelId} IS NOT NULL`
        )
      )
      .groupBy(callLogs.vendorModelId, callLogs.vendorName, callLogs.modelName)
      .having(sql`count(*) >= ${minCalls}`);

    if (rawStats.length === 0) {
      const empty: RecommendResponse = {
        recommendations: [],
        analysis: {
          totalModels: 0,
          hasRecommendations: false,
          totalPotentialSavings: 0,
        },
      };
      return reply.status(200).send({ code: 0, data: empty, message: "ok" });
    }

    const stats = rawStats.map((s) => ({
      ...s,
      totalCalls: Number(s.totalCalls),
      successCalls: Number(s.successCalls),
      totalCost: Number(s.totalCost),
      totalDurationMs: Number(s.totalDurationMs),
      avgLatencyMs: Number(s.avgLatencyMs),
    })) as CallStat[];

    // ── 2. 查询所有关联的 vendor_models 配置（含成本价格）──
    const vmIds = [...new Set(stats.map((s) => s.vendorModelId).filter(Boolean))];

    const vmRows = await db
      .select({
        id: vendorModels.id,
        vendorId: vendorModels.vendorId,
        modelId: vendorModels.modelId,
        upstreamModelName: vendorModels.upstreamModelName,
        costPriceInput: vendorModels.costPriceInput,
        costPriceOutput: vendorModels.costPriceOutput,
        weight: vendorModels.weight,
        status: vendorModels.status,
        isDown: vendorModels.isDown,
      })
      .from(vendorModels)
      .where(inArray(vendorModels.id, vmIds));

    // ── 3. 查询供应商名 ──
    const vendorIds = [...new Set(vmRows.map((v) => v.vendorId))];
    const vendorRows = await db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(inArray(vendors.id, vendorIds));
    const vendorMap = new Map(vendorRows.map((v) => [v.id, v.name]));

    // ── 4. 查询统一模型名（models 表） ──
    const modelIds = [...new Set(vmRows.map((v) => v.modelId))];
    const modelRows = await db
      .select({ id: models.id, name: models.name })
      .from(models)
      .where(inArray(models.id, modelIds));
    const modelMap = new Map(modelRows.map((m) => [m.id, m.name]));

    // ── 5. 构建完整配置 + 注入供应商/模型名 ──
    const vmConfigMap = new Map<number, VendorModelConfig>();
    for (const vm of vmRows) {
      vmConfigMap.set(vm.id, {
        ...vm,
        vendorName: vendorMap.get(vm.vendorId) ?? "未知供应商",
        upstreamModelName: vm.upstreamModelName || (modelMap.get(vm.modelId) ?? ""),
      });
    }

    // ── 6. 按统一模型名（modelName）分组，组内对比推荐 ──
    //  key: modelName（前端展示的统一模型名如 deepseek-v4-pro）
    const modelGroup = new Map<string, CallStat[]>();

    for (const stat of stats) {
      const key = stat.modelName;
      if (!modelGroup.has(key)) modelGroup.set(key, []);
      modelGroup.get(key)!.push(stat);
    }

    const recommendations: RecommendationItem[] = [];
    const monthlyFactor = (30 / days); // 从 N 天数据推算月均

    for (const [modelName, groupStats] of modelGroup) {
      if (groupStats.length < 2) continue; // 至少 2 个供应商才能对比

      // ── 7. 遍历每个供应商作为"当前"，推荐更优的替代 ──
      for (const current of groupStats) {
        const currentVm = vmConfigMap.get(current.vendorModelId);
        if (!currentVm) continue;

        // 计算当前供应商的成本单价
        const currentAvgCost = current.totalCost / current.totalCalls;
        const currentSuccessRate = current.totalCalls > 0
          ? current.successCalls / current.totalCalls
          : 0;

        // 当前每百万 Token 成本估算（以成本单价折算）
        // cost 字段是每笔总成本，包含 input+output token 消耗
        const currentCostPerCall = currentAvgCost;

        // 遍历其他供应商作为推荐目标
        let bestRecommendation: {
          target: CallStat;
          score: number;
          reason: string;
          monthlySavings: number;
        } | null = null;

        for (const candidate of groupStats) {
          if (candidate.vendorModelId === current.vendorModelId) continue;

          const candidateVm = vmConfigMap.get(candidate.vendorModelId);
          if (!candidateVm) continue;

          // 跳过宕机或禁用的配置
          if (candidateVm.isDown || !candidateVm.status) continue;

          // ── 8. 计算候选供应商的评分 ──
          const candidateAvgCost = candidate.totalCost / candidate.totalCalls;
          const candidateSuccessRate = candidate.totalCalls > 0
            ? candidate.successCalls / candidate.totalCalls
            : 0;

          // 成本得分：单价越低分越高（反向归一化，组内对比）
          const groupCosts = groupStats.map((g) => g.totalCost / g.totalCalls);
          const minCost = Math.min(...groupCosts);
          const maxCost = Math.max(...groupCosts);
          let costScore = 50;
          if (maxCost > minCost) {
            costScore = 100 * (1 - (candidateAvgCost - minCost) / (maxCost - minCost));
          } else {
            costScore = 100;
          }

          // 延迟得分：组内反向归一化
          const groupLats = groupStats.map((g) => g.avgLatencyMs);
          const minLat = Math.min(...groupLats);
          const maxLat = Math.max(...groupLats);
          let latencyScore = 50;
          if (maxLat > minLat) {
            latencyScore = 100 * (1 - (candidate.avgLatencyMs - minLat) / (maxLat - minLat));
          } else {
            latencyScore = 100;
          }

          // 可靠性得分
          const reliabilityScore = candidateSuccessRate * 100;

          // 综合评分
          const overallScore =
            SCORE_WEIGHTS.COST * costScore +
            SCORE_WEIGHTS.LATENCY * latencyScore +
            SCORE_WEIGHTS.RELIABILITY * reliabilityScore;

          // ── 9. 计算成本节约 ──
          const savingsPerCall = currentAvgCost - candidateAvgCost;
          const monthlySavings = savingsPerCall > 0
            ? current.totalCalls * monthlyFactor * savingsPerCall
            : 0;

          // 仅当推荐能省钱且评分高于当前时才推荐
          if (savingsPerCall <= 0) continue;

          // 构建推荐理由
          const reasons: string[] = [];
          if (currentAvgCost > candidateAvgCost) {
            reasons.push(
              `每笔成本从 ¥${currentAvgCost.toFixed(6)} 降至 ¥${candidateAvgCost.toFixed(6)}，降低 ${((1 - candidateAvgCost / currentAvgCost) * 100).toFixed(1)}%`
            );
          }
          if (candidate.avgLatencyMs < current.avgLatencyMs) {
            reasons.push(
              `延迟从 ${current.avgLatencyMs.toFixed(0)}ms 降至 ${candidate.avgLatencyMs.toFixed(0)}ms`
            );
          }
          if (candidateSuccessRate > currentSuccessRate) {
            reasons.push(
              `成功率从 ${(currentSuccessRate * 100).toFixed(1)}% 提升至 ${(candidateSuccessRate * 100).toFixed(1)}%`
            );
          }

          // 评分比当前高才有推荐意义
          const currentOverall =
            SCORE_WEIGHTS.COST * (maxCost > minCost
              ? 100 * (1 - (currentAvgCost - minCost) / (maxCost - minCost))
              : 100) +
            SCORE_WEIGHTS.LATENCY * (maxLat > minLat
              ? 100 * (1 - (current.avgLatencyMs - minLat) / (maxLat - minLat))
              : 100) +
            SCORE_WEIGHTS.RELIABILITY * (currentSuccessRate * 100);

          if (overallScore <= currentOverall) continue;

          if (monthlySavings > 0) {
            reasons.push(
              `月均节省约 ¥${monthlySavings.toFixed(2)}（基于 ${current.totalCalls} 次调用推算）`
            );
          }

          const reasonText = reasons.join("；");

          // 更新最佳推荐
          if (!bestRecommendation || overallScore > bestRecommendation.score ||
              (overallScore === bestRecommendation.score && monthlySavings > bestRecommendation.monthlySavings)) {
            bestRecommendation = {
              target: candidate,
              score: overallScore,
              reason: reasonText,
              monthlySavings,
            };
          }
        }

        // ── 10. 写入推荐结果 ──
        if (bestRecommendation) {
          const targetVm = vmConfigMap.get(bestRecommendation.target.vendorModelId);
          if (!targetVm) continue;

          const candCost = bestRecommendation.target.totalCost / bestRecommendation.target.totalCalls;

          // 置信度 = 综合评分 / 100 * 样本量因子
          const sampleFactor = Math.min(1, bestRecommendation.target.totalCalls / 100);
          const confidence = Math.round(Math.min(100, bestRecommendation.score * sampleFactor));

          recommendations.push({
            currentModel: modelName,
            currentVendor: current.vendorName,
            recommendedModel: modelName,
            recommendedVendor: bestRecommendation.target.vendorName,
            currentCost: currentAvgCost,
            recommendedCost: candCost,
            monthlySavings: Math.round(bestRecommendation.monthlySavings * 100) / 100,
            confidence,
            reason: bestRecommendation.reason,
          });
        }
      }
    }

    // ── 11. 按月节省金额降序排列 ──
    recommendations.sort((a, b) => b.monthlySavings - a.monthlySavings);

    const topRecommendations = recommendations.slice(0, limit);

    // ── 12. 汇总分析 ──
    const totalPotentialSavings = recommendations.reduce(
      (sum, r) => sum + r.monthlySavings, 0
    );

    const analysis: AnalysisResult = {
      totalModels: modelGroup.size,
      hasRecommendations: topRecommendations.length > 0,
      totalPotentialSavings: Math.round(totalPotentialSavings * 100) / 100,
    };

    const result: RecommendResponse = {
      recommendations: topRecommendations,
      analysis,
    };

    reply.status(200).send({
      code: 0,
      data: result,
      message: "ok",
    });
  });
}
