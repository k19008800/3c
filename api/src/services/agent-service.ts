// ============================================================
//  3cloud (3C) — Agent 服务层
//  代理商面板 / 客户管理 / 佣金 / 提现 / 管理后台
//  Version: V3.5 — 增强双审财务体系
// ============================================================

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
export async function settleCommissions(agentId?: number): Promise<number> {
  const db = getDb();
  const BATCH_SIZE = 1000;
  let totalSettled = 0;
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // 先获取当前最大凭证序号
  const seqResult = await db.execute(sql`
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(voucher_no FROM '([0-9]+)$') AS INTEGER)), 0
    ) + 1 AS next_seq
    FROM commission_logs
    WHERE voucher_no LIKE 'VCH-' || ${dateStr} || '-A-%'
  `);
  const rows = seqResult?.rows ?? [];
  let nextSeq = Number(rows[0]?.next_seq ?? 1);

  const baseConditions: any[] = [eq(commissionLogs.status, "pending")];
  if (agentId) baseConditions.push(eq(commissionLogs.agentId, agentId));

  while (true) {
    // 每次只取一批，不全部加载到内存
    const batch = await db
      .select({
        id: commissionLogs.id,
        agentId: commissionLogs.agentId,
        commissionAmount: commissionLogs.commissionAmount,
        createdAt: commissionLogs.createdAt,
      })
      .from(commissionLogs)
      .where(and(...baseConditions))
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    // 按代理商分组汇总 + 预分配凭证号 + 收集受影响的 (agentId, date) 对
    const agentSumMap = new Map<number, number>();
    const batchIds: number[] = [];
    const voucherMap = new Map<number, string>();
    const affectedDates = new Map<number, Set<string>>();
    for (const c of batch) {
      batchIds.push(c.id);
      voucherMap.set(c.id, `VCH-${dateStr}-A-${String(nextSeq++).padStart(4, '0')}`);
      const cur = agentSumMap.get(c.agentId) ?? 0;
      agentSumMap.set(c.agentId, cur + num(c.commissionAmount));
      const d = c.createdAt.toISOString().slice(0, 10);
      if (!affectedDates.has(c.agentId)) affectedDates.set(c.agentId, new Set());
      affectedDates.get(c.agentId)!.add(d);
    }

    // 事务处理：更新状态 + 累加余额
    await db.transaction(async (tx) => {
      await tx
        .update(commissionLogs)
        .set({ status: "settled", settledAt: new Date() })
        .where(inArray(commissionLogs.id, batchIds));

      for (const [aid, amount] of agentSumMap) {
        await tx
          .update(agents)
          .set({ settledCommission: sql`settled_commission + ${amount}` })
          .where(eq(agents.id, aid));
      }
    });

    // 批量更新凭证号（非事务，可容忍部分失败）
    for (const [id, no] of voucherMap) {
      try {
        await db.update(commissionLogs).set({ voucherNo: no }).where(eq(commissionLogs.id, id));
      } catch (err) {
        console.error(`[Voucher] 凭证号更新失败 (id=${id}, no=${no}):`, err);
      }
    }

    // 刷新 rollup（同步状态分布）
    for (const [aid, dates] of affectedDates) {
      for (const d of dates) {
        await refreshRollupForAgentDate(aid, d);
      }
    }

    totalSettled += batch.length;
    console.log(`[Settle] Batch completed: ${batch.length} records (total ${totalSettled})`);
  }

  return totalSettled;
}

/**
 * 手动批量结算指定 ID 的佣金记录（分批处理）
 */
export async function batchSettleCommissions(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = getDb();
  const BATCH_SIZE = 1000;
  let totalSettled = 0;
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // 先获取当前最大序号
  const seqResult = await db.execute(sql`
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(voucher_no FROM '([0-9]+)$') AS INTEGER)), 0
    ) + 1 AS next_seq
    FROM commission_logs
    WHERE voucher_no LIKE 'VCH-' || ${dateStr} || '-A-%'
  `);
  const rows = seqResult?.rows ?? [];
  let nextSeq = Number(rows[0]?.next_seq ?? 1);

  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const batchIds = ids.slice(offset, offset + BATCH_SIZE);

    const pendingList = await db
      .select({
        id: commissionLogs.id,
        agentId: commissionLogs.agentId,
        commissionAmount: commissionLogs.commissionAmount,
        createdAt: commissionLogs.createdAt,
      })
      .from(commissionLogs)
      .where(and(eq(commissionLogs.status, "pending"), inArray(commissionLogs.id, batchIds)));

    if (pendingList.length === 0) continue;

    // 收集受影响的 (agentId, date) 对，后面刷新 rollup
    const affectedRows = new Map<string, Set<number>>();
    for (const c of pendingList) {
      const date = c.createdAt.toISOString().slice(0, 10);
      const key = `${c.agentId}|${date}`;
      if (!affectedRows.has(key)) affectedRows.set(key, new Set());
      affectedRows.get(key)!.add(c.agentId);
    }

    // 按代理商分组
    const agentSumMap = new Map<number, number>();
    const settleIds: number[] = [];
    for (const c of pendingList) {
      settleIds.push(c.id);
      const cur = agentSumMap.get(c.agentId) ?? 0;
      agentSumMap.set(c.agentId, cur + num(c.commissionAmount));
    }

    // 准备批量凭证号
    const voucherMap = new Map<number, string>();
    for (const id of settleIds) {
      voucherMap.set(id, `VCH-${dateStr}-A-${String(nextSeq++).padStart(4, '0')}`);
    }

    await db.transaction(async (tx) => {
      await tx
        .update(commissionLogs)
        .set({ status: "settled", settledAt: new Date() })
        .where(inArray(commissionLogs.id, settleIds));

      for (const [aid, amount] of agentSumMap) {
        await tx
          .update(agents)
          .set({ settledCommission: sql`settled_commission + ${amount}` })
          .where(eq(agents.id, aid));
      }
    });

    // 批量更新凭证号
    for (const [id, no] of voucherMap) {
      await db.update(commissionLogs).set({ voucherNo: no }).where(eq(commissionLogs.id, id));
    }

    // 刷新 rollup（同步状态分布）
    for (const [key, agentSet] of affectedRows) {
      const date = key.split("|")[1];
      for (const aid of agentSet) {
        await refreshRollupForAgentDate(aid, date);
      }
    }

    totalSettled += pendingList.length;
    console.log(`[BatchSettle] Batch ${offset / BATCH_SIZE + 1}: ${pendingList.length} records`);
  }

  return totalSettled;
}

/**
 * 按筛选条件批量结算佣金
 * 复用 listAllCommissions 的筛选逻辑，找出匹配的 pending 记录后交由 batchSettleCommissions 执行
 */
export async function settleCommissionsByFilters(filters?: {
  agentId?: number;
  startDate?: string;
  endDate?: string;
  commissionType?: string;
}): Promise<number> {
  const db = getDb();
  const conditions: any[] = [eq(commissionLogs.status, "pending")];

  if (filters?.agentId) {
    conditions.push(eq(commissionLogs.agentId, filters.agentId));
  }
  if (filters?.startDate) {
    conditions.push(gte(commissionLogs.createdAt, new Date(filters.startDate + 'T00:00:00Z')));
  }
  if (filters?.endDate) {
    conditions.push(lte(commissionLogs.createdAt, new Date(filters.endDate + 'T23:59:59.999Z')));
  }
  if (filters?.commissionType) {
    conditions.push(eq(commissionLogs.commissionType, filters.commissionType));
  }

  const pendingList = await db
    .select({ id: commissionLogs.id })
    .from(commissionLogs)
    .where(and(...conditions));

  if (pendingList.length === 0) return 0;

  return batchSettleCommissions(pendingList.map((c) => c.id));
}

/**
 * 批量作废佣金记录
 */
