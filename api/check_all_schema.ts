import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { pool } from "./src/db/index";

/**
 * Parse Drizzle schema files to extract table names and columns.
 * Looks for pgTable("tablename", {...definitions...})
 */
function parseSchemaFiles(dir: string) {
  const files = readdirSync(dir).filter(f => f.endsWith(".ts") && f !== "index.ts");
  const tables: Record<string, string[]> = {};

  for (const file of files) {
    const content = readFileSync(join(dir, file), "utf8");
    // Extract pgTable("name", { ... })
    const match = content.match(/pgTable\(\s*"(\w+)"/);
    if (!match) continue;
    const tableName = match[1];
    const columns: string[] = [];

    // Find column definitions: name: type("column_name", ...)
    const colRegex = /(\w+):\s*\w+\(\s*"(\w+)"/g;
    let m;
    while ((m = colRegex.exec(content)) !== null) {
      columns.push(m[2]);
    }

    if (columns.length > 0) tables[tableName] = columns;
  }

  return tables;
}

async function main() {
  const schemaDir = join(import.meta.dirname || __dirname, "src/db/schema");

  // Parse all Drizzle schema files
  const drizzleSchema = parseSchemaFiles(schemaDir);
  console.log(`Found ${Object.keys(drizzleSchema).length} tables in Drizzle schema\n`);

  // Get all production tables
  const dbTables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
  );
  const dbTableSet = new Set(dbTables.rows.map((r: any) => r.table_name));

  let totalMissing = 0;
  const missingTables: string[] = [];
  const missingCols: string[] = [];

  for (const [tableName, drizzleCols] of Object.entries(drizzleSchema)) {
    if (!dbTableSet.has(tableName)) {
      missingTables.push(tableName);
      totalMissing += drizzleCols.length;
      continue;
    }

    const dbCols = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
      [tableName]
    );
    const dbColSet = new Set(dbCols.rows.map((r: any) => r.column_name));

    for (const col of drizzleCols) {
      if (!dbColSet.has(col)) {
        missingCols.push(`${tableName}.${col}`);
        totalMissing++;
      }
    }
  }

  if (missingTables.length > 0) {
    console.log(`=== MISSING TABLES (${missingTables.length}) ===`);
    missingTables.forEach(t => console.log(`  ❌ ${t}`));
    console.log();
  }

  if (missingCols.length > 0) {
    console.log(`=== MISSING COLUMNS (${missingCols.length}) ===`);
    missingCols.forEach(c => console.log(`  ❌ ${c}`));
    console.log();
  }

  console.log(`Total: ${missingTables.length} missing tables, ${missingCols.length} missing columns`);
  if (totalMissing === 0) console.log("✅ Schema fully in sync!");

  // Also list production tables NOT in Drizzle
  const drizzleTableSet = new Set(Object.keys(drizzleSchema));
  const extraTables = Array.from(dbTableSet).filter(t => !drizzleTableSet.has(t));
  if (extraTables.length > 0) {
    console.log(`\n=== DB tables NOT in Drizzle schema (${extraTables.length}) ===`);
    extraTables.forEach(t => console.log(`  ℹ️  ${t}`));
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
