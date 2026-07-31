import { eq } from "drizzle-orm";
import { db, pool } from "../db/index";
import { billingLogs } from "../db/schema/billing";
import { callLogs } from "../db/schema/call-logs";
import { vendorModels } from "../db/schema/vendor-models";

/**
 * 计费 service（§5.2）
 * 实时计费：预扣 → 实际计费 → 多退少补
 */

// ===== 定价查询 =====

/**
 * 获取模型标准售价（L1 = 成本价 × (1 + 全局加价率)）
 * 简化实现：默认加价率 50%。Phase 1 扩展 L2-L5（模型覆盖价/代理折扣/分组/活动）
 * @returns { inputPrice, outputPrice } 元/1K tokens
 */
export async function getEffectivePrice(modelId: number, vendorModelId?: number): Promise<{ inputPrice: number; outputPrice: number; priceSource: string }> {
  // 取模型的标准售价：优先用供应商映射的成本价×1.5（作为 L1 默认）
  let costInput = 0;
  let costOutput = 0;
  if (vendorModelId) {
    const vm = await db.select().from(vendorModels).where(eq(vendorModels.id, vendorModelId)).limit(1);
    costInput = Number(vm[0]?.costInputPrice ?? 0);
    costOutput = Number(vm[0]?.costOutputPrice ?? 0);
  } else {
    // 无指定映射时取该模型成本最高的可用映射（保守定价）
    const vms = await db.select().from(vendorModels).where(eq(vendorModels.modelId, modelId)).limit(1);
    costInput = Number(vms[0]?.costInputPrice ?? 0);
    costOutput = Number(vms[0]?.costOutputPrice ?? 0);
  }

  // 简化：全局加价率固定 50%（Phase 1 从 site_configs 读取）
  const markup = 1.5;
  return {
    inputPrice: round4(costInput * markup),
    outputPrice: round4(costOutput * markup),
    priceSource: "model_price",
  };
}

/** 精度工具：保留 4 位（最小计费单位 0.0001 元） */
export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** 计算费用 */
export function calcCost(inputTokens: number, outputTokens: number, inputPrice: number, outputPrice: number): number {
  return round4((inputTokens / 1000) * inputPrice + (outputTokens / 1000) * outputPrice);
}

// ===== 余额操作（原子）=====

/**
 * 预扣余额（扣减指定金额，用行级锁保证原子性）
 * @returns 成功或错误
 */
export async function reserveBalance(
  userId: number,
  amount: number, // 元
  _reason: string,
): Promise<{ ok: boolean; balanceAfter?: number; error?: string }> {
  if (amount <= 0) return { ok: true, balanceAfter: 0 };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // 行级锁读取用户余额（分）
    const amountCents = Math.ceil(amount * 100);
    const res = await client.query(
      "SELECT id, balance FROM users WHERE id = $1 FOR UPDATE",
      [userId],
    );
    const row = res.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { ok: false, error: "user_not_found" };
    }
    const balance = Number(row.balance);
    if (balance < amountCents) {
      await client.query("ROLLBACK");
      return { ok: false, error: "insufficient_balance", balanceAfter: balance };
    }
    const newBalance = balance - amountCents;
    await client.query("UPDATE users SET balance = $2, updated_at = now() WHERE id = $1", [userId, newBalance]);
    await client.query("COMMIT");
    return { ok: true, balanceAfter: newBalance };
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return { ok: false, error: "db_error" };
  } finally {
    client.release();
  }
}

/**
 * 退还余额（多退少补的"退"）
 */
export async function refundBalance(userId: number, amount: number): Promise<boolean> {
  if (amount <= 0) return true;
  const amountCents = Math.floor(amount * 100);
  try {
    await pool.query("UPDATE users SET balance = balance + $2, updated_at = now() WHERE id = $1", [
      userId,
      amountCents,
    ]);
    return true;
  } catch {
    return false;
  }
}

// ===== 记录计费 =====

/**
 * 记录一次性计费日志（预扣后实际结算）
 * 返回 { estimatedCost, actualCost, refundAmount, balanceBefore, balanceAfter }
 */
export async function recordBilling(params: {
  userId: number;
  callLogId: number;
  priceSource: string;
  inputPrice: number;
  outputPrice: number;
  inputTokens: number;
  outputTokens: number;
  balanceBefore: number; // 分
  balanceAfter: number; // 分
}): Promise<{ id: number; actualCost: number }> {
  const { userId, callLogId, priceSource, inputPrice, outputPrice, inputTokens, outputTokens, balanceBefore, balanceAfter } = params;
  const actualCost = calcCost(inputTokens, outputTokens, inputPrice, outputPrice);

  const id = Number(Date.now()); // 分区表用时间戳生成 id
  await db.insert(billingLogs).values({
    id,
    userId,
    callLogId,
    priceSource,
    inputPrice: String(inputPrice),
    outputPrice: String(outputPrice),
    estimatedCost: String(actualCost),
    actualCost: String(actualCost),
    refundAmount: "0",
    balanceBefore,
    balanceAfter,
    status: "settled",
  });

  return { id, actualCost };
}

// ===== 调用日志 =====

/**
 * 记录调用日志（分区表）
 */
export async function recordCallLog(params: {
  id: number;
  userId: number;
  apiKeyId?: number;
  modelId?: number;
  vendorId?: number;
  requestId?: string;
  provider?: string;
  upstreamModel?: string;
  requestTokens?: number;
  responseTokens?: number;
  costCents?: number;
  status?: string;
  errorCode?: string;
  latencyMs?: number;
  fallbackUsed?: boolean;
  createdAt?: Date;
}): Promise<void> {
  await db.insert(callLogs).values({
    id: params.id,
    userId: params.userId,
    apiKeyId: params.apiKeyId,
    modelId: params.modelId,
    vendorId: params.vendorId,
    requestId: params.requestId,
    provider: params.provider,
    upstreamModel: params.upstreamModel,
    requestTokens: params.requestTokens ?? 0,
    responseTokens: params.responseTokens ?? 0,
    totalTokens: (params.requestTokens ?? 0) + (params.responseTokens ?? 0),
    costCents: params.costCents ?? 0,
    status: params.status ?? "success",
    errorCode: params.errorCode,
    latencyMs: params.latencyMs,
    fallbackUsed: params.fallbackUsed ? "true" : "false",
  });
}
