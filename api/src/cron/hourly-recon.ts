// ============================================================
//  3cloud (3C) — 每小时对账定时任务
//  每小时执行快速对账检查，检测实时异常
// ============================================================

import cron from "node-cron";
import { getDb } from "../db/index.js";
import { getRedis } from "../redis.js";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  reconciliationReports,
  auditLogs,
  monitoringAlerts,
  rechargeOrders,
  withdrawOrders,
  callLogs,
  balanceLogs,
} from "../db/schema.js";
// import { sendAlert } from "../services/alert-service.js";

// 辅助函数：分钟毫秒数
const minuteMs = 60 * 1000;

/**
 * 快速对账检查 - 检查最近1小时的关键指标
 */
async function runHourlyQuickCheck(): Promise<void> {
  console.log("[HourlyRecon] Starting quick check...");
  
  const db = getDb();
  const redis = getRedis();
  
  // 计算时间范围：最近1小时
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * minuteMs);
  const startDate = oneHourAgo.toISOString().slice(0, 10);
  const startTime = oneHourAgo.toISOString();
  const endTime = now.toISOString();
  
  try {
    const anomalies: string[] = [];
    
    // 1. 检查充值订单异常
    const rechargeAnomaly = await checkRechargeAnomalies(db, startTime, endTime);
    if (rechargeAnomaly) anomalies.push(rechargeAnomaly);
    
    // 2. 检查提现异常
    const withdrawAnomaly = await checkWithdrawAnomalies(db, startTime, endTime);
    if (withdrawAnomaly) anomalies.push(withdrawAnomaly);
    
    // 3. 检查余额变动异常
    const balanceAnomaly = await checkBalanceAnomalies(db, startTime, endTime);
    if (balanceAnomaly) anomalies.push(balanceAnomaly);
    
    // 4. 检查调用扣费异常
    const consumptionAnomaly = await checkConsumptionAnomalies(db, startTime, endTime);
    if (consumptionAnomaly) anomalies.push(consumptionAnomaly);
    
    // 如果有异常，发送告警
    if (anomalies.length > 0) {
      const anomalyMessage = anomalies.join("\\n");
      console.warn(`[HourlyRecon] 🔴 发现异常:\\n${anomalyMessage}`);
      
      // 发送告警
      await db.insert(monitoringAlerts).values({
        type: "api_error_rate",
        severity: "warning",
        message: anomalyMessage,
        value: anomalies.length,
        threshold: 0,
        timestamp: new Date(),
        metadata: {
          timeRange: `${startTime} - ${endTime}`,
          anomalyCount: anomalies.length,
        },
      });
      
      // 记录审计日志
      await db.insert(auditLogs).values({
        operatorId: 1, // 系统操作
        action: "system_maintenance",
        targetType: "hourly_recon",
        description: `每小时对账发现异常: ${anomalies.length} 条`,
        before: null,
        after: { anomalies },
        ip: null,
      });
    } else {
      console.log(`[HourlyRecon] ✅ ${startTime} ~ ${endTime} 对账正常`);
    }
    
    // 记录检查结果到Redis（24小时缓存）
    const cacheKey = `hourly_recon:${startDate}:${now.getHours()}`;
    await redis.setex(cacheKey, 86400, JSON.stringify({
      timestamp: now.toISOString(),
      anomalyCount: anomalies.length,
      status: anomalies.length > 0 ? "anomaly" : "normal",
    }));
    
  } catch (error) {
    console.error("[HourlyRecon] Error:", error);
    
    // 记录错误到告警日志
    await db.insert(monitoringAlerts).values({
      type: "api_error_rate",
      severity: "critical",
      message: error instanceof Error ? error.message : "Unknown error",
      value: 1,
      threshold: 0,
      timestamp: new Date(),
      metadata: { error: String(error) },
    });
  }
}

/**
 * 检查充值订单异常
 */
async function checkRechargeAnomalies(
  db: ReturnType<typeof getDb>,
  startTime: string,
  endTime: string
): Promise<string | null> {
  try {
    // 检查已确认的充值订单是否有对应的余额变动
    const [result] = await db
      .select({
        unmatchedCount: sql<number>`count(*)::int`,
        totalAmount: sql<string>`coalesce(sum(${rechargeOrders.amount}), '0.000000')`,
      })
      .from(rechargeOrders)
      .where(
        and(
          gte(rechargeOrders.createdAt, new Date(startTime)),
          lte(rechargeOrders.createdAt, new Date(endTime)),
          eq(rechargeOrders.status, 'confirmed'),
          sql`NOT EXISTS (
            SELECT 1 FROM balance_logs 
            WHERE balance_logs.ref_type = 'recharge' 
              AND balance_logs.ref_id = recharge_orders.id
              AND balance_logs.type = 'recharge'
          )`
        )
      );
    
    if (Number(result?.unmatchedCount || 0) > 0) {
      return `发现 ${result.unmatchedCount} 笔已确认充值订单无对应余额变动，总金额 ${result.totalAmount}`;
    }
  } catch (error) {
    console.warn("充值异常检查失败:", error);
  }
  
  return null;
}