export async function batchCancelCommissions(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = getDb();

  // 先查出受影响的 (agentId, date) 对
  const affected = await db
    .select({
      agentId: commissionLogs.agentId,
      createdAt: commissionLogs.createdAt,
    })
    .from(commissionLogs)
    .where(and(eq(commissionLogs.status, "pending"), inArray(commissionLogs.id, ids)));

  await db
    .update(commissionLogs)
    .set({ status: "cancelled" })
    .where(and(eq(commissionLogs.status, "pending"), inArray(commissionLogs.id, ids)));

  // 刷新 rollup
  const seen = new Set<string>();
  for (const r of affected) {
    const date = r.createdAt.toISOString().slice(0, 10);
    const key = `${r.agentId}|${date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await refreshRollupForAgentDate(r.agentId, date);
  }

  return ids.length;
}

// ── 辅助: 获取代理商记录 ──

async function getAgentByUserId(userId: number) {
  const db = getDb();
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.userId, userId))
    .limit(1);
  if (!agent) {
    throw new AppError("NOT_AGENT", "您不是代理商", 400);
  }
  return agent;
}

// ── 辅助: 金额运算（字符串转数字）─

function num(s: string | number | null | undefined): number {
  if (s == null) return 0;
  return typeof s === 'number' ? s : parseFloat(s) || 0;
}

function fmt(n: number): string {
  return n.toFixed(6);
}

// ── 辅助: 状态中文映射 ──

const WITHDRAW_STATUS_LABEL: Record<string, string> = {
  pending_first_review: "待初审",
  pending_second_review: "待复审",
  approved: "已通过（待打款）",
  rejected: "已拒绝",
  paid: "已打款",
};

const COMMISSION_TYPE_LABEL: Record<string, string> = {
  sale: "销售佣金",
  team: "团队佣金",
  activity: "活动奖励",
  renewal: "续费佣金",
};

function getStatusLabel(status: string, map: Record<string, string>): string {
  return map[status] || status;
}

// ══════════════════════════════════════════════
//  Agent Dashboard (增强版)
// ══════════════════════════════════════════════

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

export async function getAgentCommissions(
  userId: number,
  page: number,
  pageSize: number,
  filters?: {
    status?: string;
    commissionType?: string;
    startDate?: string;
    endDate?: string;
    customerSearch?: string;
  },
) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [eq(commissionLogs.agentId, agent.id)];
  if (filters?.status) {
    conditions.push(eq(commissionLogs.status, filters.status as any));
  }
  if (filters?.commissionType) {
    conditions.push(eq(commissionLogs.commissionType, filters.commissionType));
  }
  if (filters?.startDate) {
    conditions.push(gte(commissionLogs.createdAt, new Date(filters.startDate)));
  }
  if (filters?.endDate) {
    conditions.push(lte(commissionLogs.createdAt, new Date(filters.endDate)));
  }
  if (filters?.customerSearch) {
    const kw = `%${filters.customerSearch}%`;
    conditions.push(sql`(${users.nickname} ILIKE ${kw} OR ${users.email} ILIKE ${kw})`);
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commissionLogs)
    .leftJoin(users, eq(commissionLogs.sourceCustomerId, users.id))
    .where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: commissionLogs.id,
      callCost: commissionLogs.callCost,
      commissionAmount: commissionLogs.commissionAmount,
      commissionType: commissionLogs.commissionType,
      voucherNo: commissionLogs.voucherNo,
      sourceOrderId: commissionLogs.sourceOrderId,
      sourceOrderAmount: commissionLogs.sourceOrderAmount,
      feeRate: commissionLogs.feeRate,
      feeAmount: commissionLogs.feeAmount,
      netAmount: commissionLogs.netAmount,
      calcDetail: commissionLogs.calcDetail,
      ruleSnapshot: commissionLogs.ruleSnapshot,
      status: commissionLogs.status,
      createdAt: commissionLogs.createdAt,
      settledAt: commissionLogs.settledAt,
      sourceCustomerId: commissionLogs.sourceCustomerId,
      customerName: users.nickname,
      customerEmail: users.email,
    })
    .from(commissionLogs)
    .leftJoin(users, eq(commissionLogs.sourceCustomerId, users.id))
    .where(and(...conditions))
    .orderBy(desc(commissionLogs.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      id: r.id,
      callCost: r.callCost,
      commissionAmount: r.commissionAmount,
      commissionType: r.commissionType,
      commissionTypeLabel: getStatusLabel(r.commissionType ?? "", COMMISSION_TYPE_LABEL),
      voucherNo: r.voucherNo,
      sourceOrderId: r.sourceOrderId,
      sourceOrderAmount: r.sourceOrderAmount,
      feeRate: r.feeRate,
      feeAmount: r.feeAmount ?? "0.000000",
      netAmount: r.netAmount ?? "0.000000",
      calcDetail: r.calcDetail,
      ruleSnapshot: r.ruleSnapshot,
      status: r.status,
      customerName: r.customerName,
      customerEmail: r.customerEmail,
      createdAt: r.createdAt.toISOString(),
      settledAt: r.settledAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  };
}

// ══════════════════════════════════════════════
//  佣金汇总统计 (代理商视角)
// ══════════════════════════════════════════════

export async function getAgentCommissionSummary(userId: number) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  // 当前月份范围
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalStat] = await db
    .select({
      totalCommission: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
      pendingAmount: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}) filter (where ${commissionLogs.status} = 'pending'), '0.000000')`,
      settledAmount: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}) filter (where ${commissionLogs.status} = 'settled'), '0.000000')`,
      pendingCount: sql<number>`count(*) filter (where ${commissionLogs.status} = 'pending')`,
      settledCount: sql<number>`count(*) filter (where ${commissionLogs.status} = 'settled')`,
    })
    .from(commissionLogs)
    .where(eq(commissionLogs.agentId, agent.id));

  const [monthStat] = await db
    .select({
      monthCommission: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
      monthCount: sql<number>`count(*)`,
    })
    .from(commissionLogs)
    .where(and(
      eq(commissionLogs.agentId, agent.id),
      gte(commissionLogs.createdAt, monthStart),
    ));

  return {
    totalCommission: totalStat?.totalCommission ?? "0.000000",
    monthCommission: monthStat?.monthCommission ?? "0.000000",
    monthCount: Number(monthStat?.monthCount ?? 0),
    pendingAmount: totalStat?.pendingAmount ?? "0.000000",
    pendingCount: Number(totalStat?.pendingCount ?? 0),
    settledAmount: totalStat?.settledAmount ?? "0.000000",
    settledCount: Number(totalStat?.settledCount ?? 0),
  };
}

// ══════════════════════════════════════════════
//  单条佣金详情
// ══════════════════════════════════════════════

export async function getAgentCommissionDetail(userId: number, commissionId: number) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  const [row] = await db
    .select({
      id: commissionLogs.id,
      callCost: commissionLogs.callCost,
      commissionAmount: commissionLogs.commissionAmount,
      commissionType: commissionLogs.commissionType,
      voucherNo: commissionLogs.voucherNo,
      sourceOrderId: commissionLogs.sourceOrderId,
      sourceOrderAmount: commissionLogs.sourceOrderAmount,
      feeRate: commissionLogs.feeRate,
      feeAmount: commissionLogs.feeAmount,
      netAmount: commissionLogs.netAmount,
      calcDetail: commissionLogs.calcDetail,
      ruleSnapshot: commissionLogs.ruleSnapshot,
      status: commissionLogs.status,
      createdAt: commissionLogs.createdAt,
      settledAt: commissionLogs.settledAt,
      sourceCustomerId: commissionLogs.sourceCustomerId,
      customerName: users.nickname,
      customerEmail: users.email,
    })
    .from(commissionLogs)
    .leftJoin(users, eq(commissionLogs.sourceCustomerId, users.id))
    .where(and(
      eq(commissionLogs.id, commissionId),
      eq(commissionLogs.agentId, agent.id),
    ))
    .limit(1);

  if (!row) {
    throw new AppError("NOT_FOUND", "佣金记录不存在", 404);
  }

  return {
    id: row.id,
    callCost: row.callCost,
    commissionAmount: row.commissionAmount,
    commissionType: row.commissionType,
    commissionTypeLabel: getStatusLabel(row.commissionType ?? "", COMMISSION_TYPE_LABEL),
    voucherNo: row.voucherNo,
    sourceOrderId: row.sourceOrderId,
    sourceOrderAmount: row.sourceOrderAmount,
    feeRate: row.feeRate,
    feeAmount: row.feeAmount ?? "0.000000",
    netAmount: row.netAmount ?? "0.000000",
    calcDetail: row.calcDetail,
    ruleSnapshot: row.ruleSnapshot,
    status: row.status,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    sourceCustomerId: row.sourceCustomerId,
    createdAt: row.createdAt.toISOString(),
    settledAt: row.settledAt?.toISOString() ?? null,
  };
}

// ══════════════════════════════════════════════
//  佣金 CSV 导出 (代理商视角)
// ══════════════════════════════════════════════

export async function exportAgentCommissionsCsv(
  userId: number,
  filters?: {
    status?: string;
    commissionType?: string;
    startDate?: string;
    endDate?: string;
  },
): Promise<string> {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  const conditions: any[] = [eq(commissionLogs.agentId, agent.id)];
  if (filters?.status) {
    conditions.push(eq(commissionLogs.status, filters.status as any));
  }
  if (filters?.commissionType) {
    conditions.push(eq(commissionLogs.commissionType, filters.commissionType));
  }
  if (filters?.startDate) {
    conditions.push(gte(commissionLogs.createdAt, new Date(filters.startDate)));
  }
  if (filters?.endDate) {
    conditions.push(lte(commissionLogs.createdAt, new Date(filters.endDate)));
  }

  const rows = await db
    .select({
      id: commissionLogs.id,
      callCost: commissionLogs.callCost,
      commissionAmount: commissionLogs.commissionAmount,
      commissionType: commissionLogs.commissionType,
      voucherNo: commissionLogs.voucherNo,
      sourceOrderId: commissionLogs.sourceOrderId,
      sourceOrderAmount: commissionLogs.sourceOrderAmount,
      feeRate: commissionLogs.feeRate,
      feeAmount: commissionLogs.feeAmount,
      netAmount: commissionLogs.netAmount,
      status: commissionLogs.status,
      createdAt: commissionLogs.createdAt,
      settledAt: commissionLogs.settledAt,
      customerName: users.nickname,
      customerEmail: users.email,
    })
    .from(commissionLogs)
    .leftJoin(users, eq(commissionLogs.sourceCustomerId, users.id))
    .where(and(...conditions))
    .orderBy(desc(commissionLogs.createdAt));

  const STATUS_LABEL: Record<string, string> = {
    pending: "待结算",
    settled: "已结算",
    cancelled: "已取消",
  };

  const lines: string[] = [];
  lines.push('"3cloud 代理商佣金导出"');
  lines.push(`"导出时间","${new Date().toISOString()}"`);
  if (filters?.status) lines.push(`"筛选状态","${STATUS_LABEL[filters.status] || filters.status}"`);
  if (filters?.startDate) lines.push(`"开始日期","${filters.startDate}"`);
  if (filters?.endDate) lines.push(`"结束日期","${filters.endDate}"`);
  lines.push('');
  lines.push('"ID","客户昵称","客户邮箱","调用成本","佣金金额","手续费","净佣金","类型","状态","凭证号","关联订单","创建时间","结算时间"');

  for (const r of rows) {
    const esc = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
    lines.push([
      r.id,
      esc(r.customerName),
      esc(r.customerEmail),
      r.callCost,
      r.commissionAmount,
      r.feeAmount ?? "0.000000",
      r.netAmount ?? "0.000000",
      COMMISSION_TYPE_LABEL[r.commissionType ?? ""] || r.commissionType || "",
      STATUS_LABEL[r.status] || r.status,
      esc(r.voucherNo),
      esc(r.sourceOrderId),
      r.createdAt.toISOString(),
      r.settledAt?.toISOString() ?? "",
    ].join(","));
  }

  return lines.join("\n");
}

// ══════════════════════════════════════════════
//  获取上次成功提现的银行信息（预填用）
// ══════════════════════════════════════════════

export async function getSavedBankInfo(userId: number): Promise<{ bankCardNo: string | null; bankName: string | null } | null> {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  const [lastPaid] = await db
    .select({
      bankCardNo: withdrawOrders.bankCardNo,
      bankName: withdrawOrders.bankName,
    })
    .from(withdrawOrders)
    .where(
      and(
        eq(withdrawOrders.agentId, agent.id),
        eq(withdrawOrders.status, "paid"),
      ),
    )
    .orderBy(desc(withdrawOrders.createdAt))
    .limit(1);

  if (!lastPaid || !lastPaid.bankCardNo) {
    return null;
  }

  return {
    bankCardNo: lastPaid.bankCardNo,
    bankName: lastPaid.bankName,
  };
}

// ══════════════════════════════════════════════
//  Withdraw Request (增强版: 双审 + 银行卡 + fee)
// ══════════════════════════════════════════════

export async function createWithdraw(userId: number, amount: string, bankCardNo: string, bankName: string) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    throw new AppError("INVALID_AMOUNT", "提现金额必须大于 0", 400);
  }

  // 检查最小提现金额
  const minWithdrawStr = await getSystemConfig("agent_min_withdraw");
  if (minWithdrawStr) {
    const minWithdraw = parseFloat(minWithdrawStr);
    if (amountNum < minWithdraw) {
      throw new AppError("BELOW_MIN_WITHDRAW", `最低提现金额为 ${minWithdraw.toFixed(2)} 元`, 400);
    }
  }

  // 检查每日提现次数限制
  const dailyLimitStr = await getSystemConfig("agent_daily_withdraw_limit");
  if (dailyLimitStr) {
    const dailyLimit = parseInt(dailyLimitStr, 10);
    if (dailyLimit > 0) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [dailyCountResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(withdrawOrders)
        .where(
          and(
            eq(withdrawOrders.agentId, agent.id),
            sql`${withdrawOrders.createdAt} >= ${todayStart.toISOString()}`,
          ),
        );

      const dailyCount = Number(dailyCountResult?.count ?? 0);
      if (dailyCount >= dailyLimit) {
        throw new AppError("DAILY_LIMIT_REACHED", `每日最多提现 ${dailyLimit} 次`, 400);
      }
    }
  }

  // 检查可用余额（实时计算，与 Dashboard 展示逻辑一致）
  const [withdrawnTotalResult] = await db
    .select({ sum: sql<string>`coalesce(sum(${withdrawOrders.actualAmount}), '0.000000')` })
    .from(withdrawOrders)
    .where(and(
      eq(withdrawOrders.agentId, agent.id),
      eq(withdrawOrders.status, "paid"),
    ));
  const withdrawnTotal = withdrawnTotalResult?.sum ?? "0.000000";

  const [pendingWithdrawTotalResult] = await db
    .select({ sum: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')` })
    .from(withdrawOrders)
    .where(and(
      eq(withdrawOrders.agentId, agent.id),
      sql`${withdrawOrders.status} NOT IN ('paid', 'rejected')`,
    ));
  const pendingWithdrawTotal = pendingWithdrawTotalResult?.sum ?? "0.000000";

  const settledCommission = num(agent.settledCommission);
  const withdrawn = num(withdrawnTotal);
  const pendingW = num(pendingWithdrawTotal);
  const frozen = num(agent.frozenAmount);
  const availableBalance = fmt(settledCommission - withdrawn - pendingW - frozen);

  if (amountNum > num(availableBalance)) {
    throw new AppError("INSUFFICIENT_BALANCE", `可提现余额不足。当前可提现: ${fmt(num(availableBalance))} 元`, 400);
  }

  // 获取提现手续费率
  const feeRateStr = await getSystemConfig("withdraw_fee_rate");
  const feeRate = feeRateStr ? parseFloat(feeRateStr) : 0;
  const feeAmount = amountNum * feeRate;
  const actualAmount = amountNum - feeAmount;

  // 生成凭证号
  const voucherNo = await generateVoucherNo('B');

  const [order] = await db.transaction(async (tx) => {
    // 扣减待提现余额
    await tx
      .update(agents)
      .set({
        pendingWithdraw: sql`${agents.pendingWithdraw} - ${amountNum.toFixed(6)}`,
      })
      .where(eq(agents.id, agent.id));

    // 创建提现订单（默认待初审）
    const [newOrder] = await tx
      .insert(withdrawOrders)
      .values({
        agentId: agent.id,
        amount: amountNum.toFixed(6),
        feeAmount: feeAmount.toFixed(6),
        actualAmount: Math.max(0, actualAmount).toFixed(6),
        bankCardNo,
        bankName,
        voucherNo,
        status: "pending_first_review",
        auditLevel: 1,
      })
      .returning();

    return [newOrder];
  });

  return {
    id: order.id,
    voucherNo: order.voucherNo,
    amount: order.amount,
    feeAmount: order.feeAmount,
    actualAmount: order.actualAmount,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
  };
}

