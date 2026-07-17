// ============================================================
//  3cloud (3C) — 代理佣金规则 CRUD
// ============================================================

import { eq, and } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  agents,
  commissionRules,
  auditLogs,
} from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";

// ══════════════════════════════════════════════
//  查询佣金规则
// ══════════════════════════════════════════════

export async function getAgentCommissionRules(agentId: number) {
  const db = getDb();
  return db
    .select()
    .from(commissionRules)
    .where(eq(commissionRules.agentId, agentId))
    .orderBy(commissionRules.ruleType);
}

// ══════════════════════════════════════════════
//  Upsert 佣金规则
// ══════════════════════════════════════════════

export async function upsertCommissionRule(
  agentId: number,
  data: {
    ruleType: string;
    rate?: string;
    isEnabled?: boolean;
    minTriggerAmount?: string;
    maxCap?: string;
    validFrom?: string;
    validUntil?: string;
    activityName?: string;
    activityType?: string;
    fixedAmount?: string;
    teamLevelLimit?: number;
  },
  operatorId: number,
) {
  const db = getDb();

  // 验证代理商存在
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) {
    throw new AppError("AGENT_NOT_FOUND", "代理商不存在", 404);
  }

  const now = new Date();

  // 构造更新数据（排除 undefined 字段）
  const upsertData: Record<string, any> = {
    agentId,
    ruleType: data.ruleType,
    updatedAt: now,
  };

  if (data.rate !== undefined) upsertData.rate = data.rate;
  if (data.isEnabled !== undefined) upsertData.isEnabled = data.isEnabled;
  if (data.minTriggerAmount !== undefined) upsertData.minTriggerAmount = data.minTriggerAmount;
  if (data.maxCap !== undefined) upsertData.maxCap = data.maxCap;
  if (data.validFrom !== undefined) upsertData.validFrom = new Date(data.validFrom);
  if (data.validUntil !== undefined) upsertData.validUntil = new Date(data.validUntil);
  if (data.activityName !== undefined) upsertData.activityName = data.activityName;
  if (data.activityType !== undefined) upsertData.activityType = data.activityType;
  if (data.fixedAmount !== undefined) upsertData.fixedAmount = data.fixedAmount;
  if (data.teamLevelLimit !== undefined) upsertData.teamLevelLimit = data.teamLevelLimit;

  const [existing] = await db
    .select({ id: commissionRules.id })
    .from(commissionRules)
    .where(and(
      eq(commissionRules.agentId, agentId),
      eq(commissionRules.ruleType, data.ruleType as any),
    ))
    .limit(1);

  if (existing) {
    // 更新已有规则
    await (db
      .update(commissionRules)
      .set(upsertData as any)
      .where(eq(commissionRules.id, existing.id)));

    await db.insert(auditLogs).values({
      operatorId,
      action: "agent_update",
      targetType: "commission_rules",
      targetId: existing.id,
      before: null,
      after: upsertData,
      ip: null,
      description: `更新代理商 #${agentId} 佣金规则: ${data.ruleType}`,
    });

    return { id: existing.id, ...upsertData };
  } else {
    // 新建规则
    const result = await db.transaction(async (tx) => {
      const [rule] = await tx
        .insert(commissionRules)
        .values({ ...upsertData, createdBy: operatorId } as any)
        .returning();

      await tx.insert(auditLogs).values({
        operatorId,
        action: "agent_create",
        targetType: "commission_rules",
        targetId: rule.id,
        before: null,
        after: upsertData,
        ip: null,
        description: `创建代理商 #${agentId} 佣金规则: ${data.ruleType}`,
      });

      return rule;
    });

    return result;
  }
}

// ══════════════════════════════════════════════
//  删除佣金规则
// ══════════════════════════════════════════════

export async function deleteCommissionRule(
  agentId: number,
  ruleId: number,
  operatorId: number,
) {
  const db = getDb();

  const [rule] = await db
    .select()
    .from(commissionRules)
    .where(and(
      eq(commissionRules.id, ruleId),
      eq(commissionRules.agentId, agentId),
    ))
    .limit(1);

  if (!rule) {
    throw new AppError("RULE_NOT_FOUND", "佣金规则不存在", 404);
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(commissionRules)
      .where(eq(commissionRules.id, ruleId));

    await tx.insert(auditLogs).values({
      operatorId,
      action: "agent_update",
      targetType: "commission_rules",
      targetId: ruleId,
      before: { ruleType: rule.ruleType, rate: rule.rate },
      after: null,
      ip: null,
      description: `删除代理商 #${agentId} 佣金规则: ${rule.ruleType}`,
    });
  });
}
