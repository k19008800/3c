// ============================================================
//  3cloud (3C) — 管理后台：代理商 CRUD
// ============================================================

import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  users,
  agents,
  agentClients,
  agentCustomerConsumption,
  commissionLogs,
  withdrawOrders,
  commissionRules,
  userRoleHistory,
} from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import { num, fmt } from "../agent-helpers.js";

/**
 * 获取单个代理商详情（含实时可用余额）
 */
export async function getAgentById(agentId: number) {
  const db = getDb();

  const [row] = await db
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
      parentAgentId: agents.parentAgentId,
      createdAt: agents.createdAt,
    })
    .from(agents)
    .innerJoin(users, eq(agents.userId, users.id))
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!row) return null;

  // 实时查询提现汇总
  const [withdrawRow] = await db
    .select({
      paidTotal: sql<string>`COALESCE(SUM(CAST(${withdrawOrders.amount} AS DECIMAL)) FILTER (WHERE ${withdrawOrders.status} = 'paid'), 0)`,
      pendingTotal: sql<string>`COALESCE(SUM(CAST(${withdrawOrders.amount} AS DECIMAL)) FILTER (WHERE ${withdrawOrders.status} NOT IN ('paid', 'rejected')), 0)`,
    })
    .from(withdrawOrders)
    .where(eq(withdrawOrders.agentId, agentId));

  const settled = num(row.settledCommission);
  const paidTotal = num(withdrawRow?.paidTotal ?? "0");
  const pendingTotal = num(withdrawRow?.pendingTotal ?? "0");
  const frozen = num(row.frozenAmount);

  // 可用余额 = settledCommission - 已打款 - 待处理提现 - 冻结
  const availableBalance = Math.max(0, settled - paidTotal - pendingTotal - frozen);

  return {
    ...row,
    settledCommission: row.settledCommission,
    pendingWithdraw: pendingTotal.toFixed(6),
    frozenAmount: row.frozenAmount ?? "0.000000",
    availableBalance: availableBalance.toFixed(6),
  };
}

/**
 * 代理商列表（管理后台）
 */
export async function listAllAgents(page: number, pageSize: number, status?: string) {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  const conditions = [sql`1=1`];
  if (status !== undefined && status !== "") {
    const statusBool = status === "true" || status === "active";
    conditions.push(eq(agents.status, statusBool));
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agents)
    .innerJoin(users, eq(agents.userId, users.id))
    .where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: agents.id,
      userId: agents.userId,
      email: users.email,
      nickname: users.nickname,
      totalCommission: agents.totalCommission,
      pendingWithdraw: agents.pendingWithdraw,
      frozenAmount: agents.frozenAmount,
      status: agents.status,
      parentAgentId: agents.parentAgentId,
      createdAt: agents.createdAt,
    })
    .from(agents)
    .innerJoin(users, eq(agents.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(agents.createdAt))
    .limit(pageSize)
    .offset(offset);

  // 批量查询提现汇总
  const agentIds = rows.map((r) => r.id);
  const withdrawMap = new Map<number, { paidTotal: number; pendingTotal: number }>();
  if (agentIds.length > 0) {
    const withdrawRows = await db
      .select({
        agentId: withdrawOrders.agentId,
        paidTotal: sql<string>`COALESCE(SUM(CAST(${withdrawOrders.amount} AS DECIMAL)) FILTER (WHERE ${withdrawOrders.status} = 'paid'), 0)`,
        pendingTotal: sql<string>`COALESCE(SUM(CAST(${withdrawOrders.amount} AS DECIMAL)) FILTER (WHERE ${withdrawOrders.status} NOT IN ('paid', 'rejected')), 0)`,
      })
      .from(withdrawOrders)
      .where(inArray(withdrawOrders.agentId, agentIds))
      .groupBy(withdrawOrders.agentId);

    for (const wr of withdrawRows) {
      withdrawMap.set(wr.agentId, {
        paidTotal: num(wr.paidTotal),
        pendingTotal: num(wr.pendingTotal),
      });
    }
  }

  return {
    list: rows.map((r) => {
      const totalCommission = num(r.totalCommission);
      const frozen = num(r.frozenAmount ?? "0.000000");
      const ws = withdrawMap.get(r.id);
      const paidTotal = ws?.paidTotal ?? 0;
      const pendingTotal = ws?.pendingTotal ?? 0;
      const availableBalance = Math.max(0, totalCommission - paidTotal - pendingTotal - frozen);
      return {
        ...r,
        pendingWithdraw: pendingTotal.toFixed(6),
        frozenAmount: r.frozenAmount ?? "0.000000",
        availableBalance: availableBalance.toFixed(6),
        createdAt: r.createdAt.toISOString(),
      };
    }),
    total,
    page,
    pageSize,
  };
}

/**
 * 创建代理商
 */
