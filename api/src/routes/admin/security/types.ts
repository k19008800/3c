// ============================================================
//  3cloud (3C) — 安全风控管理 共享类型
// ============================================================

/** 安全配置项 */
export interface SecurityConfigItem {
  key: string;
  value: any;
  description: string | null;
  updatedAt: string | null;
}

/** IP 封禁 */
export interface IpBanItem {
  ip: string;
  banStart: number;
  remainingMs: number;
}

/** 用户封禁 */
export interface UserBanItem {
  userId: number;
  email: string | null;
  nickname: string | null;
  banStart: number;
  banDurationMs: number;
  remainingMs: number;
}

/** 安全配置变更历史 */
export interface ConfigHistoryItem {
  id: number;
  operatorId: number;
  description: string | null;
  before: any;
  after: any;
  ip: string;
  createdAt: string;
}

/** 仪表盘统计 */
export interface DashboardStats {
  unacknowledgedHighRisk: number;
  activeCircuits: number;
  bannedIps: number;
  bannedUsers: number;
  todayEventCount: number;
  weekEventCount: number;
}

/** 风险分布 */
export interface RiskDistribution {
  riskLevel: string;
  count: number;
}

/** 事件类型分布 */
export interface TypeDistribution {
  eventType: string;
  count: number;
}

/** 趋势 */
export interface TrendItem {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

/** 自动处置规则 */
export interface AutoRuleItem {
  id: number;
  name: string;
  description: string | null;
  eventType: string;
  countThreshold: number;
  timeWindowSeconds: number;
  action: string;
  actionParams: any;
  enabled: boolean;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

/** 电路熔断状态 */
export interface CircuitStatus {
  vendorModelId: number;
  state: string;
  failureCount: number;
  lastFailure: string | null;
}
