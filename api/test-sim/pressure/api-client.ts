// ============================================================
//  3cloud (3C) — 8小时压力测试 API 客户端
//  兼容原有 ApiClient + 添加压力测试所需接口
// ============================================================

export interface ApiResponse<T = any> {
  code: number;
  data: T;
  message: string;
}

export class PressureApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async rawRequest(method: string, path: string, headers: Record<string, string>, body?: any): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async jsonRequest<T>(
    method: string,
    path: string,
    body?: any,
    token?: string,
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers["authorization"] = `Bearer ${token}`;

    const res = await this.rawRequest(method, path, headers, body);
    const json = await res.json() as ApiResponse<T>;
    if (json.code !== 0 && json.code !== 200) {
      throw new Error(`[${method} ${path}] ${json.code}: ${json.message}`);
    }
    return json;
  }

  // ── 认证 ──

  async register(email: string, password: string) {
    return this.jsonRequest<{
      user: { id: number; email: string };
      accessToken: string;
      refreshToken: string;
    }>("POST", "/api/v1/auth/register", { email, password, confirmPassword: password });
  }

  async login(email: string, password: string) {
    return this.jsonRequest<{
      user: { id: number; email: string; role: string };
      accessToken: string;
    }>("POST", "/api/v1/auth/login", { email, password });
  }

  async me(token: string) {
    return this.jsonRequest("GET", "/api/v1/auth/me", undefined, token);
  }

  // ── 管理员模拟登录 ──

  async adminImpersonate(adminToken: string, userId: number, durationMinutes: number = 60) {
    // 模拟 token 最大有效期 60 分钟
    return this.jsonRequest<{
      accessToken: string;
      expiresIn: number;
      userId: number;
      role: string;
      warning: string;
    }>("POST", "/api/v1/admin/users/impersonate", { userId, durationMinutes: Math.min(durationMinutes, 60), reason: "压力测试" }, adminToken);
  }

  // ── API Key 管理 ──

  async createApiKey(token: string, name: string) {
    return this.jsonRequest<{
      id: number;
      name: string;
      key: string;
      keyPrefix: string;
    }>("POST", "/api/v1/api-keys", { name }, token);
  }

  async listApiKeys(token: string) {
    return this.jsonRequest<Array<{
      id: number;
      name: string;
      keyPrefix: string;
      status: boolean;
      lastUsedAt: string | null;
    }>>("GET", "/api/v1/api-keys", undefined, token);
  }

  // ── 充值 ──

  async createRechargeOrder(userToken: string, amount: number, channel: string = "wechat_scan") {
    return this.jsonRequest<{ orderNo: string; id: number }>(
      "POST", "/api/v1/recharge", { amount: String(amount), channel }, userToken
    );
  }

  async rechargeNotify(orderNo: string, channelOrderNo: string, amount: string) {
    const res = await this.rawRequest("POST", "/api/v1/recharge/notify",
      { "content-type": "application/json" },
      { orderNo, channelOrderNo, amount }
    );
    return { status: res.status, text: await res.text() };
  }

  async submitBankTransfer(userToken: string, amount: number) {
    return this.jsonRequest<{ orderNo: string; id: number }>(
      "POST", "/api/v1/recharge/bank-transfer", {
        amount: String(amount),
        accountNumber: `622202${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`,
        bankName: "测试银行",
        transferDate: new Date().toISOString().slice(0, 10),
        remark: "压力测试充值",
      }, userToken
    );
  }

  async getRechargeOrders(userToken: string, page: number = 1) {
    return this.jsonRequest("GET", `/api/v1/recharge/orders?page=${page}&pageSize=100`, undefined, userToken);
  }

  // ── 管理端：充值审核 ──

  async adminFinanceRechargeList(adminToken: string, status?: string) {
    const qs = status ? `?pageSize=200&status=${status}` : "?pageSize=200";
    return this.jsonRequest("GET", `/api/v1/admin/recharge-orders${qs}`, undefined, adminToken);
  }

  async adminFirstConfirmRecharge(adminToken: string, orderId: number) {
    return this.jsonRequest("POST", `/api/v1/admin/recharge-orders/${orderId}/first-confirm`, {}, adminToken);
  }

  async adminSecondConfirmRecharge(adminToken: string, orderId: number, reject?: boolean) {
    return this.jsonRequest(
      "POST", `/api/v1/admin/recharge-orders/${orderId}/second-confirm`,
      reject ? { action: "reject" } : {}, adminToken
    );
  }

  // ── 实名认证 ──

  async submitRealNamePersonal(token: string, realName: string, idNumber: string) {
    return this.jsonRequest("POST", "/api/v1/auth/real-name/personal", {
      realName, idNumber,
      idFrontImage: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==",
    }, token);
  }

  async submitRealNameEnterprise(token: string, companyName: string, companyRegNumber: string) {
    return this.jsonRequest("POST", "/api/v1/auth/real-name/enterprise", {
      companyName, companyRegNumber,
      businessLicense: "data:image/jpeg;base64,sim_bl",
      realName: "法人代表", idNumber: "110101199001011234",
      bankName: "测试银行", bankAccount: "6222021234567890",
    }, token);
  }

  async getRealNameStatus(token: string) {
    return this.jsonRequest<{ status: string }>("GET", "/api/v1/auth/real-name/status", undefined, token);
  }

  // ── 管理端：实名审核 ──

  async adminListReviews(adminToken: string, status?: string) {
    const qs = status ? `?status=${status}&pageSize=200` : "?pageSize=200";
    return this.jsonRequest("GET", `/api/v1/admin/real-name-review${qs}`, undefined, adminToken);
  }

  async adminReviewAction(adminToken: string, reviewId: number, action: "approve" | "reject", rejectReason?: string) {
    return this.jsonRequest("POST", `/api/v1/admin/real-name-review/${reviewId}`, { action, rejectReason }, adminToken);
  }

  // ── Token 代理调用 ──

  async chatCompletion(apiKey: string, model: string, messages: any[]) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    };
    try {
      const res = await this.rawRequest("POST", "/api/v1/chat/completions", headers, { model, messages });
      const body = await res.json();
      return { status: res.status, body, ok: res.status < 400 };
    } catch (err: any) {
      return { status: 0, body: { error: { message: err.message } }, ok: false };
    }
  }

  // ── 代理商 ──

  async agentLogin(email: string, password: string) {
    return this.login(email, password);
  }

  async agentDashboard(agentToken: string) {
    return this.jsonRequest("GET", "/api/v1/agent/dashboard", undefined, agentToken);
  }

  async agentCommissions(agentToken: string, status?: string) {
    const qs = status ? `?status=${status}` : "";
    return this.jsonRequest("GET", `/api/v1/agent/commissions${qs}`, undefined, agentToken);
  }

  async agentClients(agentToken: string) {
    return this.jsonRequest("GET", "/api/v1/agent/clients", undefined, agentToken);
  }

  async agentWithdraw(agentToken: string, amount: number) {
    return this.jsonRequest("POST", "/api/v1/agent/withdraw", {
      amount,
      bankCardNo: "6222021234567890",
      bankName: "测试银行",
    }, agentToken);
  }

  async agentWithdraws(agentToken: string) {
    return this.jsonRequest("GET", "/api/v1/agent/withdraws", undefined, agentToken);
  }

  // ── 管理端：佣金/提现 ──

  async adminListWithdraws(adminToken: string) {
    return this.jsonRequest("GET", "/api/v1/admin/withdraws?pageSize=100", undefined, adminToken);
  }

  async adminFirstReviewWithdraw(adminToken: string, withdrawId: number, approve: boolean = true) {
    return this.jsonRequest("POST", `/api/v1/admin/withdraws/${withdrawId}/first-review`,
      { action: approve ? "approve" : "reject" }, adminToken);
  }

  async adminSecondReviewWithdraw(adminToken: string, withdrawId: number, approve: boolean = true) {
    return this.jsonRequest("POST", `/api/v1/admin/withdraws/${withdrawId}/second-review`,
      { action: approve ? "approve" : "reject", rejectReason: approve ? undefined : "二审不通过" }, adminToken);
  }

  async adminMarkWithdrawPaid(adminToken: string, withdrawId: number) {
    return this.jsonRequest("POST", `/api/v1/admin/withdraws/${withdrawId}/mark-paid`, {}, adminToken);
  }

  async adminCommissionsList(adminToken: string, status?: string) {
    const qs = status ? `?status=${status}&pageSize=200` : "?pageSize=200";
    return this.jsonRequest("GET", `/api/v1/admin/finance/commissions${qs}`, undefined, adminToken);
  }

  async adminSettleCommissions(adminToken: string, ids?: number[]) {
    return this.jsonRequest("POST", "/api/v1/admin/finance/commissions/settle",
      ids ? { ids } : { status: "pending" }, adminToken);
  }
}
