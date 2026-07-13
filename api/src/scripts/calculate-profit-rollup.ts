// ============================================================
//  3cloud (3C) — 月利润汇总计算脚本
//  独立运行：tsx src/scripts/calculate-profit-rollup.ts
//  遍历最近 6 个月未计算的 period，调用 computeProfitRollup()
// ============================================================

import "dotenv/config";
import { createDb, closeDb, getDb } from "../db/index.js";
import { computeProfitRollup } from "../services/profit-service.js";
import { financeProfitRecords } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";

// ── 生成最近 N 个月的 period 列表 ──

function generatePeriods(months: number): string[] {
  const periods: string[] = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    periods.push(`${y}-${m}`);
  }
  return periods;
}

async function main() {
  console.log("=".repeat(60));
  console.log("  3cloud 月利润汇总计算脚本");
  console.log("=".repeat(60));

  createDb();
  const db = getDb();

  const periods = generatePeriods(6);
  let totalInserted = 0;

  for (const period of periods) {
    console.log(`\n[${period}] 正在计算...`);

    // 检查是否已有数据
    const [existing] = await db
      .select({ count: sql<number>`count(*)` })
      .from(financeProfitRecords)
      .where(eq(financeProfitRecords.period, period));

    const existingCount = Number(existing?.count ?? 0);
    console.log(`  → 已有 ${existingCount} 条记录`);

    try {
      const result = await computeProfitRollup(period);
      console.log(`  ✅ 完成：更新 ${result.inserted} 条记录`);
      totalInserted += result.inserted;
    } catch (err: any) {
      console.error(`  ❌ 失败：${err.message}`);
      console.error(err);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`  汇总完成，共处理 ${totalInserted} 条记录`);
  console.log("=".repeat(60));

  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error("脚本执行失败:", err);
  process.exit(1);
});
