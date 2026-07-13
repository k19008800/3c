// ============================================================
//  3cloud (3C) — 佣金自动结算脚本（方案 B）
//  用法：npx tsx src/scripts/auto-settle-commissions.ts
//  功能：结算所有超过 1 天的待结算佣金
//  计划：每日凌晨 3:00 通过 cron 触发
// ============================================================

import { createDb, getDb, closeDb } from "../db/index.js";
import { settleCommissionsByFilters } from "../services/agent-settlement.js";

async function main() {
  // 初始化数据库连接
  createDb();

  const daysBefore = 1; // 结算 1 天前的佣金
  // 🐛 FIX: 使用 Asia/Shanghai 时区计算截止日期
  // 原代码用 Date.now() (UTC) 直接减天数，03:00 CST 时 Date.now()=前一天19:00 UTC，导致少算1天
  const now = new Date();
  const cstNow = new Date(now.getTime() + 8 * 3600_000);
  const cstTarget = new Date(cstNow.getTime() - daysBefore * 86400_000);
  const endDate = `${cstTarget.getUTCFullYear()}-${String(cstTarget.getUTCMonth()+1).padStart(2,'0')}-${String(cstTarget.getUTCDate()).padStart(2,'0')}`;

  console.log(`[AutoSettle] 开始自动结算，结算截止日期: ${endDate}（${daysBefore}天前）`);

  try {
    const count = await settleCommissionsByFilters({ endDate });
    console.log(`[AutoSettle] 完成: 结算 ${count} 笔待结算佣金`);
  } catch (err) {
    console.error(`[AutoSettle] 失败:`, err);
    process.exit(1);
  }

  // 关闭连接池
  await closeDb();
  process.exit(0);
}

main();
