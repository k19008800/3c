// ============================================================
//  3cloud (3C) — 对账自动化定时任务
//  每天 03:00 执行：
//    1. 计算前一天佣金日汇总
//    2. 计算前一天对账汇总
//    3. 检查对账是否平衡，不平则写入审计日志
// ============================================================

import cron from "node-cron";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  computeDailyCommissionRollup,
  computeDailyReconSummary,
} from "../services/agent-finance.js";
import { dailyReconSummary, auditLogs } from "../db/schema.js";

/**
 * 启动每日对账定时任务（每天 03:00）
 */
export function scheduleDailyRecon() {
  cron.schedule("0 3 * * *", async () => {
    console.log("[DailyRecon] Starting...");

    // 计算前一天（UTC 日期）
    const yesterday = new Date(Date.now() - 86400000);
    const dateStr = yesterday.toISOString().slice(0, 10);

    try {
      // 1. 计算佣金日汇总
      await computeDailyCommissionRollup(dateStr);
      console.log(`[DailyRecon] 佣金日汇总完成: ${dateStr}`);

      // 2. 计算日对账汇总
      await computeDailyReconSummary(dateStr);
      console.log(`[DailyRecon] 对账汇总完成: ${dateStr}`);

      // 3. 检查对账是否平衡
      const db = getDb();
      const [summary] = await db
        .select()
        .from(dailyReconSummary)
        .where(eq(dailyReconSummary.reportDate, dateStr))
        .limit(1);

      if (summary) {
        if (!summary.isBalanced) {
          console.error(
            `[DailyRecon] 🔴 对账不平！日期: ${dateStr}, 差额: ${summary.balanceDiff}`
          );
          // 写审计日志
          await db.insert(auditLogs).values({
            operatorId: 1, // 系统操作
            action: "system_maintenance",
            targetType: "daily_recon_summary",
            targetId: summary.id,
            description: `对账不平告警: 日期 ${dateStr}, 差额 ${summary.balanceDiff}`,
            before: null,
            after: {
              reportDate: dateStr,
              isBalanced: false,
              balanceDiff: summary.balanceDiff,
            },
            ip: null,
          });
        } else {
          console.log(`[DailyRecon] ✅ ${dateStr} 对账平衡`);
        }
      } else {
        console.warn(`[DailyRecon] ⚠️ ${dateStr} 无对账汇总数据`);
      }
    } catch (err) {
      console.error("[DailyRecon] Error:", err);
    }
  });

  console.log("[DailyRecon] 定时任务已注册: 每天 03:00");
}
