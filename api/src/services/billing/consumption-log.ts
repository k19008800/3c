/**
 * 消费记录服务 — 记录每次 API 调用的 token 消费
 */

import { db, schema } from '../../db';
import { eq, sql } from 'drizzle-orm';
import crypto from 'crypto';

interface ConsumptionInput {
  userId: number;
  apiKeyId: number;
  model: string;
  supplierId?: number;
  supplierModelId?: number;
  inputTokens: number;
  outputTokens: number;
  cost: string;
  trustUpstream: boolean;
  fallback: boolean;
  streamed: boolean;
  finishReason?: string;
  errorCode?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
  /** 缓存命中 token 数（上游返回缓存字段时才有值）；表无对应列则跳过写入 */
  cacheHitTokens?: number;
  /** 缓存命中折扣金额（全价 - 折后价，≥ 0）；表无对应列则跳过写入 */
  cacheDiscount?: number;
}

/**
 * 缓存打折列是否已存在于 consumption_records 表。
 *
 * 当前表结构没有 cache_hit_tokens / cache_discount 列 → false，调用方传入时静默跳过写入
 * （不报错、不改表结构，缓存打折只影响内存中的 cost 计算）。
 * 后续迁移新增这两列后此常量自动变为 true，无需改动调用方与函数体逻辑。
 */
const HAS_CACHE_COLUMNS =
  'cacheHitTokens' in schema.consumptionRecords || 'cacheDiscount' in schema.consumptionRecords;

/**
 * Record a consumption event
 */
export async function recordConsumption(input: ConsumptionInput) {
  const [record] = await db.insert(schema.consumptionRecords).values({
    userId: input.userId,
    apiKeyId: input.apiKeyId,
    requestId: input.requestId || crypto.randomUUID(),
    model: input.model,
    supplierId: input.supplierId || null,
    supplierModelId: input.supplierModelId || null,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    totalTokens: input.inputTokens + input.outputTokens,
    cost: input.cost,
    trustUpstream: input.trustUpstream,
    fallback: input.fallback,
    streamed: input.streamed,
    finishReason: input.finishReason || null,
    errorCode: input.errorCode || null,
    metadata: input.metadata || null,
    // 表有 cache 打折列时才写入；当前表结构无此列 → 展开为空对象，等价于不写入
    // cacheDiscount 为 numeric(18,8) 列（drizzle 类型 string），写入前转字符串
    ...(HAS_CACHE_COLUMNS
      ? {
          cacheHitTokens: input.cacheHitTokens ?? 0,
          cacheDiscount: input.cacheDiscount == null ? null : String(input.cacheDiscount),
        }
      : {}),
  }).returning();

  return record;
}

/**
 * Get consumption stats for a user
 */
export async function getUserConsumptionStats(userId: number, days = 30) {
  const result = await db.execute(sql`
    SELECT 
      COUNT(*) AS "totalCalls",
      COALESCE(SUM(total_tokens), 0) AS "totalTokens",
      COALESCE(SUM(cost), 0) AS "totalCost",
      COUNT(DISTINCT model) AS "modelCount",
      COUNT(DISTINCT DATE(created_at)) AS "activeDays"
    FROM consumption_records
    WHERE user_id = ${userId}
      AND created_at >= NOW() - (${days} || ' days')::INTERVAL
  `);

  const row = (result[0] as unknown) as {
    totalCalls: string;
    totalTokens: string;
    totalCost: string;
    modelCount: string;
    activeDays: string;
  };

  return {
    totalCalls: parseInt(row.totalCalls),
    totalTokens: parseInt(row.totalTokens),
    totalCost: row.totalCost,
    modelCount: parseInt(row.modelCount),
    activeDays: parseInt(row.activeDays),
  };
}
