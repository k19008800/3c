// ============================================================
//  3cloud (3C) — 佣金日汇总回填脚本
//  将 commission_logs 中已有数据回填到 commission_daily_rollup
//  幂等：每天只写一次，已有则跳过
// ============================================================
//  使用方法：
//    npx tsx src/db/scripts/backfill-commission-rollup.ts [startDate] [endDate]
//  示例：
//    npx tsx src/db/scripts/backfill-commission-rollup.ts           # 回填全部
//    npx tsx src/db/scripts/backfill-commission-rollup.ts 2026-01-01 2026-06-30
// ============================================================

import "dotenv/config";
import { createDb } from "../index.js";
import { computeDailyCommissionRollup } from "../../services/agent-finance.js";

async function main() {
  createDb(); // Initialize DB connection
  const startDate = process.argv[2];
  const endDate = process.argv[3];

  let current: Date;
  let endAt: Date;

  if (startDate) {
    current = new Date(startDate + "T00:00:00Z");
    endAt = endDate
      ? new Date(endDate + "T00:00:00Z")
      : new Date();
  } else {
    // 从分区表最早的日期开始
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const result = await pool.query("SELECT MIN(created_at) AS min_date FROM commission_logs");
    const minDate = result.rows[0]?.min_date;
    if (!minDate) {
      console.log("commission_logs 无数据，跳过回填");
      await pool.end();
      return;
    }
    current = new Date(minDate);
    endAt = new Date();
    await pool.end();
  }

  // 将 startDate 设为当天 00:00 UTC
  current = new Date(current.toISOString().slice(0, 10) + "T00:00:00Z");
  endAt = new Date(endAt.toISOString().slice(0, 10) + "T00:00:00Z");

  let totalDays = 0;
  let totalAgents = 0;

  console.log(`🔄 开始回填佣金日汇总`);
  console.log(`   范围: ${current.toISOString().slice(0, 10)} ~ ${endAt.toISOString().slice(0, 10)}`);
  console.log();

  while (current <= endAt) {
    const dateStr = current.toISOString().slice(0, 10);
    const count = await computeDailyCommissionRollup(dateStr);
    if (count > 0) {
      totalAgents += count;
      totalDays++;
      process.stdout.write(`  ✅ ${dateStr}: ${count} 个代理商\r`);
    } else {
      process.stdout.write(`  ⏭️ ${dateStr}: 无数据\r`);
    }
    current.setDate(current.getDate() + 1);
  }

  console.log(`\n\n✅ 回填完成! ${totalDays} 天, ${totalAgents} 条汇总记录`);
}

main().catch((err) => {
  console.error("❌ 回填失败:", err);
  process.exit(1);
});
