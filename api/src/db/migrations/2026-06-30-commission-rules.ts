// ============================================================
//  Migration: commission_rules table + agents.parent_agent_id
//  2026-06-30 — 佣金规则配置表 & 代理商团队层级
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

    // ── agents 表新增 parent_agent_id + team_depth ──
    const parentColExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'parent_agent_id'
      )
    `);
    if (!parentColExists.rows[0].exists) {
      await client.query(`
        ALTER TABLE agents
        ADD COLUMN parent_agent_id INTEGER REFERENCES agents(id),
        ADD COLUMN team_depth INTEGER NOT NULL DEFAULT 0
      `);
      await client.query("CREATE INDEX agents_parent_idx ON agents(parent_agent_id)");
      console.log("  + agents.parent_agent_id + agents.team_depth");
    } else {
      console.log("  ~ agents already has parent_agent_id");
    }

    // ── commission_rules 表 ──
    const crExists = await client.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'commission_rules')`
    );
    if (!crExists.rows[0].exists) {
      await client.query(`
        CREATE TABLE commission_rules (
          id SERIAL PRIMARY KEY,
          agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          rule_type VARCHAR(20) NOT NULL,
          rate DECIMAL(5,4) NOT NULL DEFAULT '0.0000',
          is_enabled BOOLEAN NOT NULL DEFAULT true,

          -- 条件约束
          min_trigger_amount DECIMAL(18,6),
          max_cap DECIMAL(18,6),
          valid_from TIMESTAMPTZ,
          valid_until TIMESTAMPTZ,

          -- 活动专有
          activity_name VARCHAR(255),
          activity_type VARCHAR(50),
          fixed_amount DECIMAL(18,6),

          -- 团队专有
          team_level_limit INTEGER DEFAULT 1,

          created_by INTEGER REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          UNIQUE(agent_id, rule_type)
        )
      `);
      await client.query("CREATE UNIQUE INDEX commission_rules_agent_type_idx ON commission_rules(agent_id, rule_type)");
      console.log("  + commission_rules");
    } else {
      console.log("  ~ commission_rules already exists");
    }

    await client.query("COMMIT");
    console.log("Migration 2026-06-30-commission-rules completed successfully");
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
