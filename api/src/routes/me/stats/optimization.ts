// ============================================================
//  3cloud (3C) — 模型成本优化建议 API
//  GET /api/v1/me/stats/optimization — 分析用户模型使用，推荐更优替代
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, gte, lt, sql, desc } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { callLogs, models, vendorModels, vendors } from "../../../db/schema.js";
import { authenticateJWT } from "../../../middleware/auth.js";

// ── 模型能力分组（相同能力可互换）──
// 按性价比、能力级别分组，用于推荐替代模型
const MODEL_CAPABILITY_GROUPS: Record<string, {
  tier: 'budget' | 'standard' | 'premium';
  capabilities: string[];
}> = {
  // DeepSeek 系列
  'deepseek-chat': { tier: 'standard', capabilities: ['chat', 'reasoning', 'coding'] },
  'deepseek-coder': { tier: 'standard', capabilities: ['chat', 'coding'] },
  'deepseek-reasoner': { tier: 'premium', capabilities: ['chat', 'reasoning', 'coding', 'math'] },
  
  // GPT 系列
  'gpt-4o': { tier: 'premium', capabilities: ['chat', 'reasoning', 'coding', 'vision', 'function_call'] },
  'gpt-4o-mini': { tier: 'standard', capabilities: ['chat', 'reasoning', 'coding'] },
  'gpt-3.5-turbo': { tier: 'budget', capabilities: ['chat', 'coding'] },
  'gpt-4-turbo': { tier: 'premium', capabilities: ['chat', 'reasoning', 'coding', 'vision'] },
  
  // Claude 系列
  'claude-3-5-sonnet-20241022': { tier: 'premium', capabilities: ['chat', 'reasoning', 'coding', 'vision'] },
  'claude-3-5-haiku-20241022': { tier: 'standard', capabilities: ['chat', 'reasoning', 'coding'] },
  'claude-3-opus-20240229': { tier: 'premium', capabilities: ['chat', 'reasoning', 'coding', 'vision'] },
  
  // Gemini 系列
  'gemini-2.0-flash-exp': { tier: 'standard', capabilities: ['chat', 'reasoning', 'coding', 'vision'] },
  'gemini-1.5-pro': { tier: 'premium', capabilities: ['chat', 'reasoning', 'coding', 'vision'] },
  'gemini-1.5-flash': { tier: 'standard', capabilities: ['chat', 'reasoning', 'coding'] },
  
  // Qwen 系列
  'qwen-turbo': { tier: 'standard', capabilities: ['chat', 'reasoning', 'coding'] },
  'qwen-plus': { tier: 'premium', capabilities: ['chat', 'reasoning', 'coding'] },
  'qwen-max': { tier: 'premium', capabilities: ['chat', 'reasoning', 'coding', 'math'] },
  
  // GLM 系列
  'glm-4-plus': { tier: 'premium', capabilities: ['chat', 'reasoning', 'coding'] },
  'glm-4-flash': { tier: 'budget', capabilities: ['chat', 'coding'] },
  'glm-4-air': { tier: 'standard', capabilities: ['chat', 'reasoning', 'coding'] },
};

// ── 计算能力匹配度（0-100）──
function calculateCapabilityMatch(
  currentModel: string,
  candidateModel: string
): number {
  const currentGroup = MODEL_CAPABILITY_GROUPS[currentModel];
  const candidateGroup = MODEL_CAPABILITY_GROUPS[candidateModel];
  
  if (!currentGroup || !candidateGroup) return 50; // 未知模型默认中等匹配
  
  // 完全匹配
  if (currentModel === candidateModel) return 100;
  
  // 能力包含度
  const currentCaps = new Set(currentGroup.capabilities);
  const candidateCaps = new Set(candidateGroup.capabilities);
  
  let matchCount = 0;
  for (const cap of currentCaps) {
    if (candidateCaps.has(cap)) matchCount++;
  }
  
  const capabilityScore = (matchCount / currentCaps.size) * 80;
  
  // Tier 匹配加分（同 tier 或更低 tier）
  let tierBonus = 0;
  if (candidateGroup.tier === currentGroup.tier) {
    tierBonus = 15;
  } else if (
    (currentGroup.tier === 'premium' && candidateGroup.tier === 'standard') ||
    (currentGroup.tier === 'standard' && candidateGroup.tier === 'budget')
  ) {
    tierBonus = 5; // 降级使用，可能节省成本
  }
  
  return Math.min(100, Math.round(capabilityScore + tierBonus));
}

