// ============================================================
//  3cloud (3C) — 客户列表 & 客户绑定
// ============================================================

import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  users,
  agents,
  agentClients,
  agentCustomerConsumption,
} from "../../db/schema.js";
import { AppError } from "../auth-service/index.js";
import { getAgentByUserId, num, fmt } from "../agent-helpers.js";

/**
 * 代理商视角：客户列表（含消费汇总）
 */
export async function getAgentClients(userId: number, page: number, pageSize: number) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);
  const offset = (page - 1) * pageSize;

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentClients)
    .where(eq(agentClients.agentId, agent.id));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: agentClients.id,
      clientUserId: agentClients.clientUserId,
      email: users.email,
      nickname: users.nickname,
      userType: users.userType,
      status: users.status,
      balance: users.balance,
      createdAt: agentClients.createdAt,
    })
    .from(agentClients)
    .innerJoin(users, eq(agentClients.clientUserId, users.id))
    .where(eq(agentClients.agentId, agent.id))
    .orderBy(desc(agentClients.createdAt))
    .limit(pageSize)
    .offset(offset);

  // 批量查询消费汇总
  const clientUserIds = rows.map((r) => r.clientUserId);
  let consumptionMap = new Map<number, {
    totalCallCost: string;
    totalCommission: string;
    orderCount: number;
    lastOrderAt: string | null;
  }>();

  if (clientUserIds.length > 0) {
    const consRows = await db
      .select({
        customerUserId: agentCustomerConsumption.customerUserId,
        totalCallCost: agentCustomerConsumption.totalAmount,
        totalCommission: agentCustomerConsumption.commissionAmount,
        orderCount: agentCustomerConsumption.orderCount,
        lastOrderAt: agentCustomerConsumption.lastOrderAt,
      })
      .from(agentCustomerConsumption)
      .where(
        and(
          eq(agentCustomerConsumption.agentId, agent.id),
          inArray(agentCustomerConsumption.customerUserId, clientUserIds),
        )
      );

    for (const row of consRows) {
      consumptionMap.set(row.customerUserId, {
        totalCallCost: row.totalCallCost ?? '0.000000',
        totalCommission: row.totalCommission ?? '0.000000',
        orderCount: row.orderCount ?? 0,
        lastOrderAt: row.lastOrderAt?.toISOString() ?? null,
      });
    }
  }

  return {
    list: rows.map((r) => {
      const cm = consumptionMap.get(r.clientUserId);
      return {
        clientUserId: r.clientUserId,
        email: r.email,
        nickname: r.nickname,
        userType: r.userType,
        status: r.status,
        balance: r.balance,
        boundAt: r.createdAt.toISOString(),
        totalCallCost: cm?.totalCallCost ?? "0.000000",
        totalCommission: cm?.totalCommission ?? "0.000000",
        orderCount: cm?.orderCount ?? 0,
        lastOrderAt: cm?.lastOrderAt ?? null,
      };
    }),
    total,
    page,
    pageSize,
  };
}

/**
 * 管理后台：查看代理商客户列表
 */