/**
 * 检查提现异常
 */
async function checkWithdrawAnomalies(
  db: ReturnType<typeof getDb>,
  startTime: string,
  endTime: string
): Promise<string | null> {
  try {
    // 检查已支付的提现订单是否有对应的余额扣款
    const [result] = await db
      .select({
        unmatchedCount: sql<number>`count(*)::int`,
        totalAmount: sql<string>`coalesce(sum(${withdrawOrders.amount}), '0.000000')`,
      })
      .from(withdrawOrders)
      .where(
        and(
          gte(withdrawOrders.createdAt, new Date(startTime)),
          lte(withdrawOrders.createdAt, new Date(endTime)),
          eq(withdrawOrders.status, 'paid'),
          sql`NOT EXISTS (
            SELECT 1 FROM balance_logs 
            WHERE balance_logs.ref_type = 'withdraw' 
              AND balance_logs.ref_id = withdraw_orders.id
              AND balance_logs.type = 'withdraw'
          )`
        )
      );
    
    if (Number(result?.unmatchedCount || 0) > 0) {
      return `发现 ${result.unmatchedCount} 笔已支付提现订单无对应余额扣款，总金额 ${result.totalAmount}`;
    }
  } catch (error) {
    console.warn("提现异常检查失败:", error);
  }
  
  return null;
}

/**
 * 检查余额变动异常
 */
async function checkBalanceAnomalies(
  db: ReturnType<typeof getDb>,
  startTime: string,
  endTime: string
): Promise<string | null> {
  try {
    // 检查余额连续性
    const [result] = await db
      .select({
        discontinuityCount: sql<number>`count(*)::int`,
      })
      .from(sql`
        SELECT 
          user_id,
          LAG(balance_after) OVER (PARTITION BY user_id ORDER BY created_at) as prev_balance,
          balance_before,
          balance_after,
          amount
        FROM balance_logs 
        WHERE created_at >= ${new Date(startTime)} 
          AND created_at <= ${new Date(endTime)}
      `)
      .where(sql`prev_balance IS NOT NULL AND ABS((prev_balance + amount) - balance_after) > 0.000001`);
    
    if (Number(result?.discontinuityCount || 0) > 0) {
      return `发现 ${result.discontinuityCount} 处余额不连续问题`;
    }
  } catch (error) {
    console.warn("余额异常检查失败:", error);
  }
  
  return null;
}

/**
 * 检查调用扣费异常
 */
async function checkConsumptionAnomalies(
  db: ReturnType<typeof getDb>,
  startTime: string,
  endTime: string
): Promise<string | null> {
  try {
    // 检查调用扣费是否有对应的余额变动
    const [result] = await db
      .select({
        unmatchedCount: sql<number>`count(*)::int`,
        totalAmount: sql<string>`coalesce(sum(${callLogs.costAmount}), '0.000000')`,
      })
      .from(callLogs)
      .where(
        and(
          gte(callLogs.createdAt, new Date(startTime)),
          lte(callLogs.createdAt, new Date(endTime)),
          eq(callLogs.status, 'completed'),
          sql`NOT EXISTS (
            SELECT 1 FROM balance_logs 
            WHERE balance_logs.ref_type = 'call' 
              AND balance_logs.ref_id = call_logs.id
              AND balance_logs.type = 'consumption'
          )`
        )
      );
    
    if (Number(result?.unmatchedCount || 0) > 0) {
      return `发现 ${result.unmatchedCount} 笔调用扣费无对应余额变动，总金额 ${result.totalAmount}`;
    }
  } catch (error) {
    console.warn("消费异常检查失败:", error);
  }
  
  return null;
}

/**
 * 启动每小时对账定时任务
 */
export function scheduleHourlyRecon(): void {
  // 每小时的第5分钟执行（避免整点高峰）
  cron.schedule("5 * * * *", async () => {
    console.log("[HourlyRecon] Scheduled task triggered");
    await runHourlyQuickCheck();
  });
  
  console.log("[HourlyRecon] 定时任务已注册: 每小时的第5分钟");
}