export async function createAgent(operatorId: number, targetUserId: number, initialSaleRate?: number) {
  const db = getDb();

  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!user) {
    throw new AppError("USER_NOT_FOUND", "用户不存在", 404);
  }

  const [existingAgent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.userId, targetUserId))
    .limit(1);

  if (existingAgent) {
    throw new AppError("ALREADY_AGENT", "该用户已是代理商", 400);
  }

  const saleRate = initialSaleRate != null ? (initialSaleRate / 100).toFixed(4) : "0.0000";

  const [agent] = await db.transaction(async (tx) => {
    const [newAgent] = await tx
      .insert(agents)
      .values({
        userId: targetUserId,
      })
      .returning();

    // 插入销售佣金规则
    await tx
      .insert(commissionRules)
      .values({
        agentId: newAgent.id,
        ruleType: "sale",
        rate: saleRate,
        isEnabled: true,
      })
      .onConflictDoNothing();

    await tx
      .update(users)
      .set({ role: "agent" })
      .where(eq(users.id, targetUserId));

    await tx.insert(userRoleHistory).values({
      userId: targetUserId,
      oldRole: user.role,
      newRole: "agent",
      operatorId,
      reason: "管理员创建代理商",
    });
    const { auditLogs } = await import("../../db/schema.js");

    await tx.insert(auditLogs).values({
      operatorId,
      action: "agent_create",
      targetType: "user",
      targetId: targetUserId,
      before: { role: user.role },
      after: { role: "agent" },
      ip: null,
      description: `创建代理商 #${targetUserId}，销售分佣比例 ${saleRate}`,
    });

    return [newAgent];
  });

  return {
    id: agent.id,
    userId: agent.userId,
    status: agent.status,
  };
}

/**
 * 更新代理商（仅 status）
 */
export async function updateAgent(agentId: number, data: { status?: boolean }) {
  const db = getDb();

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) {
    throw new AppError("AGENT_NOT_FOUND", "代理商不存在", 404);
  }

  const updateData: Record<string, any> = {};

  if (data.status !== undefined) {
    updateData.status = data.status;
  }

  if (Object.keys(updateData).length === 0) {
    throw new AppError("NO_CHANGES", "没有需要更新的字段", 400);
  }

  await db
    .update(agents)
    .set(updateData)
    .where(eq(agents.id, agentId));

  return { id: agentId, ...updateData };
}

/**
 * 删除代理商身份（前置检查 + 事务）
 */
export async function deleteAgent(operatorId: number, agentId: number): Promise<{ deleted: boolean; userId: number }> {
  const db = getDb();

  const [agent] = await db
    .select({
      id: agents.id,
      userId: agents.userId,
    })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) {
    throw new AppError("AGENT_NOT_FOUND", "代理商不存在", 404);
  }

  // 检查待结算佣金
  const [pendingResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commissionLogs)
    .where(
      and(
        eq(commissionLogs.agentId, agentId),
        eq(commissionLogs.status, "pending"),
      ),
    );
  const pendingCount = Number(pendingResult?.count ?? 0);
  if (pendingCount > 0) {
    throw new AppError("HAS_PENDING_COMMISSION", "该代理商有待结算佣金，请先结算再删除", 400);
  }

  // 检查是否有下级代理
  const [subResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agents)
    .where(eq(agents.parentAgentId, agentId));
  const subCount = Number(subResult?.count ?? 0);
  if (subCount > 0) {
    throw new AppError("HAS_SUB_AGENTS", "该代理商有下级代理，请先转移或解除关系", 400);
  }

  // 检查待处理提现
  const [pendingWithdrawResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(withdrawOrders)
    .where(
      and(
        eq(withdrawOrders.agentId, agentId),
        sql`${withdrawOrders.status} NOT IN ('paid', 'rejected')`,
      ),
    );
  const pendingWithdrawCount = Number(pendingWithdrawResult?.count ?? 0);
  if (pendingWithdrawCount > 0) {
    throw new AppError("HAS_PENDING_WITHDRAW", "该代理商有待处理提现，请先处理", 400);
  }

  const { auditLogs } = await import("../../db/schema.js");

  await db.transaction(async (tx) => {
    // 获取用户当前角色
    const [user] = await tx
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, agent.userId))
      .limit(1);

    // 更新用户角色为普通用户
    await tx
      .update(users)
      .set({ role: "user" })
      .where(eq(users.id, agent.userId));

    // 插入角色变更历史
    await tx.insert(userRoleHistory).values({
      userId: agent.userId,
      oldRole: user?.role ?? "agent",
      newRole: "user",
      operatorId,
      reason: "管理员删除代理商身份",
    });

    // 删除代理商记录（CASCADE）
    await tx
      .delete(agents)
      .where(eq(agents.id, agentId));

    // 审计日志
    await tx.insert(auditLogs).values({
      operatorId,
      action: "agent_update",
      targetType: "user",
      targetId: agent.userId,
      before: { role: user?.role ?? "agent" },
      after: { role: "user" },
      ip: null,
      description: "删除代理商身份",
    });
  });

  return { deleted: true, userId: agent.userId };
}
