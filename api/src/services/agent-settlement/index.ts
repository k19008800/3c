// ============================================================
//  3cloud (3C) — Agent 服务层
//  代理商面板 / 客户管理 / 佣金 / 提现 / 管理后台
//  Version: V3.5 — 增强双审财务体系
// ============================================================

export type { AgentIntegrityParams } from "./types.js";
export { getSystemConfig } from "./system-config.js";
export { settleCommissions, batchSettleCommissions, settleCommissionsByFilters, batchCancelCommissions } from "./settlements.js";
export {
  getSettlementConfig, updateSettlementConfig, settleAgentManually,
  getSettlementHistory, autoSettleDueAgents, getAgentIntegrity,
} from "./admin.js";
