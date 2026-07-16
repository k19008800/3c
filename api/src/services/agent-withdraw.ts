// ============================================================
//  3cloud (3C) — 提现服务 (Business Logic)
// ============================================================
//
// ── 业务逻辑 ──
//
// 【提现状态机】
//   pending_first_review ──初审通过──> pending_second_review ──复审通过──> approved ──标记打款──> paid
//        │                                    │                                  │
//        └──初审拒绝──> rejected              └──复审拒绝──> rejected            (终态)
//   rejected: 拒绝时退还 agents.pendingWithdraw += amount
//   paid: 终态, 已实际打款
//
// 【创建提现 (createWithdraw)】
//   - 余额检查: 可用余额 = settledCommission - withdrawnTotal - pendingWithdrawTotal - frozenAmount
//   - 最小金额: system_configs key=agent_min_withdraw
//   - 每日次数限制: system_configs key=agent_daily_withdraw_limit, count today's withdrawOrders
//   - 手续费: system_configs key=withdraw_fee_rate (0.x, 如 0.01 为 1%)
//     - feeAmount = amount x feeRate
//     - actualAmount = amount - feeAmount (到账金额)
//   - 凭证号: generateVoucherNo('B') (全局流水号)
//   - 事务: UPDATE agents.pendingWithdraw += amount (冻结) + INSERT withdrawOrders (status='pending_first_review', auditLevel=1)
//
// 【银行信息预填 (getSavedBankInfo)】
//   - 查询上次 paid 状态提现的 bankCardNo/bankName
//   - 空安全返回 null
//
// 【提现列表 (getAgentWithdraws / listAllWithdraws)】
//   - 代理商视角: agentId 强制过滤
//   - 管理后台: JOIN agents + users, 含一审/二审审计人和风控结果
//
// 【双审流程】
//   - firstReviewWithdraw:
//     - approve: status → pending_second_review, auditLevel=2, 记录 firstAuditorId + firstAuditedAt, 生成 voucherNo
//     - reject: 退还 agents.pendingWithdraw += amount, status='rejected', 记录 rejectReason
//   - secondReviewWithdraw:
//     - approve: status → approved, 记录 secondAuditorId + secondAuditedAt, 可选 bankVoucherUrl
//     - reject: 同初审拒绝 (退余额)
//   - 状态保护: 严格检查当前状态 (pending_first_review / pending_second_review)
//
// 【打款确认 (markWithdrawAsPaid)】
//   - 前置: status='approved'
//   - 更新: status='paid', paidOperatorId, paidAt, bankVoucherUrl
//   - 审计: 写入 auditLogs
//   - pendingWithdraw 在创建时已扣减, 打款不再操作余额
//
// 【旧版兼容 (reviewWithdraw)】
//   - 兼容 1.0 单审流程
//   - 接受 pending_first_review 或 pending_second_review
//   - 通过 → approved, 拒绝 → rejected
//
// 【批量审核 (batchReviewWithdraws)】
//   - 逐个调用 firstReviewWithdraw, 收集错误不中断
//   - 返回: approved/rejected 计数 + errors 列表
//
// 【CSV 导出 (exportWithdrawsCsv)】
//   - 列: ID, 凭证号, 代理商ID, 昵称, 邮箱, 金额, 手续费, 实际到账, 银行卡号, 开户行, 状态, 拒绝原因, 创建时间, 打款时间
//   - 状态中文映射: pending_first_review=待初审, pending_second_review=待复审, approved=已通过, paid=已打款, rejected=已拒绝
//
// 【集成点】
//   - agent-helpers.ts: WITHDRAW_STATUS_LABEL 映射, getAgentByUserId
//   - voucher-service.ts: generateVoucherNo
//   - auditLogs: 所有审核操作全量审计

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
import { getAgentByUserId, num, fmt, getStatusLabel, WITHDRAW_STATUS_LABEL } from "./agent-helpers.js";

// ── 辅助: 获取系统配置值 ──

// PERF: 支持单 key 和批量 key 查询，避免多次独立查询
async function getSystemConfig(key: string): Promise<string | null> {
  const db = getDb();
  const [config] = await db
    .select({ value: systemConfigs.value })
    .from(systemConfigs)
    .where(eq(systemConfigs.key, key))
    .limit(1);
  return config?.value ?? null;
}

// PERF: 批量获取多个系统配置，单次 SQL WHERE key IN (...)
async function getSystemConfigs(keys: string[]): Promise<Map<string, string>> {
  const db = getDb();
  const rows = await db
    .select({ key: systemConfigs.key, value: systemConfigs.value })
    .from(systemConfigs)
    .where(inArray(systemConfigs.key, keys));
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.key, r.value);
  }
  return map;
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

  // PERF: 批量获取所有系统配置，单次 SQL 替代 3 次独立查询
  const configs = await getSystemConfigs(["agent_min_withdraw", "agent_daily_withdraw_limit", "withdraw_fee_rate"]);

  // 检查最小提现金额
  const minWithdrawStr = configs.get("agent_min_withdraw");
  if (minWithdrawStr) {
    const minWithdraw = parseFloat(minWithdrawStr);
    if (amountNum < minWithdraw) {
      throw new AppError("BELOW_MIN_WITHDRAW", `最低提现金额为 ${minWithdraw.toFixed(2)} 元`, 400);
    }
  }

  // 检查每日提现次数限制
  const dailyLimitStr = configs.get("agent_daily_withdraw_limit");
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

  // PERF: 合并 withdrawn + pendingWithdraw 统计为单次 SQL，减少一次全表扫描
  const [aggregateResult] = await db
    .select({
      withdrawnSum: sql<string>`coalesce(sum(${withdrawOrders.actualAmount}) filter (where ${withdrawOrders.status} = 'paid'), '0.000000')`,
      pendingSum: sql<string>`coalesce(sum(${withdrawOrders.amount}) filter (where ${withdrawOrders.status} NOT IN ('paid', 'rejected')), '0.000000')`,
    })
    .from(withdrawOrders)
    .where(eq(withdrawOrders.agentId, agent.id));
  const withdrawnTotal = aggregateResult?.withdrawnSum ?? "0.000000";
  const pendingWithdrawTotal = aggregateResult?.pendingSum ?? "0.000000";

  const settledCommission = num(agent.settledCommission);
  const withdrawn = num(withdrawnTotal);
  const pendingW = num(pendingWithdrawTotal);
  const frozen = num(agent.frozenAmount);
  const availableBalance = fmt(settledCommission - withdrawn - pendingW - frozen);

  if (amountNum > num(availableBalance)) {
    throw new AppError("INSUFFICIENT_BALANCE", `可提现余额不足。当前可提现: ${fmt(num(availableBalance))} 元`, 400);
  }

  // 获取提现手续费率（从已批量获取的 configs 中读取）
  const feeRateStr = configs.get("withdraw_fee_rate");
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

