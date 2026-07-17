// ============================================================
//  3cloud (3C) — 额度预算管理服务 类型定义
// ============================================================

export interface QuotaInfo {
  quotaAmount: string;
  usedAmount: string;
  remaining: string;
  alertPercent: string;
  alertThreshold: string;
  isAlerting: boolean;
  isExceeded: boolean;
  periodStart: string;
  periodEnd: string;
  rpmLimit: number | null;
  tpmLimit: number | null;
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  quotaInfo?: QuotaInfo;
  status: "ok" | "alert" | "exceeded";
}
