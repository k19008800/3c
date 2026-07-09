// ============================================================
//  Migration: Add ocr_result column to user_real_name_reviews
//  2026-07-04
// ============================================================

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if column exists
    const exists = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'user_real_name_reviews' AND column_name = 'ocr_result'
    `);

    if (exists.rows.length === 0) {
      await client.query(`
        ALTER TABLE user_real_name_reviews
        ADD COLUMN ocr_result jsonb DEFAULT NULL
      `);
      console.log("  + added ocr_result jsonb column to user_real_name_reviews");
    } else {
      console.log("  ~ ocr_result column already exists");
    }

    // Add system_config entry if not exists
    const configExists = await client.query(`
      SELECT id FROM system_configs WHERE key = 'deepseek_api_key'
    `);

    if (configExists.rows.length === 0) {
      await client.query(`
        INSERT INTO system_configs (key, value, description, updated_at)
        VALUES ('deepseek_api_key', '', 'DeepSeek API Key，用于证件 OCR 识别', NOW())
      `);
      console.log("  + added deepseek_api_key system config");
    } else {
      console.log("  ~ deepseek_api_key system config already exists");
    }

    await client.query("COMMIT");
    console.log("\n✅ OCR migration complete");
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
