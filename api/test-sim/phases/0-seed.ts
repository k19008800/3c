// ============================================================
//  阶段 0 - 种子数据初始化
// ============================================================

import { ApiClient } from "../api-client.js";
import { CONFIG } from "../config.js";
import { startPhase, endPhase } from "../utils/verify.js";

export async function phase0Seed(client: ApiClient) {
  startPhase("0: 种子数据初始化");

  // 尝试登录各账号
  const accounts = [
    { email: CONFIG.admin.email, password: CONFIG.admin.password, role: "super_admin" },
    { email: CONFIG.finance.email, password: CONFIG.finance.password, role: "finance_ops" },
    { email: CONFIG.auditor.email, password: CONFIG.auditor.password, role: "auditor" },
    { email: CONFIG.ops.email, password: CONFIG.ops.password, role: "ops" },
  ];

  const verified: Array<{ email: string; token: string; role: string }> = [];
  let adminToken = "";

  for (const acct of accounts) {
    try {
      const res = await client.login(acct.email, acct.password);
      const token = res.data.accessToken;
      verified.push({ email: acct.email, token, role: acct.role });
      if (acct.role === "super_admin") adminToken = token;
      console.log(`  ✅ ${acct.email} (${acct.role}) 登录成功`);
    } catch (err: any) {
      console.error(`  ⚠️  ${acct.email} 登录失败: ${err.message}`);
    }
  }

  endPhase("0: 种子数据");
  return { adminToken, verifiedAccounts: verified };
}
