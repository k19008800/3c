// ============================================================
//  3cloud (3C) — Agent 管理 / 结算配置 / 完整性查询
// ============================================================

import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { agents, users } from "../../db/schema.js";
import { settleCommissions } from "./settlements.js";
import type { AgentIntegrityParams } from "./types.js";

// ══════════════════════════════════════════════
//  结算配置管理 (预留)
// ══════════════════════════════════════════════

export async function getSettlementConfig(agentId: number) {
  // TODO: 实现结算配置查询（settlement_cycles 表）
  return { agentId, settlementCycle: "monthly", autoSettle: true };
}

export async function updateSettlementConfig(agentId: number, settlementCycle: string, operatorId: number) {
  // TODO: 实现结算配置更新
  return { agentId, settlementCycle, updatedBy: operatorId };
}

export async function settleAgentManually(agentId: number, operatorId: number) {
  // TODO: 实现手动触发结算
  const count = await settleCommissions(agentId);
  return { agentId, settledCount: count, triggeredBy: operatorId };
}

export async function getSettlementHistory(agentId: number, page: number, pageSize: number) {
  // TODO: 实现结算历史查询
  return { agentId, list: [], total: 0, page, pageSize };
}

export async function autoSettleDueAgents(): Promise<number> {
  // TODO: 查询 settlement_cycles 找出到期代理商并调用 settleCommissions
  const count = await settleCommissions();
  return count;
}

// ══════════════════════════════════════════════
//  Agent 完整性查询
// ══════════════════════════════════════════════

export async function getAgentIntegrity(params?: AgentIntegrityParams) {
  const db = getDb();
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [];
  if (params?.agentId) {
    conditions.push(eq(agents.id, params.agentId));
  }
  if (params?.agentSearch) {
    const kw = `%${params.agentSearch}%`;
    conditions.push(sql`(${users.nickname} ILIKE ${kw} OR ${users.email} ILIKE ${kw})`);
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agents)
    .innerJoin(users, eq(agents.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : sql`1=1`);
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: agents.id,
      userId: agents.userId,
      email: users.email,
      nickname: users.nickname,
      totalCommission: agents.totalCommission,
      settledCommission: agents.settledCommission,
      pendingWithdraw: agents.pendingWithdraw,
      frozenAmount: agents.frozenAmount,
      status: agents.status,
      createdAt: agents.createdAt,
    })
    .from(agents)
    .innerJoin(users, eq(agents.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : sql`1=1`)
    .orderBy(desc(agents.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      ...r,
      totalCommission: r.totalCommission ?? "0.000000",
      settledCommission: r.settledCommission ?? "0.000000",
      pendingWithdraw: r.pendingWithdraw ?? "0.000000",
      frozenAmount: r.frozenAmount ?? "0.000000",
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}
