import { pool } from "./src/db/index";

async function main() {
  // 1. Add missing users columns
  const userCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users'");
  const existing = new Set(userCols.rows.map((r: any) => r.column_name));
  
  const addCols = [
    ["agent_id", "INTEGER REFERENCES users(id)"],
    ["two_factor_secret", "VARCHAR(255)"],
    ["two_factor_enabled", "BOOLEAN DEFAULT false"],
    ["two_factor_verified", "BOOLEAN DEFAULT false"],
    ["two_factor_enabled_at", "TIMESTAMP"],
    ["two_factor_failed_attempts", "INTEGER DEFAULT 0"],
    ["two_factor_locked_until", "TIMESTAMP"],
    ["consent_status", "VARCHAR(20) DEFAULT 'pending'"],
    ["onboarding_status", "VARCHAR(20) DEFAULT 'not_started'"],
    ["onboarding_step", "INTEGER DEFAULT 1"],
    ["onboarding_completed_at", "TIMESTAMP WITH TIME ZONE"],
  ];
  
  for (const [col, def] of addCols) {
    if (!existing.has(col)) {
      await pool.query(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
      console.log(`✅ users.${col} added`);
    } else {
      console.log(`⏭️  users.${col} exists`);
    }
  }

  // 2. Add category to models
  const modelCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='models'");
  const modelExisting = new Set(modelCols.rows.map((r: any) => r.column_name));
  if (!modelExisting.has("category")) {
    await pool.query("ALTER TABLE models ADD COLUMN category VARCHAR(50)");
    console.log("✅ models.category added");
  }
  
  // 3. Create site_configs table
  await pool.query(`CREATE TABLE IF NOT EXISTS site_configs (
    key VARCHAR(64) PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  console.log("✅ site_configs table ready");

  // 4. Insert default site config values
  await pool.query(`INSERT INTO site_configs (key, value) VALUES 
    ('site_name', '3Cloud'),
    ('site_copyright', '© 2026 3Cloud · AI Token 聚合平台')
    ON CONFLICT (key) DO NOTHING`);
  console.log("✅ Default site configs inserted");

  console.log("\nDone! DB is now in sync with Drizzle schema.");
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
