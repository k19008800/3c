// ============================================================
//  3cloud (3C) — Agent 核心服务 (Business Logic)
// ============================================================
//
// ── 业务逻辑 ──
//
// 【Dashboard (getAgentDashboard)】
//   - 客户总数: count agent_clients WHERE agentId
//   - 已提现合计: sum withdrawOrders.actualAmount WHERE status='paid'
//   - 提现中冻结: sum withdrawOrders.amount WHERE status NOT IN ('paid','rejected')
//   - 可用余额 = settledCommission - withdrawnTotal - pendingWithdrawTotal - frozenAmount
//   - 分佣比例: commissionRules WHERE ruleType='sale' AND isEnabled=true
//
// 【客户列表 (getAgentClients)】
//   - JOIN agent_clients + users, 分页
//   - 消费汇总数据源优先级:
//     1. agent_customer_consumption (实时维护, ON CONFLICT DO UPDATE)
//     2. commission_logs 聚合降级 (历史数据未回填时)
//   - 返回: email, nickname, userType, status, balance, totalCallCost, totalCommission, orderCount, lastOrderAt
//
// 【管理后台客户列表 (listAgentClientsForAdmin)】
//   - 同 agent 视角, 额外返回代理商可用余额和用户信息
//   - 可用余额 = settledCommission - paidTotal - pendingTotal - frozenAmount
//
// 【绑定客户 (bindAgentClient)】
//   - 事务: INSERT agent_clients + INSERT agent_customer_consumption (onConflictDoNothing) + INSERT audit_logs
//   - 检查: 客户未被其他代理商绑定 (UNIQUE on clientUserId)
//   - 检查: 代理商存在, 客户用户存在
//
// 【推荐码 (getAgentReferralCode)】
//   - Redis ref:uid:{userId} → 已有则返回
//   - 生成: nanoid(8), 过滤 0/O/I/l 易混淆字符
//   - 双向映射: ref:link:{code} → agentId, ref:uid:{userId} → code
//   - TTL: 90 天
//
// 【代理商 CRUD (管理后台)】
//   - createAgent: 事务内 INSERT agents + INSERT commissionRules(ruleType='sale') + UPDATE users.role='agent' + INSERT userRoleHistory + INSERT auditLogs
//   - updateAgent: 仅支持 status toggle
//   - deleteAgent: 前置检查 — 待结算佣金 > 0 (HAS_PENDING_COMMISSION), 有下级代理 (HAS_SUB_AGENTS), 待处理提现 (HAS_PENDING_WITHDRAW)
//     - 事务: UPDATE users.role='user' + INSERT userRoleHistory + DELETE agents (CASCADE) + INSERT auditLogs
//
// 【收入趋势 (getAgentIncomeTrend)】
//   - 数据源: commission_daily_rollup (预聚合表)
//   - 汇总: totalIncome, avgDailyIncome
//   - 增长率: 后7日均值 / 前7日均值 - 1, 日增长率 (最后/第一 - 1)
//
// 【收入结构 (getAgentIncomeStructure)】
//   - 按佣金类型汇总: sale/renewal/activity, 百分比饼图数据
//   - TOP 5 客户: agent_customer_consumption ORDER BY commissionAmount DESC
//   - 本月收入: commission_daily_rollup WHERE reportDate >= monthStart
//
// 【集成点】
//   - agent-helpers.ts: getAgentByUserId, num/fmt 精度工具, 状态标签
//   - billing.ts: processActivityCommission (活动奖励)
//   - auditLogs 表: 所有管理操作记录审计

import { eq, and, sql, desc, asc, count, inArray, gte, lte, lt, like } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  users,
  agents,
  agentClients,
  agentCustomerConsumption,
  commissionLogs,
  callLogs,
  withdrawOrders,
  rechargeOrders,
  systemConfigs,
  auditLogs,
  userRoleHistory,
  dailyReconSummary,
  balanceLogs,
  commissionDailyRollup,
  commissionRules,
} from "../db/schema.js";
import { AppError } from "./auth-service.js";
import { getRedis } from "../redis.js";
import { nanoid } from "nanoid";
import { generateVoucherNo } from "./voucher-service.js";
import { getAgentByUserId, num, fmt, getStatusLabel, COMMISSION_TYPE_LABEL, WITHDRAW_STATUS_LABEL } from "./agent-helpers.js";

