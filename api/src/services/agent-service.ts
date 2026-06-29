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
  const [seqResult] = await db.execute(sql`
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(voucher_no FROM '([0-9]+)$') AS INTEGER)), 0
    ) + 1 AS next_seq
    FROM commission_logs
    WHERE voucher_no LIKE 'VCH-' || ${dateStr} || '-A-%'
  `);
  const seqRows = seqResult.rows ?? [];
  let nextSeq = Number(seqRows[0]?.next_seq ?? 1);

  const baseConditions: any[] = [eq(commissionLogs.status, "pending")];
  if (agentId) baseConditions.push(eq(commissionLogs.agentId, agentId));

  while (true) {
    // 每次只取一批，不全部加载到内存
    const batch = await db
      .select({
        id: commissionLogs.id,
        agentId: commissionLogs.agentId,
        commissionAmount: commissionLogs.commissionAmount,
      })
      .from(commissionLogs)
      .where(and(...baseConditions))
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    // 按代理商分组汇总 + 预分配凭证号
    const agentSumMap = new Map<number, number>();
    const batchIds: number[] = [];
    const voucherMap = new Map<number, string>();
    for (const c of batch) {
      batchIds.push(c.id);
      voucherMap.set(c.id, `VCH-${dateStr}-A-${String(nextSeq++).padStart(4, '0')}`);
      const cur = agentSumMap.get(c.agentId) ?? 0;
      agentSumMap.set(c.agentId, cur + num(c.commissionAmount));
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
  const [seqResult] = await db.execute(sql`
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(voucher_no FROM '([0-9]+)$') AS INTEGER)), 0
    ) + 1 AS next_seq
    FROM commission_logs
    WHERE voucher_no LIKE 'VCH-' || ${dateStr} || '-A-%'
  `);
  const rows = seqResult.rows ?? [];
  let nextSeq = Number(rows[0]?.next_seq ?? 1);

  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const batchIds = ids.slice(offset, offset + BATCH_SIZE);

    const pendingList = await db
      .select({
        id: commissionLogs.id,
        agentId: commissionLogs.agentId,
        commissionAmount: commissionLogs.commissionAmount,
      })
      .from(commissionLogs)
      .where(and(eq(commissionLogs.status, "pending"), inArray(commissionLogs.id, batchIds)));

    if (pendingList.length === 0) continue;

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
    conditions.push(gte(commissionLogs.createdAt, new Date(filters.startDate)));
  }
  if (filters?.endDate) {
    conditions.push(lte(commissionLogs.createdAt, new Date(filters.endDate)));
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
  await db
    .update(commissionLogs)
    .set({ status: "cancelled" })
    .where(and(eq(commissionLogs.status, "pending"), inArray(commissionLogs.id, ids)));
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

  // 最近 10 条佣金记录（增强：含客户名、类型）
  const recentCommissions = await db
    .select({
      id: commissionLogs.id,
      callCost: commissionLogs.callCost,
      commissionAmount: commissionLogs.commissionAmount,
      commissionType: commissionLogs.commissionType,
      voucherNo: commissionLogs.voucherNo,
      status: commissionLogs.status,
      createdAt: commissionLogs.createdAt,
      sourceCustomerId: commissionLogs.sourceCustomerId,
      customerName: users.nickname,
      customerEmail: users.email,
    })
    .from(commissionLogs)
    .leftJoin(users, eq(commissionLogs.sourceCustomerId, users.id))
    .where(eq(commissionLogs.agentId, agent.id))
    .orderBy(desc(commissionLogs.createdAt))
    .limit(10);

  // 最近 5 条提现记录
  const recentWithdraws = await db
    .select({
      id: withdrawOrders.id,
      amount: withdrawOrders.amount,
      actualAmount: withdrawOrders.actualAmount,
      feeAmount: withdrawOrders.feeAmount,
      status: withdrawOrders.status,
      voucherNo: withdrawOrders.voucherNo,
      createdAt: withdrawOrders.createdAt,
    })
    .from(withdrawOrders)
    .where(eq(withdrawOrders.agentId, agent.id))
    .orderBy(desc(withdrawOrders.createdAt))
    .limit(5);

  // 客户消费排行 TOP5
  const customerRankings = await db
    .select({
      customerUserId: agentCustomerConsumption.customerUserId,
      customerName: agentCustomerConsumption.customerName,
      totalAmount: agentCustomerConsumption.totalAmount,
      monthAmount: agentCustomerConsumption.monthAmount,
      commissionAmount: agentCustomerConsumption.commissionAmount,
      orderCount: agentCustomerConsumption.orderCount,
    })
    .from(agentCustomerConsumption)
    .where(eq(agentCustomerConsumption.agentId, agent.id))
    .orderBy(desc(agentCustomerConsumption.totalAmount))
    .limit(5);

  return {
    totalClients,
    totalCommission: agent.totalCommission,
    settledCommission: agent.settledCommission,
    withdrawnTotal,
    pendingWithdrawTotal,
    frozenAmount: agent.frozenAmount,
    availableBalance,
    commissionRate: agent.commissionRate,
    status: agent.status,
    recentCommissions: recentCommissions.map((c) => ({
      ...c,
      commissionTypeLabel: getStatusLabel(c.commissionType ?? "", COMMISSION_TYPE_LABEL),
      createdAt: c.createdAt.toISOString(),
    })),
    recentWithdraws: recentWithdraws.map((w) => ({
      ...w,
      statusLabel: getStatusLabel(w.status, WITHDRAW_STATUS_LABEL),
      createdAt: w.createdAt.toISOString(),
    })),
    customerRankings: customerRankings.map((r) => ({
      ...r,
      totalAmount: r.totalAmount ?? "0.000000",
      monthAmount: r.monthAmount ?? "0.000000",
      commissionAmount: r.commissionAmount ?? "0.000000",
    })),
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

  // 批量查询消费汇总
  const clientUserIds = rows.map((r) => r.clientUserId);
  let consumptionMap = new Map<number, {
    totalConsumption: string;
    monthConsumption: string;
    commissionContribution: string;
    orderCount: number;
    lastOrderAt: string | null;
  }>();

  if (clientUserIds.length > 0) {
    const consumptionRows = await db
      .select()
      .from(agentCustomerConsumption)
      .where(
        and(
          eq(agentCustomerConsumption.agentId, agent.id),
          inArray(agentCustomerConsumption.customerUserId, clientUserIds),
        )
      );

    for (const row of consumptionRows) {
      consumptionMap.set(row.customerUserId, {
        totalConsumption: row.totalAmount ?? "0.000000",
        monthConsumption: row.monthAmount ?? "0.000000",
        commissionContribution: row.commissionAmount ?? "0.000000",
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
        totalConsumption: cm?.totalConsumption ?? "0.000000",
        monthConsumption: cm?.monthConsumption ?? "0.000000",
        commissionContribution: cm?.commissionContribution ?? "0.000000",
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
  status?: string,
) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);
  const offset = (page - 1) * pageSize;

  const conditions = [eq(commissionLogs.agentId, agent.id)];
  if (status) {
    conditions.push(eq(commissionLogs.status, status as any));
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commissionLogs)
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

  // 检查可用余额
  const pendingWithdraw = parseFloat(agent.pendingWithdraw);
  if (amountNum > pendingWithdraw) {
    throw new AppError("INSUFFICIENT_BALANCE", `可提现余额不足。当前可提现: ${pendingWithdraw.toFixed(2)} 元`, 400);
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
      commissionRate: agents.commissionRate,
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

  // 批量查询每个客户的佣金汇总
  const clientUserIds = rows.map((r) => r.clientUserId);
  let commissionMap = new Map<number, { totalCallCost: string; totalCommission: string; count: number }>();

  if (clientUserIds.length > 0) {
    const commissionAgg = await db
      .select({
        userId: callLogs.userId,
        totalCallCost: sql<string>`coalesce(sum(${commissionLogs.callCost}), '0.000000')`,
        totalCommission: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
        commissionCount: sql<number>`count(${commissionLogs.id})`,
      })
      .from(commissionLogs)
      .innerJoin(callLogs, eq(callLogs.id, commissionLogs.clientCallLogId))
      .where(
        and(
          eq(commissionLogs.agentId, agentId),
          inArray(callLogs.userId, clientUserIds)
        )
      )
      .groupBy(callLogs.userId);

    for (const item of commissionAgg) {
      commissionMap.set(item.userId, {
        totalCallCost: item.totalCallCost,
        totalCommission: item.totalCommission,
        count: item.commissionCount,
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
      commissionRate: agent.commissionRate,
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
      commissionRate: agents.commissionRate,
      totalCommission: agents.totalCommission,
      pendingWithdraw: agents.pendingWithdraw,
      frozenAmount: agents.frozenAmount,
      status: agents.status,
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

export async function createAgent(operatorId: number, targetUserId: number, commissionRate: string) {
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

  const rateNum = parseFloat(commissionRate);
  if (isNaN(rateNum) || rateNum < 0 || rateNum > 1) {
    throw new AppError("INVALID_RATE", "分佣比例必须在 0-1 之间", 400);
  }

  const [agent] = await db.transaction(async (tx) => {
    const [newAgent] = await tx
      .insert(agents)
      .values({
        userId: targetUserId,
        commissionRate: commissionRate,
      })
      .returning();

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
      description: `创建代理商 #${targetUserId}，分佣比例 ${commissionRate}`,
    });

    return [newAgent];
  });

  return {
    id: agent.id,
    userId: agent.userId,
    commissionRate: agent.commissionRate,
    status: agent.status,
  };
}

// ──────────────────────────────────────────────
//  Update Agent
// ──────────────────────────────────────────────

export async function updateAgent(agentId: number, data: { commissionRate?: string; status?: boolean }) {
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

  if (data.commissionRate !== undefined) {
    const rateNum = parseFloat(data.commissionRate);
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 1) {
      throw new AppError("INVALID_RATE", "分佣比例必须在 0-1 之间", 400);
    }
    updateData.commissionRate = data.commissionRate;
  }

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
    cursor?: string;  // ISO datetime cursor for keyset pagination
  },
) {
  const db = getDb();
  const useCursor = !!filters?.cursor;
  const offset = useCursor ? 0 : (page - 1) * pageSize;

  const conditions: any[] = [sql`1=1`];

  // 游标分页条件：取 createdAt < cursor 的下一批
  if (useCursor && filters?.cursor) {
    conditions.push(lt(commissionLogs.createdAt, new Date(filters.cursor)));
  }

  if (filters?.agentId) {
    conditions.push(eq(commissionLogs.agentId, filters.agentId));
  }
  if (filters?.agentSearch) {
    const keyword = `%${filters.agentSearch}%`;
    conditions.push(
      sql`(${users.email} ILIKE ${keyword} OR ${users.nickname} ILIKE ${keyword})`
    );
  }
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

  let total = 0;
  if (!useCursor) {
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(commissionLogs)
      .innerJoin(agents, eq(commissionLogs.agentId, agents.id))
      .where(and(...conditions));
    total = Number(totalResult?.count ?? 0);
  }

  const query = db
    .select({
      id: commissionLogs.id,
      agentId: commissionLogs.agentId,
      agentEmail: users.email,
      agentNickname: users.nickname,
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
    .innerJoin(agents, eq(commissionLogs.agentId, agents.id))
    .innerJoin(users, eq(agents.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(commissionLogs.createdAt))
    .limit(pageSize);

  const rows = useCursor ? await query : await query.offset(offset);
  const nextCursor = useCursor && rows.length === pageSize
    ? rows[rows.length - 1].createdAt.toISOString()
    : undefined;

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
    nextCursor,
  };
}

// ══════════════════════════════════════════════
//  Admin: Reconciliation Report (新增)
// ══════════════════════════════════════════════

export async function getReconciliationReport(date?: string) {
  const db = getDb();

  const reportDate = date || new Date().toISOString().slice(0, 10);
  const startOfDay = new Date(reportDate + "T00:00:00Z");
  const endOfDay = new Date(reportDate + "T23:59:59Z");

  // 当日佣金统计
  const [commissionResult] = await db
    .select({
      count: sql<number>`count(*)`,
      totalCommission: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
      totalFee: sql<string>`coalesce(sum(${commissionLogs.feeAmount}), '0.000000')`,
      totalNet: sql<string>`coalesce(sum(${commissionLogs.netAmount}), '0.000000')`,
    })
    .from(commissionLogs)
    .where(and(
      gte(commissionLogs.createdAt, startOfDay),
      lte(commissionLogs.createdAt, endOfDay),
    ));

  // 当日提现统计
  const [withdrawResult] = await db
    .select({
      count: sql<number>`count(*)`,
      totalAmount: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
      totalFee: sql<string>`coalesce(sum(${withdrawOrders.feeAmount}), '0.000000')`,
      totalActual: sql<string>`coalesce(sum(${withdrawOrders.actualAmount}), '0.000000')`,
    })
    .from(withdrawOrders)
    .where(and(
      gte(withdrawOrders.createdAt, startOfDay),
      lte(withdrawOrders.createdAt, endOfDay),
    ));

  // 当日充值确认统计
  const [rechargeResult] = await db
    .select({
      count: sql<number>`count(*)`,
      totalAmount: sql<string>`coalesce(sum(${rechargeOrders.amount}), '0.000000')`,
    })
    .from(rechargeOrders)
    .where(and(
      eq(rechargeOrders.status, "confirmed"),
      gte(rechargeOrders.confirmedAt, startOfDay),
      lte(rechargeOrders.confirmedAt, endOfDay),
    ));

  return {
    date: reportDate,
    commission: {
      count: Number(commissionResult?.count ?? 0),
      totalCommission: commissionResult?.totalCommission ?? "0.000000",
      totalFee: commissionResult?.totalFee ?? "0.000000",
      totalNet: commissionResult?.totalNet ?? "0.000000",
    },
    withdraw: {
      count: Number(withdrawResult?.count ?? 0),
      totalAmount: withdrawResult?.totalAmount ?? "0.000000",
      totalFee: withdrawResult?.totalFee ?? "0.000000",
      totalActual: withdrawResult?.totalActual ?? "0.000000",
    },
    recharge: {
      count: Number(rechargeResult?.count ?? 0),
      totalAmount: rechargeResult?.totalAmount ?? "0.000000",
    },
  };
}
