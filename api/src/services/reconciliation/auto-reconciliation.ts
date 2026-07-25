// ============================================================
//  自动对账核心逻辑
// ============================================================

import { getDb } from "../../db/index.js";
import { eq, and, gte, lte, sql, desc, inArray, or } from "drizzle-orm";
import {
  rechargeOrders,
  balanceLogs,
  agents,
  reconciliationReports,
  reconciliationMismatches,
  commissionLogs,
  withdrawOrders,
  users,
  callLogs,
  monitoringAlerts,
} from "../../db/schema.js";
import type { Numeric } from "drizzle-orm/pg-core";
import { getRedis } from "../../redis.js";
// import { sendAlert } from "../alert-service.js"; // TODO: 实现 sendAlert

// ══════════════════════════════════════════════════════════════
//  类型定义
// ══════════════════════════════════════════════════════════════

export interface ReconciliationOptions {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  reconType?: 'full' | 'recharge' | 'balance' | 'commission' | 'withdraw' | 'consumption';
  createdBy?: number;
}

export interface MismatchRecord {
  orderId?: number;
  refType: string;
  refId: number;
  mismatchType: string;
  expectedValue?: string;
  actualValue?: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ReconciliationResult {
  reportId: number;
  summary: {
    totalOrders: number;
    matchedOrders: number;
    mismatchedOrders: number;
    totalAmount: string;
    difference: string;
    rechargeSummary?: {
      count: number;
      total: string;
    };
    withdrawSummary?: {
      count: number;
      total: string;
      feeTotal: string;
      actualTotal: string;
    };
    consumptionSummary?: {
      count: number;
      total: string;
    };
  };
  mismatches: MismatchRecord[];
  status: 'completed' | 'failed';
  errorMessage?: string;
}

// ══════════════════════════════════════════════════════════════
//  主入口：执行自动对账
// ══════════════════════════════════════════════════════════════

export async function runAutoReconciliation(
  options: ReconciliationOptions
): Promise<ReconciliationResult> {
  const db = getDb();
  const { startDate, endDate, reconType = 'full', createdBy } = options;

  // 创建报告记录
  const [report] = await db
    .insert(reconciliationReports)
    .values({
      startDate,
      endDate,
      reconType,
      status: 'running',
      createdBy,
      startedAt: new Date(),
      mismatches: [],
    })
    .returning();

  const reportId = report.id;

  try {
    const mismatches: MismatchRecord[] = [];

    // 根据对账类型执行不同的对账逻辑
    if (reconType === 'full' || reconType === 'recharge') {
      const rechargeMismatches = await checkRechargeOrders(db, startDate, endDate);
      mismatches.push(...rechargeMismatches);
    }

    if (reconType === 'full' || reconType === 'balance') {
      const balanceMismatches = await checkBalanceConsistency(db, startDate, endDate);
      mismatches.push(...balanceMismatches);
    }

    if (reconType === 'full' || reconType === 'commission') {
      const commissionMismatches = await checkCommissionAccuracy(db, startDate, endDate);
      mismatches.push(...commissionMismatches);
    }

    if (reconType === 'full' || reconType === 'withdraw') {
      const withdrawMismatches = await checkWithdrawRecords(db, startDate, endDate);
      mismatches.push(...withdrawMismatches);
    }

    if (reconType === 'full' || reconType === 'consumption') {
      const consumptionMismatches = await checkConsumptionRecords(db, startDate, endDate);
      mismatches.push(...consumptionMismatches);
    }

    // 用户余额一致性检查
    if (reconType === 'full' || reconType === 'balance') {
      const userBalanceMismatches = await checkUserBalanceConsistency(db, startDate, endDate);
      mismatches.push(...userBalanceMismatches);
    }

    // 计算汇总数据
    const summary = await calculateSummary(db, startDate, endDate, mismatches);

    // 更新报告
    await db
      .update(reconciliationReports)
      .set({
        totalOrders: summary.totalOrders,
        matchedOrders: summary.matchedOrders,
        mismatchedOrders: summary.mismatchedOrders,
        totalAmount: summary.totalAmount,
        difference: summary.difference,
        mismatches: mismatches as any,
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(reconciliationReports.id, reportId));

    // 插入异常明细
    if (mismatches.length > 0) {
      await db.insert(reconciliationMismatches).values(
        mismatches.map((m) => ({
          reportId,
          orderId: m.orderId,
          refType: m.refType,
          refId: m.refId,
          mismatchType: m.mismatchType,
          expectedValue: m.expectedValue,
          actualValue: m.actualValue,
          reason: m.reason,
          severity: m.severity,
        }))
      );
      
      // 发送告警通知
      await sendReconciliationAlert(reportId, mismatches);
    }

    return {
      reportId,
      summary,
      mismatches,
      status: 'completed',
    };
  } catch (error: any) {
    // 更新报告为失败状态
    await db
      .update(reconciliationReports)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorMessage: error.message || 'Unknown error',
      })
      .where(eq(reconciliationReports.id, reportId));

    return {
      reportId,
      summary: {
        totalOrders: 0,
        matchedOrders: 0,
        mismatchedOrders: 0,
        totalAmount: '0.000000',
        difference: '0.000000',
        rechargeSummary: { count: 0, total: '0.000000' },
        withdrawSummary: { count: 0, total: '0.000000', feeTotal: '0.000000', actualTotal: '0.000000' },
        consumptionSummary: { count: 0, total: '0.000000' },
      },
      mismatches: [],
      status: 'failed',
      errorMessage: error.message,
    };
  }
}

