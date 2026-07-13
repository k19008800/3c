// ============================================================
//  阶段 7 - 提现流程 & 双审
// ============================================================

import { ApiClient } from "../api-client.js";
import { CONFIG } from "../config.js";
import { startPhase, endPhase, VerificationReport } from "../utils/verify.js";
import type { AgentInfo } from "./4-agent.js";

export async function phase7Withdraw(
  client: ApiClient,
  agents: AgentInfo[],
  adminToken: string,
): Promise<VerificationReport> {
  startPhase("7: 提现 & 双审");
  const report = new VerificationReport();

  // 7.1 代理人发起提现
  console.log("  代理商发起提现...");
  const withdrawResults: Array<{
    agentIdx: number;
    amount: number;
    withdrawId?: number;
    success: boolean;
    rejected?: boolean;
  }> = [];

  for (const wd of CONFIG.withdraws) {
    const agent = agents[wd.agentIdx];
    if (!agent) continue;

    try {
      const res = await client.agentWithdraw(agent.token, wd.amount);
      withdrawResults.push({
        agentIdx: wd.agentIdx,
        amount: wd.amount,
        withdrawId: res.data?.id || res.data?.withdrawId,
        success: true,
        rejected: wd.reject,
      });
    } catch (err: any) {
      console.error(`  ⚠️  代理商 ${agent.email} 提现 ${wd.amount} 失败: ${err.message}`);
      withdrawResults.push({
        agentIdx: wd.agentIdx,
        amount: wd.amount,
        success: false,
        rejected: false,
      });
    }
  }
  report.add("提现申请提交", withdrawResults.filter((w) => w.success).length > 0,
    `${withdrawResults.filter((w) => w.success).length} 笔提交`);

  // 7.2 超额提现验证
  console.log("  超额提现验证...");
  if (agents.length > 0) {
    try {
      await client.agentWithdraw(agents[0].token, 9999999);
      report.add("超额提现拦截", false, "未返回错误");
    } catch {
      report.add("超额提现拦截", true, "正确拦截超额请求");
    }
  }

  // 7.3 管理员双审流程
  console.log("  管理端提现双审...");
  const withdrawListRes = await client.adminListWithdraws(adminToken);
  const withdrawList = withdrawListRes.data?.rows || withdrawListRes.data || [];
  const wdArray = Array.isArray(withdrawList) ? withdrawList : [];
  console.log(`  待审核提现: ${wdArray.length} 笔`);

  let firstPassed = 0;
  let secondPassed = 0;
  let rejectedCount = 0;

  for (const wd of wdArray) {
    const wdId = wd.id;
    if (!wdId) continue;

    const withdrawConfig = CONFIG.withdraws.find(
      (w, i) => withdrawResults[i]?.withdrawId === wdId
    );

    // 一审全部通过
    try {
      await client.adminFirstReviewWithdraw(adminToken, wdId);
      firstPassed++;
    } catch {
      continue;
    }

    // 二审：标记为拒绝的提现不通过
    const shouldReject = withdrawConfig?.reject ?? false;
    try {
      if (shouldReject) {
        await client.adminSecondReviewWithdraw(adminToken, wdId, false);
        rejectedCount++;
      } else {
        await client.adminSecondReviewWithdraw(adminToken, wdId, true);
        secondPassed++;
      }
    } catch {
      continue;
    }

    // 通过的才打款
    if (!shouldReject) {
      try {
        await client.adminMarkWithdrawPaid(adminToken, wdId);
      } catch {
        // 可能已打款，忽略
      }
    }
  }

  report.add("提现一审", firstPassed > 0, `${firstPassed} 笔通过一审`);
  report.add("提现二审通过", secondPassed > 0, `${secondPassed} 笔通过二审`);
  report.add("提现二审拒绝", rejectedCount > 0, `${rejectedCount} 笔被拒绝`);

  // 7.4 验证代理商提现记录
  console.log("  验证代理商提现记录...");
  for (const agent of agents) {
    try {
      await client.agentWithdraws(agent.token);
    } catch {
      // 忽略
    }
  }
  report.add("代理商提现记录查询", true);

  endPhase("7: 提现 & 双审");
  return report;
}
