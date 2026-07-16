// ============================================================
//  3cloud (3C) — 财务对账服务 (Business Logic)
// ============================================================
//
// ── 业务逻辑 ──
//
// 【客户消费明细 (getCustomerConsumption)】
//   - 数据源: agent_customer_consumption (实时维护表)
//   - 排序: total_amount, month_amount, commission_amount, last_order_at (asc/desc)
//   - 代理商过滤: eq(agentId, agent.id)
//
// 【客户订单详情 (getCustomerOrderDetail)】
//   - 验证: agentId + customerUserId 属于该代理商 (agent_clients 查证)
//   - 订单数据: commission_logs WHERE agentId + sourceCustomerId
//   - 返回: orderNo, orderAmount, commissionAmount, commissionType, callCost, paidAt
//
// 【财务仪表盘 (getFinanceDashboard)】
//   - Redis 缓存: finance:dashboard, 60s TTL (降级到 DB 查询)
//   - 指标:
//     - pendingFirstReview: 待初审提现 (count + sum)
//     - pendingSecondReview: 待复审提现
//     - pendingRecharge: 对公转账待确认 (channel='bank_transfer', status='pending')
//     - pendingCommissions: 待结算佣金 (count + sum)
//     - todayPaidWithdraws: 今日已打款 (paidAt >= todayStart)
//
// 【对账报表 (getReconciliationReport)】
//   - Redis 缓存: recon:{startDate}:{endDate}:{granularity}, 24h TTL (仅历史数据)
//   - 汇总统计: 佣金/提现/充值确认/调用消耗 四项并行查询
//   - 维度拆分: 按代理商 / 按佣金状态 / 按提现状态 / 按佣金类型 四项并行查询
//   - 异常检测:
//     1. orphan_commission: commission_logs.clientCallLogId IS NOT NULL AND NOT EXISTS call_logs (高严重)
//     2. frequent_withdraw: 同一天同一代理 >= 3 笔提现 (中严重, 拆分风险)
//     3. unmatched_recharge: 充值confirmed但balance_logs无入账记录 (高严重)
//   - 资金平衡校验:
//     公式: balanceDiff = 充值确认总额 - (调用消耗 + 佣金净额 + 提现实际到账)
//     isBalanced = |balanceDiff| < 0.01 (¥0.01容差)
//   - 趋势: 按 granularity(day/week/month) 分组, 合并 commission/withdraw/recharge 三条线
//   - 粒度生成: genDates() 生成完整日期序列 (含零值填充)
//
// 【日对账汇总 (computeDailyReconSummary)】
//   - Cron: 每日凌晨执行 (targetDate = 前一天)
//   - 调用 getReconciliationReport → 写入 daily_recon_summary (ON CONFLICT DO UPDATE)
//   - 清除 Redis 缓存
//   - version 字段自增
//
// 【佣金日汇总 (computeDailyCommissionRollup)】
//   - Cron: 每天 00:30 执行, Asia/Shanghai 时区
//   - 数据源: commission_logs (分区表) 按 agentId GROUP BY
//   - 聚合维度: total/pending/settled/cancelled + sale/renewal/activity 三分
//   - 写入: commission_daily_rollup ON CONFLICT (agentId, reportDate) DO UPDATE
//   - 日志: logger.info 记录聚合结果
//
// 【Rollup 刷新 (refreshRollupForAgentDate)】
//   - 单代理商+单日精准刷新 (结算/作废时调用)
//   - 接收可选 tx 参数 (事务内调用, 避免脏读)
//   - 数据为空时: 非事务模式 DELETE rollup 行 (避免残留), 事务模式跳过
//   - Upsert: ON CONFLICT DO UPDATE
//
// 【CSV 导出 (exportReconCsv)】
//   - 复用 getReconciliationReport 结果
//   - 分区块: 汇总 → 资金平衡 → 异常 → 趋势
//
// 【集成点】
//   - billing.ts: processCommission → refreshRollupForAgentDate
//   - agent-helpers.ts: toDecStr, addDec, subDec 精度工具
//   - logger.ts: 结构化日志 (pino)
//   - daily_recon_summary / commission_daily_rollup: 预聚合持久化表

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
import { logger } from "../logger.js";
import { getAgentByUserId, getStatusLabel, COMMISSION_TYPE_LABEL, num, fmt, toDecStr, addDec, subDec, type ReconParams } from "./agent-helpers.js";

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

    // PERF: 修复 groupBy 使用表达式而非常量 1，确保按正确粒度分组
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
        .groupBy(sql`${groupExpr}`)
        .orderBy(sql`${groupExpr}`),
      db.select({
        date: sql<string>`to_char(${withdrawOrders.createdAt}, 'YYYY-MM-DD')`,
        amount: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
        count: sql<number>`count(*)`,
      }).from(withdrawOrders)
        .where(and(
          gte(withdrawOrders.createdAt, startOfRange),
          lte(withdrawOrders.createdAt, endOfRange),
        ))
        .groupBy(sql`to_char(${withdrawOrders.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${withdrawOrders.createdAt}, 'YYYY-MM-DD')`),
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
        .groupBy(sql`to_char(${rechargeOrders.confirmedAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${rechargeOrders.confirmedAt}, 'YYYY-MM-DD')`),
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

  // PERF: 并行查询汇总、维度拆分、异常检测同时执行，减少总等待时间

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

  logger.info({ date }, "[CommissionRollup] 开始聚合分佣数据");

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
    logger.info({ date }, "[CommissionRollup] 无分佣数据，跳过");
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

  logger.info({ date, updatedCount, totalRecords: rollupRows.reduce((s, r) => s + r.totalRecords, 0) }, "[CommissionRollup] 聚合完成");
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

  logger.info({ agentId, date, pending: rollup.pendingCount, settled: rollup.settledCount, cancelled: rollup.cancelledCount }, "[RollupRefresh] 聚合结果");
}

// ══════════════════════════════════════════════
//  佣金规则 CRUD
// ══════════════════════════════════════════════

// ──────────────────────────────────────────────
//  Get Commission Rules for an Agent
// ──────────────────────────────────────────────

