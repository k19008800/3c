// ============================================================
//  Migration: user_login_history + user_notes + user_ip_whitelist
//  2026-06-28 (Second Wave)
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

    // ── user_login_history ──
    const lhExists = await client.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_login_history')`
    );
    if (!lhExists.rows[0].exists) {
      await client.query(`
        CREATE TABLE user_login_history (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          ip VARCHAR(45) NOT NULL,
          user_agent VARCHAR(500),
          success BOOLEAN NOT NULL,
          fail_reason VARCHAR(100),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query("CREATE INDEX user_login_history_user_created_at_idx ON user_login_history(user_id, created_at)");
      await client.query("CREATE INDEX user_login_history_created_at_idx ON user_login_history(created_at)");
      console.log("  + user_login_history");
    } else {
      console.log("  ~ user_login_history already exists");
    }

    // ── user_notes ──
    const unExists = await client.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_notes')`
    );
    if (!unExists.rows[0].exists) {
      await client.query(`
        CREATE TABLE user_notes (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          created_by INTEGER NOT NULL REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query("CREATE INDEX user_notes_user_id_idx ON user_notes(user_id)");
      console.log("  + user_notes");
    } else {
      console.log("  ~ user_notes already exists");
    }

    // ── user_ip_whitelist ──
    const iwExists = await client.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_ip_whitelist')`
    );
    if (!iwExists.rows[0].exists) {
      await client.query(`
        CREATE TABLE user_ip_whitelist (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          ip VARCHAR(45) NOT NULL,
          description VARCHAR(255),
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query("CREATE UNIQUE INDEX user_ip_whitelist_user_id_ip_idx ON user_ip_whitelist(user_id, ip)");
      console.log("  + user_ip_whitelist");
    } else {
      console.log("  ~ user_ip_whitelist already exists");
    }

    await client.query("COMMIT");
    console.log("\n✅ Second wave migration complete");
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