// ══════════════════════════════════════════════
//  My Withdraw Orders (增强版)
// ══════════════════════════════════════════════

export async function getAgentWithdraws(
  userId: number,
  page: number,
  pageSize: number,
  status?: string,
) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);
  const offset = (page - 1) * pageSize;

  const conditions = [eq(withdrawOrders.agentId, agent.id)];
  if (status) {
    conditions.push(eq(withdrawOrders.status, status as any));
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(withdrawOrders)
    .where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: withdrawOrders.id,
      voucherNo: withdrawOrders.voucherNo,
      amount: withdrawOrders.amount,
      feeAmount: withdrawOrders.feeAmount,
      actualAmount: withdrawOrders.actualAmount,
      bankCardNo: withdrawOrders.bankCardNo,
      bankName: withdrawOrders.bankName,
      bankVoucherUrl: withdrawOrders.bankVoucherUrl,
      wechatPayNo: withdrawOrders.wechatPayNo,
      status: withdrawOrders.status,
      auditLevel: withdrawOrders.auditLevel,
      rejectReason: withdrawOrders.rejectReason,
      createdAt: withdrawOrders.createdAt,
      reviewedAt: withdrawOrders.reviewedAt,
      paidAt: withdrawOrders.paidAt,
    })
    .from(withdrawOrders)
    .where(and(...conditions))
    .orderBy(desc(withdrawOrders.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      id: r.id,
      voucherNo: r.voucherNo,
      amount: r.amount,
      feeAmount: r.feeAmount ?? "0.000000",
      actualAmount: r.actualAmount ?? r.amount,
      bankCardNo: r.bankCardNo,
      bankName: r.bankName,
      bankVoucherUrl: r.bankVoucherUrl,
      wechatPayNo: r.wechatPayNo,
      status: r.status,
      statusLabel: getStatusLabel(r.status, WITHDRAW_STATUS_LABEL),
      auditLevel: r.auditLevel,
      rejectReason: r.rejectReason,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  };
}

// ══════════════════════════════════════════════
//  客户消费排行 (新增)
// ══════════════════════════════════════════════

export async function getCustomerConsumption(
  userId: number,
  page: number,
  pageSize: number,
  sortBy: string = "total_amount",
  sortOrder: string = "desc",
) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  const offset = (page - 1) * pageSize;

  // 允许排序字段
  const sortFieldMap: Record<string, any> = {
    total_amount: agentCustomerConsumption.totalAmount,
    month_amount: agentCustomerConsumption.monthAmount,
    commission_amount: agentCustomerConsumption.commissionAmount,
    last_order_at: agentCustomerConsumption.lastOrderAt,
  };

  const sortField = sortFieldMap[sortBy] ?? agentCustomerConsumption.totalAmount;
  const sortFn = sortOrder === "asc" ? asc : desc;

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentCustomerConsumption)
    .where(eq(agentCustomerConsumption.agentId, agent.id));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select()
    .from(agentCustomerConsumption)
    .where(eq(agentCustomerConsumption.agentId, agent.id))
    .orderBy(sortFn(sortField))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      customerUserId: r.customerUserId,
      customerName: r.customerName,
      totalAmount: r.totalAmount ?? "0.000000",
      monthAmount: r.monthAmount ?? "0.000000",
      commissionAmount: r.commissionAmount ?? "0.000000",
      orderCount: r.orderCount ?? 0,
      lastOrderAt: r.lastOrderAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  };
}

// ══════════════════════════════════════════════
//  客户订单详情 (新增)
// ══════════════════════════════════════════════

export async function getCustomerOrderDetail(
  userId: number,
  customerUserId: number,
  page: number,
  pageSize: number,
) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);
  const offset = (page - 1) * pageSize;

  // 验证客户属于该代理商
  const [client] = await db
    .select({ id: agentClients.id })
    .from(agentClients)
    .where(and(
      eq(agentClients.agentId, agent.id),
      eq(agentClients.clientUserId, customerUserId),
    ))
    .limit(1);

  if (!client) {
    throw new AppError("CLIENT_NOT_FOUND", "该客户不属于您", 404);
  }

  // 从佣金日志查询该客户的订单
  const conditions = [
    eq(commissionLogs.agentId, agent.id),
    eq(commissionLogs.sourceCustomerId, customerUserId),
  ];

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commissionLogs)
    .where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: commissionLogs.id,
      sourceOrderId: commissionLogs.sourceOrderId,
      sourceOrderAmount: commissionLogs.sourceOrderAmount,
      commissionAmount: commissionLogs.commissionAmount,
      commissionType: commissionLogs.commissionType,
      callCost: commissionLogs.callCost,
      createdAt: commissionLogs.createdAt,
    })
    .from(commissionLogs)
    .where(and(...conditions))
    .orderBy(desc(commissionLogs.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      orderNo: r.sourceOrderId,
      orderAmount: r.sourceOrderAmount,
      commissionAmount: r.commissionAmount,
      commissionType: r.commissionType,
      commissionTypeLabel: getStatusLabel(r.commissionType ?? "", COMMISSION_TYPE_LABEL),
      callCost: r.callCost,
      paidAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

// ══════════════════════════════════════════════
//  Admin: Agent Client Management
// ══════════════════════════════════════════════

// ──────────────────────────────────────────────
//  List Clients Under an Agent (Admin)
//  含该客户为代理商贡献的佣金汇总
// ──────────────────────────────────────────────

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

  return {
    ...row,
    availableBalance: (Number(row.pendingWithdraw || 0) - Number(row.frozenAmount || 0)).toFixed(6),
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

  return {
    list: rows.map((r) => {
      const totalCommission = num(r.totalCommission);
      const pendingW = num(r.pendingWithdraw);
      const frozen = num(r.frozenAmount ?? "0.000000");
      return {
        ...r,
        frozenAmount: r.frozenAmount ?? "0.000000",
        availableBalance: fmt(totalCommission - pendingW - frozen),
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
      pendingWithdraw: agents.pendingWithdraw,
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
  const pendingWithdraw = Number(agent.pendingWithdraw);
  if (pendingWithdraw > 0) {
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

export async function listAllWithdraws(page: number, pageSize: number, status?: string) {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  const conditions = [sql`1=1`];
  if (status) {
    conditions.push(eq(withdrawOrders.status, status as any));
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(withdrawOrders)
    .innerJoin(agents, eq(withdrawOrders.agentId, agents.id))
    .innerJoin(users, eq(agents.userId, users.id))
    .where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: withdrawOrders.id,
      agentId: withdrawOrders.agentId,
      userId: agents.userId,
      email: users.email,
      nickname: users.nickname,
      voucherNo: withdrawOrders.voucherNo,
      amount: withdrawOrders.amount,
      feeAmount: withdrawOrders.feeAmount,
      actualAmount: withdrawOrders.actualAmount,
      bankCardNo: withdrawOrders.bankCardNo,
      bankName: withdrawOrders.bankName,
      bankVoucherUrl: withdrawOrders.bankVoucherUrl,
      wechatPayNo: withdrawOrders.wechatPayNo,
      status: withdrawOrders.status,
      auditLevel: withdrawOrders.auditLevel,
      rejectReason: withdrawOrders.rejectReason,
      firstAuditorId: withdrawOrders.firstAuditorId,
      firstAuditedAt: withdrawOrders.firstAuditedAt,
      secondAuditorId: withdrawOrders.secondAuditorId,
      secondAuditedAt: withdrawOrders.secondAuditedAt,
      paidOperatorId: withdrawOrders.paidOperatorId,
      riskCheckResult: withdrawOrders.riskCheckResult,
      reviewedBy: withdrawOrders.reviewedBy,
      createdAt: withdrawOrders.createdAt,
      reviewedAt: withdrawOrders.reviewedAt,
      paidAt: withdrawOrders.paidAt,
    })
    .from(withdrawOrders)
    .innerJoin(agents, eq(withdrawOrders.agentId, agents.id))
    .innerJoin(users, eq(agents.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(withdrawOrders.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      ...r,
      feeAmount: r.feeAmount ?? "0.000000",
      actualAmount: r.actualAmount ?? r.amount,
      statusLabel: getStatusLabel(r.status, WITHDRAW_STATUS_LABEL),
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      firstAuditedAt: r.firstAuditedAt?.toISOString() ?? null,
      secondAuditedAt: r.secondAuditedAt?.toISOString() ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  };
}

// ──────────────────────────────────────────────
//  Withdraw 初审
// ──────────────────────────────────────────────

export async function firstReviewWithdraw(
  operatorId: number,
  withdrawId: number,
  action: "approve" | "reject",
  rejectReason?: string | null,
) {
  const db = getDb();

  const [order] = await db
    .select()
    .from(withdrawOrders)
    .where(eq(withdrawOrders.id, withdrawId))
    .limit(1);

  if (!order) {
    throw new AppError("WITHDRAW_NOT_FOUND", "提现订单不存在", 404);
  }

  if (order.status !== "pending_first_review") {
    throw new AppError("INVALID_STATUS", `当前状态为 ${order.status}，无法初审`, 400);
  }

  await db.transaction(async (tx) => {
    if (action === "approve") {
      // 初审通过时生成凭证号
      const firstVoucherNo = await generateVoucherNo('B');

      await tx
        .update(withdrawOrders)
        .set({
          status: "pending_second_review",
          auditLevel: 2,
          firstAuditorId: operatorId,
          firstAuditedAt: new Date(),
          voucherNo: firstVoucherNo,
        })
        .where(eq(withdrawOrders.id, withdrawId));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "withdraw_first_approve",
        targetType: "withdraw_orders",
        targetId: withdrawId,
        before: { status: "pending_first_review" },
        after: { status: "pending_second_review", voucherNo: firstVoucherNo },
        ip: null,
        description: `初审通过提现 #${withdrawId}，金额 ${order.amount}，凭证号 ${firstVoucherNo}`,
      });
    } else {
      // 拒绝时退还冻结金额
      await tx
        .update(agents)
        .set({
          pendingWithdraw: sql`${agents.pendingWithdraw} + ${order.amount}`,
        })
        .where(eq(agents.id, order.agentId));

      await tx
        .update(withdrawOrders)
        .set({
          status: "rejected",
          auditLevel: 1,
          firstAuditorId: operatorId,
          firstAuditedAt: new Date(),
          rejectReason: rejectReason ?? null,
        })
        .where(eq(withdrawOrders.id, withdrawId));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "withdraw_reject",
        targetType: "withdraw_orders",
        targetId: withdrawId,
        before: { status: "pending_first_review" },
        after: { status: "rejected", rejectReason },
        ip: null,
        description: `初审拒绝提现 #${withdrawId}: ${rejectReason ?? "无原因"}`,
      });
    }
  });

  return {
    id: withdrawId,
    status: action === "approve" ? "pending_second_review" : "rejected",
  };
}

// ──────────────────────────────────────────────
//  Withdraw 复审
// ──────────────────────────────────────────────

export async function secondReviewWithdraw(
  operatorId: number,
  withdrawId: number,
  action: "approve" | "reject",
  rejectReason?: string | null,
  bankVoucherUrl?: string | null,
) {
  const db = getDb();

  const [order] = await db
    .select()
    .from(withdrawOrders)
    .where(eq(withdrawOrders.id, withdrawId))
    .limit(1);

  if (!order) {
    throw new AppError("WITHDRAW_NOT_FOUND", "提现订单不存在", 404);
  }

  if (order.status !== "pending_second_review") {
    throw new AppError("INVALID_STATUS", `当前状态为 ${order.status}，无法复审`, 400);
  }

  await db.transaction(async (tx) => {
    if (action === "approve") {
      // 复审通过时生成凭证号（若初审未生成则补充）
      const secondVoucherNo = order.voucherNo || await generateVoucherNo('B');

      await tx
        .update(withdrawOrders)
        .set({
          status: "approved",
          auditLevel: 2,
          secondAuditorId: operatorId,
          secondAuditedAt: new Date(),
          bankVoucherUrl: bankVoucherUrl ?? null,
          voucherNo: secondVoucherNo,
        })
        .where(eq(withdrawOrders.id, withdrawId));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "withdraw_second_approve",
        targetType: "withdraw_orders",
        targetId: withdrawId,
        before: { status: "pending_second_review" },
        after: { status: "approved", voucherNo: secondVoucherNo },
        ip: null,
        description: `复审通过提现 #${withdrawId}，金额 ${order.amount}，凭证号 ${secondVoucherNo}`,
      });
    } else {
      // 拒绝时退还冻结金额
      await tx
        .update(agents)
        .set({
          pendingWithdraw: sql`${agents.pendingWithdraw} + ${order.amount}`,
        })
        .where(eq(agents.id, order.agentId));

      await tx
        .update(withdrawOrders)
        .set({
          status: "rejected",
          auditLevel: 2,
          secondAuditorId: operatorId,
          secondAuditedAt: new Date(),
          rejectReason: rejectReason ?? null,
        })
        .where(eq(withdrawOrders.id, withdrawId));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "withdraw_reject",
        targetType: "withdraw_orders",
        targetId: withdrawId,
        before: { status: "pending_second_review" },
        after: { status: "rejected", rejectReason },
        ip: null,
        description: `复审拒绝提现 #${withdrawId}: ${rejectReason ?? "无原因"}`,
      });
    }
  });

  return {
    id: withdrawId,
    status: action === "approve" ? "approved" : "rejected",
  };
}

// ──────────────────────────────────────────────
//  Mark Withdraw as Paid
// ──────────────────────────────────────────────

export async function markWithdrawAsPaid(
  operatorId: number,
  withdrawId: number,
  bankVoucherUrl?: string | null,
) {
  const db = getDb();

  const [order] = await db
    .select()
    .from(withdrawOrders)
    .where(eq(withdrawOrders.id, withdrawId))
    .limit(1);

  if (!order) {
    throw new AppError("WITHDRAW_NOT_FOUND", "提现订单不存在", 404);
  }

  if (order.status !== "approved") {
    throw new AppError("INVALID_STATUS", `当前状态为 ${order.status}，无法标记已打款`, 400);
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(withdrawOrders)
      .set({
        status: "paid",
        paidOperatorId: operatorId,
        paidAt: now,
        bankVoucherUrl: bankVoucherUrl ?? order.bankVoucherUrl,
      })
      .where(eq(withdrawOrders.id, withdrawId));

    // 更新代理商总佣金已提现信息（pendingWithdraw 在创建时已扣减）
    // 打款完成，无需再操作余额

    await tx.insert(auditLogs).values({
      operatorId,
      action: "withdraw_paid",
      targetType: "withdraw_orders",
      targetId: withdrawId,
      before: { status: "approved" },
      after: { status: "paid" },
      ip: null,
      description: `标记提现 #${withdrawId} 已打款，金额 ${order.amount}`,
    });
  });

  return {
    id: withdrawId,
    status: "paid",
  };
}