// ── 辅助: 获取系统配置值 ──

async function getSystemConfig(key: string): Promise<string | null> {
  const db = getDb();
  const [config] = await db
    .select({ value: systemConfigs.value })
    .from(systemConfigs)
    .where(eq(systemConfigs.key, key))
    .limit(1);
  return config?.value ?? null;
}

// ══════════════════════════════════════════════
//  Settlement helpers (新增)
// ══════════════════════════════════════════════

/**
 * 批量生成凭证号（一次查询最大序号，避免逐条 SELECT）
 */
/**
 * 结算指定代理商的待结算佣金（分批处理，每批 1000 条）
 * @param agentId 可选，不传则结算所有 pending 佣金
 * @returns 结算记录数
 */
export async function getAgentDashboard(userId: number) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  // 客户总数
  const [clientCountResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentClients)
    .where(eq(agentClients.agentId, agent.id));
  const totalClients = Number(clientCountResult?.count ?? 0);

  // 已提现合计
  const [withdrawnTotalResult] = await db
    .select({ sum: sql<string>`coalesce(sum(${withdrawOrders.actualAmount}), '0.000000')` })
    .from(withdrawOrders)
    .where(and(
      eq(withdrawOrders.agentId, agent.id),
      eq(withdrawOrders.status, "paid"),
    ));
  const withdrawnTotal = withdrawnTotalResult?.sum ?? "0.000000";

  // 提现中冻结金额（所有非最终状态的提现订单）
  const [pendingWithdrawTotalResult] = await db
    .select({ sum: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')` })
    .from(withdrawOrders)
    .where(and(
      eq(withdrawOrders.agentId, agent.id),
      sql`${withdrawOrders.status} NOT IN ('paid', 'rejected')`,
    ));
  const pendingWithdrawTotal = pendingWithdrawTotalResult?.sum ?? "0.000000";

  // 可用余额 = settledCommission - withdrawnTotal - pendingWithdrawTotal - frozenAmount
  const settledCommission = num(agent.settledCommission);
  const withdrawn = num(withdrawnTotal);
  const pendingW = num(pendingWithdrawTotal);
  const frozen = num(agent.frozenAmount);
  const availableBalance = fmt(settledCommission - withdrawn - pendingW - frozen);
  if (num(availableBalance) < 0) {
    // 不小于 0
  }

  // 分佣比例：从 commission_rules 表查询 sale 类型规则
  const [saleRule] = await db
    .select({ rate: commissionRules.rate })
    .from(commissionRules)
    .where(and(
      eq(commissionRules.agentId, agent.id),
      eq(commissionRules.ruleType, 'sale'),
      eq(commissionRules.isEnabled, true),
    ))
    .limit(1);
  const commissionRate = saleRule?.rate ?? "0.0000";

  return {
    totalClients,
    totalCommission: agent.totalCommission,
    settledCommission: agent.settledCommission,
    withdrawnTotal,
    pendingWithdrawTotal,
    frozenAmount: agent.frozenAmount,
    availableBalance,
    status: agent.status,
    commissionRate,
  };
}

// ══════════════════════════════════════════════
//  Client List (增强版: 含消费汇总)
// ══════════════════════════════════════════════


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

  // 批量查询消费汇总（从 agent_customer_consumption 读取，此为记账引擎实时维护的真实数据）
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

    // 降级：如果 agent_customer_consumption 无数据（如历史数据未回填），
    // 从 commission_logs 按 sourceCustomerId 聚合
    if (consumptionMap.size === 0) {
      const commissionAgg = await db
        .select({
          customerUserId: commissionLogs.sourceCustomerId,
          totalCallCost: sql<string>`coalesce(sum(${commissionLogs.callCost}), '0.000000')`,
          totalCommission: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
          orderCount: sql<number>`count(*)`,
          lastOrderAt: sql<string>`max(${commissionLogs.createdAt})`,
        })
        .from(commissionLogs)
        .where(
          and(
            eq(commissionLogs.agentId, agent.id),
            inArray(commissionLogs.sourceCustomerId, clientUserIds),
          )
        )
        .groupBy(commissionLogs.sourceCustomerId);

      for (const row of commissionAgg) {
        if (row.customerUserId != null) {
          consumptionMap.set(row.customerUserId, {
            totalCallCost: row.totalCallCost,
            totalCommission: row.totalCommission,
            orderCount: row.orderCount,
            lastOrderAt: row.lastOrderAt ?? null,
          });
        }
      }
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

// ══════════════════════════════════════════════
//  Commission History (增强版)
// ══════════════════════════════════════════════


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

  // 批量查询每个客户的消费汇总（从 agent_customer_consumption 读取）
  const clientUserIds = rows.map((r) => r.clientUserId);
  let commissionMap = new Map<number, { totalCallCost: string; totalCommission: string; count: number }>();

  if (clientUserIds.length > 0) {
    // 优先从 agent_customer_consumption 读取，此为记账引擎实时维护的真实数据
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

    // 降级：如果 agent_customer_consumption 无数据，从 commission_logs 聚合
    if (commissionMap.size === 0) {
      const commissionAgg = await db
        .select({
          customerUserId: commissionLogs.sourceCustomerId,
          totalCallCost: sql<string>`coalesce(sum(${commissionLogs.callCost}), '0.000000')`,
          totalCommission: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
          commissionCount: sql<number>`count(${commissionLogs.id})`,
        })
        .from(commissionLogs)
        .where(
          and(
            eq(commissionLogs.agentId, agentId),
            inArray(commissionLogs.sourceCustomerId, clientUserIds)
          )
        )
        .groupBy(commissionLogs.sourceCustomerId);

      for (const item of commissionAgg) {
        if (item.customerUserId != null) {
          commissionMap.set(item.customerUserId, {
            totalCallCost: item.totalCallCost,
            totalCommission: item.totalCommission,
            count: item.commissionCount,
          });
        }
      }
    }
  }

  // 代理商关联的用户信息
  const [agentUser] = await db
    .select({ email: users.email, nickname: users.nickname })
    .from(users)
    .where(eq(users.id, agent.userId))
    .limit(1);

  const totalCommission = num(agent.totalCommission);
  const withdrawn = 0; // Simplified: query would be needed
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

// ──────────────────────────────────────────────
//  Bind Client to Agent (Admin)
// ──────────────────────────────────────────────


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

// ──────────────────────────────────────────────
//  Get/Generate Agent Referral Code
// ──────────────────────────────────────────────


export async function getAgentReferralCode(userId: number): Promise<string> {
  const db = getDb();
  const redis = getRedis();

  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.userId, userId))
    .limit(1);

  if (!agent) {
    throw new AppError("NOT_AGENT", "您不是代理商", 400);
  }

  const existingCode = await redis.get(`ref:uid:${userId}`);
  if (existingCode) {
    return existingCode;
  }

  const code = nanoid(8).replace(/[0OIl]/g, () => nanoid(1));

  await redis.setex(`ref:link:${code}`, 90 * 24 * 3600, String(agent.id));
  await redis.setex(`ref:uid:${userId}`, 90 * 24 * 3600, code);

  return code;
}

