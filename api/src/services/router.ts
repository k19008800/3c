// ============================================================
//  3cloud (3C) — Token 代理路由引擎
//  智能路由：自动最低价 / 加权动态 / 手动指定
//  故障切换 + 多 Key 分摊
//  占位 — 后续开发实现
// ============================================================

import { FastifyRequest } from "fastify";

export type RoutingStrategy = "lowest_price" | "weighted_random" | "manual";

export interface RoutingOptions {
  modelName: string;
  userId: number;
  strategy?: RoutingStrategy;
  preferredVendorId?: number;
}

export interface VendorModelRoute {
  vendorModelId: number;
  vendorId: number;
  vendorName: string;
  modelId: number;
  upstreamModelName: string;
  apiEndpoint: string;
  apiKey: string;
  sellPriceInput: number;
  sellPriceOutput: number;
  weight: number;
}

/**
 * 选择最佳厂商-模型路由
 * 策略：
 * - lowest_price: 选最低价
 * - weighted_random: 按 weight 加权随机
 * - manual: 指定厂商
 */
export async function selectRoute(options: RoutingOptions): Promise<VendorModelRoute> {
  // TODO: 实现路由选择
  // 1. 查询 modelId 下所有可用 vendor_models
  // 2. 过滤 isDown=false
  // 3. 按策略选择
  // 4. 解密 API Key
  throw new Error("Not implemented");
}

/**
 * 转发请求到上游厂商
 */
export async function forwardRequest(
  route: VendorModelRoute,
  request: FastifyRequest
) {
  // TODO: 实现请求转发
  // 1. 替换 model 名为 upstreamModelName
  // 2. 替换 Authorization header 为厂商 API Key
  // 3. 转发 HTTP 请求
  throw new Error("Not implemented");
}