// ──────────────────────────────────────────────
//  (保留) 旧版审核函数 — 适配新 Status 枚举
//  用于兼容旧版单审流程
// ──────────────────────────────────────────────

export async function reviewWithdraw(
  operatorId: number,
  withdrawId: number,
  action: "approve" | "reject",
  rejectReason?: string | null,
) {
  const db = getDb();

  const [order] = await db
    .select()
    .from(withdrawOrders)
    .where(eq(withdrawOrders.id, withdrawId))
    .limit(1);

  if (!order) {
    throw new AppError("WITHDRAW_NOT_FOUND", "提现订单不存在", 404);
  }

  if (order.status !== "pending_first_review" && order.status !== "pending_second_review") {
    throw new AppError("INVALID_STATUS", `当前状态为 ${order.status}，无法审核`, 400);
  }

  await db.transaction(async (tx) => {
    if (action === "approve") {
      // 审核通过时生成凭证号并计算实际金额
      const voucherNo = await generateVoucherNo('B');
      const orderAmount = num(order.amount);
      const orderFee = num(order.feeAmount);
      const actualAmount = (orderAmount - orderFee).toFixed(6);

      await tx
        .update(withdrawOrders)
        .set({
          status: "approved",
          reviewedBy: operatorId,
          reviewedAt: new Date(),
          voucherNo,
          actualAmount,
        })
        .where(eq(withdrawOrders.id, withdrawId));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "withdraw_approve",
        targetType: "withdraw_orders",
        targetId: withdrawId,
        before: { status: order.status },
        after: { status: "approved", voucherNo, actualAmount },
        ip: null,
        description: `审核通过提现 #${withdrawId}，金额 ${order.amount}，凭证号 ${voucherNo}`,
      });
    } else {
      await tx
        .update(agents)
        .set({
          pendingWithdraw: sql`${agents.pendingWithdraw} + ${order.amount}`,
        })
        .where(eq(agents.id, order.agentId));

      await tx
        .update(withdrawOrders)
        .set({
          status: "rejected",
          reviewedBy: operatorId,
          reviewedAt: new Date(),
          rejectReason: rejectReason ?? null,
        })
        .where(eq(withdrawOrders.id, withdrawId));

      await tx.insert(auditLogs).values({
        operatorId,
        action: "withdraw_reject",
        targetType: "withdraw_orders",
        targetId: withdrawId,
        before: { status: order.status },
        after: { status: "rejected", rejectReason },
        ip: null,
        description: `审核拒绝提现 #${withdrawId}: ${rejectReason ?? "无原因"}`,
      });
    }
  });

  return {
    id: withdrawId,
    status: action === "approve" ? "approved" : "rejected",
  };
}

// ══════════════════════════════════════════════
//  Admin: Withdraw — 批量审核
// ══════════════════════════════════════════════

export async function batchReviewWithdraws(
  operatorId: number,
  ids: number[],
  action: "approve" | "reject",
  rejectReason?: string | null,
) {
  const db = getDb();
  let approved = 0;
  let rejected = 0;
  const errors: { id: number; reason: string }[] = [];

  for (const withdrawId of ids) {
    try {
      const result = await firstReviewWithdraw(operatorId, withdrawId, action, rejectReason);
      if (result.status === "pending_second_review") approved++;
      else if (result.status === "rejected") rejected++;
    } catch (err: any) {
      errors.push({ id: withdrawId, reason: err.message || "未知错误" });
    }
  }

  return { approved, rejected, total: ids.length, errors };
}

// ══════════════════════════════════════════════
//  Admin: Withdraw — CSV 导出
// ══════════════════════════════════════════════

export async function exportWithdrawsCsv(status?: string): Promise<string> {
  const db = getDb();

  const conditions = [sql`1=1`];
  if (status) {
    conditions.push(eq(withdrawOrders.status, status as any));
  }

  const rows = await db
    .select({
      id: withdrawOrders.id,
      agentId: withdrawOrders.agentId,
      email: users.email,
      nickname: users.nickname,
      voucherNo: withdrawOrders.voucherNo,
      amount: withdrawOrders.amount,
      feeAmount: withdrawOrders.feeAmount,
      actualAmount: withdrawOrders.actualAmount,
      bankCardNo: withdrawOrders.bankCardNo,
      bankName: withdrawOrders.bankName,
      status: withdrawOrders.status,
      rejectReason: withdrawOrders.rejectReason,
      createdAt: withdrawOrders.createdAt,
      paidAt: withdrawOrders.paidAt,
    })
    .from(withdrawOrders)
    .innerJoin(agents, eq(withdrawOrders.agentId, agents.id))
    .innerJoin(users, eq(agents.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(withdrawOrders.createdAt));

  const STATUS_LABEL: Record<string, string> = {
    pending_first_review: "待初审",
    pending_second_review: "待复审",
    approved: "已通过",
    paid: "已打款",
    rejected: "已拒绝",
  };

  const lines: string[] = [];
  lines.push('"3cloud 提现导出"');
  lines.push(`"导出时间","${new Date().toISOString()}"`);
  if (status) {
    lines.push(`"筛选状态","${STATUS_LABEL[status] || status}"`);
  }
  lines.push('');
  lines.push('"ID","凭证号","代理商ID","代理商昵称","邮箱","金额","手续费","实际到账","银行卡号","开户行","状态","拒绝原因","创建时间","打款时间"');

  for (const r of rows) {
    const escape = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
    lines.push([
      r.id,
      escape(r.voucherNo),
      r.agentId,
      escape(r.nickname),
      escape(r.email),
      r.amount,
      r.feeAmount ?? "0.000000",
      r.actualAmount ?? r.amount,
      escape(r.bankCardNo),
      escape(r.bankName),
      STATUS_LABEL[r.status] || r.status,
      escape(r.rejectReason),
      r.createdAt.toISOString(),
      r.paidAt?.toISOString() ?? "",
    ].join(","));
  }

  return lines.join("\n");
}

// ══════════════════════════════════════════════
//  Admin: Finance Dashboard (新增)
// ══════════════════════════════════════════════

export async function getFinanceDashboard() {
  const db = getDb();
  const redis = getRedis();

  // 缓存命中直接返回（60秒 TTL）
  const cacheKey = "finance:dashboard";
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Redis 不可用时降级到 DB 查询
  }

  // 待初审提现
  const [firstReviewResult] = await db
    .select({
      count: sql<number>`count(*)`,
      sum: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
    })
    .from(withdrawOrders)
    .where(eq(withdrawOrders.status, "pending_first_review"));

  // 待复审提现
  const [secondReviewResult] = await db
    .select({
      count: sql<number>`count(*)`,
      sum: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
    })
    .from(withdrawOrders)
    .where(eq(withdrawOrders.status, "pending_second_review"));

  // 待确认充值（对公转账待双审）
  const [pendingRechargeResult] = await db
    .select({
      count: sql<number>`count(*)`,
      sum: sql<string>`coalesce(sum(${rechargeOrders.amount}), '0.000000')`,
    })
    .from(rechargeOrders)
    .where(and(
      eq(rechargeOrders.status, "pending"),
      eq(rechargeOrders.channel, "bank_transfer"),
    ));

  // 今日交易统计
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todayWithdrawPaidResult] = await db
    .select({
      count: sql<number>`count(*)`,
      sum: sql<string>`coalesce(sum(${withdrawOrders.actualAmount}), '0.000000')`,
    })
    .from(withdrawOrders)
    .where(and(
      eq(withdrawOrders.status, "paid"),
      gte(withdrawOrders.paidAt, todayStart),
    ));

  // 待结算佣金统计
  const [pendingCommissionResult] = await db
    .select({
      count: sql<number>`count(*)`,
      sum: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
    })
    .from(commissionLogs)
    .where(eq(commissionLogs.status, "pending"));

  const result = {
    pendingFirstReview: {
      count: Number(firstReviewResult?.count ?? 0),
      totalAmount: firstReviewResult?.sum ?? "0.000000",
    },
    pendingSecondReview: {
      count: Number(secondReviewResult?.count ?? 0),
      totalAmount: secondReviewResult?.sum ?? "0.000000",
    },
    pendingRecharge: {
      count: Number(pendingRechargeResult?.count ?? 0),
      totalAmount: pendingRechargeResult?.sum ?? "0.000000",
    },
    pendingCommissions: {
      count: Number(pendingCommissionResult?.count ?? 0),
      totalAmount: pendingCommissionResult?.sum ?? "0.000000",
    },
    todayPaidWithdraws: {
      count: Number(todayWithdrawPaidResult?.count ?? 0),
      totalAmount: todayWithdrawPaidResult?.sum ?? "0.000000",
    },
  };

  // 写缓存（非阻塞）
  redis.setex(cacheKey, 60, JSON.stringify(result)).catch(() => {});

  return result;
}