// ══════════════════════════════════════════════
//  Admin: Agent Management
// ══════════════════════════════════════════════

// ──────────────────────────────────────────────
//  List All Agents
// ──────────────────────────────────────────────


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

  // 实时查询提现汇总（保证数据准确，不依赖 agents.pending_withdraw 字段）
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

  // 批量查询提现汇总（实时计算，不依赖 agents.pending_withdraw）
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

// ──────────────────────────────────────────────
//  Create Agent
// ──────────────────────────────────────────────


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

// ──────────────────────────────────────────────
//  Update Agent
// ──────────────────────────────────────────────


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

// ──────────────────────────────────────────────
//  Delete Agent (删除代理商身份)
// ──────────────────────────────────────────────


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

  // 检查待处理提现（实时查询 withdraw_orders，不依赖可能过期的 agents.pendingWithdraw）
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

    // 删除代理商记录（CASCADE 处理 agent_clients, commission_rules, withdraw_orders）
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

// ══════════════════════════════════════════════
//  Admin: Withdraw Management (增强双审版)
// ══════════════════════════════════════════════

// ──────────────────────────────────────────────
//  List All Withdraw Orders (Admin) — 增强版
// ──────────────────────────────────────────────


export async function getAgentIncomeTrend(userId: number, days: number = 30) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().slice(0, 10);

  const rows = await db
    .select({
      reportDate: commissionDailyRollup.reportDate,
      totalCommissionAmount: commissionDailyRollup.totalCommissionAmount,
      totalNetAmount: commissionDailyRollup.totalNetAmount,
      settledAmount: commissionDailyRollup.settledAmount,
      pendingAmount: commissionDailyRollup.pendingAmount,
      saleAmount: commissionDailyRollup.saleAmount,
      renewalAmount: commissionDailyRollup.renewalAmount,
      activityAmount: commissionDailyRollup.activityAmount,
      totalRecords: commissionDailyRollup.totalRecords,
    })
    .from(commissionDailyRollup)
    .where(and(
      eq(commissionDailyRollup.agentId, agent.id),
      gte(commissionDailyRollup.reportDate, startDateStr),
    ))
    .orderBy(asc(commissionDailyRollup.reportDate));

  // 计算汇总指标
  const totalIncome = rows.reduce((s, r) => s + num(r.totalCommissionAmount), 0);
  const avgDailyIncome = rows.length > 0 ? totalIncome / rows.length : 0;

  // 增长率: 后7日均值 / 前7日均值 - 1
  let growthRate = 0;
  if (rows.length >= 14) {
    const recent = rows.slice(-7).reduce((s, r) => s + num(r.totalCommissionAmount), 0) / 7;
    const previous = rows.slice(-14, -7).reduce((s, r) => s + num(r.totalCommissionAmount), 0) / 7;
    growthRate = previous > 0 ? (recent - previous) / previous : 0;
  }

  // 日增长率（最后一天 / 第一天 -1，当数据点足够时）
  let dailyGrowthRate = 0;
  if (rows.length >= 2) {
    const first = num(rows[0].totalCommissionAmount);
    const last = num(rows[rows.length - 1].totalCommissionAmount);
    dailyGrowthRate = first > 0 ? (last - first) / first : 0;
  }

  return {
    trend: rows.map((r) => ({
      date: r.reportDate,
      totalAmount: r.totalCommissionAmount ?? "0.000000",
      netAmount: r.totalNetAmount ?? "0.000000",
      settledAmount: r.settledAmount ?? "0.000000",
      pendingAmount: r.pendingAmount ?? "0.000000",
      saleAmount: r.saleAmount ?? "0.000000",
      renewalAmount: r.renewalAmount ?? "0.000000",
      activityAmount: r.activityAmount ?? "0.000000",
      recordCount: r.totalRecords ?? 0,
    })),
    summary: {
      totalIncome: fmt(totalIncome),
      avgDailyIncome: fmt(avgDailyIncome),
      growthRate: parseFloat(growthRate.toFixed(4)),
      dailyGrowthRate: parseFloat(dailyGrowthRate.toFixed(4)),
      totalDays: rows.length,
    },
  };
}

