// ============================================================
//  3cloud (3C) — Agent 共享辅助函数
//  供 agent-core / agent-commission / agent-withdraw / agent-finance / agent-settlement 使用
// ============================================================

import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { agents } from "../db/schema.js";
import { AppError } from "./auth-service.js";

// ── Agent 查询辅助 ──

export async function getAgentByUserId(userId: number) {
  const db = getDb();
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.userId, userId))
    .limit(1);
  if (!agent) {
    throw new AppError("NOT_AGENT", "您不是代理商", 400);
  }
  return agent;
}

// ── 数值转换 ──
export function num(s: string | number | null | undefined): number {
  if (s == null) return 0;
  return typeof s === 'number' ? s : parseFloat(s) || 0;
}

export function fmt(n: number): string {
  return n.toFixed(6);
}

export function decStrToInt(s: string): number {
  return Math.round(parseFloat(s) * 1_000_000);
}

export function intToDecStr(n: number): string {
  return (n / 1_000_000).toFixed(6);
}

// ── 状态中文映射 ──

export const WITHDRAW_STATUS_LABEL: Record<string, string> = {
  pending_first_review: "待初审",
  pending_second_review: "待复审",
  approved: "已通过（待打款）",
  rejected: "已拒绝",
  paid: "已打款",
};

export const COMMISSION_TYPE_LABEL: Record<string, string> = {
  sale: "销售佣金",
  team: "团队佣金",
  activity: "活动奖励",
  renewal: "续费佣金",
};

export function getStatusLabel(status: string, map: Record<string, string>): string {
  return map[status] || status;
}

// ── 对账精度运算 ──

/** 数字转固定精度字符串，保持 DECIMAL(18,6) 格式 */
export function toDecStr(v: string | number | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  return n.toFixed(6)
}

/** 字符串数字加法 */
export function addDec(a: string, b: string): string {
  return (parseFloat(a) + parseFloat(b)).toFixed(6)
}

/** 字符串数字减法 */
export function subDec(a: string, b: string): string {
  return (parseFloat(a) - parseFloat(b)).toFixed(6)
}

// ── 类型 ──

export interface ReconParams {
  startDate?: string
  endDate?: string
  granularity?: 'day' | 'week' | 'month'
}

export interface AgentIntegrityParams {
  agentId?: number;        // 指定代理商 ID (agents.id)
  agentSearch?: string;    // 搜索邮箱/昵称
  page?: number;
  pageSize?: number;
}
