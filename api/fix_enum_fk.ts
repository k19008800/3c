import { pool } from "./src/db/index";

async function main() {
  // 1. Create missing enum types (only if they don't exist)
  const enums: [string, string[]][] = [
    ["contact_method", ["phone", "wechat", "email", "meeting", "other"]],
    ["customer_status", ["lead", "trial", "active", "silent", "churned"]],
    ["task_priority", ["low", "normal", "high", "urgent"]],
    ["task_status", ["pending", "completed", "cancelled"]],
  ];

  for (const [name, values] of enums) {
    try {
      const vals = values.map(v => `'${v}'`).join(", ");
      await pool.query(`CREATE TYPE "${name}" AS ENUM (${vals})`);
      console.log(`✅ CREATED ENUM: ${name}`);
    } catch (e: any) {
      if (e.code === "42710") console.log(`⏭️  ENUM exists: ${name}`);
      else console.log(`⚠️  ENUM ${name}: ${e.message?.slice(0, 60)}`);
    }
  }

  // 2. Add missing columns to admin_roles (legacy table)
  const adminRolesCols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='admin_roles'"
  );
  const existing = new Set(adminRolesCols.rows.map((r: any) => r.column_name));

  const missingAdminCols: [string, string][] = [
    ["user_id", "INTEGER"],
    ["role_id", "INTEGER"],
    ["assigned_by", "INTEGER"],
    ["assigned_at", "TIMESTAMP WITH TIME ZONE"],
    ["revoked_at", "TIMESTAMP WITH TIME ZONE"],
    ["action", "VARCHAR(50)"],
    ["operator_id", "INTEGER"],
    ["target_user_id", "INTEGER"],
    ["target_role_id", "INTEGER"],
    ["detail", "TEXT"],
    ["diff", "TEXT"],
  ];

  for (const [col, type] of missingAdminCols) {
    if (!existing.has(col)) {
      try {
        await pool.query(`ALTER TABLE admin_roles ADD COLUMN "${col}" ${type}`);
        console.log(`✅ admin_roles.${col}`);
      } catch (e: any) {
        console.log(`⚠️  admin_roles.${col}: ${e.message?.slice(0, 60)}`);
      }
    }
  }

  // 3. Now re-run the specific failed migration statements from 0001 and 0021
  // These create tables that depend on the enums we just created
  const failedStmts = [
    // From 0001: tables that need contact_method, customer_status, task_status enums
    `CREATE TABLE IF NOT EXISTS customer_contacts (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      contact_type "contact_method" NOT NULL,
      value VARCHAR(200) NOT NULL,
      is_primary BOOLEAN DEFAULT false,
      verified BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS customer_status_logs (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      from_status "customer_status",
      to_status "customer_status" NOT NULL,
      operator_id INTEGER,
      note TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS follow_reminders (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      reminder_at TIMESTAMP WITH TIME ZONE NOT NULL,
      priority "task_priority" DEFAULT 'normal',
      status "task_status" DEFAULT 'pending',
      operator_id INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      contact_info TEXT,
      status "customer_status" DEFAULT 'lead',
      source VARCHAR(50),
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
    )`,
  ];

  for (const stmt of failedStmts) {
    try {
      await pool.query(stmt);
      console.log("✅ Executed table creation");
    } catch (e: any) {
      console.log(`⏭️  ${e.message?.slice(0, 80)}`);
    }
  }

  console.log("\nDone!");
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
