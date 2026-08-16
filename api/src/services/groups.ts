/**
 * 用户分组服务 — Group 查询与生效配置解析
 *
 * 职责：
 * - getUserGroup：解析用户归属分组（绑定优先，未绑定回退默认组），Redis 缓存 300s
 * - getEffectiveQuotas：计算用户生效的限流 / 额度 / 白名单 / 定价组
 * - isModelAllowedForUser：模型白名单校验（空白名单 = 放行）
 * - ensureDefaultGroup：启动时确保 default 组存在（幂等）
 *
 * 缓存键：user_group:{userId}，TTL 300s；分组变更时由路由层调用 cacheDel 清除。
 * NOTE: 默认组切换后，未绑定用户的历史缓存最长 300s 内过期，可接受。
 *
 * @module services/groups
 * @see newapi-gap-analysis.md Batch 2 任务 2.3
 */

import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { cacheGet, cacheSet } from '../lib/redis';

export const USER_GROUP_CACHE_TTL = 300;
export const USER_GROUP_CACHE_PREFIX = 'user_group:';

/** 用户生效的分组配额配置（未绑组且无默认组时全为 null/空，表示不限制） */
export interface EffectiveQuotas {
  qps: number | null;
  tpm: number | null;
  dailyQuota: number | null;
  modelWhitelist: string[];
  pricingGroup: string | null;
}

/** 分组 DTO（对外返回；numeric 金额统一转 number，白名单保证为数组） */
export interface GroupDTO {
  id: number;
  name: string;
  description: string | null;
  pricingGroup: string | null;
  rateLimitQps: number | null;
  rateLimitTpm: number | null;
  dailyQuota: number | null;
  modelWhitelist: string[];
  isDefault: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/** 分组缓存键 */
export function groupCacheKey(userId: number): string {
  return `${USER_GROUP_CACHE_PREFIX}${userId}`;
}

/** 查询分组行所需字段（与返回 DTO 一致） */
const groupSelect = {
  id: schema.userGroups.id,
  name: schema.userGroups.name,
  description: schema.userGroups.description,
  pricingGroup: schema.userGroups.pricingGroup,
  rateLimitQps: schema.userGroups.rateLimitQps,
  rateLimitTpm: schema.userGroups.rateLimitTpm,
  dailyQuota: schema.userGroups.dailyQuota,
  modelWhitelist: schema.userGroups.modelWhitelist,
  isDefault: schema.userGroups.isDefault,
  status: schema.userGroups.status,
  createdAt: schema.userGroups.createdAt,
  updatedAt: schema.userGroups.updatedAt,
};

/** 分组行（db.select(groupSelect) 的结果类型） */
interface GroupRow {
  id: number;
  name: string;
  description: string | null;
  pricingGroup: string | null;
  rateLimitQps: number | null;
  rateLimitTpm: number | null;
  dailyQuota: string | null;
  modelWhitelist: string[] | null;
  isDefault: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/** 归一化：numeric 字符串 → number，白名单保证为数组 */
function toGroupDTO(row: GroupRow): GroupDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    pricingGroup: row.pricingGroup,
    rateLimitQps: row.rateLimitQps,
    rateLimitTpm: row.rateLimitTpm,
    dailyQuota: row.dailyQuota != null ? Number(row.dailyQuota) : null,
    modelWhitelist: Array.isArray(row.modelWhitelist) ? row.modelWhitelist : [],
    isDefault: row.isDefault,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 解析用户归属分组。
 *
 * 查询顺序：memberships 绑定 → 命中返回该组；未绑定 → 按 isDefault 查默认组；
 * 仍无 → 返回 null。结果缓存 300s（key: user_group:{userId}）。
 *
 * @param userId - 用户 ID
 * @returns 分组 DTO；无任何可用分组时为 null
 */
export async function getUserGroup(userId: number): Promise<GroupDTO | null> {
  const cacheKey = groupCacheKey(userId);

  // 1. Redis 缓存命中（损坏 JSON 视为未命中，走 DB 重查）
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as GroupDTO;
    } catch {
      /* 缓存损坏 → 忽略，走 DB */
    }
  }

  // 2. 查绑定关系
  const [membership] = await db
    .select({ groupId: schema.userGroupMemberships.groupId })
    .from(schema.userGroupMemberships)
    .where(eq(schema.userGroupMemberships.userId, userId))
    .limit(1);

  // 3. 未绑定 → 回退默认组
  let groupId: number | null = membership?.groupId ?? null;
  if (groupId == null) {
    const [defaultGroup] = await db
      .select({ id: schema.userGroups.id })
      .from(schema.userGroups)
      .where(eq(schema.userGroups.isDefault, true))
      .limit(1);
    groupId = defaultGroup?.id ?? null;
  }
  if (groupId == null) return null;

  // 4. 取分组行
  const [group] = await db
    .select(groupSelect)
    .from(schema.userGroups)
    .where(eq(schema.userGroups.id, groupId))
    .limit(1);
  if (!group) return null;

  const dto = toGroupDTO(group);
  await cacheSet(cacheKey, JSON.stringify(dto), USER_GROUP_CACHE_TTL);
  return dto;
}

/**
 * 计算用户生效的限流 / 额度 / 模型白名单 / 定价组配置。
 *
 * 未绑组且无默认组 → 全 null/空，表示不限制。
 *
 * @param userId - 用户 ID
 * @returns 生效配置
 */
export async function getEffectiveQuotas(userId: number): Promise<EffectiveQuotas> {
  const group = await getUserGroup(userId);
  if (!group) {
    return { qps: null, tpm: null, dailyQuota: null, modelWhitelist: [], pricingGroup: null };
  }
  return {
    qps: group.rateLimitQps ?? null,
    tpm: group.rateLimitTpm ?? null,
    dailyQuota: group.dailyQuota != null ? Number(group.dailyQuota) : null,
    modelWhitelist: Array.isArray(group.modelWhitelist) ? group.modelWhitelist : [],
    pricingGroup: group.pricingGroup ?? null,
  };
}

/**
 * 检查用户是否被允许使用指定模型（平台模型名）。
 *
 * 规则：无分组或白名单为空 → 放行；非空 → 仅白名单内放行。
 *
 * @param userId - 用户 ID
 * @param model - 平台模型名
 * @returns true = 允许
 */
export async function isModelAllowedForUser(userId: number, model: string): Promise<boolean> {
  const group = await getUserGroup(userId);
  if (!group) return true;
  const whitelist = Array.isArray(group.modelWhitelist) ? group.modelWhitelist : [];
  if (whitelist.length === 0) return true;
  return whitelist.includes(model);
}

/**
 * 确保 default 分组存在（幂等，可重复调用）。
 *
 * 启动时调用；name 唯一约束 + onConflictDoNothing 兜底并发竞态。
 */
export async function ensureDefaultGroup(): Promise<void> {
  const [existing] = await db
    .select({ id: schema.userGroups.id })
    .from(schema.userGroups)
    .where(eq(schema.userGroups.name, 'default'))
    .limit(1);
  if (existing) return;

  await db
    .insert(schema.userGroups)
    .values({
      name: 'default',
      description: '默认分组（新注册用户自动归属）',
      pricingGroup: 'default',
      modelWhitelist: [],
      isDefault: true,
      status: 'active',
    })
    .onConflictDoNothing();
}
