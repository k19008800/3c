import { pool } from "./src/db/index";

async function main() {
  // Check which exist already
  const fixes: [string, string, string][] = [
    // models
    ["models", "context_length", "INTEGER DEFAULT 0"],
    // vendors
    ["vendors", "code", "VARCHAR(50)"],
    ["vendors", "display_name", "VARCHAR(150)"],
    ["vendors", "api_format", "VARCHAR(20)"],
    ["vendors", "currency", "VARCHAR(10)"],
    ["vendors", "is_active", "BOOLEAN DEFAULT true"],
    ["vendors", "contact", "TEXT"],
    ["vendors", "reviewed_by", "INTEGER"],
    ["vendors", "reviewed_at", "TIMESTAMP"],
    // vendor_models
    ["vendor_models", "upstream_model", "VARCHAR(200) NOT NULL DEFAULT ''"],
    ["vendor_models", "cost_input_price", "NUMERIC(12,8) NOT NULL DEFAULT 0"],
    ["vendor_models", "cost_output_price", "NUMERIC(12,8) NOT NULL DEFAULT 0"],
    ["vendor_models", "priority", "INTEGER NOT NULL DEFAULT 0"],
    ["vendor_models", "is_enabled", "BOOLEAN NOT NULL DEFAULT true"],
    ["vendor_models", "avg_latency_ms", "INTEGER DEFAULT 0"],
  ];

  for (const [table, col, def] of fixes) {
    try {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${def}`);
      console.log(`✅ ${table}.${col}`);
    } catch (e: any) {
      console.log(`⏭️ ${table}.${col} — ${e.message?.slice(0, 60)}`);
    }
  }

  console.log("\nDone! All columns added.");
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
