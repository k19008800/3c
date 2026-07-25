// ============================================================
//  3cloud (3C) — 双因素认证字段迁移
//  为 users 表添加 2FA 相关字段
// ============================================================

import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log("开始迁移 2FA 字段...");

    await client.query("BEGIN");

    // 检查字段是否已存在
    const checkColumn = async (columnName: string): Promise<boolean> => {
      const result = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = $1
      `, [columnName]);
      return result.rows.length > 0;
    };

    // 添加 two_factor_enabled 字段
    if (!(await checkColumn("two_factor_enabled"))) {
      console.log("添加 two_factor_enabled 字段...");
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE
      `);
    } else {
      console.log("two_factor_enabled 字段已存在，跳过");
    }

    // 添加 two_factor_secret 字段
    if (!(await checkColumn("two_factor_secret"))) {
      console.log("添加 two_factor_secret 字段...");
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN two_factor_secret VARCHAR(255)
      `);
    } else {
      console.log("two_factor_secret 字段已存在，跳过");
    }

    // 添加 two_factor_backup_codes 字段
    if (!(await checkColumn("two_factor_backup_codes"))) {
      console.log("添加 two_factor_backup_codes 字段...");
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN two_factor_backup_codes JSONB
      `);
    } else {
      console.log("two_factor_backup_codes 字段已存在，跳过");
    }

    await client.query("COMMIT");
    console.log("✅ 2FA 字段迁移完成");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ 迁移失败:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("迁移脚本执行失败:", err);
  process.exit(1);
});
