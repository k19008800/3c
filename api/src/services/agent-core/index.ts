// ============================================================
//  3cloud (3C) — Agent 核心服务 (索引)
//  重新导出所有公共函数，保持外部 import 兼容
// ============================================================

export { getAgentDashboard } from "./dashboard.js";
export { getAgentClients, listAgentClientsForAdmin, bindAgentClient } from "./clients.js";
export { getAgentReferralCode } from "./referral.js";
export { getAgentById, listAllAgents, createAgent, updateAgent, deleteAgent } from "./admin.js";
export { getAgentIncomeTrend, getAgentIncomeStructure } from "./analytics.js";
