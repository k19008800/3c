import { pool } from "./src/db/index";

// All Drizzle schema columns (table -> columns from source code)
const SCHEMA: Record<string, { col: string; type: string; nullable?: boolean }[]> = {
  users: [
    { col: "id", type: "serial" }, { col: "email", type: "varchar(255)" }, { col: "password_hash", type: "varchar(255)" },
    { col: "username", type: "varchar(50)", nullable: true }, { col: "phone", type: "varchar(20)", nullable: true },
    { col: "status", type: "varchar(20)" }, { col: "role", type: "varchar(20)" },
    { col: "balance", type: "integer" }, { col: "real_name_status", type: "varchar(20)", nullable: true },
    { col: "agent_id", type: "integer", nullable: true }, { col: "two_factor_secret", type: "varchar(255)", nullable: true },
    { col: "two_factor_enabled", type: "boolean", nullable: true }, { col: "two_factor_verified", type: "boolean", nullable: true },
    { col: "two_factor_enabled_at", type: "timestamp", nullable: true }, { col: "two_factor_failed_attempts", type: "integer", nullable: true },
    { col: "two_factor_locked_until", type: "timestamp", nullable: true }, { col: "consent_status", type: "varchar(20)", nullable: true },
    { col: "onboarding_status", type: "varchar(20)", nullable: true }, { col: "onboarding_step", type: "integer", nullable: true },
    { col: "onboarding_completed_at", type: "timestamp with time zone", nullable: true },
    { col: "created_at", type: "timestamp" }, { col: "updated_at", type: "timestamp" },
  ],
  models: [
    { col: "id", type: "serial" }, { col: "name", type: "varchar(100)" }, { col: "display_name", type: "varchar(100)", nullable: true },
    { col: "category", type: "varchar(50)", nullable: true }, { col: "context_length", type: "integer", nullable: true },
    { col: "description", type: "text", nullable: true }, { col: "status", type: "varchar(20)" },
    { col: "created_at", type: "timestamp" }, { col: "updated_at", type: "timestamp" },
  ],
  vendors: [
    { col: "id", type: "serial" }, { col: "name", type: "varchar(100)" }, { col: "code", type: "varchar(50)", nullable: true },
    { col: "display_name", type: "varchar(150)", nullable: true }, { col: "description", type: "text", nullable: true },
    { col: "base_url", type: "varchar(500)", nullable: true }, { col: "api_format", type: "varchar(20)", nullable: true },
    { col: "currency", type: "varchar(10)", nullable: true }, { col: "status", type: "varchar(20)" },
    { col: "is_active", type: "boolean", nullable: true }, { col: "contact", type: "text", nullable: true },
    { col: "contact_email", type: "varchar(255)", nullable: true }, { col: "reviewed_by", type: "integer", nullable: true },
    { col: "reviewed_at", type: "timestamp", nullable: true }, { col: "reject_reason", type: "text", nullable: true },
    { col: "created_at", type: "timestamp" }, { col: "updated_at", type: "timestamp" },
  ],
  vendor_models: [
    { col: "id", type: "serial" }, { col: "vendor_id", type: "integer" }, { col: "model_id", type: "integer" },
    { col: "upstream_model", type: "varchar(200)" }, { col: "cost_input_price", type: "numeric(12,8)" },
    { col: "cost_output_price", type: "numeric(12,8)" }, { col: "weight", type: "integer" },
    { col: "priority", type: "integer" }, { col: "is_enabled", type: "boolean" },
    { col: "health_score", type: "integer", nullable: true }, { col: "avg_latency_ms", type: "integer", nullable: true },
    { col: "created_at", type: "timestamp" }, { col: "updated_at", type: "timestamp" },
  ],
  site_configs: [
    { col: "key", type: "varchar(64)" }, { col: "value", type: "text" },
    { col: "updated_at", type: "timestamp", nullable: true },
  ],
};

async function main() {
  const tables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
  );
  const existingTables = new Set(tables.rows.map((r: any) => r.table_name));

  console.log("=== Checking Drizzle schema tables exist in DB ===\n");
  let totalIssues = 0;

  for (const [tableName, columns] of Object.entries(SCHEMA)) {
    if (!existingTables.has(tableName)) {
      console.log(`❌ TABLE MISSING: ${tableName} — table doesn't exist`);
      totalIssues++;
      continue;
    }

    const dbCols = await pool.query(
      `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [tableName]
    );
    const dbColNames = new Set(dbCols.rows.map((r: any) => r.column_name));

    for (const { col } of columns) {
      if (!dbColNames.has(col)) {
        console.log(`❌ MISSING: ${tableName}.${col}`);
        totalIssues++;
      }
    }
  }

  console.log(`\n=== Total issues: ${totalIssues} ===`);
  if (totalIssues === 0) console.log("✅ All schema columns in sync!");

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
