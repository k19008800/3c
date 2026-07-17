// ============================================================
//  2026-07-17: Key 分组价格字段 + call_logs 溯源
//  1. vendor_key_group_items 添加价格字段（Key 级别专属价格）
//  2. call_logs 添加 key_group_item_id 及当时生效的 Key 定价
// ============================================================

import { sql } from "drizzle-orm";
import { getDb } from "../index.js";

export async function up() {
  const db = getDb();

  console.log("[Migration 2026-07-17] 开始: Key 分组价格 + 溯源字段");

  // ── vendor_key_group_items: 添加 Key 级别价格字段 ──
  await db.execute(sql`
    ALTER TABLE vendor_key_group_items
    ADD COLUMN IF NOT EXISTS cost_price_input NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS cost_price_output NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS sell_price_input NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS sell_price_output NUMERIC(18,6);
  `);
  console.log("  ✓ vendor_key_group_items 价格字段已添加");

  // ── call_logs: 添加溯源字段 ──
  await db.execute(sql`
    ALTER TABLE call_logs
    ADD COLUMN IF NOT EXISTS key_group_item_id INTEGER,
    ADD COLUMN IF NOT EXISTS key_sell_price_input NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS key_sell_price_output NUMERIC(18,6);
  `);
  console.log("  ✓ call_logs 溯源字段已添加");

  // ── 索引 ──
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS call_logs_key_group_item_id_idx
    ON call_logs (key_group_item_id)
    WHERE key_group_item_id IS NOT NULL;
  `);
  console.log("  ✓ call_logs key_group_item_id 索引已创建");

  console.log("[Migration 2026-07-17] 完成");
}

export async function down() {
  const db = getDb();

  console.log("[Migration 2026-07-17] 回滚");

  await db.execute(sql`DROP INDEX IF EXISTS call_logs_key_group_item_id_idx`);
  await db.execute(sql`ALTER TABLE call_logs DROP COLUMN IF EXISTS key_group_item_id`);
  await db.execute(sql`ALTER TABLE call_logs DROP COLUMN IF EXISTS key_sell_price_input`);
  await db.execute(sql`ALTER TABLE call_logs DROP COLUMN IF EXISTS key_sell_price_output`);
  await db.execute(sql`ALTER TABLE vendor_key_group_items DROP COLUMN IF EXISTS cost_price_input`);
  await db.execute(sql`ALTER TABLE vendor_key_group_items DROP COLUMN IF EXISTS cost_price_output`);
  await db.execute(sql`ALTER TABLE vendor_key_group_items DROP COLUMN IF EXISTS sell_price_input`);
  await db.execute(sql`ALTER TABLE vendor_key_group_items DROP COLUMN IF EXISTS sell_price_output`);

  console.log("[Migration 2026-07-17] 回滚完成");
}

// 直接运行
const isMain = process.argv[1]?.includes("2026-07-17-key-group-pricing");
if (isMain) {
  const action = process.argv[2] || "up";
  if (action === "up") up().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
  else down().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
