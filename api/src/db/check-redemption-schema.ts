#!/usr/bin/env tsx
import { getDb, createDb } from "./index.js";
import { sql } from "drizzle-orm";

async function main() {
  await createDb();
  const db = getDb();

  const tables = ["redemption_logs", "redemption_codes", "redemption_batches"];
  for (const t of tables) {
    const result = await db.execute(
      sql`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = ${t} ORDER BY ordinal_position`
    );
    console.log("--- " + t + " --- type:", typeof result, Array.isArray(result));
    // drizzle execute returns a result object with rows
    if (result && result.rows) {
      for (const r of result.rows) {
        console.log("  " + r.column_name + " (" + r.data_type + ") nullable=" + r.is_nullable);
      }
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
