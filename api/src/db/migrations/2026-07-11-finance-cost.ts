// ============================================================
//  Migration: Finance cost records & agent balance ledger
//  2026-07-11
// ============================================================

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1. finance_cost_records table ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS finance_cost_records (
        id SERIAL PRIMARY KEY,
        cost_type VARCHAR(20) NOT NULL,
        period DATE NOT NULL,
        campaign_id INTEGER REFERENCES campaigns(id),
        agent_id INTEGER REFERENCES agents(id),
        total_face BIGINT NOT NULL,
        total_used BIGINT NOT NULL,
        cost_amount BIGINT NOT NULL,
        subsidy_amount BIGINT NOT NULL,
        revenue_attributed BIGINT DEFAULT 0,
        roi DECIMAL(10,2),
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS fin_cost_period_idx ON finance_cost_records(period);
      CREATE INDEX IF NOT EXISTS fin_cost_type_idx ON finance_cost_records(cost_type);
      CREATE INDEX IF NOT EXISTS fin_cost_campaign_idx ON finance_cost_records(campaign_id);
      CREATE INDEX IF NOT EXISTS fin_cost_agent_idx ON finance_cost_records(agent_id);
      CREATE INDEX IF NOT EXISTS fin_cost_status_idx ON finance_cost_records(status);
    `);
    console.log("  + created finance_cost_records table");

    // ── 2. agent_balance_ledger table ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_balance_ledger (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL REFERENCES agents(id),
        balance_type VARCHAR(20) NOT NULL,
        change_type VARCHAR(30) NOT NULL,
        amount BIGINT NOT NULL,
        balance_before BIGINT NOT NULL,
        balance_after BIGINT NOT NULL,
        ref_type VARCHAR(20),
        ref_id INTEGER,
        ref_code_id INTEGER REFERENCES redemption_codes(id),
        remark TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS abl_agent_idx ON agent_balance_ledger(agent_id);
      CREATE INDEX IF NOT EXISTS abl_agent_created_idx ON agent_balance_ledger(agent_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS abl_balance_type_idx ON agent_balance_ledger(balance_type);
      CREATE INDEX IF NOT EXISTS abl_ref_code_idx ON agent_balance_ledger(ref_code_id);
    `);
    console.log("  + created agent_balance_ledger table");

    await client.query("COMMIT");
    console.log("\n✅ Migration complete: finance_cost_records & agent_balance_ledger");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("\n❌ Migration failed:", e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