// ══════════════════════════════════════════════════════════════
//  对账逻辑 1：充值订单与支付渠道对账
// ══════════════════════════════════════════════════════════════

async function checkRechargeOrders(
  db: ReturnType<typeof getDb>,
  startDate: string,
  endDate: string
): Promise<MismatchRecord[]> {
  const mismatches: MismatchRecord[] = [];

  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T23:59:59Z');

  // 查询已确认的充值订单
  const orders = await db
    .select()
    .from(rechargeOrders)
    .where(
      and(
        gte(rechargeOrders.createdAt, start),
        lte(rechargeOrders.createdAt, end),
        eq(rechargeOrders.status, 'confirmed')
      )
    );

  for (const order of orders) {
    // 检查是否有对应的余额变动记录
    const [balanceLog] = await db
      .select()
      .from(balanceLogs)
      .where(
        and(
          eq(balanceLogs.userId, order.userId),
          eq(balanceLogs.refType, 'order'),
          eq(balanceLogs.refId, order.id),
          eq(balanceLogs.type, 'recharge')
        )
      )
      .limit(1);

    if (!balanceLog) {
      mismatches.push({
        orderId: order.id,
        refType: 'recharge_order',
        refId: order.id,
        mismatchType: 'missing_record',
        expectedValue: order.amount,
        actualValue: '0.000000',
        reason: `充值订单 #${order.id} 已确认，但未找到对应的余额入账记录`,
        severity: 'high',
      });
      continue;
    }

    // 检查金额是否一致
    const orderAmount = parseFloat(order.amount);
    const logAmount = parseFloat(balanceLog.amount);

    if (Math.abs(orderAmount - logAmount) > 0.000001) {
      mismatches.push({
        orderId: order.id,
        refType: 'recharge_order',
        refId: order.id,
        mismatchType: 'amount_mismatch',
        expectedValue: order.amount,
        actualValue: balanceLog.amount,
        reason: `充值订单金额 ${order.amount} 与余额变动金额 ${balanceLog.amount} 不一致`,
        severity: 'critical',
      });
    }
  }

  return mismatches;
}

// ══════════════════════════════════════════════════════════════
//  对账逻辑 2：余额变动日志一致性检查
// ══════════════════════════════════════════════════════════════

