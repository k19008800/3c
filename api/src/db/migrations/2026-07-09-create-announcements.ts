// ============================================================
//  Migration: Create announcements table
//  2026-07-09
//  - Create announcements table for system announcements
// ============================================================

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const tableExists = await client.query(`
      SELECT tablename FROM pg_tables WHERE tablename = 'announcements'
    `);

    if (tableExists.rows.length === 0) {
      await client.query(`
        CREATE TABLE announcements (
          id SERIAL PRIMARY KEY,
          title VARCHAR(500) NOT NULL,
          content TEXT NOT NULL,
          type VARCHAR(50) NOT NULL DEFAULT 'system_announcement',
          status BOOLEAN NOT NULL DEFAULT true,
          priority INTEGER NOT NULL DEFAULT 0,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE INDEX announcements_status_idx ON announcements(status)
      `);
      await client.query(`
        CREATE INDEX announcements_created_at_idx ON announcements(created_at DESC)
      `);
      console.log("  + created announcements table");
    } else {
      console.log("  ~ announcements table already exists");
    }

    await client.query("COMMIT");
    console.log("✅ Announcements migration complete");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