// ── 推荐理由生成 ──
function generateRecommendationReason(
  currentModel: string,
  candidateModel: string,
  savingsPercent: number,
  capabilityMatch: number
): string {
  const currentGroup = MODEL_CAPABILITY_GROUPS[currentModel];
  const candidateGroup = MODEL_CAPABILITY_GROUPS[candidateModel];
  
  const reasons: string[] = [];
  
  // 价格优势
  if (savingsPercent >= 50) {
    reasons.push(`价格降低 ${savingsPercent.toFixed(0)}%`);
  } else if (savingsPercent >= 20) {
    reasons.push(`价格降低 ${savingsPercent.toFixed(0)}%`);
  } else {
    reasons.push(`价格更优`);
  }
  
  // 能力说明
  if (capabilityMatch >= 90) {
    reasons.push('能力完全覆盖');
  } else if (capabilityMatch >= 70) {
    reasons.push('能力基本覆盖');
  }
  
  // Tier 说明
  if (currentGroup && candidateGroup) {
    if (candidateGroup.tier === currentGroup.tier) {
      reasons.push('同级别模型');
    } else if (candidateGroup.tier === 'budget' && currentGroup.tier !== 'budget') {
      reasons.push('轻量级替代');
    }
  }
  
  return reasons.join('，');
}

export interface ModelOptimization {
  currentModel: string;
  recommendedModel: string;
  currentCost: number;      // 元/百万 token（综合价格）
  recommendedCost: number;
  savings: number;          // 每月预估节省（元）
  savingsPercent: number;   // 节省百分比
  capabilityMatch: number;  // 能力匹配度 0-100
  reason: string;
  usageCount: number;       // 用户使用次数
  usageTokens: number;      // 用户使用 token 数
}

