/**
 * 消费记录服务 — 记录每次 API 调用的 token 消费
 */

import { db, schema } from '../../db/index.js';
import { sql } from 'drizzle-orm';
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
  /** 缓存命中（读取）token 数（上游返回缓存字段时才有值）；表无对应列则跳过写入 */
  cacheHitTokens?: number;
  /** 缓存命中折扣金额（全价 − 折后价，可为负 = 缓存写入溢价，product Q3 裁定）；表无对应列则跳过写入 */
  cacheDiscount?: number;
  /** 缓存写入 token 数（Anthropic cache_creation；P0 显式价，D-8） */
  cacheWriteTokens?: number;
  /** 缓存读取计费金额（¥） */
  cacheHitCost?: number;
  /** 缓存写入计费金额（¥） */
  cacheWriteCost?: number;
  /** 本次调用实际采用的缓存读取单价快照（¥/1K，D-8 定价快照列） */
  cacheReadInputPrice?: number;
  /** 本次调用实际采用的缓存写入单价快照（¥/1K） */
  cacheWriteInputPrice?: number;
  /** 写入价来源标识（D-4）：explicit / full_price（合并进 metadata，P2 透出） */
  cacheWritePriceSource?: 'explicit' | 'full_price';
}

/**
 * 缓存审计/快照列是否已存在于 consumption_records 表。
 *
 * ⚠️ R-B7 注释修正：0005 已加 cache_hit_tokens/cache_discount，0031 已加
 * cache_write_tokens/cache_hit_cost/cache_write_cost/cache_read_input_price/cache_write_input_price
 * （本地库已迁移，本检查为 true，代码确实写入）。保留运行时检查仅作防御
 * （未迁移的库缺列时静默跳过，不报错、不改表结构），注释不再声称"当前表结构没有"。
 */
const HAS_CACHE_COLUMNS =
  'cacheHitTokens' in schema.consumptionRecords || 'cacheDiscount' in schema.consumptionRecords;

/**
 * Record a consumption event
 */
export async function recordConsumption(input: ConsumptionInput) {
  // D-4：写入价来源标识合并进 metadata（P2 前端透出用；不占用独立列）
  const metadata = {
    ...(input.metadata ?? {}),
    ...(input.cacheWritePriceSource ? { cache_write_price_source: input.cacheWritePriceSource } : {}),
  };

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
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
    // 缓存审计/快照列：迁移 0005/0031 已落地（HAS_CACHE_COLUMNS=true），
    // 运行时检查仅防御未迁移库；numeric 列写入前转字符串
    ...(HAS_CACHE_COLUMNS
      ? {
          cacheHitTokens: input.cacheHitTokens ?? 0,
          cacheDiscount: input.cacheDiscount == null ? null : String(input.cacheDiscount),
          cacheWriteTokens: input.cacheWriteTokens ?? null,
          cacheHitCost: input.cacheHitCost == null ? null : String(input.cacheHitCost),
          cacheWriteCost: input.cacheWriteCost == null ? null : String(input.cacheWriteCost),
          cacheReadInputPrice: input.cacheReadInputPrice == null ? null : String(input.cacheReadInputPrice),
          cacheWriteInputPrice: input.cacheWriteInputPrice == null ? null : String(input.cacheWriteInputPrice),
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
