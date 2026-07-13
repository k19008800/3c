// ============================================================
//  Migration: Vendor self-service + notification + model types
//  2026-07-09
//  - Extend model_type enum
//  - Extend notification_type enum
//  - Extend vendor_status enum (add pending)
//  - Add vendor_api_keys table
//  - Add vendor registration fields
//  - Extend audit_action enum
// ============================================================

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1. Extend model_type enum ──
    await client.query(`
      ALTER TYPE model_type ADD VALUE IF NOT EXISTS 'rerank'
    `);
    console.log("  + added rerank to model_type");

    await client.query(`
      ALTER TYPE model_type ADD VALUE IF NOT EXISTS 'video'
    `);
    console.log("  + added video to model_type");

    await client.query(`
      ALTER TYPE model_type ADD VALUE IF NOT EXISTS 'moderation'
    `);
    console.log("  + added moderation to model_type");

    await client.query(`
      ALTER TYPE model_type ADD VALUE IF NOT EXISTS 'realtime'
    `);
    console.log("  + added realtime to model_type");

    // ── 2. Extend notification_type enum ──
    const newNotifTypes = [
      'balance_low', 'quota_warning', 'quota_exceeded',
      'withdraw_result', 'commission_settled', 'agent_client_event',
      'new_model', 'system_announcement', 'redemption_success',
    ];

    for (const nt of newNotifTypes) {
      try {
        await client.query(`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS '${nt}'`);
        console.log(`  + added ${nt} to notification_type`);
      } catch (e: any) {
        // ADD VALUE IF NOT EXISTS may not be available on older PG
        if (e.code !== '42710') throw e;
        console.log(`  ~ ${nt} already exists in notification_type`);
      }
    }

    // ── 3. Extend vendor_status enum (add pending) ──
    await client.query(`
      ALTER TYPE vendor_status ADD VALUE IF NOT EXISTS 'pending'
    `);
    console.log("  + added pending to vendor_status");

    // ── 4. Add vendor registration columns ──
    const vendorCols = [
      { name: 'user_id', def: 'integer REFERENCES users(id) ON DELETE SET NULL' },
      { name: 'company_name', def: 'varchar(255)' },
      { name: 'contact_name', def: 'varchar(100)' },
      { name: 'contact_phone', def: 'varchar(20)' },
      { name: 'contact_email', def: 'varchar(255)' },
    ];

    for (const col of vendorCols) {
      const exists = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'vendors' AND column_name = '${col.name}'
      `);
      if (exists.rows.length === 0) {
        await client.query(`ALTER TABLE vendors ADD COLUMN ${col.name} ${col.def}`);
        console.log(`  + added ${col.name} to vendors`);
      } else {
        console.log(`  ~ ${col.name} already exists in vendors`);
      }
    }

    // Add index on vendors.user_id
    const idxExists = await client.query(`
      SELECT indexname FROM pg_indexes WHERE tablename = 'vendors' AND indexname = 'vendors_user_id_idx'
    `);
    if (idxExists.rows.length === 0) {
      await client.query(`CREATE INDEX vendors_user_id_idx ON vendors(user_id)`);
      console.log("  + created vendors_user_id_idx");
    } else {
      console.log("  ~ vendors_user_id_idx already exists");
    }

    // ── 5. Create vendor_api_keys table ──
    const tableExists = await client.query(`
      SELECT tablename FROM pg_tables WHERE tablename = 'vendor_api_keys'
    `);
    if (tableExists.rows.length === 0) {
      await client.query(`
        CREATE TABLE vendor_api_keys (
          id SERIAL PRIMARY KEY,
          vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
          key_hash VARCHAR(64) NOT NULL,
          key_prefix VARCHAR(10) NOT NULL,
          permissions JSONB NOT NULL DEFAULT '["vendor:*"]',
          status BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE UNIQUE INDEX vendor_api_keys_hash_idx ON vendor_api_keys(key_hash)
      `);
      await client.query(`
        CREATE INDEX vendor_api_keys_vendor_id_idx ON vendor_api_keys(vendor_id)
      `);
      console.log("  + created vendor_api_keys table");
    } else {
      console.log("  ~ vendor_api_keys table already exists");
    }

    await client.query("COMMIT");
    console.log("\n✅ Vendor self + notification + model types migration complete");
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