async function checkBalanceConsistency(
  db: ReturnType<typeof getDb>,
  startDate: string,
  endDate: string
): Promise<MismatchRecord[]> {
  const mismatches: MismatchRecord[] = [];

  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T23:59:59Z');

  // 查询时间范围内的余额变动
  const logs = await db
    .select()
    .from(balanceLogs)
    .where(
      and(
        gte(balanceLogs.createdAt, start),
        lte(balanceLogs.createdAt, end)
      )
    )
    .orderBy(balanceLogs.userId, balanceLogs.createdAt);

  // 按用户分组检查余额连续性
  const userLogs = new Map<number, typeof logs>();

  for (const log of logs) {
    const userId = log.userId;
    if (!userLogs.has(userId)) {
      userLogs.set(userId, []);
    }
    userLogs.get(userId)!.push(log);
  }

  // 检查每个用户的余额连续性
  for (const [userId, userLogList] of userLogs) {
    // 按时间排序
    userLogList.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    for (let i = 1; i < userLogList.length; i++) {
      const prev = userLogList[i - 1];
      const curr = userLogList[i];

      // 检查余额连续性：当前余额 = 上次余额 + 当前变动
      const prevBalance = parseFloat(prev.balanceAfter);
      const currAmount = parseFloat(curr.amount);
      const currBalance = parseFloat(curr.balanceAfter);
      const expectedBalance = prevBalance + currAmount;

      if (Math.abs(expectedBalance - currBalance) > 0.000001) {
        mismatches.push({
          refType: 'balance_log',
          refId: curr.id,
          mismatchType: 'calculation_error',
          expectedValue: expectedBalance.toFixed(6),
          actualValue: curr.balanceAfter,
          reason: `用户 #${userId} 余额不连续：上次余额 ${prev.balanceAfter} + 本次变动 ${curr.amount} = ${expectedBalance.toFixed(6)}，但记录余额为 ${curr.balanceAfter}`,
          severity: 'critical',
        });
      }
    }
  }

  return mismatches;
}

// ══════════════════════════════════════════════════════════════
//  对账逻辑 3：佣金计算准确性验证
// ══════════════════════════════════════════════════════════════

async function checkCommissionAccuracy(
  db: ReturnType<typeof getDb>,
  startDate: string,
  endDate: string
): Promise<MismatchRecord[]> {
  const mismatches: MismatchRecord[] = [];

  // 检查是否有 commissionLogs 表
  try {
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T23:59:59Z');

    // 查询佣金记录
    const commissions = await db
      .select()
      .from(commissionLogs)
      .where(
        and(
          gte(commissionLogs.createdAt, start),
          lte(commissionLogs.createdAt, end)
        )
      );

    for (const comm of commissions) {
      // 验证佣金计算公式
      // 佣金 = 调用成本 × 费率（feeRate）
      const callCost = parseFloat(comm.callCost || '0');
      const feeRate = parseFloat(comm.feeRate || '0');
      const expectedCommission = callCost * feeRate;
      const actualCommission = parseFloat(comm.commissionAmount || '0');

      // 允许 0.01 的误差
      if (feeRate > 0 && Math.abs(expectedCommission - actualCommission) > 0.01) {
        mismatches.push({
          refType: 'commission_log',
          refId: comm.id,
          mismatchType: 'calculation_error',
          expectedValue: expectedCommission.toFixed(6),
          actualValue: comm.commissionAmount,
          reason: `佣金 #${comm.id} 计算错误：调用成本 ${comm.callCost} × 费率 ${comm.feeRate} = ${expectedCommission.toFixed(6)}，但记录佣金为 ${comm.commissionAmount}`,
          severity: 'high',
        });
      }

      // 检查代理商是否存在
      if (comm.agentId) {
        const [agent] = await db
          .select()
          .from(agents)
          .where(eq(agents.id, comm.agentId))
          .limit(1);

        if (!agent) {
          mismatches.push({
            refType: 'commission_log',
            refId: comm.id,
            mismatchType: 'missing_record',
            reason: `佣金 #${comm.id} 关联的代理商 #${comm.agentId} 不存在`,
            severity: 'critical',
          });
        }
      }
    }
  } catch (error) {
    // commissionLogs 表可能不存在，跳过此检查
    console.warn('Commission logs table not found, skipping commission check');
  }

  return mismatches;
}

// ══════════════════════════════════════════════════════════════
//  对账逻辑 4：提现记录完整性检查
// ══════════════════════════════════════════════════════════════

