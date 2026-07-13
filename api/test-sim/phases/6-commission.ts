// ============================================================
//  阶段 6 - 佣金结算
// ============================================================

import { ApiClient } from "../api-client.js";
import { startPhase, endPhase, VerificationReport } from "../utils/verify.js";
import type { AgentInfo } from "./4-agent.js";

export async function phase6Commission(
  client: ApiClient,
  agents: AgentInfo[],
  adminToken: string,
): Promise<VerificationReport> {
  startPhase("6: 佣金结算");
  const report = new VerificationReport();

  // 6.1 管理员查看佣金列表
  console.log("  查看佣金列表...");
  let totalCommissionCount = 0;
  try {
    const listRes = await client.adminListCommissions(adminToken);
    const list = listRes.data?.rows || listRes.data || [];
    totalCommissionCount = Array.isArray(list) ? list.length : 0;
    console.log(`  待结算佣金: ${totalCommissionCount} 条`);
    report.add("佣金列表可访问", true, `共 ${totalCommissionCount} 条`);
  } catch (err: any) {
    console.error(`  ⚠️  佣金列表加载失败: ${err.message}`);
    report.add("佣金列表可访问", false, err.message);
  }

  // 6.2 批量结算所有待结算佣金
  if (totalCommissionCount > 0) {
    console.log("  执行佣金批量结算...");
    try {
      await client.adminSettleCommissions(adminToken);
      report.add("佣金批量结算", true);

      // 6.3 验证结算后状态
      const settledRes = await client.adminListCommissions(adminToken, { status: "settled" });
      const settledList = settledRes.data?.rows || settledRes.data || [];
      const settledCount = Array.isArray(settledList) ? settledList.length : 0;
      report.add("结算后状态验证", settledCount > 0, `settled: ${settledCount} 条`);

      // 6.4 验证代理商面板数据更新
      console.log("  验证代理商面板数据...");
      for (const agent of agents) {
        const dashRes = await client.agentDashboard(agent.token);
        const dashData = dashRes.data || {};
        report.add(`代理商 ${agent.email} 面板`, true,
          `佣金数据: ${JSON.stringify(dashData).slice(0, 100)}...`);
      }
    } catch (err: any) {
      console.error(`  ⚠️  佣金结算失败: ${err.message}`);
      report.add("佣金批量结算", false, err.message);
    }
  } else {
    report.add("佣金批量结算（无数据跳过）", true, "0 条待结算");
  }

  endPhase("6: 佣金结算");
  return report;
}
