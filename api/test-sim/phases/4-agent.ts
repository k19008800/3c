// ============================================================
//  阶段 4 - 代理商体系
// ============================================================

import { ApiClient } from "../api-client.js";
import { CONFIG } from "../config.js";
import { startPhase, endPhase, VerificationReport } from "../utils/verify.js";
import type { RegisteredUser } from "./1-register.js";

export interface AgentInfo {
  agentId: number;
  userId: number;
  email: string;
  token: string;
  idx: number;
}

export async function phase4Agent(
  client: ApiClient,
  personalUsers: RegisteredUser[],
  enterpriseUsers: RegisteredUser[],
  adminToken: string,
): Promise<{ agents: AgentInfo[]; report: VerificationReport }> {
  startPhase("4: 代理商体系搭建");
  const report = new VerificationReport();
  const agents: AgentInfo[] = [];

  // 4.1 将用户的 role 改为 agent
  // 管理端创建代理商时，传入已注册的用户 ID
  // 选取前几个用户作为代理商账号

  const agentUsers = [
    personalUsers[0],  // Agent A
    personalUsers[1],  // Agent B1
    personalUsers[2],  // Agent B2
    personalUsers[3],  // Agent B3
  ];
  const clients = personalUsers.slice(4, 16); // 12 个客户

  console.log(`  创建 ${CONFIG.agents.length} 个代理商...`);
  for (let i = 0; i < CONFIG.agents.length; i++) {
    const agentDef = CONFIG.agents[i];
    try {
      const user = agentUsers[i];
      const createData: any = { userId: user.userId };
      if (agentDef.parentIdx !== undefined && agents[agentDef.parentIdx]) {
        createData.parentAgentId = agents[agentDef.parentIdx].agentId;
      }
      const res = await client.adminCreateAgent(adminToken, createData);
      agents.push({
        agentId: res.data.id,
        userId: user.userId,
        email: user.email,
        token: user.accessToken,
        idx: i,
      });
    } catch (err: any) {
      console.error(`  ⚠️  创建代理商 ${agentDef.name} 失败: ${err.message}`);
    }
  }
  report.add("创建代理商", agents.length === CONFIG.agents.length,
    `成功 ${agents.length} 个`);

  // 4.2 绑定客户
  console.log("  绑定客户到代理商...");
  let clientIdx = 0;
  let bindCount = 0;
  for (let a = 0; a < agents.length; a++) {
    const clientCount = CONFIG.agentClientsPerAgent[a];
    for (let c = 0; c < clientCount && clientIdx < clients.length; c++) {
      try {
        await client.adminBindClient(adminToken, agents[a].agentId, clients[clientIdx].userId);
        bindCount++;
        clientIdx++;
      } catch (err: any) {
        console.error(`  ⚠️  绑定客户失败: ${err.message}`);
      }
    }
  }
  report.add("客户绑定", bindCount > 0, `绑定 ${bindCount} 个客户`);

  // 4.3 验证代理商店面板
  console.log("  验证代理商面板...");
  for (const agent of agents) {
    try {
      await client.agentDashboard(agent.token);
    } catch (err: any) {
      console.error(`  ⚠️  代理商 ${agent.email} 面板加载失败: ${err.message}`);
    }
  }
  report.add("代理商面板可访问", true, `${agents.length} 个代理商面板正常`);

  endPhase("4: 代理商体系");
  return { agents, report };
}
