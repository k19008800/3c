#!/usr/bin/env tsx
// 修复兑换码表缺失的字段
// schema.ts 定义了 batch_id / used_at / updated_at，
// 但 v2-create-all-tables.ts 创建的表缺少这些列

import { getDb, createDb } from "../index.js";
import { sql } from "drizzle-orm";

async function run() {
  await createDb();
  const db = getDb();

  // 1. redemption_logs 缺少 batch_id
  await db.execute(sql`
    ALTER TABLE redemption_logs 
    ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES redemption_batches(id)
  `);
  console.log("✅ redemption_logs.batch_id");

  // 2. redemption_logs 缺少 ip
  await db.execute(sql`
    ALTER TABLE redemption_logs 
    ADD COLUMN IF NOT EXISTS ip VARCHAR(45)
  `);
  console.log("✅ redemption_logs.ip");

  // 3. redemption_codes 缺少 used_at
  await db.execute(sql`
    ALTER TABLE redemption_codes 
    ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ
  `);
  console.log("✅ redemption_codes.used_at");

  // 4. redemption_batches 缺少 updated_at
  await db.execute(sql`
    ALTER TABLE redemption_batches 
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
  `);
  console.log("✅ redemption_batches.updated_at");

  // 5. 添加缺失的索引
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_redemption_logs_user_created 
    ON redemption_logs(user_id, created_at DESC)
  `);
  console.log("✅ idx_redemption_logs_user_created");

  console.log("🎉 Redemption schema fix complete!");
  process.exit(0);
}

run().catch((e) => {
  console.error("❌ Fix failed:", e);
  process.exit(1);
});