async function checkWithdrawRecords(
  db: ReturnType<typeof getDb>,
  startDate: string,
  endDate: string
): Promise<MismatchRecord[]> {
  const mismatches: MismatchRecord[] = [];

  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T23:59:59Z');

  // 查询已支付的提现订单
  const withdraws = await db
    .select()
    .from(withdrawOrders)
    .where(
      and(
        gte(withdrawOrders.createdAt, start),
        lte(withdrawOrders.createdAt, end),
        eq(withdrawOrders.status, 'paid')
      )
    );

  for (const withdraw of withdraws) {
    // 检查是否有对应的余额变动记录（扣款）
    const [balanceLog] = await db
      .select()
      .from(balanceLogs)
      .where(
        and(
          eq(balanceLogs.userId, withdraw.userId),
          eq(balanceLogs.refType, 'withdraw'),
          eq(balanceLogs.refId, withdraw.id),
          eq(balanceLogs.type, 'withdraw')
        )
      )
      .limit(1);

    if (!balanceLog) {
      mismatches.push({
        orderId: withdraw.id,
        refType: 'withdraw_order',
        refId: withdraw.id,
        mismatchType: 'missing_record',
        expectedValue: withdraw.amount,
        actualValue: '0.000000',
        reason: `提现订单 #${withdraw.id} 已支付，但未找到对应的余额扣款记录`,
        severity: 'high',
      });
      continue;
    }

    // 检查金额是否一致（应为负数）
    const withdrawAmount = parseFloat(withdraw.amount);
    const logAmount = parseFloat(balanceLog.amount);

    if (Math.abs(withdrawAmount + logAmount) > 0.000001) { // logAmount应为负数
      mismatches.push({
        orderId: withdraw.id,
        refType: 'withdraw_order',
        refId: withdraw.id,
        mismatchType: 'amount_mismatch',
        expectedValue: (-withdrawAmount).toFixed(6),
        actualValue: balanceLog.amount,
        reason: `提现金额 ${withdraw.amount} 与余额变动金额 ${balanceLog.amount} 不一致`,
        severity: 'critical',
      });
    }

    // 检查实际支付金额是否正确（amount - feeAmount = actualAmount）
    const amount = parseFloat(withdraw.amount);
    const feeAmount = parseFloat(withdraw.feeAmount || '0');
    const actualAmount = parseFloat(withdraw.actualAmount || withdraw.amount);
    const expectedActual = amount - feeAmount;

    if (Math.abs(expectedActual - actualAmount) > 0.000001) {
      mismatches.push({
        orderId: withdraw.id,
        refType: 'withdraw_order',
        refId: withdraw.id,
        mismatchType: 'calculation_error',
        expectedValue: expectedActual.toFixed(6),
        actualValue: actualAmount.toFixed(6),
        reason: `提现 #${withdraw.id} 计算错误：金额 ${amount} - 手续费 ${feeAmount} = ${expectedActual.toFixed(6)}，但实际支付金额为 ${actualAmount}`,
        severity: 'high',
      });
    }
  }

  return mismatches;
}

// ══════════════════════════════════════════════════════════════
//  对账逻辑 5：消费记录（调用扣费）检查
// ══════════════════════════════════════════════════════════════

