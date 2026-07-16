// ============================================================
//  3cloud (3C) — Database Migration Runner
//  Reads .sql files from db/migrations/ and executes them in order
//  Usage:
//    npx tsx src/db/migrate.ts                      # run all pending
//    npx tsx src/db/migrate.ts --file 2026-07-15    # run one file by name prefix
//    npx tsx src/db/migrate.ts --list               # list all migration files
// ============================================================

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, closeDb, pool } from "./index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, "migrations");

/** Track table for idempotent runs */
const TRACK_TABLE = "_migrations";

interface MigrationFile {
  name: string;
  path: string;
  sql: string;
}

async function ensureTrackTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "${TRACK_TABLE}" (
      name VARCHAR(255) PRIMARY KEY,
      hash VARCHAR(64) NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/** Compute a simple content hash for change detection */
function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const chr = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // convert to 32bit int
  }
  return Math.abs(hash).toString(36).padStart(7, "0");
}

function loadMigrationFiles(): MigrationFile[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("_"))
    .sort(); // alphabetical = chronological by convention

  return files.map((name) => ({
    name,
    path: join(MIGRATIONS_DIR, name),
    sql: readFileSync(join(MIGRATIONS_DIR, name), "utf-8"),
  }));
}

async function getExecutedMigrations(): Promise<Set<string>> {
  const result = await pool.query(
    `SELECT name FROM "${TRACK_TABLE}" ORDER BY name`
  );
  return new Set(result.rows.map((r: { name: string }) => r.name));
}

async function markExecuted(name: string, hash: string): Promise<void> {
  await pool.query(
    `INSERT INTO "${TRACK_TABLE}" (name, hash) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET hash = EXCLUDED.hash, executed_at = NOW()`,
    [name, hash]
  );
}

async function runMigration(migration: MigrationFile): Promise<void> {
  const hash = simpleHash(migration.sql);
  console.log(`  → Executing ${migration.name} ...`);

  const statements = migration.sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const stmt of statements) {
    try {
      await pool.query(stmt);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Ignore "already exists" errors for idempotent migrations
      if (
        message.includes("already exists") ||
        message.includes("duplicate key") ||
        message.includes("NOTICE")
      ) {
        console.warn(`    ⚠ ${message}`);
      } else {
        throw err;
      }
    }
  }

  await markExecuted(migration.name, hash);
  console.log(`  ✓ ${migration.name} done`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fileFilter = args.includes("--file")
    ? args[args.indexOf("--file") + 1]
    : null;
  const listOnly = args.includes("--list");

  console.log(`\n📦 3cloud Migration Runner`);
  console.log(`   Directory: ${MIGRATIONS_DIR}\n`);

  const db = createDb();
  await ensureTrackTable();

  const migrations = loadMigrationFiles();
  const executed = await getExecutedMigrations();

  if (listOnly) {
    console.log("Migration files:\n");
    for (const m of migrations) {
      const status = executed.has(m.name) ? "✓" : " ";
      const hash = simpleHash(m.sql);
      console.log(`  [${status}] ${m.name}  (hash: ${hash})`);
    }
    console.log();
    await closeDb();
    return;
  }

  let pending = migrations;

  if (fileFilter) {
    pending = migrations.filter((m) => m.name.includes(fileFilter));
    if (pending.length === 0) {
      console.error(`❌ No migration found matching "${fileFilter}"`);
      await closeDb();
      process.exit(1);
    }
  }

  console.log(`Found ${pending.length} migration(s) to process:\n`);

  for (const migration of pending) {
    if (!fileFilter && executed.has(migration.name)) {
      console.log(`  - ${migration.name} (already executed, skipping)`);
      continue;
    }
    await runMigration(migration);
  }

  console.log(`\n✅ Migration run complete.\n`);
  await closeDb();
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
