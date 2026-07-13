// ============================================================
//  Migration: Add campaign management tables
//  2026-07-11
// ============================================================

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1. campaign_status enum ──
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'ended', 'archived');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log("  + created campaign_status enum");

    // ── 2. campaigns table ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id SERIAL PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        description TEXT,
        status campaign_status NOT NULL DEFAULT 'draft',
        start_at TIMESTAMP WITH TIME ZONE,
        end_at TIMESTAMP WITH TIME ZONE,
        budget_amount BIGINT NOT NULL DEFAULT 0,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns(status);
      CREATE INDEX IF NOT EXISTS campaigns_created_by_idx ON campaigns(created_by);
      CREATE INDEX IF NOT EXISTS campaigns_start_end_idx ON campaigns(start_at, end_at);
    `);
    console.log("  + created campaigns table");

    // ── 3. campaign_codes table ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS campaign_codes (
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        agent_id INTEGER REFERENCES agents(id),
        allocated_count INTEGER NOT NULL DEFAULT 0,
        used_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (campaign_id, agent_id)
      );
    `);
    console.log("  + created campaign_codes table");

    await client.query("COMMIT");
    console.log("\n✅ Migration complete: campaign management tables");
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