async function checkConsumptionRecords(
  db: ReturnType<typeof getDb>,
  startDate: string,
  endDate: string
): Promise<MismatchRecord[]> {
  const mismatches: MismatchRecord[] = [];

  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T23:59:59Z');

  try {
    // 查询调用日志
    const calls = await db
      .select()
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, start),
          lte(callLogs.createdAt, end),
          eq(callLogs.status, 'completed')
        )
      );

    for (const call of calls) {
      if (!call.userId) continue;

      // 检查是否有对应的余额变动记录
      const [balanceLog] = await db
        .select()
        .from(balanceLogs)
        .where(
          and(
            eq(balanceLogs.userId, call.userId),
            eq(balanceLogs.refType, 'call'),
            eq(balanceLogs.refId, call.id),
            eq(balanceLogs.type, 'consumption')
          )
        )
        .limit(1);

      if (!balanceLog) {
        mismatches.push({
          refType: 'call_log',
          refId: call.id,
          mismatchType: 'missing_record',
          expectedValue: call.costAmount || '0.000000',
          actualValue: '0.000000',
          reason: `调用记录 #${call.id} 已扣费，但未找到对应的余额变动记录`,
          severity: 'high',
        });
        continue;
      }

      // 检查扣费金额是否一致
      const callCost = parseFloat(call.costAmount || '0');
      const logAmount = parseFloat(balanceLog.amount);

      if (Math.abs(callCost + logAmount) > 0.000001) { // logAmount应为负数
        mismatches.push({
          refType: 'call_log',
          refId: call.id,
          mismatchType: 'amount_mismatch',
          expectedValue: (-callCost).toFixed(6),
          actualValue: balanceLog.amount,
          reason: `调用扣费金额 ${call.costAmount} 与余额变动金额 ${balanceLog.amount} 不一致`,
          severity: 'critical',
        });
      }
    }
  } catch (error) {
    // callLogs 表可能不存在，跳过此检查
    console.warn('Call logs table not found, skipping consumption check');
  }

  return mismatches;
}

// ══════════════════════════════════════════════════════════════
//  对账逻辑 6：用户余额一致性检查
// ══════════════════════════════════════════════════════════════

async function checkUserBalanceConsistency(
  db: ReturnType<typeof getDb>,
  startDate: string,
  endDate: string
): Promise<MismatchRecord[]> {
  const mismatches: MismatchRecord[] = [];

  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T23:59:59Z');

  // 获取所有在时间范围内有余额变动的用户
  const usersWithActivity = await db
    .select({
      userId: balanceLogs.userId,
      startBalance: sql<string>`first_value(${balanceLogs.balanceBefore}) over (partition by ${balanceLogs.userId} order by ${balanceLogs.createdAt})`,
      endBalance: sql<string>`last_value(${balanceLogs.balanceAfter}) over (partition by ${balanceLogs.userId} order by ${balanceLogs.createdAt})`,
      totalChange: sql<string>`sum(${balanceLogs.amount})`,
    })
    .from(balanceLogs)
    .where(
      and(
        gte(balanceLogs.createdAt, start),
        lte(balanceLogs.createdAt, end)
      )
    )
    .groupBy(balanceLogs.userId)
    .having(sql`count(*) > 0`);

  for (const activity of usersWithActivity) {
    const userId = activity.userId;
    
    // 获取用户当前余额
    const [user] = await db
      .select({ balance: users.balance })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) continue;

    // 验证：期初余额 + 期间变动总额 = 期末余额（当前余额）
    const startBalance = parseFloat(activity.startBalance || '0');
    const totalChange = parseFloat(activity.totalChange || '0');
    const currentBalance = parseFloat(user.balance || '0');
    const expectedBalance = startBalance + totalChange;

    if (Math.abs(expectedBalance - currentBalance) > 0.000001) {
      mismatches.push({
        refType: 'user_balance',
        refId: userId,
        mismatchType: 'calculation_error',
        expectedValue: expectedBalance.toFixed(6),
        actualValue: currentBalance.toFixed(6),
        reason: `用户 #${userId} 余额不匹配：期初 ${startBalance.toFixed(6)} + 期间变动 ${totalChange.toFixed(6)} = ${expectedBalance.toFixed(6)}，但当前余额为 ${currentBalance.toFixed(6)}`,
        severity: 'critical',
      });
    }
  }

  return mismatches;
}

// ══════════════════════════════════════════════════════════════
//  计算汇总数据
// ══════════════════════════════════════════════════════════════

