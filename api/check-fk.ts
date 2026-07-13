import { createDb, closeDb } from "./src/db/index.js";
import { sql } from "drizzle-orm";

const db = createDb();
const r = await db.execute(sql.raw(`
  SELECT
    tc.constraint_name, tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
  WHERE tc.table_name = 'call_logs'
  ORDER BY tc.constraint_type, kcu.ordinal_position
`));
console.log("call_logs constraints:");
for (const row of (r as any).rows || []) {
  console.log(" ", row.constraint_name, row.constraint_type, row.column_name, "->", row.foreign_table_name, row.foreign_column_name || "");
}
await closeDb();
