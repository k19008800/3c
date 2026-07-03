// ============================================================
//  Migration: 2026-06-29 — 回填补充分佣记录缺失数据
//  1. commission_type → 'sale' (全部 NULL 记录)
//  2. source_customer_id → 从 call_logs 恢复
//  3. settled 记录补发 voucher_no
// ============================================================

import { createDb, closeDb } from "../index.js";

export async function migrate() {
  const db = createDb();

  // ── 1. 补全 commission_type ──
  console.log("[Migration] Backfilling commission_type…");
  const r1 = await db.execute(`
    UPDATE commission_logs
    SET commission_type = 'sale'
    WHERE commission_type IS NULL
  `);
  console.log(`[Migration] ✓ commission_type backfilled: ${r1.rowCount ?? '?'} rows`);

  // ── 2. 从 call_logs 恢复 source_customer_id ──
  console.log("[Migration] Backfilling source_customer_id from call_logs…");
  const r2 = await db.execute(`
    UPDATE commission_logs cl
    SET source_customer_id = cl2.user_id
    FROM call_logs cl2
    WHERE cl.client_call_log_id = cl2.id
      AND cl.source_customer_id IS NULL
  `);
  console.log(`[Migration] ✓ source_customer_id backfilled: ${r2.rowCount ?? '?'} rows`);

  // ── 3. 已结算记录补发凭证号 ──
  console.log("[Migration] Generating voucher numbers for settled records…");
  // 先算当前最大凭证序号
  const seqResult = await db.execute(`
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(voucher_no FROM '([0-9]+)$') AS INTEGER)), 0
    ) + 1 AS next_seq
    FROM commission_logs
    WHERE voucher_no LIKE 'VCH-20260629-A-%'
  `);
  const rows = seqResult.rows ?? [];
  let nextSeq = Number(rows[0]?.next_seq ?? 1);

  // 分批更新：每次取 500 条没有凭证号的 settled 记录
  const BATCH_SIZE = 500;
  let totalUpdated = 0;

  while (true) {
    const batch = await db.execute(`
      SELECT id FROM commission_logs
      WHERE status = 'settled' AND (voucher_no IS NULL OR voucher_no = '')
      ORDER BY id
      LIMIT ${BATCH_SIZE}
    `);
    const batchRows = batch.rows ?? [];
    if (batchRows.length === 0) break;

    const ids = batchRows.map((r: any) => r.id);
    const dateStr = '20260629';

    // 为每一条生成凭证号（用 CTE 一次性更新）
    const cases = ids.map((id: number) => {
      const no = `VCH-${dateStr}-R-${String(nextSeq++).padStart(4, '0')}`;
      return `WHEN ${id} THEN '${no}'`;
    }).join(' ');

    await db.execute(`
      UPDATE commission_logs
      SET voucher_no = CASE id ${cases} END
      WHERE id IN (${ids.join(',')})
    `);

    totalUpdated += ids.length;
    console.log(`  Batch: ${ids.length} records (${totalUpdated} total)`);
  }

  console.log(`[Migration] ✓ Voucher numbers generated: ${totalUpdated} records`);
  console.log("[Migration] ✓ Commission data backfill complete");
}

// ── 独立运行入口 ──

async function main() {
  console.log("\n═══════════════════════════════════════════════");
  console.log("  迁移: 回填补充分佣记录缺失数据");
  console.log("  时间: 2026-06-29");
  console.log("═══════════════════════════════════════════════\n");
  try {
    await migrate();
  } catch (err) {
    console.error("[Migration] FAILED:", err);
    process.exit(1);
  } finally {
    await closeDb();
  }
  console.log("\n✅ 迁移完成\n");
}

main();
