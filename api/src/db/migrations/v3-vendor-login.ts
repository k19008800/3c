// ============================================================
//  Migration v3: Vendor login & approval fields
//  2026-07-15
//  - Add email, password_hash, approved_at, approved_by, reject_reason
//    to vendors table
//  - Extend audit_action enum (add vendor_reject)
// ============================================================

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1. Add vendor login & approval columns ──
    const vendorCols = [
      { name: 'email', def: 'varchar(255) UNIQUE' },
      { name: 'password_hash', def: 'varchar(255)' },
      { name: 'approved_at', def: 'TIMESTAMP WITH TIME ZONE' },
      { name: 'approved_by', def: 'INTEGER REFERENCES users(id) ON DELETE SET NULL' },
      { name: 'reject_reason', def: 'TEXT' },
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

    // ── 2. Extend vendor_status enum (add rejected) ──
    try {
      await client.query(`
        ALTER TYPE vendor_status ADD VALUE IF NOT EXISTS 'rejected'
      `);
      console.log("  + added rejected to vendor_status");
    } catch (e: any) {
      if (e.code === '42710' || (e.message && e.message.includes('already exists'))) {
        console.log("  ~ rejected already exists in vendor_status");
      } else {
        throw e;
      }
    }

    // ── 3. Extend audit_action enum (if not exists) ──
    try {
      await client.query(`
        ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'vendor_reject'
      `);
      console.log("  + added vendor_reject to audit_action");
    } catch (e: any) {
      if (e.code === '42710' || (e.message && e.message.includes('already exists'))) {
        console.log("  ~ vendor_reject already exists in audit_action");
      } else {
        throw e;
      }
    }

    await client.query("COMMIT");
    console.log("\n✅ Vendor login & approval fields migration complete");
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
