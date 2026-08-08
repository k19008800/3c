/**
 * Agent API Service — encapsulates all agent-related API calls.
 */
import { apiGet, apiPost, type PaginatedResponse } from "./api";
export type { PaginatedResponse };

// ── Types ──

export interface AgentProfile {
  is_agent: boolean;
  level: string | null;
  level_label: string | null;
  commission_rate: number;
  verify_status?: string;
  referral_code?: string;
  withdraw_account?: string;
  withdraw_bank?: string;
  withdraw_name?: string;
}

export interface WithdrawSummary {
  balance: number;
  commission_total: number;
  withdrawn: number;
  pending: number;
  withdrawable: number;
  active_withdraw: number;
  active_amount: number;
  min_withdraw: number;
  account_set: boolean;
  level: string | null;
}

export interface AgentReport {
  id: number;
  target_phone?: string;
  target_email?: string;
  target_user_id?: number;
  note?: string;
  status: string;
  reject_reason?: string;
  created_at: string;
  audit_at?: string;
  target_email_resolved?: string;
  target_username?: string;
}

export interface CommissionRecord {
  id: number;
  amount: number;
  rate: number;
  status: string;
  status_label: string;
  customer_name?: string;
  customer_email?: string;
  consumption?: number;
  settled_at?: string;
  period_start?: string;
  period_end?: string;
  created_at?: string;
}

export interface WithdrawalRecord {
  id: number;
  withdrawal_no: string;
  amount: number;
  status: string;
  status_label: string;
  reject_reason?: string;
  first_review_note?: string;
  second_review_note?: string;
  transfer_no?: string;
  created_at: string;
  completed_at?: string;
}

export interface CommissionRule {
  level: string;
  label: string;
  rate: number;
  desc: string;
  current?: boolean;
}

export interface CommissionRulesResponse {
  current_level: string | null;
  is_agent: boolean;
  rules: CommissionRule[];
}

// ── Helper: wrap apiGet/apiPost to return { data, error } ──

async function safeGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const data = await apiGet<T>(path, params);
    return { data, error: null };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : "未知错误" };
  }
}

async function safePost<T>(
  path: string,
  body?: unknown,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const data = await apiPost<T>(path, body);
    return { data, error: null };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : "未知错误" };
  }
}

// ── API Functions ──

export const agentApi = {
  /** 获取代理档案 */
  getProfile: () => safeGet<AgentProfile>("/me/agent/profile"),

  /** 获取代理的报备客户列表 */
  getReports: () => safeGet<{ list: AgentReport[] }>("/agent/reports"),

  /** 报备新客户 */
  createReport: (data: {
    target_phone?: string;
    target_email?: string;
    target_user_id?: number;
    note?: string;
  }) => safePost<{ ok: boolean; report_id: number; status: string }>(
    "/agent/reports",
    data,
  ),

  /** 获取提现汇总（余额/可提现） */
  getWithdrawSummary: () => safeGet<WithdrawSummary>("/me/agent/withdraw-summary"),

  /** 获取提现记录 */
  getWithdrawals: (params?: {
    page?: number;
    page_size?: number;
    status?: string;
  }) => safeGet<PaginatedResponse<WithdrawalRecord>>(
    "/me/agent/withdrawals",
    params as Record<string, string | number | undefined>,
  ),

  /** 提交提现申请 */
  submitWithdraw: (amount: number) =>
    safePost<{
      id: number;
      withdrawal_no: string;
      amount: number;
      status: string;
      status_label: string;
    }>("/me/agent/withdraw", { amount }),

  /** 获取佣金明细 */
  getCommissions: (params?: { page?: number; page_size?: number }) =>
    safeGet<PaginatedResponse<CommissionRecord>>(
      "/me/agent/commissions",
      params as Record<string, string | number | undefined>,
    ),

  /** 获取佣金规则 */
  getCommissionRules: () =>
    safeGet<CommissionRulesResponse>("/me/agent/commission-rules"),
};
