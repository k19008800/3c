// ============================================================
//  Migration: Remove agents.commissionRate, migrate to commission_rules
//  2026-07-01 — 将 agents.commission_rate 迁移到 commission_rules 表
//  然后删除 agents.commission_rate 列
// ============================================================

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1. 将已有 agents.commission_rate 迁移到 commission_rules ──
    // 对每个代理商，以 ruleType='sale' 插入一条销售佣金规则
    console.log("  Migrating agents.commission_rate → commission_rules (sale)...");
    const migrateResult = await client.query(`
      INSERT INTO commission_rules (agent_id, rule_type, rate, is_enabled)
      SELECT id, 'sale', commission_rate, true
      FROM agents
      WHERE commission_rate IS NOT NULL
      ON CONFLICT (agent_id, rule_type)
      DO UPDATE SET rate = EXCLUDED.rate, is_enabled = true, updated_at = NOW()
    `);
    console.log(`  + ${migrateResult.rowCount} commission_rules rows inserted/updated`);

    // ── 2. 删除 agents.commission_rate 列 ──
    const colExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'commission_rate'
      )
    `);
    if (colExists.rows[0].exists) {
      await client.query(`
        ALTER TABLE agents DROP COLUMN commission_rate
      `);
      console.log("  + Dropped agents.commission_rate column");
    } else {
      console.log("  ~ agents.commission_rate already dropped");
    }

    await client.query("COMMIT");
    console.log("Migration 2026-07-01-remove-agent-commission-rate completed successfully");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