// ══════════════════════════════════════════════
//  Admin: Financial Commission Overview (新增)
// ══════════════════════════════════════════════

/**
 * 管理后台佣金列表（走预聚合表 commission_daily_rollup）
 * 每行 = 一个代理商一天的分佣汇总
 * 列表页不再扫描 commission_logs 分区表
 */
export async function listAllCommissions(
  page: number,
  pageSize: number,
  filters?: {
    agentId?: number;
    agentSearch?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    commissionType?: string;
    cursor?: string;
  },
) {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [sql`1=1`];

  if (filters?.agentId) {
    conditions.push(eq(commissionDailyRollup.agentId, filters.agentId));
  }
  if (filters?.agentSearch) {
    const keyword = `%${filters.agentSearch}%`;
    conditions.push(
      sql`(${users.email} ILIKE ${keyword} OR ${users.nickname} ILIKE ${keyword})`
    );
  }
  if (filters?.startDate) {
    conditions.push(gte(commissionDailyRollup.reportDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(commissionDailyRollup.reportDate, filters.endDate));
  }

  // COUNT 走 rollup 表，数据量极小
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commissionDailyRollup)
    .innerJoin(agents, eq(commissionDailyRollup.agentId, agents.id))
    .where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: commissionDailyRollup.id,
      agentId: commissionDailyRollup.agentId,
      agentEmail: users.email,
      agentNickname: users.nickname,
      reportDate: commissionDailyRollup.reportDate,
      totalRecords: commissionDailyRollup.totalRecords,
      totalCallCost: commissionDailyRollup.totalCallCost,
      totalCommissionAmount: commissionDailyRollup.totalCommissionAmount,
      totalFeeAmount: commissionDailyRollup.totalFeeAmount,
      totalNetAmount: commissionDailyRollup.totalNetAmount,
      pendingCount: commissionDailyRollup.pendingCount,
      settledCount: commissionDailyRollup.settledCount,
      cancelledCount: commissionDailyRollup.cancelledCount,
      pendingAmount: commissionDailyRollup.pendingAmount,
      settledAmount: commissionDailyRollup.settledAmount,
      saleCount: commissionDailyRollup.saleCount,
      renewalCount: commissionDailyRollup.renewalCount,
      activityCount: commissionDailyRollup.activityCount,
      saleAmount: commissionDailyRollup.saleAmount,
      renewalAmount: commissionDailyRollup.renewalAmount,
      activityAmount: commissionDailyRollup.activityAmount,
    })
    .from(commissionDailyRollup)
    .innerJoin(agents, eq(commissionDailyRollup.agentId, agents.id))
    .innerJoin(users, eq(agents.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(commissionDailyRollup.reportDate), desc(commissionDailyRollup.id))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      ...r,
      totalCallCost: r.totalCallCost ?? "0.000000",
      totalCommissionAmount: r.totalCommissionAmount ?? "0.000000",
      totalFeeAmount: r.totalFeeAmount ?? "0.000000",
      totalNetAmount: r.totalNetAmount ?? "0.000000",
      pendingAmount: r.pendingAmount ?? "0.000000",
      settledAmount: r.settledAmount ?? "0.000000",
      saleAmount: r.saleAmount ?? "0.000000",
      renewalAmount: r.renewalAmount ?? "0.000000",
      activityAmount: r.activityAmount ?? "0.000000",
    })),
    total,
    page,
    pageSize,
    nextCursor: undefined,
  };
}

/**
 * 管理后台佣金明细（走分区表 commission_logs，强制 agentId + date 范围）
 * 从列表页点击某行后跳转进来
 */
export async function listAllCommissionsDetail(
  page: number,
  pageSize: number,
  filters: {
    agentId: number;
    date: string;
    status?: string;
    commissionType?: string;
  },
) {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  // 只查指定代理商当天的数据 → 强制走索引，范围限定在一个分区内
  const dateStart = new Date(filters.date + "T00:00:00Z");
  const dateEnd = new Date(filters.date + "T23:59:59.999Z");

  const conditions: any[] = [
    eq(commissionLogs.agentId, filters.agentId),
    gte(commissionLogs.createdAt, dateStart),
    lte(commissionLogs.createdAt, dateEnd),
  ];

  if (filters?.status) {
    conditions.push(eq(commissionLogs.status, filters.status as any));
  }

  if (filters?.commissionType) {
    conditions.push(eq(commissionLogs.commissionType, filters.commissionType));
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commissionLogs)
    .where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: commissionLogs.id,
      agentId: commissionLogs.agentId,
      voucherNo: commissionLogs.voucherNo,
      commissionType: commissionLogs.commissionType,
      callCost: commissionLogs.callCost,
      commissionAmount: commissionLogs.commissionAmount,
      feeRate: commissionLogs.feeRate,
      feeAmount: commissionLogs.feeAmount,
      netAmount: commissionLogs.netAmount,
      status: commissionLogs.status,
      sourceOrderId: commissionLogs.sourceOrderId,
      sourceCustomerId: commissionLogs.sourceCustomerId,
      createdAt: commissionLogs.createdAt,
      settledAt: commissionLogs.settledAt,
    })
    .from(commissionLogs)
    .where(and(...conditions))
    .orderBy(desc(commissionLogs.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      ...r,
      commissionTypeLabel: getStatusLabel(r.commissionType ?? "", COMMISSION_TYPE_LABEL),
      feeAmount: r.feeAmount ?? "0.000000",
      netAmount: r.netAmount ?? "0.000000",
      createdAt: r.createdAt.toISOString(),
      settledAt: r.settledAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  };
}

// ══════════════════════════════════════════════
//  Admin: Reconciliation Report (增强版)
//  支持日/周/月粒度、维度拆分、资金平衡校验、异常检测、趋势
// ══════════════════════════════════════════════

interface ReconParams {
  startDate?: string
  endDate?: string
  granularity?: 'day' | 'week' | 'month'
}

/** 数字转固定精度字符串，保持 DECIMAL(18,6) 格式 */
function toDecStr(v: string | number | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  return n.toFixed(6)
}

/** 字符串数字加法 */
function addDec(a: string, b: string): string {
  return (parseFloat(a) + parseFloat(b)).toFixed(6)
}

/** 字符串数字减法 */
function subDec(a: string, b: string): string {
  return (parseFloat(a) - parseFloat(b)).toFixed(6)
}

