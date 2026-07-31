import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/index";
import { vendorModels } from "../db/schema/vendor-models";
import { routingOverrides } from "../db/schema/routing";
import { allowRequest } from "./circuit-breaker";

/**
 * 路由选择 service（§5.1）
 * 为某个模型选择最优供应商映射，支持：
 * - 手动覆盖优先（routing_overrides）
 * - 按权重加权轮询
 * - 排除熔断中的候选
 * - 按优先级排序
 */

export interface RouteCandidate {
  vendorModelId: number;
  vendorId: number;
  modelId: number;
  upstreamModel: string;
  weight: number;
  priority: number;
}

/**
 * 获取某模型的可用路由候选（未被熔断）
 */
async function getAvailableCandidates(modelId: number): Promise<RouteCandidate[]> {
  // 查询所有启用的供应商映射
  const rows = await db
    .select()
    .from(vendorModels)
    .where(and(eq(vendorModels.modelId, modelId), eq(vendorModels.isEnabled, true)))
    .orderBy(desc(vendorModels.priority));

  const candidates: RouteCandidate[] = [];
  for (const row of rows) {
    // 跳过熔断中的候选
    const allowed = await allowRequest(row.id);
    if (!allowed) continue;
    candidates.push({
      vendorModelId: row.id,
      vendorId: row.vendorId,
      modelId: row.modelId,
      upstreamModel: row.upstreamModel,
      weight: row.weight,
      priority: row.priority,
    });
  }
  return candidates;
}

/**
 * 检查是否有手动覆盖（返回被强制指定的 vendorModelId 或 null）
 */
async function getManualOverride(modelId: number): Promise<number | null> {
  const override = await db
    .select()
    .from(routingOverrides)
    .where(and(eq(routingOverrides.modelId, modelId), eq(routingOverrides.isPermanent, true)))
    .limit(1);
  // 简单处理：仅永久覆盖生效（临时覆盖需校验时间窗口，Phase 1 简化）
  const perm = override[0];
  if (perm) {
    // 通过 vendorId 找到对应的 vendorModelId（首个启用）
    const vm = await db
      .select()
      .from(vendorModels)
      .where(and(eq(vendorModels.modelId, modelId), eq(vendorModels.vendorId, perm.vendorId), eq(vendorModels.isEnabled, true)))
      .limit(1);
    return vm[0]?.id ?? null;
  }
  return null;
}

/**
 * 加权轮询选择（返回候选或 null）
 */
function weightedRoundRobin(candidates: RouteCandidate[]): RouteCandidate | null {
  if (candidates.length === 0) return null;
  // 简单加权：按权重累加随机
  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  let r = Math.floor(Math.random() * totalWeight);
  for (const c of candidates) {
    r -= c.weight;
    if (r < 0) return c;
  }
  return candidates[candidates.length - 1]!;
}

/**
 * 主入口：为模型选择一个路由目标
 * @returns vendorModelId 或 null（无可用路由）
 */
export async function selectRoute(modelId: number): Promise<{ vendorModelId: number; upstreamModel: string; viaOverride: boolean } | null> {
  // 1. 手动覆盖优先
  const overrideVmId = await getManualOverride(modelId);
  if (overrideVmId) {
    const vm = await db.select().from(vendorModels).where(eq(vendorModels.id, overrideVmId)).limit(1);
    const row = vm[0];
    if (row && row.isEnabled) {
      return { vendorModelId: row.id, upstreamModel: row.upstreamModel, viaOverride: true };
    }
  }

  // 2. 可用候选（过滤熔断）
  const candidates = await getAvailableCandidates(modelId);
  if (candidates.length === 0) return null;

  // 3. 加权轮询
  const chosen = weightedRoundRobin(candidates);
  if (!chosen) return null;

  return {
    vendorModelId: chosen.vendorModelId,
    upstreamModel: chosen.upstreamModel,
    viaOverride: false,
  };
}

/**
 * 路由推荐评分（§5.1 P2）
 * 基于成本/延迟/可靠性打分（0-100）
 */
export function scoreCandidate(params: {
  avgCostPerCall: number;
  avgLatencyMs: number;
  successRate: number; // 0-100
  minCost?: number;
  maxLatencyMs?: number;
}): { costScore: number; latencyScore: number; reliabilityScore: number; overallScore: number } {
  const { avgCostPerCall, avgLatencyMs, successRate, minCost = 0.001, maxLatencyMs = 5000 } = params;

  // 成本分（成本越低分越高：cost=ref → 80 分, cost=5×ref → 0 分）
  const costScore = Math.max(0, Math.min(100, Math.round(100 - (avgCostPerCall / minCost) * 20)));

  // 延迟分（延迟越低越好，0ms → 100，maxLatencyMs → 0）
  const latencyScore = Math.max(0, Math.min(100, Math.round(100 - (avgLatencyMs / maxLatencyMs) * 100)));

  // 可靠性分（成功率 100% → 100 分）
  const reliabilityScore = Math.max(0, Math.min(100, Math.round(successRate)));

  // 综合（成本 30% + 延迟 30% + 可靠性 40%）
  const overallScore = Math.round(costScore * 0.3 + latencyScore * 0.3 + reliabilityScore * 0.4);

  return { costScore, latencyScore, reliabilityScore, overallScore };
}
