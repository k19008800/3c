/**
 * Pipeline 执行器类型定义（§1.1）
 * 带回滚的 Pipeline 骨架，为所有网关逻辑提供执行框架。
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import type { ForwardResult } from "../../services/upstream";

/** 请求/响应上下文，在 step 间传递 */
export interface PipelineContext {
  /** 任意 payload，由各 step 读写 */
  [key: string]: unknown;
}

/**
 * API 网关请求上下文 — 贯穿整个 Pipeline 生命周期
 *
 * 各 step 通过类型化字段读写请求状态：
 * - auth step 填充 userId/apiKeyId
 * - pricing step 填充 inputPrice/outputPrice/priceSource
 * - pre-consume step 填充 estimatedCost/balanceReserved
 * - routing step 填充 vendorId/vendorModelId/upstreamModel/vendorApiKey/vendorBaseUrl
 * - proxy step 填充 upstreamResponse
 * - settle step 填充 actualCost/balanceBefore/balanceAfter
 *
 * @see pipeline/steps/* 各 step 实现
 */
export interface GatewayContext extends PipelineContext {
  /** Fastify 请求对象 */
  req: FastifyRequest;
  /** Fastify 响应对象 */
  reply: FastifyReply;
  /** 解析后的请求体 */
  body: Record<string, unknown>;

  // ── 鉴权 ──
  /** 认证后的用户 ID（auth step 填充） */
  userId?: number;
  /** 认证后的 API Key ID（auth step 填充） */
  apiKeyId?: number;

  // ── 模型 ──
  /** 模型 ID（从 DB 解析，routes/proxy.ts 填充） */
  modelId?: number;
  /** 模型名称 */
  modelName?: string;

  // ── 路由 ──
  /** 选中的供应商 ID（routing step 填充） */
  vendorId?: number;
  /** 选中的供应商名称（routing step 填充） */
  vendorName?: string;
  /** 选中的供应商模型 ID（routing step 填充） */
  vendorModelId?: number;
  /** 上游模型名（routing step 填充） */
  upstreamModel?: string;
  /** 供应商 API Key（routing step 填充） */
  vendorApiKey?: string;
  /** 供应商基础 URL（routing step 填充） */
  vendorBaseUrl?: string;

  // ── 定价 ──
  /** 输入价格 元/1K tokens（pricing step 填充） */
  inputPrice?: number;
  /** 输出价格 元/1K tokens（pricing step 填充） */
  outputPrice?: number;
  /** 价格来源（pricing step 填充） */
  priceSource?: string;

  // ── 计费 ──
  /** 预估费用 元（pre-consume step 填充） */
  estimatedCost?: number;
  /** 实际费用 元（settle step 填充） */
  actualCost?: number;
  /** 是否已预扣（pre-consume step 填充） */
  balanceReserved?: boolean;
  /** 计费前余额 分（settle step 填充） */
  balanceBefore?: number;
  /** 计费后余额 分（settle step 填充） */
  balanceAfter?: number;

  // ── 上游响应 ──
  /** 上游转发结果（proxy step 填充） */
  upstreamResponse?: ForwardResult;
  /** 最终返回给客户端的数据（proxy step 或 idempotency step 填充） */
  upstreamData?: Record<string, unknown>;

  // ── 内部控制标记 ──
  /** 幂等命中标记（idempotency step 设置） */
  _idempotencyHit?: boolean;
  /** 幂等缓存 key（idempotency step 设置，用于回滚清理） */
  _idempotencyCacheKey?: string;
}

/**
 * 幂等命中错误 — 用于提前终止 Pipeline 但不标记为失败
 *
 * 在 idempotency step 中，若 Redis 命中缓存，抛出此错误。
 * 路由 handler 通过 ctx._idempotencyHit 判断是否返回缓存结果。
 *
 * @see pipeline/steps/idempotency.ts
 */
export class IdempotencyHitError extends Error {
  constructor() {
    super("IDEMPOTENCY_HIT");
    this.name = "IdempotencyHitError";
  }
}

/** 单个 Pipeline 步骤 */
export interface PipelineStep<T extends PipelineContext = PipelineContext> {
  /** 步骤名（用于日志/调试） */
  name: string;
  /** 执行函数，抛异常视为失败 */
  execute: (ctx: T) => Promise<void>;
  /** 回滚函数（可选），在后续 step 失败时按逆序调用 */
  rollback?: (ctx: T) => Promise<void>;
  /** 标记此 step 失败时不触发前置步骤回滚（如纯校验类 step） */
  noRollbackOn?: boolean;
}

/** Pipeline 执行结果 */
export interface PipelineResult {
  /** 执行成功 */
  ok: boolean;
  /** 失败的 step 名 */
  failedStep?: string;
  /** 原始错误 */
  error?: Error;
  /** 回滚中抛出的二级错误 */
  rollbackErrors?: Error[];
}
