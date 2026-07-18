// ============================================================
//  3cloud (3C) — Commission Rules Zod Schemas
// ============================================================

import { z } from "zod";

export const commissionRuleTypeEnum = z.enum(["sale", "renewal", "team", "activity"]);
export const commissionActivityTypeEnum = z.enum([
  "register_bonus",
  "first_recharge",
  "invite_bonus",
  "consumption_milestone",
]).optional();

export const upsertCommissionRuleSchema = z.object({
  ruleType: commissionRuleTypeEnum,
  rate: z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
  isEnabled: z.boolean().optional(),
  minTriggerAmount: z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
  maxCap: z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  // 活动专有
  activityName: z.string().max(255).optional(),
  activityType: commissionActivityTypeEnum,
  fixedAmount: z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
  // 团队专有
  teamLevelLimit: z.coerce.number().int().min(1).max(10).optional(),
});
export type UpsertCommissionRuleInput = z.infer<typeof upsertCommissionRuleSchema>;

export const setAgentParentSchema = z.object({
  parentAgentId: z.number().int().positive().nullable(),
});
export type SetAgentParentInput = z.infer<typeof setAgentParentSchema>;