async function calculateSummary(
  db: ReturnType<typeof getDb>,
  startDate: string,
  endDate: string,
  mismatches: MismatchRecord[]
): Promise<ReconciliationResult['summary']> {
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T23:59:59Z');

  // 统计充值订单
  const [rechargeStats] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${rechargeOrders.amount}), '0.000000')`,
    })
    .from(rechargeOrders)
    .where(
      and(
        gte(rechargeOrders.createdAt, start),
        lte(rechargeOrders.createdAt, end),
        eq(rechargeOrders.status, 'confirmed')
      )
    );

  const rechargeCount = Number(rechargeStats?.count || 0);
  const rechargeTotal = rechargeStats?.total || '0.000000';

  // 统计提现订单
  const [withdrawStats] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
      feeTotal: sql<string>`coalesce(sum(${withdrawOrders.feeAmount}), '0.000000')`,
      actualTotal: sql<string>`coalesce(sum(${withdrawOrders.actualAmount}), '0.000000')`,
    })
    .from(withdrawOrders)
    .where(
      and(
        gte(withdrawOrders.createdAt, start),
        lte(withdrawOrders.createdAt, end),
        eq(withdrawOrders.status, 'paid')
      )
    );

  const withdrawCount = Number(withdrawStats?.count || 0);
  const withdrawTotal = withdrawStats?.total || '0.000000';
  const withdrawFeeTotal = withdrawStats?.feeTotal || '0.000000';
  const withdrawActualTotal = withdrawStats?.actualTotal || '0.000000';

  // 统计消费记录
  let consumptionTotal = '0.000000';
  let consumptionCount = 0;
  
  try {
    const [consumptionStats] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${callLogs.costAmount}), '0.000000')`,
      })
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, start),
          lte(callLogs.createdAt, end),
          eq(callLogs.status, 'completed')
        )
      );
    
    consumptionCount = Number(consumptionStats?.count || 0);
    consumptionTotal = consumptionStats?.total || '0.000000';
  } catch (error) {
    // callLogs 表可能不存在
    console.warn('Call logs table not found, skipping consumption stats');
  }

  // 统计余额变动
  const [rechargeBalanceStats] = await db
    .select({
      total: sql<string>`coalesce(sum(${balanceLogs.amount}), '0.000000')`,
    })
    .from(balanceLogs)
    .where(
      and(
        gte(balanceLogs.createdAt, start),
        lte(balanceLogs.createdAt, end),
        eq(balanceLogs.type, 'recharge')
      )
    );

  const rechargeBalanceTotal = rechargeBalanceStats?.total || '0.000000';

  // 计算充值差额
  const rechargeDiff = Math.abs(parseFloat(rechargeTotal) - parseFloat(rechargeBalanceTotal));

  // 统计匹配和不匹配的订单
  const mismatchedOrderIds = new Set(
    mismatches.filter((m) => m.orderId).map((m) => m.orderId!)
  );
  const matchedOrders = rechargeCount + withdrawCount + consumptionCount - mismatchedOrderIds.size;

  return {
    totalOrders: rechargeCount + withdrawCount + consumptionCount,
    matchedOrders,
    mismatchedOrders: mismatchedOrderIds.size,
    totalAmount: (parseFloat(rechargeTotal) + parseFloat(withdrawTotal) + parseFloat(consumptionTotal)).toFixed(6),
    difference: rechargeDiff.toFixed(6),
    rechargeSummary: {
      count: rechargeCount,
      total: rechargeTotal,
    },
    withdrawSummary: {
      count: withdrawCount,
      total: withdrawTotal,
      feeTotal: withdrawFeeTotal,
      actualTotal: withdrawActualTotal,
    },
    consumptionSummary: {
      count: consumptionCount,
      total: consumptionTotal,
    },
  };
}

// ══════════════════════════════════════════════════════════════
//  查询对账报告列表
// ══════════════════════════════════════════════════════════════

export async function listReconciliationReports(options: {
  page?: number;
  pageSize?: number;
  reconType?: string;
  status?: string;
}): Promise<{
  list: any[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const db = getDb();
  const { page = 1, pageSize = 20, reconType, status } = options;

  const conditions: any[] = [];

  if (reconType) {
    conditions.push(eq(reconciliationReports.reconType, reconType as any));
  }

  if (status) {
    conditions.push(eq(reconciliationReports.status, status as any));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // 查询总数
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reconciliationReports)
    .where(whereClause);

  const total = Number(countResult?.count || 0);

  // 查询列表
  const list = await db
    .select()
    .from(reconciliationReports)
    .where(whereClause)
    .orderBy(desc(reconciliationReports.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    list: list.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      startedAt: r.startedAt?.toISOString() || null,
      completedAt: r.completedAt?.toISOString() || null,
    })),
    total,
    page,
    pageSize,
  };
}

