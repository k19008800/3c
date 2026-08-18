/**
 * 网关请求结构化日志 — 字段定义与统一输出（P3-2）
 *
 * 目标：每条网关请求日志携带可观测字段（requestId / model / supplier / keyId /
 * latencyMs / usage / cost / status），与 request_id 全链路（x-request-id 透传或
 * 服务端生成）对齐，支持按 requestId 串联慢查询日志、对话留痕与消费记录。
 *
 * 字段口径：
 *   - requestId：pipelineCtx.requestId = Idempotency-Key 头 || x-request-id 头 ||
 *     服务端生成 UUID（与 request.id 一致，见 app.ts requestIdHeader + genReqId）
 *   - supplier：渠道名（suppliers.name）；mock 回退为 null
 *   - keyId：使用的供应商 Key id（api_keys.id）
 *   - latencyMs：网关处理耗时（请求进入 handler 到 finally 输出日志）
 *   - usage：input/output/total tokens（失败请求无 usage 时省略）
 *   - cost：结算金额（元，字符串，与 consumption_records.cost 同精度）
 *   - status：success / failure / circuit_breaker / idempotency_hit
 *
 * 所有网关路由共用本文件的类型与输出函数，保证字段名单一来源，避免口径漂移。
 *
 * @see docs/iteration-plan-v2.md P3-2 链路追踪与结构化日志
 * @module lib/gateway-log
 */

import type { FastifyReply, FastifyRequest } from 'fastify';

// ============================================================
// 常量
// ============================================================

/** 网关请求结构化日志的 msg 标识（日志检索锚点） */
export const GATEWAY_REQUEST_LOG_MSG = 'gateway request';

/** 慢查询日志的 msg 标识 */
export const SLOW_REQUEST_LOG_MSG = 'slow request';

/** 慢查询阈值（ms）：onResponse 耗时超过该值的请求记为慢查询 */
export const SLOW_REQUEST_THRESHOLD_MS = 3000;

// ============================================================
// 类型
// ============================================================

/** 网关请求结果状态（P3-2 验收字段） */
export type GatewayRequestStatus = 'success' | 'failure' | 'circuit_breaker' | 'idempotency_hit';

/** token 用量（input / output / total） */
export interface GatewayUsage {
  input: number;
  output: number;
  total: number;
}

/** 网关请求结构化日志字段（路由层统一填充，finally 输出） */
export interface GatewayLogFields {
  /** 请求关联键（幂等键 || x-request-id || 生成 UUID） */
  requestId: string;
  /** 客户端请求的标准模型名（validate 前从 body 读取） */
  model?: string;
  /** 渠道名（suppliers.name）；mock 回退 / 未路由为 null */
  supplier?: string | null;
  /** 使用的供应商 Key id（api_keys.id） */
  keyId?: number | null;
  /** 网关处理耗时（ms） */
  latencyMs: number;
  /** token 用量；失败且无用量时省略 */
  usage?: GatewayUsage;
  /** 结算金额（元，字符串）；未结算为 null */
  cost?: string | null;
  /** 请求结果状态 */
  status: GatewayRequestStatus;
  /** 是否流式请求 */
  stream?: boolean;
  /** HTTP 状态码（失败分支补充） */
  statusCode?: number;
  /** 错误码 / 错误描述（失败分支补充） */
  error?: string;
}

/** 慢查询日志字段（app.ts onResponse 输出） */
export interface SlowRequestLogFields {
  requestId: string;
  method: string;
  url: string;
  statusCode: number;
  latencyMs: number;
  slowRequestThresholdMs: number;
}

/** pino 兼容 logger 的最小接口（Fastify request.log / app.log 均满足） */
export interface PinoLikeLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

// ============================================================
// 输出函数
// ============================================================

/**
 * 输出网关请求结构化日志（info 级）。
 *
 * @param log - pino logger（路由内传 request.log，字段自动携带 reqId）
 * @param fields - 结构化字段（见 GatewayLogFields）
 */
export function logGatewayRequest(log: PinoLikeLogger, fields: GatewayLogFields): void {
  log.info(fields as unknown as Record<string, unknown>, GATEWAY_REQUEST_LOG_MSG);
}

/**
 * 输出慢查询日志（warn 级）。
 *
 * @param log - pino logger
 * @param fields - 慢查询字段（路径 / 耗时 / requestId / 阈值）
 */
export function logSlowRequest(log: PinoLikeLogger, fields: SlowRequestLogFields): void {
  log.warn(fields as unknown as Record<string, unknown>, SLOW_REQUEST_LOG_MSG);
}

// ============================================================
// Fastify 请求生命周期 hook
// ============================================================

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * P3-2 请求级 requestId：x-request-id 透传或服务端生成。
     * 由 requestIdOnRequestHook 注入（= request.id），供路由幂等键回退 / 日志使用。
     */
    requestId?: string;
  }
}

/**
 * onRequest hook：生成 / 透传 x-request-id 并注入 request.requestId。
 *
 * request.id 已由 app.ts 的 requestIdHeader + genReqId 保证 =
 * x-request-id 头（有则透传）|| 服务端生成 UUID（无则生成），此处仅把
 * request.id 暴露为 request.requestId 并在响应头回写 x-request-id，
 * 保证客户端 → 请求日志 → 响应头同一把 requestId。
 *
 * ⚠️ 必须 async：Fastify 5.11.2 的 hookRunnerGenerator 对返回非 thenable
 * （同步函数）的 hook 不会自动 next()，请求会永久挂起（已踩坑复现）。
 *
 * @param request - Fastify 请求
 * @param reply - Fastify 响应
 */
export async function requestIdOnRequestHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  request.requestId = request.id;
  reply.header('x-request-id', request.id);
}

/**
 * onResponse hook：记录耗时超过阈值的慢查询（含路径 / 耗时 / requestId）。
 *
 * 阈值可用参数覆盖（默认 SLOW_REQUEST_THRESHOLD_MS = 3000），便于测试注入小阈值。
 *
 * @param opts - { thresholdMs } 慢查询阈值（ms），缺省用全局常量
 * @returns Fastify onResponse hook
 */
export function slowRequestOnResponseHook(opts?: { thresholdMs?: number }) {
  const thresholdMs = opts?.thresholdMs ?? SLOW_REQUEST_THRESHOLD_MS;
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const latencyMs = reply.elapsedTime;
    if (latencyMs <= thresholdMs) return;
    logSlowRequest(request.log, {
      requestId: request.requestId ?? request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      latencyMs: Math.round(latencyMs),
      slowRequestThresholdMs: thresholdMs,
    });
  };
}