export async function getReconciliationReport(params?: ReconParams) {
  const db = getDb();
  const redis = getRedis();

  const now = new Date().toISOString().slice(0, 10);
  const startDate = params?.startDate || now;
  const endDate = params?.endDate || now;
  const granularity: 'day' | 'week' | 'month' = params?.granularity || 'day';

  // 对于历史数据，尝试走 Redis 缓存（非今天的数据写入后可缓存24h）
  const cacheKey = `recon:${startDate}:${endDate}:${granularity}`;
  if (startDate < now) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch { /* 缓存读失败则继续查库 */ }
  }

  const startOfRange = new Date(startDate + "T00:00:00Z");
  const endOfRange = new Date(endDate + "T23:59:59Z");

  // ── 1. 汇总统计（佣金、提现、充值、消耗） ──

  const aggregatePromises = Promise.all([
    // 佣金
    db.select({
      count: sql<number>`count(*)`,
      totalCommission: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
      totalFee: sql<string>`coalesce(sum(${commissionLogs.feeAmount}), '0.000000')`,
      totalNet: sql<string>`coalesce(sum(${commissionLogs.netAmount}), '0.000000')`,
    }).from(commissionLogs).where(and(
      gte(commissionLogs.createdAt, startOfRange),
      lte(commissionLogs.createdAt, endOfRange),
    )),
    // 提现
    db.select({
      count: sql<number>`count(*)`,
      totalAmount: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
      totalFee: sql<string>`coalesce(sum(${withdrawOrders.feeAmount}), '0.000000')`,
      totalActual: sql<string>`coalesce(sum(${withdrawOrders.actualAmount}), '0.000000')`,
    }).from(withdrawOrders).where(and(
      gte(withdrawOrders.createdAt, startOfRange),
      lte(withdrawOrders.createdAt, endOfRange),
    )),
    // 充值确认
    db.select({
      count: sql<number>`count(*)`,
      totalAmount: sql<string>`coalesce(sum(${rechargeOrders.amount}), '0.000000')`,
    }).from(rechargeOrders).where(and(
      eq(rechargeOrders.status, "confirmed"),
      gte(rechargeOrders.confirmedAt, startOfRange),
      lte(rechargeOrders.confirmedAt, endOfRange),
    )),
    // 调用消耗（实际扣费总额）
    db.select({
      totalConsumption: sql<string>`coalesce(sum(${callLogs.cost}), '0.000000')`,
    }).from(callLogs).where(and(
      gte(callLogs.createdAt, startOfRange),
      lte(callLogs.createdAt, endOfRange),
      inArray(callLogs.status, ["success", "timeout", "cancelled"]),
    )),
  ]);

  // ── 2. 维度拆分 ──

  const dimensionPromises = Promise.all([
    // 按代理商
    db.select({
      agentId: commissionLogs.agentId,
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
    }).from(commissionLogs)
      .where(and(
        gte(commissionLogs.createdAt, startOfRange),
        lte(commissionLogs.createdAt, endOfRange),
      ))
      .groupBy(commissionLogs.agentId)
      .orderBy(sql`sum(commission_amount) desc`)
      .limit(50),
    // 按状态
    db.select({
      status: commissionLogs.status,
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
      fee: sql<string>`coalesce(sum(${commissionLogs.feeAmount}), '0.000000')`,
    }).from(commissionLogs)
      .where(and(
        gte(commissionLogs.createdAt, startOfRange),
        lte(commissionLogs.createdAt, endOfRange),
      ))
      .groupBy(commissionLogs.status),
    // 按提现状态
    db.select({
      status: withdrawOrders.status,
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
      fee: sql<string>`coalesce(sum(${withdrawOrders.feeAmount}), '0.000000')`,
    }).from(withdrawOrders)
      .where(and(
        gte(withdrawOrders.createdAt, startOfRange),
        lte(withdrawOrders.createdAt, endOfRange),
      ))
      .groupBy(withdrawOrders.status),
    // 按佣金类型
    db.select({
      type: commissionLogs.commissionType,
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
    }).from(commissionLogs)
      .where(and(
        gte(commissionLogs.createdAt, startOfRange),
        lte(commissionLogs.createdAt, endOfRange),
        sql`${commissionLogs.commissionType} is not null`,
      ))
      .groupBy(commissionLogs.commissionType),
  ]);

  // ── 3. 异常检测 ──

  const anomalyPromises = Promise.all([
    // 孤立佣金（无对应 call_log）
    db.select({
      id: commissionLogs.id,
      clientCallLogId: commissionLogs.clientCallLogId,
      amount: commissionLogs.commissionAmount,
      createdAt: commissionLogs.createdAt,
    }).from(commissionLogs)
      .where(and(
        gte(commissionLogs.createdAt, startOfRange),
        lte(commissionLogs.createdAt, endOfRange),
        sql`${commissionLogs.clientCallLogId} is not null`,
        sql`not exists (select 1 from call_logs where call_logs.id = ${commissionLogs.clientCallLogId})`,
      ))
      .limit(50),
    // 高频提现（同一天 >= 3 笔）
    db.select({
      agentId: withdrawOrders.agentId,
      times: sql<number>`count(*)`,
      totalAmount: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
    }).from(withdrawOrders)
      .where(and(
        gte(withdrawOrders.createdAt, startOfRange),
        lte(withdrawOrders.createdAt, endOfRange),
      ))
      .groupBy(withdrawOrders.agentId, sql`date(${withdrawOrders.createdAt})`)
      .having(sql`count(*) >= 3`)
      .limit(50),
    // 无匹配充值（充值完成但 balance_logs 未对应入账）
    db.select({
      id: rechargeOrders.id,
      userId: rechargeOrders.userId,
      amount: rechargeOrders.amount,
      status: rechargeOrders.status,
      createdAt: rechargeOrders.createdAt,
    }).from(rechargeOrders)
      .where(and(
        eq(rechargeOrders.status, "confirmed"),
        gte(rechargeOrders.confirmedAt, startOfRange),
        lte(rechargeOrders.confirmedAt, endOfRange),
        sql`not exists (
          select 1 from balance_logs
          where balance_logs.user_id = ${rechargeOrders.userId}
            and balance_logs.ref_type = 'recharge'
            and balance_logs.ref_id = ${rechargeOrders.id}
        )`,
      ))
      .limit(50),
  ]);

  // ── 4. 趋势数据（多日才有意义） ──

  let trends: Array<{
    date: string
    commissionAmount: string
    commissionCount: number
    withdrawAmount: string
    withdrawCount: number
    rechargeAmount: string
    rechargeCount: number
  }> = [];

  if (startDate !== endDate) {
    const groupExpr = granularity === 'month'
      ? sql`to_char(${commissionLogs.createdAt}, 'YYYY-MM')`
      : granularity === 'week'
        ? sql`to_char(date_trunc('week', ${commissionLogs.createdAt}), 'YYYY-MM-DD')`
        : sql`to_char(${commissionLogs.createdAt}, 'YYYY-MM-DD')`;

    const [trendComm, trendWdraw, trendRech] = await Promise.all([
      db.select({
        date: sql<string>`${groupExpr}`,
        amount: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
        count: sql<number>`count(*)`,
      }).from(commissionLogs)
        .where(and(
          gte(commissionLogs.createdAt, startOfRange),
          lte(commissionLogs.createdAt, endOfRange),
        ))
        .groupBy(sql`1`)
        .orderBy(sql`1`),
      db.select({
        date: sql<string>`to_char(${withdrawOrders.createdAt}, 'YYYY-MM-DD')`,
        amount: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
        count: sql<number>`count(*)`,
      }).from(withdrawOrders)
        .where(and(
          gte(withdrawOrders.createdAt, startOfRange),
          lte(withdrawOrders.createdAt, endOfRange),
        ))
        .groupBy(sql`1`)
        .orderBy(sql`1`),
      db.select({
        date: sql<string>`to_char(${rechargeOrders.confirmedAt}, 'YYYY-MM-DD')`,
        amount: sql<string>`coalesce(sum(${rechargeOrders.amount}), '0.000000')`,
        count: sql<number>`count(*)`,
      }).from(rechargeOrders)
        .where(and(
          eq(rechargeOrders.status, "confirmed"),
          gte(rechargeOrders.confirmedAt, startOfRange),
          lte(rechargeOrders.confirmedAt, endOfRange),
        ))
        .groupBy(sql`1`)
        .orderBy(sql`1`),
    ]);

    // 合并趋势数据
    const dateMap = new Map<string, {
      commissionAmount: string; commissionCount: number
      withdrawAmount: string; withdrawCount: number
      rechargeAmount: string; rechargeCount: number
    }>();

    const genDates = () => {
      const dates: string[] = [];
      const d = new Date(startDate + "T00:00:00Z");
      const end = new Date(endDate + "T23:59:59Z");
      while (d <= end) {
        let key: string;
        if (granularity === 'month') {
          key = d.toISOString().slice(0, 7);
          d.setMonth(d.getMonth() + 1);
        } else if (granularity === 'week') {
          const dayOfWeek = d.getUTCDay();
          const monday = new Date(d);
          monday.setUTCDate(d.getUTCDate() - ((dayOfWeek + 6) % 7));
          key = monday.toISOString().slice(0, 10);
          d.setUTCDate(d.getUTCDate() + 7);
        } else {
          key = d.toISOString().slice(0, 10);
          d.setUTCDate(d.getUTCDate() + 1);
        }
        dates.push(key);
      }
      return dates;
    };

    const allDates = genDates();
    for (const dt of allDates) {
      dateMap.set(dt, {
        commissionAmount: '0.000000', commissionCount: 0,
        withdrawAmount: '0.000000', withdrawCount: 0,
        rechargeAmount: '0.000000', rechargeCount: 0,
      });
    }

    for (const row of trendComm) {
      const existing = dateMap.get(row.date) || {
        commissionAmount: '0.000000', commissionCount: 0,
        withdrawAmount: '0.000000', withdrawCount: 0,
        rechargeAmount: '0.000000', rechargeCount: 0,
      };
      existing.commissionAmount = row.amount;
      existing.commissionCount = row.count;
      dateMap.set(row.date, existing);
    }
    for (const row of trendWdraw) {
      const existing = dateMap.get(row.date) || {
        commissionAmount: '0.000000', commissionCount: 0,
        withdrawAmount: '0.000000', withdrawCount: 0,
        rechargeAmount: '0.000000', rechargeCount: 0,
      };
      existing.withdrawAmount = row.amount;
      existing.withdrawCount = row.count;
      dateMap.set(row.date, existing);
    }
    for (const row of trendRech) {
      const existing = dateMap.get(row.date) || {
        commissionAmount: '0.000000', commissionCount: 0,
        withdrawAmount: '0.000000', withdrawCount: 0,
        rechargeAmount: '0.000000', rechargeCount: 0,
      };
      existing.rechargeAmount = row.amount;
      existing.rechargeCount = row.count;
      dateMap.set(row.date, existing);
    }

    trends = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }));
  }

  // ── 等待所有并行查询完成 ──

  const [
    [commissionResult],
    [withdrawResult],
    [rechargeResult],
    [consumptionResult],
  ] = await aggregatePromises;

  const [
    byAgentRows,
    byCommissionStatusRows,
    byWithdrawStatusRows,
    byCommissionTypeRows,
  ] = await dimensionPromises;

  const [
    orphanRows,
    frequentWithdrawRows,
    unmatchedRechargeRows,
  ] = await anomalyPromises;

  // ── 5. 构建响应 ──

  const commissionTotal = toDecStr(commissionResult?.totalCommission);
  const commissionFee = toDecStr(commissionResult?.totalFee);
  const commissionNet = toDecStr(commissionResult?.totalNet || commissionTotal);
  const withdrawTotal = toDecStr(withdrawResult?.totalAmount);
  const withdrawFee = toDecStr(withdrawResult?.totalFee);
  const withdrawActual = toDecStr(withdrawResult?.totalActual || withdrawTotal);
  const rechargeTotal = toDecStr(rechargeResult?.totalAmount);
  const consumptionTotal = toDecStr(consumptionResult?.totalConsumption);

  // 资金平衡校验
  // 公式：充值确认总额 = 调用消耗 + 佣金支出 + 提现支出 + 平台利润
  // diff = 充值 - (消耗 + 佣金净额 + 提现实际到账)
  const totalExpenses = addDec(addDec(consumptionTotal, commissionNet), withdrawActual);
  const balanceDiff = subDec(rechargeTotal, totalExpenses);
  const absDiff = Math.abs(parseFloat(balanceDiff));
  const isBalanced = absDiff < 0.01; // 精度容差 ¥0.01

  // 构建 anomaly items
  const anomalies: Array<{
    id: number
    type: string
    severity: string
    description: string
    relatedId: number | null
    amount: string | null
    createdAt: string
  }> = [];

  for (const row of orphanRows) {
    anomalies.push({
      id: row.id,
      type: 'orphan_commission',
      severity: 'high',
      description: `佣金记录 #${row.id} 没有对应的调用日志（call_log_id: ${row.clientCallLogId}）`,
      relatedId: row.clientCallLogId as number | null,
      amount: toDecStr(row.amount),
      createdAt: row.createdAt?.toISOString() || startDate,
    });
  }

  for (const row of frequentWithdrawRows) {
    anomalies.push({
      id: 0,
      type: 'frequent_withdraw',
      severity: 'medium',
      description: `代理商 #${row.agentId} 当日提现 ${row.times} 次（共 ${toDecStr(row.totalAmount)}），存在拆分风险`,
      relatedId: row.agentId as number,
      amount: toDecStr(row.totalAmount),
      createdAt: startDate,
    });
  }

  for (const row of unmatchedRechargeRows) {
    anomalies.push({
      id: row.id,
      type: 'unmatched_recharge',
      severity: 'high',
      description: `充值订单 #${row.id}（用户 #${row.userId}，${toDecStr(row.amount)}）已确认但 balance_logs 未入账`,
      relatedId: row.id,
      amount: toDecStr(row.amount),
      createdAt: row.createdAt?.toISOString() || startDate,
    });
  }

  // 按维度构建 byStatus
  const byStatusLabels: Record<string, string> = {
    pending: '待结算',
    settled: '已结算',
    cancelled: '已作废',
  };
  const byStatus: Record<string, { label: string; count: number; totalAmount: string; feeAmount?: string; netAmount?: string }> = {};
  for (const row of byCommissionStatusRows) {
    byStatus[row.status] = {
      label: byStatusLabels[row.status] || row.status,
      count: row.count,
      totalAmount: toDecStr(row.total),
      feeAmount: toDecStr(row.fee),
    };
  }
  for (const row of byWithdrawStatusRows) {
    const key = `withdraw_${row.status}`;
    byStatus[key] = {
      label: `提现(${row.status})`,
      count: row.count,
      totalAmount: toDecStr(row.total),
      feeAmount: toDecStr(row.fee),
    };
  }

  // 按代理商
  // 需要关联 agents 表获取名称，先查一批
  const agentIds = byAgentRows.map(r => r.agentId).filter(Boolean);
  let agentMap = new Map<number, string>();
  if (agentIds.length > 0) {
    const agentRows = await db.select({
      id: agents.id,
      nickname: users.nickname,
    }).from(agents)
      .leftJoin(users, eq(agents.userId, users.id))
      .where(inArray(agents.id, agentIds as number[]));
    for (const a of agentRows) {
      agentMap.set(a.id, a.nickname || `代理商 #${a.id}`);
    }
  }

  const byAgent = byAgentRows.map(r => ({
    label: agentMap.get(r.agentId as number) || `代理商 #${r.agentId}`,
    count: r.count,
    totalAmount: toDecStr(r.total),
  }));

  // 按佣金类型
  const typeLabels: Record<string, string> = {
    sale: '销售佣金',
    team: '团队佣金',
    activity: '活动奖励',
    renewal: '续费佣金',
  };
  const byCommissionType = byCommissionTypeRows.map(r => ({
    label: typeLabels[r.type as string] || (r.type as string),
    count: r.count,
    totalAmount: toDecStr(r.total),
  }));

  // ── 组装结果 ──

  const report = {
    date: startDate === endDate ? startDate : `${startDate} ~ ${endDate}`,
    startDate,
    endDate,
    granularity,
    summary: {
      commission: {
        count: Number(commissionResult?.count ?? 0),
        totalCommission: commissionTotal,
        totalFee: commissionFee,
        totalNet: commissionNet,
      },
      withdraw: {
        count: Number(withdrawResult?.count ?? 0),
        totalAmount: withdrawTotal,
        totalFee: withdrawFee,
        totalActual: withdrawActual,
      },
      recharge: {
        count: Number(rechargeResult?.count ?? 0),
        totalAmount: rechargeTotal,
      },
    },
    dimensions: {
      byAgent,
      byStatus,
      byCommissionType,
    },
    balanceCheck: {
      totalIncome: rechargeTotal,
      totalExpense: consumptionTotal,
      totalCommission: commissionNet,
      totalWithdraw: withdrawActual,
      platformProfit: balanceDiff,
      diff: balanceDiff,
      isBalanced,
    },
    anomalies,
    trends,
  };

  // 缓存历史数据（24h TTL）
  if (startDate < now) {
    try {
      await redis.setex(cacheKey, 86400, JSON.stringify(report));
    } catch { /* 缓存写入失败不阻塞 */ }
  }

  return report;
}

