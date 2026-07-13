// ============================================================
//  Migration: Add redemption system & admin API keys tables
//  2026-07-09
// ============================================================

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1. Update balance_log_type enum ──
    await client.query(`
      ALTER TYPE balance_log_type ADD VALUE IF NOT EXISTS 'redemption_prepay';
    `);
    console.log("  + added 'redemption_prepay' to balance_log_type enum");

    await client.query(`
      ALTER TYPE balance_log_type ADD VALUE IF NOT EXISTS 'redemption_refund';
    `);
    console.log("  + added 'redemption_refund' to balance_log_type enum");

    // ── 2. New enums ──
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE redemption_batch_status AS ENUM ('active', 'expired', 'disabled');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log("  + created redemption_batch_status enum");

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE redemption_code_status AS ENUM ('unused', 'used', 'expired', 'revoked');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log("  + created redemption_code_status enum");

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE admin_api_key_status AS ENUM ('active', 'disabled', 'expired');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    console.log("  + created admin_api_key_status enum");

    // ── 3. redemption_batches ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS redemption_batches (
        id SERIAL PRIMARY KEY,
        creator_id INTEGER NOT NULL REFERENCES users(id),
        name VARCHAR(200) NOT NULL,
        amount DECIMAL(18,6) NOT NULL,
        total_count INTEGER NOT NULL,
        used_count INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMP WITH TIME ZONE,
        max_uses INTEGER,
        status redemption_batch_status NOT NULL DEFAULT 'active',
        note TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS redemption_batches_creator_id_idx ON redemption_batches(creator_id);
      CREATE INDEX IF NOT EXISTS redemption_batches_status_idx ON redemption_batches(status);
      CREATE INDEX IF NOT EXISTS redemption_batches_expires_at_idx ON redemption_batches(expires_at);
    `);
    console.log("  + created redemption_batches table");

    // ── 4. redemption_codes ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS redemption_codes (
        id SERIAL PRIMARY KEY,
        batch_id INTEGER NOT NULL REFERENCES redemption_batches(id) ON DELETE CASCADE,
        code VARCHAR(16) NOT NULL UNIQUE,
        amount DECIMAL(18,6) NOT NULL,
        uses_left INTEGER NOT NULL DEFAULT 1,
        status redemption_code_status NOT NULL DEFAULT 'unused',
        used_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS redemption_codes_code_idx ON redemption_codes(code);
      CREATE INDEX IF NOT EXISTS redemption_codes_batch_id_idx ON redemption_codes(batch_id);
      CREATE INDEX IF NOT EXISTS redemption_codes_status_idx ON redemption_codes(status);
    `);
    console.log("  + created redemption_codes table");

    // ── 5. redemption_logs ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS redemption_logs (
        id SERIAL PRIMARY KEY,
        code_id INTEGER NOT NULL REFERENCES redemption_codes(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        amount DECIMAL(18,6) NOT NULL,
        batch_id INTEGER REFERENCES redemption_batches(id),
        ip VARCHAR(45),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS redemption_logs_code_id_idx ON redemption_logs(code_id);
      CREATE INDEX IF NOT EXISTS redemption_logs_user_id_idx ON redemption_logs(user_id);
      CREATE INDEX IF NOT EXISTS redemption_logs_user_created_at_idx ON redemption_logs(user_id, created_at DESC);
    `);
    console.log("  + created redemption_logs table");

    // ── 6. admin_api_keys ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_api_keys (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        key_hash VARCHAR(64) NOT NULL UNIQUE,
        key_prefix VARCHAR(10) NOT NULL,
        permissions JSONB NOT NULL DEFAULT '[]',
        status admin_api_key_status NOT NULL DEFAULT 'active',
        expires_at TIMESTAMP WITH TIME ZONE,
        last_used_at TIMESTAMP WITH TIME ZONE,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS admin_api_keys_hash_idx ON admin_api_keys(key_hash);
      CREATE INDEX IF NOT EXISTS admin_api_keys_status_idx ON admin_api_keys(status);
    `);
    console.log("  + created admin_api_keys table");

    // ── 7. admin_key_usage_logs ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_key_usage_logs (
        id SERIAL PRIMARY KEY,
        key_id INTEGER NOT NULL REFERENCES admin_api_keys(id) ON DELETE CASCADE,
        method VARCHAR(10) NOT NULL,
        path VARCHAR(500) NOT NULL,
        ip VARCHAR(45),
        status_code INTEGER,
        duration_ms INTEGER,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS admin_key_usage_logs_key_id_idx ON admin_key_usage_logs(key_id);
      CREATE INDEX IF NOT EXISTS admin_key_usage_logs_key_created_at_idx ON admin_key_usage_logs(key_id, created_at DESC);
    `);
    console.log("  + created admin_key_usage_logs table");

    await client.query("COMMIT");
    console.log("\n✅ Migration complete: redemption system & admin API keys");
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
