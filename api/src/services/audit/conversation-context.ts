/**
 * 对话上下文留痕采集服务
 *
 * 每笔 /v1/chat/completions 请求落一条完整上下文记录（含上文 messages、响应全文、
 * 实际路由模型、供应商 Key 指纹、账号、时间、状态），供管理员后台纠纷举证 / 政府调证。
 *
 * 设计约束（与主链路完全解耦）：
 *   - 只做旁路写入，不参与计费、不抛错
 *   - 写入失败仅 console.error，绝不阻断或改变请求结果
 *   - 与消费记录通过 requestId 一一对应，但失败 / 402 / 超时等无消费记录的请求同样留痕
 */
import { db, schema } from '../../db';
import crypto from 'crypto';

/** 供应商 Key 指纹：sha256 前缀（只存指纹，不存明文 Key） */
export function fingerprintKey(keyValue: string): string {
  return crypto.createHash('sha256').update(keyValue).digest('hex').slice(0, 32);
}

/** 客户端 API Key 指纹：与 api_keys.key_hash 同源（key_prefix + sha256 前缀） */
export function clientKeyFingerprint(keyValue: string): string {
  return crypto.createHash('sha256').update(keyValue).digest('hex').slice(0, 16);
}

export interface ConversationContextInput {
  requestId: string;
  userId: number;
  apiKeyId: number | null;
  clientKeyHash: string;
  requestedModel: string;
  routedModel?: string | null;
  supplierId?: number | null;
  supplierModelId?: number | null;
  supplierKeyFp?: string | null;
  messages: unknown[];
  responseText?: string | null;
  finishReason?: string | null;
  status: string;
  errorCode?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cost?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  occurredAt: Date;
  completedAt?: Date | null;
}

/**
 * 记录一笔对话上下文。只增不删、不做脱敏（全量原样存储）。
 * 失败不抛错 —— 采集是旁路，不得影响主链路。
 */
export async function recordConversationContext(input: ConversationContextInput): Promise<void> {
  try {
    await db.insert(schema.conversationContextRecords).values({
      requestId: input.requestId,
      userId: input.userId,
      apiKeyId: input.apiKeyId ?? null,
      clientKeyHash: input.clientKeyHash,
      requestedModel: input.requestedModel,
      routedModel: input.routedModel ?? null,
      supplierId: input.supplierId ?? null,
      supplierModelId: input.supplierModelId ?? null,
      supplierKeyFp: input.supplierKeyFp ?? null,
      messages: input.messages,
      responseText: input.responseText ?? null,
      finishReason: input.finishReason ?? null,
      status: input.status,
      errorCode: input.errorCode ?? null,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      cost: input.cost ?? null,
      clientIp: input.clientIp ?? null,
      userAgent: input.userAgent ?? null,
      occurredAt: input.occurredAt,
      completedAt: input.completedAt ?? null,
    });
  } catch (err) {
    // 采集失败不影响主链路：仅记录日志，不向上抛
    console.error(`[conversation-context] record failed for request ${input.requestId}:`, err);
  }
}
