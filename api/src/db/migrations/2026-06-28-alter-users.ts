// ============================================================
//  Migration: Add phone, avatar, lastLoginAt, OAuth bindings
//  2026-06-28
// ============================================================

import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/threecloud",
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Add columns to users
    const colResult = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name IN ('phone', 'avatar_url', 'last_login_at')
    `);
    const existingCols = colResult.rows.map((r) => r.column_name);

    if (!existingCols.includes("phone")) {
      await client.query("ALTER TABLE users ADD COLUMN phone varchar(20)");
      console.log("  + phone");
    }
    if (!existingCols.includes("avatar_url")) {
      await client.query("ALTER TABLE users ADD COLUMN avatar_url varchar(500)");
      console.log("  + avatar_url");
    }
    if (!existingCols.includes("last_login_at")) {
      await client.query("ALTER TABLE users ADD COLUMN last_login_at timestamptz");
      console.log("  + last_login_at");
    }

    // 2. Create oauth_provider enum
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE oauth_provider AS ENUM ('wechat', 'google', 'apple', 'github');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // 3. Create user_oauth_bindings table
    const tableResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'user_oauth_bindings'
      )
    `);
    const tableExists = tableResult.rows[0].exists;

    if (!tableExists) {
      await client.query(`
        CREATE TABLE user_oauth_bindings (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider oauth_provider NOT NULL,
          provider_user_id VARCHAR(255) NOT NULL,
          provider_email VARCHAR(255),
          nickname VARCHAR(100),
          avatar_url VARCHAR(500),
          raw_profile JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(
        "CREATE UNIQUE INDEX user_oauth_user_provider_idx ON user_oauth_bindings(user_id, provider)"
      );
      await client.query(
        "CREATE UNIQUE INDEX user_oauth_provider_user_idx ON user_oauth_bindings(provider, provider_user_id)"
      );
      console.log("  + user_oauth_bindings table + indexes");
    } else {
      console.log("  ~ user_oauth_bindings already exists");
    }

    await client.query("COMMIT");
    console.log("\n✅ Migration complete");
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
