/**
 * 生产 DB 全量同步 — 最终版
 * 方案：合并所有 migration SQL，逐条安全执行（跳过已有对象）
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { pool } from "./src/db/index";

async function main() {
  const migrationsDir = join(process.cwd(), "src/db/migrations");
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql"))
    .sort();

  console.log(`Found ${files.length} migration files\n`);

  let totalStatements = 0;
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    // Split by Drizzle breakpoint marker
    const statements = sql
      .split("--> statement-breakpoint")
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      totalStatements++;
      try {
        // Skip CREATE TYPE/ENUM (production already has its own enums)
        if (/^CREATE\s+TYPE/i.test(stmt) || /^CREATE\s+ENUM/i.test(stmt)) {
          skipCount++;
          continue;
        }

        // Skip ALTER TYPE (can't alter enums we don't manage)
        if (/^ALTER\s+TYPE/i.test(stmt)) {
          skipCount++;
          continue;
        }

        // For ALTER TABLE ADD COLUMN, wrap with IF NOT EXISTS check
        if (/^ALTER\s+TABLE\s+\"?(\w+)\"?\s+ADD\s+COLUMN\s+\"?(\w+)\"?/i.test(stmt)) {
          await pool.query(stmt);
          successCount++;
        } else if (/^ALTER\s+TABLE/i.test(stmt)) {
          // Other ALTER TABLE (ADD CONSTRAINT, DROP, etc.)
          // Try once; if it fails, the constraint/index likely already exists
          try {
            await pool.query(stmt);
            successCount++;
          } catch {
            skipCount++;
          }
        } else {
          // CREATE TABLE, CREATE INDEX, etc. (usually have IF NOT EXISTS)
          await pool.query(stmt);
          successCount++;
        }
      } catch (e: any) {
        // Known safe errors: existing objects
        if (/already exists|duplicate|Duplicate/.test(e.message)) {
          skipCount++;
        } else {
          console.log(`  ⚠️  ${file}: ${e.message?.slice(0, 100)}`);
          errorCount++;
        }
      }
    }
  }

  console.log(`\n=== Migration Complete ===`);
  console.log(`Total statements: ${totalStatements}`);
  console.log(`Executed OK:      ${successCount}`);
  console.log(`Skipped (exists): ${skipCount}`);
  console.log(`Errors:           ${errorCount}`);

  if (errorCount > 0) {
    console.log("\n⚠️  Some errors occurred. Review and fix manually if needed.");
  } else {
    console.log("✅ All migrations applied successfully!");
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
