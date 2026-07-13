// ============================================================
//  3cloud (3C) — 8小时压力测试状态管理
// ============================================================

import fs from "node:fs";

// ── 测试状态定义 ──

export interface TestUser {
  userId: number;
  email: string;
  userType: "personal" | "enterprise";
  role: string;
  realNameStatus: string;
  accessToken: string;
  apiKey: string;  // 原始 API Key 值
  apiKeyId: number;

  // 阶段跟踪
  rechargeOrderNo?: string;
  rechargeAmount?: number;
  recharged: boolean;
  realNameResolved: boolean; // 调用前实名问题已处理

  // Token 调用窗口
  callWindowStart?: number;  // 测试开始后的毫秒偏移
  callWindowEnd?: number;
}

export interface TestAgent {
  agentId: number;
  userId: number;
  email: string;
  role: "agent";
  accessToken: string;
  parentAgentId?: number | null;
  clients: number[]; // 名下客户 userId 列表
  commissionChecked: boolean;
  withdrawalDone: boolean;
}

export interface TestState {
  startTime: number;
  adminToken: string;
  financeToken?: string;  // 财务管理员
  auditorToken?: string;  // 审计员

  // 用户
  personalUsers: TestUser[];
  enterpriseUsers: TestUser[];
  allUsers: TestUser[];

  // 代理商
  agents: TestAgent[];

  // 统计
  totalRecharges: number;
  totalRechargeApproved: number;
  totalTokenCalls: number;
  totalTokenCallsFailed: number;
  totalTokenCallsSucceeded: number;
  totalAutoReviewed: number;     // 自动实名审核数
  totalUnverifiedDetected: number;
  totalCommissionWithdrawals: number;
  totalCommissionWithdrawalAmount: number;

  // 阶段标记
  phaseRechargeDone: boolean;
  phaseTokenCallsInProgress: boolean;
  phaseAgentTasksDone: boolean;

  // 错误记录
  errors: Array<{ time: string; phase: string; user: string; error: string }>;
}

export function createState(): TestState {
  return {
    startTime: Date.now(),
    adminToken: "",
    personalUsers: [],
    enterpriseUsers: [],
    allUsers: [],
    agents: [],
    totalRecharges: 0,
    totalRechargeApproved: 0,
    totalTokenCalls: 0,
    totalTokenCallsFailed: 0,
    totalTokenCallsSucceeded: 0,
    totalAutoReviewed: 0,
    totalUnverifiedDetected: 0,
    totalCommissionWithdrawals: 0,
    totalCommissionWithdrawalAmount: 0,
    phaseRechargeDone: false,
    phaseTokenCallsInProgress: false,
    phaseAgentTasksDone: false,
    errors: [],
  };
}

// ── 状态日志 ──

export function logState(state: TestState) {
  const elapsed = Date.now() - state.startTime;
  const elapsedStr = formatElapsed(elapsed);
  const progress = Math.min(100, ((elapsed / (8 * 3600 * 1000)) * 100)).toFixed(1);

  console.log(`
═══════════════════════════════════════════════════════
  压力测试运行中 [${elapsedStr}] (${progress}%)
═══════════════════════════════════════════════════════
  用户: ${state.allUsers.length} 人 (个人 ${state.personalUsers.length} + 企业 ${state.enterpriseUsers.length})
  代理商: ${state.agents.length} 人
  充值: ${state.totalRecharges} 笔 | 通过: ${state.totalRechargeApproved} | 待审核: ${state.totalRecharges - state.totalRechargeApproved}
  Token 调用: ${state.totalTokenCalls} 次 | 成功: ${state.totalTokenCallsSucceeded} | 失败: ${state.totalTokenCallsFailed}
  实名自动审核: ${state.totalAutoReviewed} 次 | 检测到未实名: ${state.totalUnverifiedDetected}
  代理商提现: ${state.totalCommissionWithdrawals} 笔 | 金额: ${state.totalCommissionWithdrawalAmount.toFixed(2)}
  错误: ${state.errors.length} 条
═══════════════════════════════════════════════════════
`);
}

function formatElapsed(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
}

// ── 状态持久化 ————

const STATE_FILE = "test-sim/pressure/pressure-state.json";

export function saveState(state: TestState) {
  const data = {
    ...state,
    // 去除 accessToken 和 apiKey 敏感信息
    allUsers: state.allUsers.map((u) => ({ ...u, accessToken: "***", apiKey: "***" })),
    personalUsers: state.personalUsers.map((u) => ({ ...u, accessToken: "***", apiKey: "***" })),
    enterpriseUsers: state.enterpriseUsers.map((u) => ({ ...u, accessToken: "***", apiKey: "***" })),
    agents: state.agents.map((a) => ({ ...a, accessToken: "***" })),
    adminToken: "***",
    financeToken: "***",
    auditorToken: "***",
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
  console.log(`  💾 状态已保存到 ${STATE_FILE}`);
}

// ── 报告生成 ──

export function generateFinalReport(state: TestState): string {
  const elapsedMs = Date.now() - state.startTime;
  const elapsedStr = formatElapsed(elapsedMs);

  return [
    "",
    "╔═══════════════════════════════════════════════════╗",
    "║      3cloud 压力模拟测试 — 最终报告               ║",
    "╠═══════════════════════════════════════════════════╣",
    `║  测试时长: ${elapsedStr.padEnd(28)}║`,
    `║  总用户数: ${String(state.allUsers.length).padStart(4)}                           ║`,
    `║    · 个人: ${String(state.personalUsers.length).padStart(4)}                           ║`,
    `║    · 企业: ${String(state.enterpriseUsers.length).padStart(4)}                           ║`,
    `║  代理商数: ${String(state.agents.length).padStart(4)}                           ║`,
    `║  ─────────────────────────────                    ║`,
    `║  充值提交: ${String(state.totalRecharges).padStart(4)} 笔                         ║`,
    `║  充值审核通过: ${String(state.totalRechargeApproved).padStart(4)} 笔                    ║`,
    `║  ─────────────────────────────                    ║`,
    `║  Token 调用: ${String(state.totalTokenCalls).padStart(5)} 次                      ║`,
    `║    · 成功: ${String(state.totalTokenCallsSucceeded).padStart(5)}                           ║`,
    `║    · 失败: ${String(state.totalTokenCallsFailed).padStart(5)}                           ║`,
    `║  ─────────────────────────────                    ║`,
    `║  检测未实名调用: ${String(state.totalUnverifiedDetected).padStart(4)} 次              ║`,
    `║  自动实名审核: ${String(state.totalAutoReviewed).padStart(4)} 次                    ║`,
    `║  ─────────────────────────────                    ║`,
    `║  代理商提现: ${String(state.totalCommissionWithdrawals).padStart(4)} 笔                     ║`,
    `║  提现金额总计: ${String(state.totalCommissionWithdrawalAmount.toFixed(2)).padStart(10)} ¥          ║`,
    `║  ─────────────────────────────                    ║`,
    `║  错误总数: ${String(state.errors.length).padStart(4)}                            ║`,
    "╚═══════════════════════════════════════════════════╝",
    "",
    state.errors.length > 0 ? "  ❌ 错误明细:" : "",
    ...state.errors.slice(-20).map((e) =>
      `    [${e.time}] ${e.phase} - ${e.user}: ${e.error}`
    ),
    "",
  ].join("\n");
}