export async function meStatsOptimizationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ──────────────────────────────────────────────
  //  GET /api/v1/me/stats/optimization — 模型成本优化建议
  //  分析用户最近 7 天的模型使用，推荐更便宜的替代模型
  // ──────────────────────────────────────────────

  app.get("/api/v1/me/stats/optimization", async (request, reply) => {
    const userId = request.user!.userId;
    const db = getDb();

    try {
      // 1. 查询用户最近 7 天的模型使用统计
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

      const userUsage = await db
        .select({
          modelName: callLogs.modelName,
          totalCalls: sql<number>`count(*)::int`,
          totalTokens: sql<number>`coalesce(sum(${callLogs.totalTokens}), 0)::bigint`,
          totalCost: sql<string>`coalesce(sum(${callLogs.cost}::numeric), 0)`,
        })
        .from(callLogs)
        .where(
          and(
            eq(callLogs.userId, userId),
            gte(callLogs.createdAt, sevenDaysAgo),
            lt(callLogs.createdAt, now),
            sql`${callLogs.modelName} IS NOT NULL`
          )
        )
        .groupBy(callLogs.modelName)
        .orderBy(sql`sum(${callLogs.cost}::numeric) desc`)
        .limit(10); // 只分析使用最多的 10 个模型

      if (userUsage.length === 0) {
        return reply.send({
          code: 0,
          data: {
            hasOptimizations: false,
            optimizations: [],
            message: "暂无使用数据",
          },
          message: "ok",
        });
      }

      // 2. 获取所有可用模型及其价格
      const allModels = await db
        .select({
          modelId: models.id,
          modelName: models.name,
          modelDisplayName: models.displayName,
          modelType: models.type,
          modelStatus: models.status,
          vmId: vendorModels.id,
          vmStatus: vendorModels.status,
          sellPriceInput: vendorModels.sellPriceInput,
          sellPriceOutput: vendorModels.sellPriceOutput,
        })
        .from(models)
        .innerJoin(
          vendorModels,
          and(
            eq(vendorModels.modelId, models.id),
            eq(vendorModels.status, true)
          )
        )
        .where(eq(models.status, true));

      // 3. 构建模型价格映射（取最低价格）
      const modelPriceMap = new Map<string, {
        inputPrice: number;
        outputPrice: number;
        avgPrice: number; // 平均价格（用于比较）
      }>();

      for (const m of allModels) {
        const inputPrice = parseFloat(m.sellPriceInput || "0");
        const outputPrice = parseFloat(m.sellPriceOutput || "0");
        // 综合价格 = (input + output) / 2，单位：元/千 token
        const avgPrice = (inputPrice + outputPrice) / 2;

        const existing = modelPriceMap.get(m.modelName);
        if (!existing || avgPrice < existing.avgPrice) {
          modelPriceMap.set(m.modelName, {
            inputPrice,
            outputPrice,
            avgPrice,
          });
        }
      }

      // 4. 为每个用户使用的模型寻找替代方案
      const optimizations: ModelOptimization[] = [];

      for (const usage of userUsage) {
        const currentModel = usage.modelName;
        if (!currentModel) continue; // 模型名为空，跳过
        
        const currentPrice = modelPriceMap.get(currentModel);

        if (!currentPrice) continue; // 模型不在系统中，跳过

        // 寻找更便宜的替代模型
        const candidates: Array<{
          modelName: string;
          price: number;
          capabilityMatch: number;
        }> = [];

        for (const [modelName, price] of modelPriceMap.entries()) {
          if (modelName === currentModel) continue;
          if (price.avgPrice >= currentPrice.avgPrice) continue; // 只考虑更便宜的

          const capabilityMatch = calculateCapabilityMatch(currentModel, modelName);
          
          // 只推荐能力匹配度 >= 60% 的模型
          if (capabilityMatch >= 60) {
            candidates.push({
              modelName,
              price: price.avgPrice,
              capabilityMatch,
            });
          }
        }

        // 按性价比排序：价格 * (100 - 能力匹配度) 越小越好
        candidates.sort((a, b) => {
          const scoreA = a.price * (100 - a.capabilityMatch + 50);
          const scoreB = b.price * (100 - b.capabilityMatch + 50);
          return scoreA - scoreB;
        });

        // 取最佳推荐
        if (candidates.length > 0) {
          const best = candidates[0];
          const recommendedPrice = modelPriceMap.get(best.modelName)!;
          
          // 计算节省金额
          // 假设用户每月使用量 = 7天使用量 * 4.3
          const weeklyCost = parseFloat(usage.totalCost);
          const monthlyCost = weeklyCost * 4.3;
          
          // 节省比例 = (当前价格 - 推荐价格) / 当前价格
          const savingsPercent = ((currentPrice.avgPrice - best.price) / currentPrice.avgPrice) * 100;
          
          // 每月节省 = 月消费 * 节省比例
          const monthlySavings = monthlyCost * (savingsPercent / 100);

          // 只推荐有实际节省的（> 1 元/月）
          if (monthlySavings >= 1) {
            optimizations.push({
              currentModel: currentModel,
              recommendedModel: best.modelName,
              currentCost: currentPrice.avgPrice * 1000, // 转换为 元/百万 token
              recommendedCost: recommendedPrice.avgPrice * 1000,
              savings: Math.round(monthlySavings * 100) / 100,
              savingsPercent: Math.round(savingsPercent * 10) / 10,
              capabilityMatch: best.capabilityMatch,
              reason: generateRecommendationReason(
                currentModel,
                best.modelName,
                savingsPercent,
                best.capabilityMatch
              ),
              usageCount: usage.totalCalls,
              usageTokens: Number(usage.totalTokens),
            });
          }
        }
      }

      // 按节省金额排序
      optimizations.sort((a, b) => b.savings - a.savings);

      // 5. 返回结果
      reply.send({
        code: 0,
        data: {
          hasOptimizations: optimizations.length > 0,
          optimizations: optimizations.slice(0, 5), // 最多返回 5 个推荐
          totalSavings: optimizations.reduce((sum, o) => sum + o.savings, 0),
          analysisPeriod: "7d",
          message: optimizations.length > 0
            ? `发现 ${optimizations.length} 个优化建议，预计每月可节省 ¥${optimizations.reduce((sum, o) => sum + o.savings, 0).toFixed(2)}`
            : "您的模型选择已经很优化了",
        },
        message: "ok",
      });
    } catch (err: any) {
      reply.status(500).send({
        code: 1,
        message: `分析优化建议失败: ${err.message}`,
      });
    }
  });
}
