// ============================================================
//  3cloud (3C) — Migration: 代理商结算周期字段
//  2026-07-11
//  Adds: settlement_cycle, next_settlement_at, last_settlement_at, min_withdraw_amount
// ============================================================

import { sql } from "drizzle-orm";
import { getDb } from "../index.js";

export async function up() {
  const db = getDb();

  // ── agents 表新增字段 ──
  await db.execute(sql`
    ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS settlement_cycle VARCHAR(10) DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS next_settlement_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_settlement_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS min_withdraw_amount DECIMAL(18,6) DEFAULT '0.000000';
  `);

  // ── 索引：加速定时结算查询 ──
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS agents_next_settlement_idx
      ON agents (next_settlement_at)
      WHERE settlement_cycle != 'manual' AND status = true;
  `);

  console.log("[Migration] 2026-07-11-settlement-cycle: completed");
}

export async function down() {
  const db = getDb();

  await db.execute(sql`
    DROP INDEX IF EXISTS agents_next_settlement_idx;
  `);

  await db.execute(sql`
    ALTER TABLE agents
      DROP COLUMN IF EXISTS settlement_cycle,
      DROP COLUMN IF EXISTS next_settlement_at,
      DROP COLUMN IF EXISTS last_settlement_at,
      DROP COLUMN IF EXISTS min_withdraw_amount;
  `);

  console.log("[Migration] 2026-07-11-settlement-cycle: rolled back");
}
