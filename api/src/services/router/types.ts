// ============================================================
//  路由引擎 — 类型定义
// ============================================================

export type RoutingStrategy = "lowest_price" | "weighted_random" | "manual";

export interface RoutingOptions {
  modelName: string;           // 统一模型名（如 deepseek-v4-pro）
  userId: number;
  strategy?: RoutingStrategy;
  preferredVendorId?: number;  // manual 策略时指定
}

export interface VendorModelRoute {
  vendorModelId: number;
  vendorId: number;
  vendorName: string;
  modelId: number;
  upstreamModelName: string;
  apiEndpoint: string;
  apiKeyPlain: string;         // 已解密
  sellPriceInput: number;
  sellPriceOutput: number;
  weight: number;
  rpmLimit: number | null;
  tpmLimit: number | null;
  healthScore: number;
  isDown: boolean;
  // Key 分组
  keyGroupId: number | null;
  keyGroupItemId: number | null;
  // Key 级别售价（覆盖 vendorModel 售价）
  keySellPriceInput: number | null;
  keySellPriceOutput: number | null;
}

export interface ForwardResult {
  status: number;
  headers: Record<string, string>;
  body: any;                    // 非流式：JSON 对象
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
}

export interface StreamForwardResult {
  status: number;
  headers: Record<string, string>;
  /** 返回一个 TransformStream，外部可直接 pipe */
  stream: ReadableStream<Uint8Array>;
  /** 流结束后 resolve 的 usage 信息 */
  usagePromise: Promise<{ promptTokens: number; completionTokens: number; totalTokens: number } | null>;
}