export async function listAgentClientsForAdmin(
  agentId: number,
  page: number,
  pageSize: number,
) {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  // 验证代理商存在
  const [agent] = await db
    .select({
      id: agents.id,
      userId: agents.userId,
      totalCommission: agents.totalCommission,
      pendingWithdraw: agents.pendingWithdraw,
      frozenAmount: agents.frozenAmount,
      status: agents.status,
    })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) {
    throw new AppError("AGENT_NOT_FOUND", "代理商不存在", 404);
  }

  // 客户总数
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentClients)
    .where(eq(agentClients.agentId, agentId));
  const total = Number(totalResult?.count ?? 0);

  // 分页查询客户列表
  const rows = await db
    .select({
      id: agentClients.id,
      clientUserId: agentClients.clientUserId,
      email: users.email,
      nickname: users.nickname,
      userType: users.userType,
      status: users.status,
      balance: users.balance,
      boundAt: agentClients.createdAt,
    })
    .from(agentClients)
    .innerJoin(users, eq(agentClients.clientUserId, users.id))
    .where(eq(agentClients.agentId, agentId))
    .orderBy(desc(agentClients.createdAt))
    .limit(pageSize)
    .offset(offset);

  // 批量查询消费汇总
  const clientUserIds = rows.map((r) => r.clientUserId);
  let commissionMap = new Map<number, { totalCallCost: string; totalCommission: string; count: number }>();

  if (clientUserIds.length > 0) {
    const consRows = await db
      .select({
        customerUserId: agentCustomerConsumption.customerUserId,
        totalCallCost: agentCustomerConsumption.totalAmount,
        totalCommission: agentCustomerConsumption.commissionAmount,
        orderCount: agentCustomerConsumption.orderCount,
      })
      .from(agentCustomerConsumption)
      .where(
        and(
          eq(agentCustomerConsumption.agentId, agentId),
          inArray(agentCustomerConsumption.customerUserId, clientUserIds)
        )
      );

    for (const item of consRows) {
      commissionMap.set(item.customerUserId, {
        totalCallCost: item.totalCallCost ?? '0.000000',
        totalCommission: item.totalCommission ?? '0.000000',
        count: item.orderCount ?? 0,
      });
    }
  }

  // 代理商关联的用户信息
  const [agentUser] = await db
    .select({ email: users.email, nickname: users.nickname })
    .from(users)
    .where(eq(users.id, agent.userId))
    .limit(1);

  const totalCommission = num(agent.totalCommission);
  const withdrawn = 0;
  const pendingW = num(agent.pendingWithdraw);
  const frozen = num(agent.frozenAmount);
  const availableBalance = fmt(totalCommission - withdrawn - pendingW - frozen);

  return {
    agent: {
      id: agent.id,
      userId: agent.userId,
      email: agentUser?.email ?? null,
      nickname: agentUser?.nickname ?? null,
      totalCommission: agent.totalCommission,
      pendingWithdraw: agent.pendingWithdraw,
      frozenAmount: agent.frozenAmount,
      availableBalance,
      status: agent.status,
    },
    list: rows.map((r) => {
      const cm = commissionMap.get(r.clientUserId);
      return {
        clientUserId: r.clientUserId,
        email: r.email,
        nickname: r.nickname,
        userType: r.userType,
        status: r.status,
        balance: r.balance,
        boundAt: r.boundAt.toISOString(),
        totalCallCost: cm?.totalCallCost ?? "0.000000",
        totalCommission: cm?.totalCommission ?? "0.000000",
        commissionCount: cm?.count ?? 0,
      };
    }),
    total,
    page,
    pageSize,
  };
}

/**
 * 管理后台：绑定客户到代理商
 */
export async function bindAgentClient(
  operatorId: number,
  agentId: number,
  clientUserId: number,
) {
  const db = getDb();

  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) {
    throw new AppError("AGENT_NOT_FOUND", "代理商不存在", 404);
  }

  const [client] = await db
    .select({ id: users.id, email: users.email, nickname: users.nickname })
    .from(users)
    .where(eq(users.id, clientUserId))
    .limit(1);

  if (!client) {
    throw new AppError("CLIENT_NOT_FOUND", "客户用户不存在", 404);
  }

  const [existing] = await db
    .select({ id: agentClients.id })
    .from(agentClients)
    .where(eq(agentClients.clientUserId, clientUserId))
    .limit(1);

  if (existing) {
    throw new AppError("CLIENT_ALREADY_BOUND", "该客户已被其他代理商绑定", 400);
  }

  const [binding] = await db.transaction(async (tx) => {
    const [newBinding] = await tx
      .insert(agentClients)
      .values({ agentId, clientUserId })
      .returning();

    // 初始化消费汇总记录
    await tx
      .insert(agentCustomerConsumption)
      .values({
        agentId,
        customerUserId: clientUserId,
        customerName: client.nickname,
      })
      .onConflictDoNothing();

    const { auditLogs } = await import("../../db/schema.js");
    await tx.insert(auditLogs).values({
      operatorId,
      action: "agent_update",
      targetType: "agent_clients",
      targetId: newBinding.id,
      before: null,
      after: { agentId, clientUserId },
      ip: null,
      description: `管理员将客户 #${clientUserId}（${client.email}）绑定到代理商 #${agentId}`,
    });

    return [newBinding];
  });

  return {
    id: binding.id,
    agentId: binding.agentId,
    clientUserId: binding.clientUserId,
    clientEmail: client.email,
    clientNickname: client.nickname,
    createdAt: binding.createdAt.toISOString(),
  };
}
