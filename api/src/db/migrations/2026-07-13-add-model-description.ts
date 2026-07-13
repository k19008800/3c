// ============================================================
//  3cloud (3C) — Migration: Add description to models
//  2026-07-13
// ============================================================

import { sql } from "drizzle-orm";
import { getDb } from "../index.js";

export async function up() {
  const db = getDb();
  await db.execute(sql`ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "description" TEXT`);
  console.log("[Migration] 2026-07-13-add-model-description completed");
}

export async function down() {
  const db = getDb();
  await db.execute(sql`ALTER TABLE "models" DROP COLUMN IF EXISTS "description"`);
  console.log("[Migration] 2026-07-13-add-model-description rolled back");
}
