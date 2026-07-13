// Global setup: initialize DB, run pending migrations, load env before tests
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
dotenv.config({ path: resolve(__dirname, "../../.env") });

/**
 * Auto-run pending manual migrations before test suite starts.
 * These are migrations in src/db/migrations/ that need to be applied
 * to the local test DB (drizzle-kit push only handles schema DDL,
 * but  manual migrations may contain ALTER/DDL+DML that need to run separately).
 */
async function runPendingMigrations(): Promise<void> {
  // Only run in test environment
  if (!process.env.DATABASE_URL) {
    console.warn("[test setup] DATABASE_URL not set, skipping migrations");
    return;
  }

  try {
    // Dynamic import to avoid circular deps during globalSetup
    const { createDb } = await import("../db/index.js");
    const db = createDb();

    // List of manual migrations that need to be idempotent (use IF NOT EXISTS)
    const pendingMigrations = [
      // 2026-07-11: Add settlement_cycle etc to agents table
      async () => {
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`
          ALTER TABLE IF EXISTS agents
            ADD COLUMN IF NOT EXISTS settlement_cycle VARCHAR(10) DEFAULT 'manual',
            ADD COLUMN IF NOT EXISTS next_settlement_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS last_settlement_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS min_withdraw_amount DECIMAL(18,6) DEFAULT '0.000000';
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS agents_next_settlement_idx
            ON agents (next_settlement_at)
            WHERE settlement_cycle != 'manual' AND status = true;
        `);
        console.log("[test setup] Migration: settlement_cycle columns — OK");
      },
    ];

    for (const migration of pendingMigrations) {
      try {
        await migration();
      } catch (err: any) {
        // Ignore "already exists" errors — migrations are idempotent
        if (err?.code === "42701" || err?.code === "42P07" || err?.message?.includes("already exists")) {
          console.log("[test setup] Migration skipped (already applied):", err.message?.slice(0, 80));
        } else {
          console.warn("[test setup] Migration warning:", err.message?.slice(0, 120));
        }
      }
    }
  } catch (err: any) {
    console.warn("[test setup] Migration runner failed (DB may not be available):", err.message?.slice(0, 120));
  }
}

export async function setup() {
  if (!process.env.DATABASE_URL) {
    console.warn("[test setup] DATABASE_URL not set, tests may fail");
  }

  // Run pending manual migrations before any test file loads
  await runPendingMigrations();
}

export async function teardown() {
  // Cleanup is handled per-test
}
