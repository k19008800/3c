// ============================================================
//  3cloud (3C) — 用户主题偏好字段
//  为 users 表添加 theme 字段，支持 'light' | 'dark' | 'system'
// ============================================================

import { Pool } from "pg";

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/threecloud",
  });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 检查 theme 列是否已存在
    const checkResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'theme'
    `);

    if (checkResult.rows.length === 0) {
      // 添加 theme 列
      await client.query(`
        ALTER TABLE users
        ADD COLUMN theme VARCHAR(10) NOT NULL DEFAULT 'system'
      `);

      console.log("[Migration] Added theme column to users table");
    } else {
      console.log("[Migration] theme column already exists, skipping");
    }

    await client.query("COMMIT");
    console.log("[Migration] 2026-07-25-user-theme completed successfully");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[Migration] Failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// 直接运行
runMigration().catch((err) => {
  console.error("[Migration] Fatal error:", err);
  process.exit(1);
});