// ══════════════════════════════════════════════
//  Export: 对账报表 CSV 导出
// ══════════════════════════════════════════════

export async function exportReconCsv(params: ReconParams): Promise<string> {
  const report = await getReconciliationReport(params);

  const lines: string[] = [];
  lines.push('"3cloud 对账报表"');
  lines.push(`"日期范围","${report.startDate} ~ ${report.endDate}"`);
  lines.push(`"粒度","${report.granularity}"`);
  lines.push('');

  // 汇总
  lines.push('"汇总"');
  lines.push('"分类","笔数","总金额","手续费","净额"');
  lines.push(`"佣金",${report.summary.commission.count},"${report.summary.commission.totalCommission}","${report.summary.commission.totalFee}","${report.summary.commission.totalNet}"`);
  lines.push(`"提现",${report.summary.withdraw.count},"${report.summary.withdraw.totalAmount}","${report.summary.withdraw.totalFee}","${report.summary.withdraw.totalActual}"`);
  lines.push(`"充值确认",${report.summary.recharge.count},"${report.summary.recharge.totalAmount}","-","-"`);
  lines.push('');

  // 资金平衡
  lines.push('"资金平衡校验"');
  lines.push(`"总收入(充值)","${report.balanceCheck.totalIncome}"`);
  lines.push(`"总支出(扣费)","${report.balanceCheck.totalExpense}"`);
  lines.push(`"佣金支出","${report.balanceCheck.totalCommission}"`);
  lines.push(`"提现支出","${report.balanceCheck.totalWithdraw}"`);
  lines.push(`"平台利润","${report.balanceCheck.platformProfit}"`);
  lines.push(`"差额","${report.balanceCheck.diff}"`);
  lines.push(`"是否平账","${report.balanceCheck.isBalanced ? '是' : '否'}"`);
  lines.push('');

  // 异常
  if (report.anomalies.length > 0) {
    lines.push('"异常记录"');
    lines.push('"类型","严重级别","描述","金额"');
    for (const a of report.anomalies) {
      lines.push(`"${a.type}","${a.severity}","${a.description}","${a.amount || ''}"`);
    }
    lines.push('');
  }

  // 趋势
  if (report.trends.length > 0) {
    lines.push('"趋势数据"');
    lines.push('"日期","佣金总额","佣金笔数","提现总额","提现笔数","充值总额","充值笔数"');
    for (const t of report.trends) {
      lines.push(`"${t.date}","${t.commissionAmount}",${t.commissionCount},"${t.withdrawAmount}",${t.withdrawCount},"${t.rechargeAmount}",${t.rechargeCount}`);
    }
  }

  return lines.join('\n');
}

// ══════════════════════════════════════════════
//  Cron: 每日凌晨预计算对账汇总
// ══════════════════════════════════════════════

export async function computeDailyReconSummary(targetDate?: string): Promise<number> {
  const db = getDb();
  const redis = getRedis();

  const date = targetDate || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const startOfDay = new Date(date + "T00:00:00Z");
  const endOfDay = new Date(date + "T23:59:59Z");

  // 获取该日聚合数据
  const report = await getReconciliationReport({ startDate: date, endDate: date });

  // 写入 daily_recon_summary
  await db.insert(dailyReconSummary).values({
    reportDate: date,
    commissionCount: report.summary.commission.count,
    commissionTotal: report.summary.commission.totalCommission,
    commissionFee: report.summary.commission.totalFee,
    commissionNet: report.summary.commission.totalNet,
    withdrawCount: report.summary.withdraw.count,
    withdrawTotal: report.summary.withdraw.totalAmount,
    withdrawFee: report.summary.withdraw.totalFee,
    withdrawActual: report.summary.withdraw.totalActual,
    rechargeCount: report.summary.recharge.count,
    rechargeTotal: report.summary.recharge.totalAmount,
    consumptionTotal: report.balanceCheck.totalExpense,
    balanceDiff: report.balanceCheck.diff,
    isBalanced: report.balanceCheck.isBalanced,
    version: 1,
    computedAt: new Date(),
  }).onConflictDoUpdate({
    target: dailyReconSummary.reportDate,
    set: {
      commissionCount: sql`excluded.commission_count`,
      commissionTotal: sql`excluded.commission_total`,
      commissionFee: sql`excluded.commission_fee`,
      commissionNet: sql`excluded.commission_net`,
      withdrawCount: sql`excluded.withdraw_count`,
      withdrawTotal: sql`excluded.withdraw_total`,
      withdrawFee: sql`excluded.withdraw_fee`,
      withdrawActual: sql`excluded.withdraw_actual`,
      rechargeCount: sql`excluded.recharge_count`,
      rechargeTotal: sql`excluded.recharge_total`,
      consumptionTotal: sql`excluded.consumption_total`,
      balanceDiff: sql`excluded.balance_diff`,
      isBalanced: sql`excluded.is_balanced`,
      version: sql`${dailyReconSummary.version} + 1`,
      computedAt: new Date(),
    },
  });

  // 清除 Redis 缓存
  const cacheKey = `recon:${date}:${date}:day`;
  try {
    await redis.del(cacheKey);
  } catch { /* ignore */ }

  return report.summary.commission.count + report.summary.withdraw.count + report.summary.recharge.count;
}

// ══════════════════════════════════════════════
//  佣金日汇总聚合（commission_daily_rollup）
//  每天 00:30 执行，汇总前一天数据
// ══════════════════════════════════════════════

export async function computeDailyCommissionRollup(targetDate?: string): Promise<number> {
  const db = getDb();

  // 默认聚合前一天（Asia/Shanghai 时区）
  const date = targetDate || (() => {
    const now = new Date();
    const cstNow = new Date(now.getTime() + 8 * 3600_000);
    const cstTarget = new Date(cstNow.getTime() - 86400_000);
    return `${cstTarget.getUTCFullYear()}-${String(cstTarget.getUTCMonth()+1).padStart(2,'0')}-${String(cstTarget.getUTCDate()).padStart(2,'0')}`;
  })();
  const startOfDay = new Date(date + "T00:00:00Z");
  const endOfDay = new Date(date + "T23:59:59.999Z");

  console.log(`[CommissionRollup] 开始聚合 ${date} 的分佣数据...`);

  // 从分区表获取每日聚合
  const rollupRows = await db
    .select({
      agentId: commissionLogs.agentId,
      totalRecords: sql<number>`count(*)`,
      totalCallCost: sql<string>`coalesce(sum(call_cost), '0.000000')`,
      totalCommissionAmount: sql<string>`coalesce(sum(commission_amount), '0.000000')`,
      totalFeeAmount: sql<string>`coalesce(sum(fee_amount), '0.000000')`,
      totalNetAmount: sql<string>`coalesce(sum(net_amount), '0.000000')`,
      pendingCount: sql<number>`count(*) filter (where status = 'pending')`,
      settledCount: sql<number>`count(*) filter (where status = 'settled')`,
      cancelledCount: sql<number>`count(*) filter (where status = 'cancelled')`,
      pendingAmount: sql<string>`coalesce(sum(commission_amount) filter (where status = 'pending'), '0.000000')`,
      settledAmount: sql<string>`coalesce(sum(commission_amount) filter (where status = 'settled'), '0.000000')`,
      cancelledAmount: sql<string>`coalesce(sum(commission_amount) filter (where status = 'cancelled'), '0.000000')`,
      saleCount: sql<number>`count(*) filter (where commission_type = 'sale')`,
      renewalCount: sql<number>`count(*) filter (where commission_type = 'renewal')`,
      activityCount: sql<number>`count(*) filter (where commission_type = 'activity')`,
      saleAmount: sql<string>`coalesce(sum(commission_amount) filter (where commission_type = 'sale'), '0.000000')`,
      renewalAmount: sql<string>`coalesce(sum(commission_amount) filter (where commission_type = 'renewal'), '0.000000')`,
      activityAmount: sql<string>`coalesce(sum(commission_amount) filter (where commission_type = 'activity'), '0.000000')`,
    })
    .from(commissionLogs)
    .where(
      and(
        gte(commissionLogs.createdAt, startOfDay),
        lte(commissionLogs.createdAt, endOfDay),
      )
    )
    .groupBy(commissionLogs.agentId);

  if (rollupRows.length === 0) {
    console.log(`[CommissionRollup] ${date} 无分佣数据，跳过`);
    return 0;
  }

  // 分批写入 rollup 表（Upsert）
  let updatedCount = 0;
  for (const row of rollupRows) {
    await db.insert(commissionDailyRollup).values({
      agentId: row.agentId,
      reportDate: date,
      totalRecords: row.totalRecords,
      totalCallCost: row.totalCallCost,
      totalCommissionAmount: row.totalCommissionAmount,
      totalFeeAmount: row.totalFeeAmount,
      totalNetAmount: row.totalNetAmount,
      pendingCount: row.pendingCount,
      settledCount: row.settledCount,
      cancelledCount: row.cancelledCount,
      pendingAmount: row.pendingAmount,
      settledAmount: row.settledAmount,
      cancelledAmount: row.cancelledAmount,
      saleCount: row.saleCount,
      renewalCount: row.renewalCount,
      activityCount: row.activityCount,
      saleAmount: row.saleAmount,
      renewalAmount: row.renewalAmount,
      activityAmount: row.activityAmount,
    }).onConflictDoUpdate({
      target: [commissionDailyRollup.agentId, commissionDailyRollup.reportDate],
      set: {
        totalRecords: sql`excluded.total_records`,
        totalCallCost: sql`excluded.total_call_cost`,
        totalCommissionAmount: sql`excluded.total_commission_amount`,
        totalFeeAmount: sql`excluded.total_fee_amount`,
        totalNetAmount: sql`excluded.total_net_amount`,
        pendingCount: sql`excluded.pending_count`,
        settledCount: sql`excluded.settled_count`,
        cancelledCount: sql`excluded.cancelled_count`,
        pendingAmount: sql`excluded.pending_amount`,
        settledAmount: sql`excluded.settled_amount`,
        cancelledAmount: sql`excluded.cancelled_amount`,
        saleCount: sql`excluded.sale_count`,
        renewalCount: sql`excluded.renewal_count`,
        activityCount: sql`excluded.activity_count`,
        saleAmount: sql`excluded.sale_amount`,
        renewalAmount: sql`excluded.renewal_amount`,
        activityAmount: sql`excluded.activity_amount`,
        updatedAt: new Date(),
      },
    });
    updatedCount++;
  }

  console.log(`[CommissionRollup] ${date} 聚合完成: ${updatedCount} 个代理商，总 ${rollupRows.reduce((s, r) => s + r.totalRecords, 0)} 条记录`);
  return updatedCount;
}

