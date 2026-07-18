import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    const newActions = ["content_filter_create", "content_filter_update", "content_filter_delete"];

    for (const action of newActions) {
      try {
        await client.query(`ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '${action}'`);
        console.log(`  + added ${action} to audit_action`);
      } catch (e: any) {
        if (e.code !== "42710") throw e;
        console.log(`  ~ ${action} already exists in audit_action`);
      }
    }

    console.log("\n✅ Content filter audit actions migration complete");
  } catch (e) {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