// ══════════════════════════════════════════════════════════════
//  查询对账报告详情
// ══════════════════════════════════════════════════════════════

export async function getReconciliationReportDetail(reportId: number): Promise<{
  report: any;
  mismatches: any[];
}> {
  const db = getDb();

  // 查询报告
  const [report] = await db
    .select()
    .from(reconciliationReports)
    .where(eq(reconciliationReports.id, reportId))
    .limit(1);

  if (!report) {
    throw new Error('报告不存在');
  }

  // 查询异常明细
  const mismatches = await db
    .select()
    .from(reconciliationMismatches)
    .where(eq(reconciliationMismatches.reportId, reportId))
    .orderBy(desc(reconciliationMismatches.severity));

  return {
    report: {
      ...report,
      createdAt: report.createdAt.toISOString(),
      startedAt: report.startedAt?.toISOString() || null,
      completedAt: report.completedAt?.toISOString() || null,
    },
    mismatches: mismatches.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      resolvedAt: m.resolvedAt?.toISOString() || null,
    })),
  };
}

// ══════════════════════════════════════════════════════════════
//  发送对账异常告警
// ══════════════════════════════════════════════════════════════

async function sendReconciliationAlert(
  reportId: number,
  mismatches: MismatchRecord[]
): Promise<void> {
  try {
    // 统计各严重级别的异常数量
    const severityCounts = {
      critical: mismatches.filter(m => m.severity === 'critical').length,
      high: mismatches.filter(m => m.severity === 'high').length,
      medium: mismatches.filter(m => m.severity === 'medium').length,
      low: mismatches.filter(m => m.severity === 'low').length,
    };
    
    const totalCriticalHigh = severityCounts.critical + severityCounts.high;
    
    // 确定告警级别
    let alertLevel: 'critical' | 'error' | 'warning' = 'warning';
    if (severityCounts.critical > 0) {
      alertLevel = 'critical';
    } else if (totalCriticalHigh > 0) {
      alertLevel = 'error';
    }
    
    // 构建告警消息
    const message = `对账报告 #${reportId} 发现 ${mismatches.length} 条异常，其中：` +
      `严重 ${severityCounts.critical} 条，高 ${severityCounts.high} 条，` +
      `中 ${severityCounts.medium} 条，低 ${severityCounts.low} 条`;
    
    // 发送告警 (TODO: 实现 sendAlert)
    // await sendAlert({
    //   type: 'reconciliation',
    //   level: alertLevel,
    //   title: `对账异常告警（${mismatches.length} 条）`,
    //   message,
    //   metadata: {
    //     reportId,
    //     severityCounts,
    //     totalMismatches: mismatches.length,
    //     criticalExamples: mismatches
    //       .filter(m => m.severity === 'critical')
    //       .slice(0, 3)
    //       .map(m => ({ reason: m.reason, type: m.mismatchType })),
    //   },
    // });
    
    // 记录到告警日志
    const db = getDb();
    await db.insert(monitoringAlerts).values({
      type: 'reconciliation',
      severity: alertLevel,
      message: `对账异常告警（${mismatches.length} 条）: ${message}`,
      value: mismatches.length,
      threshold: 0,
      timestamp: new Date(),
      metadata: {
        reportId,
        title: `对账异常告警（${mismatches.length} 条）`,
        severityCounts,
        totalMismatches: mismatches.length,
      },
      createdAt: new Date(),
    });
    
  } catch (error) {
    console.error('发送对账告警失败:', error);
    // 告警发送失败不影响对账主流程
  }
}

// ══════════════════════════════════════════════════════════════
//  标记异常为已解决
// ══════════════════════════════════════════════════════════════

export async function resolveMismatch(
  mismatchId: number,
  resolvedBy: number,
  note?: string
): Promise<void> {
  const db = getDb();

  await db
    .update(reconciliationMismatches)
    .set({
      resolved: true,
      resolvedBy,
      resolvedAt: new Date(),
      resolutionNote: note,
    })
    .where(eq(reconciliationMismatches.id, mismatchId));
}
