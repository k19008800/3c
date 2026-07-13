import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // a) 添加 rpm_limit, tpm_limit 到 user_quotas
    const uqCols = ["rpm_limit", "tpm_limit"];
    for (const col of uqCols) {
      const exists = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'user_quotas' AND column_name = $1
      `, [col]);
      if (exists.rows.length === 0) {
        await client.query(`ALTER TABLE user_quotas ADD COLUMN ${col} INTEGER`);
        console.log(`  + added user_quotas.${col}`);
      } else {
        console.log(`  ~ user_quotas.${col} already exists`);
      }
    }

    // b) 添加 quota_delete 到 audit_action enum
    try {
      await client.query(`ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'quota_delete'`);
      console.log("  + added quota_delete to audit_action");
    } catch (e) {
      console.log("  ~ quota_delete already in audit_action");
    }

    // c) 清理 set_by_role enum 中 agent 值（可选，跳过也可）
    // 不删除旧值，保留兼容性

    await client.query("COMMIT");
    console.log("\n✅ Migration complete");
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
