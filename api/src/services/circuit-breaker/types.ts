// ============================================================
//  3cloud (3C) — 通道熔断器 V2 类型定义
// ============================================================

export type CircuitStateV2 = "closed" | "degraded" | "half_open" | "dead";

export interface CircuitStatusV2 {
  vendorModelId: number;
  vendorId: number;
  vendorName: string;
  modelName: string;
  upstreamModelName: string;
  circuitState: CircuitStateV2;
  circuitOpenedAt: string | null;
  circuitRetryAfter: string | null;
  circuitFailCount: number;
  weight: number;
  isDown: boolean;
  failuresInWindow: number;
}
