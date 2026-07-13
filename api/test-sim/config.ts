// ============================================================
//  3cloud 仿真测试 — 配置
// ============================================================

export const CONFIG = {
  // API 地址
  apiBase: process.env.API_BASE || "http://localhost:3000",

  // 管理员账号
  admin: {
    email: "admin@3cloud.dev",
    password: "admin123",
  },

  // 财务 & 审计账号
  finance: {
    email: "finance@3c.local",
    password: "admin123",
  },
  auditor: {
    email: "auditor@3c.local",
    password: "admin123",
  },
  ops: {
    email: "ops@3c.local",
    password: "admin123",
  },

  // 用户规模
  personalUsers: 15,
  enterpriseUsers: 15,
  totalUsers: 30,

  // 代理商
  agents: [
    { name: "顶级代理 A", email: "agent_a@test.local" },
    { name: "二级代理 B1", email: "agent_b1@test.local", parentIdx: 0 },
    { name: "二级代理 B2", email: "agent_b2@test.local", parentIdx: 0 },
    { name: "二级代理 B3", email: "agent_b3@test.local", parentIdx: 0 },
  ],
  agentCommissionRules: {
    sale: 0.10,
    renewal: 0.05,
    team: 0.02,
  },
  agentClientsPerAgent: [4, 3, 3, 2], // A=4, B1=3, B2=3, B3=2 = 12 clients

  // Token 调用
  totalCallLogs: 100_000,
  callDays: 60,

  // 充值
  onlineRechargeCount: 15,
  bankTransferCount: 8,
  rejectBankTransferCount: 2,

  // 提现
  withdraws: [
    { agentIdx: 0, amount: 1000 },
    { agentIdx: 0, amount: 5000 },
    { agentIdx: 1, amount: 300, reject: true },
    { agentIdx: 2, amount: 800 },
  ],

  // 模型定价（sellPrice per 1000 tokens）
  modelPricing: {
    "gpt-4o":              { inputPrice: 0.03,   outputPrice: 0.12 },
    "gpt-4o-mini":         { inputPrice: 0.01,   outputPrice: 0.04 },
    "claude-3.5-sonnet":   { inputPrice: 0.02,   outputPrice: 0.08 },
    "deepseek-chat":       { inputPrice: 0.005,  outputPrice: 0.02 },
    "deepseek-v4-flash":   { inputPrice: 0.002,  outputPrice: 0.008 },
    "deepseek-v4-pro":     { inputPrice: 0.01,   outputPrice: 0.04 },
    "text-embedding-3-small": { inputPrice: 0.001, outputPrice: 0.001 },
    "text-embedding-3-large": { inputPrice: 0.002, outputPrice: 0.002 },
  },
};

// 用于生成用户的邮箱列表
export function userEmail(idx: number, type: "personal" | "enterprise"): string {
  const prefix = type === "personal" ? "user" : "company";
  return `${prefix}${String(idx).padStart(2, "0")}@test.local`;
}
