// ============================================================
//  3cloud (3C) — 风险评分器
//  综合敏感词检测 + 异常模式检测，输出风险等级
// ============================================================

import type { SensitiveDetectionResult } from "./sensitive-detector.js";
import type { PatternDetectionResult } from "./pattern-detector.js";

export type RiskLevel = "normal" | "suspicious" | "high_risk";

export interface RiskScoreResult {
  riskLevel: RiskLevel;
  riskTags: string[];
  riskReason: string;
}

/**
 * 综合评估风险等级
 * 评分规则：
 * - 高优敏感词命中 → high_risk
 * - 敏感词命中 + 异常模式 → high_risk
 * - 仅敏感词命中（非高优）→ suspicious
 * - 仅异常模式 → suspicious
 * - 无命中 → normal
 */
export function assessRisk(
  sensitiveResult: SensitiveDetectionResult,
  patternResult: PatternDetectionResult,
): RiskScoreResult {
  const allTags: string[] = [];
  const reasons: string[] = [];

  // 收集标签
  if (sensitiveResult.hasSensitive) {
    allTags.push(...sensitiveResult.tags);
  }
  if (patternResult.isAnomaly) {
    allTags.push(...patternResult.tags);
  }

  // 去重
  const riskTags = Array.from(new Set(allTags));

  // 判断风险等级
  let riskLevel: RiskLevel = "normal";
  const reasonsList: string[] = [];

  if (sensitiveResult.highPriorityMatch) {
    riskLevel = "high_risk";
    reasonsList.push("高优先级敏感词命中");
  } else if (sensitiveResult.hasSensitive && patternResult.isAnomaly) {
    riskLevel = "high_risk";
    reasonsList.push("敏感词 + 异常模式组合");
  } else if (sensitiveResult.hasSensitive) {
    riskLevel = "suspicious";
    reasonsList.push("敏感词命中");
  } else if (patternResult.isAnomaly) {
    riskLevel = "suspicious";
    reasonsList.push("异常请求模式");
  }

  if (patternResult.reason) {
    reasonsList.push(patternResult.reason);
  }

  return {
    riskLevel,
    riskTags,
    riskReason: reasonsList.join("；"),
  };
}