/**
 * 结算/作废后，刷新指定代理商指定日期的 rollup 行
 * 只影响一个 agent + date，针对性强
 */
export async function refreshRollupForAgentDate(agentId: number, date: string, tx?: any): Promise<void> {
  const db = tx ?? getDb();
  const startOfDay = new Date(date + "T00:00:00Z");
  const endOfDay = new Date(date + "T23:59:59.999Z");

  const [rollup] = await db
    .select({
      totalRecords: sql<number>`count(*)`,
      totalCallCost: sql<string>`coalesce(sum(call_cost), '0.000000')`,
      totalCommissionAmount: sql<string>`coalesce(sum(commission_amount), '0.000000')`,
      totalFeeAmount: sql<string>`coalesce(sum(fee_amount), '0.000000')`,
      totalNetAmount: sql<string>`coalesce(sum(net_amount), '0.000000')`,
      pendingCount: sql<number>`count(*) filter (where status = 'pending')`,
      settledCount: sql<number>`count(*) filter (where status = 'settled')`,
      cancelledCount: sql<number>`count(*) filter (where status = 'cancelled')`,
      pendingAmount: sql<string>`coalesce(sum(commission_amount) filter (where status = 'pending'), '0.000000')`,
      settledAmount: sql<string>`coalesce(sum(commission_amount) filter (where status = 'settled'), '0.000000')`,
      cancelledAmount: sql<string>`coalesce(sum(commission_amount) filter (where status = 'cancelled'), '0.000000')`,
      saleCount: sql<number>`count(*) filter (where commission_type = 'sale')`,
      renewalCount: sql<number>`count(*) filter (where commission_type = 'renewal')`,
      activityCount: sql<number>`count(*) filter (where commission_type = 'activity')`,
      saleAmount: sql<string>`coalesce(sum(commission_amount) filter (where commission_type = 'sale'), '0.000000')`,
      renewalAmount: sql<string>`coalesce(sum(commission_amount) filter (where commission_type = 'renewal'), '0.000000')`,
      activityAmount: sql<string>`coalesce(sum(commission_amount) filter (where commission_type = 'activity'), '0.000000')`,
    })
    .from(commissionLogs)
    .where(
      and(
        eq(commissionLogs.agentId, agentId),
        gte(commissionLogs.createdAt, startOfDay),
        lte(commissionLogs.createdAt, endOfDay),
      ),
    );

  if (!rollup || rollup.totalRecords === 0) {
    // 该代理商当天没有记录 → 删除 rollup 行（避免残留）
    // 注意：在 tx 模式下清空可能导致该日其他数据丢失
    if (!tx) {
      await db
        .delete(commissionDailyRollup)
        .where(
          and(
            eq(commissionDailyRollup.agentId, agentId),
            eq(commissionDailyRollup.reportDate, date),
          ),
        );
    }
    return;
  }

  await db
    .insert(commissionDailyRollup)
    .values({
      agentId,
      reportDate: date,
      totalRecords: rollup.totalRecords,
      totalCallCost: rollup.totalCallCost,
      totalCommissionAmount: rollup.totalCommissionAmount,
      totalFeeAmount: rollup.totalFeeAmount,
      totalNetAmount: rollup.totalNetAmount,
      pendingCount: rollup.pendingCount,
      settledCount: rollup.settledCount,
      cancelledCount: rollup.cancelledCount,
      pendingAmount: rollup.pendingAmount,
      settledAmount: rollup.settledAmount,
      cancelledAmount: rollup.cancelledAmount,
      saleCount: rollup.saleCount,
      renewalCount: rollup.renewalCount,
      activityCount: rollup.activityCount,
      saleAmount: rollup.saleAmount,
      renewalAmount: rollup.renewalAmount,
      activityAmount: rollup.activityAmount,
    })
    .onConflictDoUpdate({
      target: [commissionDailyRollup.agentId, commissionDailyRollup.reportDate],
      set: {
        totalRecords: sql`excluded.total_records`,
        totalCallCost: sql`excluded.total_call_cost`,
        totalCommissionAmount: sql`excluded.total_commission_amount`,
        totalFeeAmount: sql`excluded.total_fee_amount`,
        totalNetAmount: sql`excluded.total_net_amount`,
        pendingCount: sql`excluded.pending_count`,
        settledCount: sql`excluded.settled_count`,
        cancelledCount: sql`excluded.cancelled_count`,
        pendingAmount: sql`excluded.pending_amount`,
        settledAmount: sql`excluded.settled_amount`,
        cancelledAmount: sql`excluded.cancelled_amount`,
        saleCount: sql`excluded.sale_count`,
        renewalCount: sql`excluded.renewal_count`,
        activityCount: sql`excluded.activity_count`,
        saleAmount: sql`excluded.sale_amount`,
        renewalAmount: sql`excluded.renewal_amount`,
        activityAmount: sql`excluded.activity_amount`,
        updatedAt: new Date(),
      },
    });

  console.log(`[RollupRefresh] agent=${agentId} date=${date}: pending=${rollup.pendingCount} settled=${rollup.settledCount} cancelled=${rollup.cancelledCount}`);
}

// ══════════════════════════════════════════════
//  佣金规则 CRUD
// ══════════════════════════════════════════════

// ──────────────────────────────────────────────
//  Get Commission Rules for an Agent
// ──────────────────────────────────────────────

export async function getAgentCommissionRules(agentId: number) {
  const db = getDb();
  return db
    .select()
    .from(commissionRules)
    .where(eq(commissionRules.agentId, agentId))
    .orderBy(commissionRules.ruleType);
}

// ──────────────────────────────────────────────
//  Upsert a Commission Rule (按 agentId + ruleType)
// ──────────────────────────────────────────────

export async function upsertCommissionRule(
  agentId: number,
  data: {
    ruleType: string;
    rate?: string;
    isEnabled?: boolean;
    minTriggerAmount?: string;
    maxCap?: string;
    validFrom?: string;
    validUntil?: string;
    activityName?: string;
    activityType?: string;
    fixedAmount?: string;
    teamLevelLimit?: number;
  },
  operatorId: number,
) {
  const db = getDb();

  // 验证代理商存在
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) {
    throw new AppError("AGENT_NOT_FOUND", "代理商不存在", 404);
  }

  const now = new Date();

  // 构造更新数据（排除 undefined 字段）
  const upsertData: Record<string, any> = {
    agentId,
    ruleType: data.ruleType,
    updatedAt: now,
  };

  if (data.rate !== undefined) upsertData.rate = data.rate;
  if (data.isEnabled !== undefined) upsertData.isEnabled = data.isEnabled;
  if (data.minTriggerAmount !== undefined) upsertData.minTriggerAmount = data.minTriggerAmount;
  if (data.maxCap !== undefined) upsertData.maxCap = data.maxCap;
  if (data.validFrom !== undefined) upsertData.validFrom = new Date(data.validFrom);
  if (data.validUntil !== undefined) upsertData.validUntil = new Date(data.validUntil);
  if (data.activityName !== undefined) upsertData.activityName = data.activityName;
  if (data.activityType !== undefined) upsertData.activityType = data.activityType;
  if (data.fixedAmount !== undefined) upsertData.fixedAmount = data.fixedAmount;
  if (data.teamLevelLimit !== undefined) upsertData.teamLevelLimit = data.teamLevelLimit;

  const [existing] = await db
    .select({ id: commissionRules.id })
    .from(commissionRules)
    .where(and(
      eq(commissionRules.agentId, agentId),
      eq(commissionRules.ruleType, data.ruleType as any),
    ))
    .limit(1);

  if (existing) {
    // 更新已有规则
    await (db
      .update(commissionRules)
      .set(upsertData as any)
      .where(eq(commissionRules.id, existing.id)));

    await db.insert(auditLogs).values({
      operatorId,
      action: "agent_update",
      targetType: "commission_rules",
      targetId: existing.id,
      before: null,
      after: upsertData,
      ip: null,
      description: `更新代理商 #${agentId} 佣金规则: ${data.ruleType}`,
    });

    return { id: existing.id, ...upsertData };
  } else {
    // 新建规则
    const result = await db.transaction(async (tx) => {
      const [rule] = await tx
        .insert(commissionRules)
        .values({ ...upsertData, createdBy: operatorId } as any)
        .returning();

      await tx.insert(auditLogs).values({
        operatorId,
        action: "agent_create",
        targetType: "commission_rules",
        targetId: rule.id,
        before: null,
        after: upsertData,
        ip: null,
        description: `创建代理商 #${agentId} 佣金规则: ${data.ruleType}`,
      });

      return rule;
    });

    return result;
  }
}

// ──────────────────────────────────────────────
//  Delete a Commission Rule
// ──────────────────────────────────────────────

export async function deleteCommissionRule(
  agentId: number,
  ruleId: number,
  operatorId: number,
) {
  const db = getDb();

  const [rule] = await db
    .select()
    .from(commissionRules)
    .where(and(
      eq(commissionRules.id, ruleId),
      eq(commissionRules.agentId, agentId),
    ))
    .limit(1);

  if (!rule) {
    throw new AppError("RULE_NOT_FOUND", "佣金规则不存在", 404);
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(commissionRules)
      .where(eq(commissionRules.id, ruleId));

    await tx.insert(auditLogs).values({
      operatorId,
      action: "agent_update",
      targetType: "commission_rules",
      targetId: ruleId,
      before: { ruleType: rule.ruleType, rate: rule.rate },
      after: null,
      ip: null,
      description: `删除代理商 #${agentId} 佣金规则: ${rule.ruleType}`,
    });
  });
}

// ══════════════════════════════════════════════
//  代理商团队层级管理
// ══════════════════════════════════════════════

// ──────────────────────────────────────────────
//  Set Agent Parent (设置上级代理商)
// ──────────────────────────────────────────────

export async function setAgentParent(
  agentId: number,
  parentAgentId: number | null,
  operatorId: number,
) {
  const db = getDb();

  // 验证代理商存在
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) {
    throw new AppError("AGENT_NOT_FOUND", "代理商不存在", 404);
  }

  if (parentAgentId) {
    // 验证上级代理商存在
    const [parent] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.id, parentAgentId))
      .limit(1);

    if (!parent) {
      throw new AppError("PARENT_NOT_FOUND", "上级代理商不存在", 404);
    }

    // 防止循环引用（不能把自己设为自己的上级）
    if (parentAgentId === agentId) {
      throw new AppError("SELF_PARENT", "不能将自己设为上级代理商", 400);
    }

    // 防止循环引用（上级的下级不能反过来成为上级）
    const [cycle] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(
        eq(agents.parentAgentId, agentId),
        eq(agents.id, parentAgentId),
      ))
      .limit(1);

    if (cycle) {
      throw new AppError("CYCLE_DETECTED", "循环引用: 该代理商的下级不能成为其上级", 400);
    }
  }

  // 计算新的深度
  let newDepth = 0;
  if (parentAgentId) {
    const [parent] = await db
      .select({ teamDepth: agents.teamDepth })
      .from(agents)
      .where(eq(agents.id, parentAgentId))
      .limit(1);
    newDepth = (parent?.teamDepth ?? 0) + 1;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(agents)
      .set({
        parentAgentId: parentAgentId,
        teamDepth: newDepth,
      })
      .where(eq(agents.id, agentId));

    await tx.insert(auditLogs).values({
      operatorId,
      action: "agent_update",
      targetType: "agent",
      targetId: agentId,
      before: null,
      after: { parentAgentId, teamDepth: newDepth },
      ip: null,
      description: `设置代理商 #${agentId} 的上级为 #${parentAgentId ?? "无"}`,
    });
  });

  return { id: agentId, parentAgentId, teamDepth: newDepth };
}

// ══════════════════════════════════════════════
//  收入趋势 — Dashboard 收入曲线数据
// ══════════════════════════════════════════════

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
