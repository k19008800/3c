// ============================================================
//  Migration: Profit records & price change history tables
//  2026-07-11
// ============================================================

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1. finance_profit_records table ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS finance_profit_records (
        id SERIAL PRIMARY KEY,
        period VARCHAR(7) NOT NULL,
        vendor_model_id INTEGER REFERENCES vendor_models(id),
        model_id INTEGER REFERENCES models(id),
        vendor_id INTEGER REFERENCES vendors(id),
        total_calls INTEGER NOT NULL DEFAULT 0,
        total_tokens BIGINT NOT NULL DEFAULT 0,
        total_user_cost DECIMAL(18,6) NOT NULL DEFAULT 0,
        total_cost_price DECIMAL(18,6) NOT NULL DEFAULT 0,
        gross_profit DECIMAL(18,6) NOT NULL DEFAULT 0,
        gross_margin DECIMAL(18,6) NOT NULL DEFAULT 0,
        total_commission DECIMAL(18,6) NOT NULL DEFAULT 0,
        computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(period, vendor_model_id)
      );
      CREATE INDEX IF NOT EXISTS fin_profit_period_idx ON finance_profit_records(period);
      CREATE INDEX IF NOT EXISTS fin_profit_model_idx ON finance_profit_records(model_id);
      CREATE INDEX IF NOT EXISTS fin_profit_vendor_idx ON finance_profit_records(vendor_id);
    `);
    console.log("  + created finance_profit_records table");

    // ── 2. price_change_history table ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS price_change_history (
        id SERIAL PRIMARY KEY,
        operator_id INTEGER NOT NULL REFERENCES users(id),
        change_type VARCHAR(20) NOT NULL,
        target_type VARCHAR(20) NOT NULL,
        target_id INTEGER,
        before_value DECIMAL(18,6),
        after_value DECIMAL(18,6),
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS pch_target_idx ON price_change_history(target_type, target_id);
      CREATE INDEX IF NOT EXISTS pch_created_idx ON price_change_history(created_at DESC);
    `);
    console.log("  + created price_change_history table");

    await client.query("COMMIT");
    console.log("\n✅ Migration complete: finance_profit_records & price_change_history");
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
