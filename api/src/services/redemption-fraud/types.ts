// ============================================================
//  3cloud (3C) — 兑换码风控引擎 类型定义
// ============================================================

export interface RedeemFraudResult {
  blocked: boolean;
  riskScore: number;
  reason?: string;
}
