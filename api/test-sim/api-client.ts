// ============================================================
//  3cloud 仿真测试 — HTTP API 客户端
// ============================================================

import { CONFIG } from "../config.js";

export interface AuthResult {
  userId: number;
  email: string;
  accessToken: string;
  refreshToken: string;
}

export interface ApiResponse<T = any> {
  code: number;
  data: T;
  message: string;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any,
    token?: string,
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (token) {
      headers["authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const json: ApiResponse<T> = await res.json();
    if (json.code !== 0 && json.code !== 200) {
      throw new Error(`[${method} ${path}] ${json.code}: ${json.message}`);
    }
    return json;
  }

  // ── 认证 ──

  async register(email: string, password: string) {
    return this.request<{
      user: { id: number; email: string };
      accessToken: string;
      refreshToken: string;
    }>("POST", "/api/v1/auth/register", { email, password, confirmPassword: password });
  }

  async verifyEmail(token: string, code: string = "000000") {
    return this.request("POST", "/api/v1/auth/verify-email", { code }, token);
  }

  async login(email: string, password: string) {
    return this.request<{
      user: { id: number; email: string; role: string };
      accessToken: string;
      refreshToken: string;
    }>("POST", "/api/v1/auth/login", { email, password });
  }

  async me(token: string) {
    return this.request("GET", "/api/v1/auth/me", undefined, token);
  }

  // ── 实名认证 ──

  async submitRealNamePersonal(token: string, data: {
    realName: string;
    idNumber: string;
    idFrontImage?: string;
    idBackImage?: string;
  }) {
    return this.request("POST", "/api/v1/auth/real-name/personal", data, token);
  }

  async submitRealNameEnterprise(token: string, data: {
    companyName: string;
    companyRegNumber: string;
    businessLicense: string;
    realName: string;
    idNumber: string;
    bankName: string;
    bankAccount: string;
  }) {
    return this.request("POST", "/api/v1/auth/real-name/enterprise", data, token);
  }

  async getRealNameStatus(token: string) {
    return this.request("GET", "/api/v1/auth/real-name/status", undefined, token);
  }

  // ── 管理员：实名审核 ──

  async adminListReviews(adminToken: string, params?: { status?: string; page?: number }) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.page) qs.set("page", String(params.page));
    return this.request("GET", `/api/v1/admin/real-name-review?${qs}`, undefined, adminToken);
  }

  async adminReviewAction(adminToken: string, reviewId: number, action: "approve" | "reject", rejectReason?: string) {
    return this.request("POST", `/api/v1/admin/real-name-review/${reviewId}`, { action, rejectReason }, adminToken);
  }

  // ── 充值 ──

  async createRechargeOrder(userToken: string, amount: number, channel: string = "wechat_scan") {
    return this.request("POST", "/api/v1/recharge", { amount: String(amount), channel }, userToken);
  }

  async rechargeNotify(payload: { orderNo: string; channelOrderNo: string; amount: string }) {
    // 模拟支付回调（不需要鉴权）
    const res = await fetch(`${this.baseUrl}/api/v1/recharge/notify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    return { status: res.status, text };
  }

  async submitBankTransfer(userToken: string, data: {
    amount: number;
    voucherImage: string;
    voucherNo: string;
    payerAccountName: string;
    payerAccountNo: string;
  }) {
    return this.request("POST", "/api/v1/recharge/bank-transfer", {
      amount: String(data.amount),
      accountNumber: data.payerAccountNo,
      bankName: "测试银行",
      transferDate: new Date().toISOString().slice(0, 10),
      remark: "仿真测试对公转账",
    }, userToken);
  }

  async getRechargeOrders(userToken: string, page: number = 1) {
    return this.request("GET", `/api/v1/recharge/orders?page=${page}`, undefined, userToken);
  }

  // ── 管理员：财务 ──

  async adminFirstConfirmRecharge(adminToken: string, orderId: number) {
    return this.request("POST", `/api/v1/admin/finance/recharge/${orderId}/first-confirm`, {}, adminToken);
  }

  async adminSecondConfirmRecharge(adminToken: string, orderId: number, reject?: boolean) {
    return this.request("POST", `/api/v1/admin/finance/recharge/${orderId}/second-confirm`,
      reject ? { action: "reject" } : {}, adminToken);
  }

  async adminFinanceDashboard(adminToken: string) {
    return this.request("GET", "/api/v1/admin/finance/dashboard", undefined, adminToken);
  }

  // ── 管理员：代理商 ──

  async adminCreateAgent(adminToken: string, data: { userId: number; commissionRate?: number; parentAgentId?: number }) {
    return this.request("POST", "/api/v1/admin/agents", data, adminToken);
  }

  async adminBindClient(adminToken: string, agentId: number, clientUserId: number) {
    return this.request("POST", `/api/v1/admin/agents/${agentId}/clients`, { clientUserId }, adminToken);
  }

  async adminListAgents(adminToken: string) {
    return this.request("GET", "/api/v1/admin/agents?pageSize=100", undefined, adminToken);
  }

  // ── 代理商 ──

  async agentDashboard(agentToken: string) {
    return this.request("GET", "/api/v1/agent/dashboard", undefined, agentToken);
  }

  async agentClients(agentToken: string) {
    return this.request("GET", "/api/v1/agent/clients", undefined, agentToken);
  }

  async agentCommissions(agentToken: string, status?: string) {
    const qs = status ? `?status=${status}` : "";
    return this.request("GET", `/api/v1/agent/commissions${qs}`, undefined, agentToken);
  }

  async agentWithdraw(agentToken: string, amount: number, data?: { bankCardNo?: string; bankName?: string }) {
    return this.request("POST", "/api/v1/agent/withdraw", {
      amount,
      bankCardNo: data?.bankCardNo || "6222021234567890",
      bankName: data?.bankName || "测试银行",
    }, agentToken);
  }

  async agentWithdraws(agentToken: string) {
    return this.request("GET", "/api/v1/agent/withdraws", undefined, agentToken);
  }

  // ── 管理员：佣金 ──

  async adminListCommissions(adminToken: string, params?: { page?: number; status?: string }) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.status) qs.set("status", params.status);
    return this.request("GET", `/api/v1/admin/finance/commissions?${qs}`, undefined, adminToken);
  }

  async adminSettleCommissions(adminToken: string, commissionIds?: number[]) {
    return this.request("POST", "/api/v1/admin/finance/commissions/settle",
      commissionIds ? { ids: commissionIds } : { status: "pending" }, adminToken);
  }

  // ── 管理员：提现 ──

  async adminListWithdraws(adminToken: string) {
    return this.request("GET", "/api/v1/admin/finance/withdraws?pageSize=100", undefined, adminToken);
  }

  async adminFirstReviewWithdraw(adminToken: string, withdrawId: number, approve: boolean = true) {
    return this.request("POST", `/api/v1/admin/finance/withdraw/${withdrawId}/first-review`,
      { action: approve ? "approve" : "reject" }, adminToken);
  }

  async adminSecondReviewWithdraw(adminToken: string, withdrawId: number, approve: boolean = true) {
    return this.request("POST", `/api/v1/admin/finance/withdraw/${withdrawId}/second-review`,
      { action: approve ? "approve" : "reject", rejectReason: approve ? undefined : "二审不通过" }, adminToken);
  }

  async adminMarkWithdrawPaid(adminToken: string, withdrawId: number) {
    return this.request("POST", `/api/v1/admin/finance/withdraw/${withdrawId}/mark-paid`, {}, adminToken);
  }

  // ── Token 代理调用 ──

  async chatCompletion(apiKey: string, model: string, messages: any[] = [{ role: "user", content: "你好" }]) {
    const res = await fetch(`${this.baseUrl}/api/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages }),
    });
    return { status: res.status, body: await res.json() };
  }

  // ── 管理端：审计日志 ──

  async adminAuditLogs(adminToken: string, params?: { action?: string; page?: number }) {
    const qs = new URLSearchParams();
    if (params?.action) qs.set("action", params.action);
    if (params?.page) qs.set("page", String(params.page));
    return this.request("GET", `/api/v1/admin/audit-logs?${qs}`, undefined, adminToken);
  }

  // ── 管理端：对账 ──

  async adminReconciliation(adminToken: string, date: string) {
    return this.request("GET", `/api/v1/admin/finance/reconciliation?date=${date}`, undefined, adminToken);
  }
}
