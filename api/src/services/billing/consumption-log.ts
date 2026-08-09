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
  metadata?: Record<string, unknown>;
}

/**
 * Record a consumption event
 */
export async function recordConsumption(input: ConsumptionInput) {
  const [record] = await db.insert(schema.consumptionRecords).values({
    userId: input.userId,
    apiKeyId: input.apiKeyId,
    requestId: crypto.randomUUID(),
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