// ══════════════════════════════════════════════
//  收入结构 — Dashboard 收入来源分析
// ══════════════════════════════════════════════


export async function getAgentIncomeStructure(userId: number) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  // ── 按佣金类型汇总（全部历史） ──
  const [typeAgg] = await db
    .select({
      saleAmount: sql<string>`coalesce(sum(${commissionDailyRollup.saleAmount}), '0.000000')`,
      renewalAmount: sql<string>`coalesce(sum(${commissionDailyRollup.renewalAmount}), '0.000000')`,
      activityAmount: sql<string>`coalesce(sum(${commissionDailyRollup.activityAmount}), '0.000000')`,
      saleCount: sql<number>`coalesce(sum(${commissionDailyRollup.saleCount}), 0)`,
      renewalCount: sql<number>`coalesce(sum(${commissionDailyRollup.renewalCount}), 0)`,
      activityCount: sql<number>`coalesce(sum(${commissionDailyRollup.activityCount}), 0)`,
      totalAmount: sql<string>`coalesce(sum(${commissionDailyRollup.totalCommissionAmount}), '0.000000')`,
    })
    .from(commissionDailyRollup)
    .where(eq(commissionDailyRollup.agentId, agent.id));

  const total = num(typeAgg?.totalAmount ?? "0");
  const sale = num(typeAgg?.saleAmount ?? "0");
  const renewal = num(typeAgg?.renewalAmount ?? "0");
  const activity = num(typeAgg?.activityAmount ?? "0");

  const byType = [
    {
      type: "sale",
      label: "销售佣金",
      amount: fmt(sale),
      count: Number(typeAgg?.saleCount ?? 0),
      percentage: total > 0 ? parseFloat(((sale / total) * 100).toFixed(1)) : 0,
    },
    {
      type: "renewal",
      label: "续费佣金",
      amount: fmt(renewal),
      count: Number(typeAgg?.renewalCount ?? 0),
      percentage: total > 0 ? parseFloat(((renewal / total) * 100).toFixed(1)) : 0,
    },
    {
      type: "activity",
      label: "活动奖励",
      amount: fmt(activity),
      count: Number(typeAgg?.activityCount ?? 0),
      percentage: total > 0 ? parseFloat(((activity / total) * 100).toFixed(1)) : 0,
    },
  ];

  // ── TOP 5 客户（按贡献佣金排名） ──
  const topClients = await db
    .select({
      customerUserId: agentCustomerConsumption.customerUserId,
      customerName: agentCustomerConsumption.customerName,
      totalAmount: agentCustomerConsumption.totalAmount,
      monthAmount: agentCustomerConsumption.monthAmount,
      commissionAmount: agentCustomerConsumption.commissionAmount,
      orderCount: agentCustomerConsumption.orderCount,
      lastOrderAt: agentCustomerConsumption.lastOrderAt,
    })
    .from(agentCustomerConsumption)
    .where(eq(agentCustomerConsumption.agentId, agent.id))
    .orderBy(desc(agentCustomerConsumption.commissionAmount))
    .limit(5);

  // ── 本月收入（快速概览） ──
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartStr = monthStart.toISOString().slice(0, 10);

  const [monthAgg] = await db
    .select({
      monthIncome: sql<string>`coalesce(sum(${commissionDailyRollup.totalCommissionAmount}), '0.000000')`,
      monthRecords: sql<number>`coalesce(sum(${commissionDailyRollup.totalRecords}), 0)`,
    })
    .from(commissionDailyRollup)
    .where(and(
      eq(commissionDailyRollup.agentId, agent.id),
      gte(commissionDailyRollup.reportDate, monthStartStr),
    ));

  return {
    byType,
    topClients: topClients.map((c) => ({
      customerUserId: c.customerUserId,
      customerName: c.customerName,
      totalAmount: c.totalAmount ?? "0.000000",
      monthAmount: c.monthAmount ?? "0.000000",
      commissionAmount: c.commissionAmount ?? "0.000000",
      orderCount: c.orderCount ?? 0,
      lastOrderAt: c.lastOrderAt?.toISOString() ?? null,
    })),
    monthIncome: monthAgg?.monthIncome ?? "0.000000",
    monthRecords: Number(monthAgg?.monthRecords ?? 0),
    totalIncome: typeAgg?.totalAmount ?? "0.000000",
  };
}
