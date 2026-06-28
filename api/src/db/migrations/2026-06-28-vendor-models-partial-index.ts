// ============================================================
//  Migration: 2026-06-28 — vendor_models 部分唯一索引
//  将 vendor_models_vendor_model_idx 改为仅对 status=true 生效
//  解决软删除后无法重建映射的问题
// ============================================================

import { getDb } from "../index.js";

export async function migrate() {
  const db = getDb();
  console.log("[Migration] Rebuilding vendor_models unique index as partial index…");

  await db.execute(`
    DROP INDEX IF EXISTS "vendor_models_vendor_model_idx";
    CREATE UNIQUE INDEX "vendor_models_vendor_model_idx"
      ON "vendor_models" ("vendor_id", "model_id")
      WHERE status = true;
  `);

  console.log("[Migration] ✓ vendor_models partial unique index created");
}
