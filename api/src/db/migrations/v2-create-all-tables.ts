#!/usr/bin/env tsx
// 3cloud V2 迁移脚本 — 新表创建 + 字段扩展
// 手工执行，因为 drizzle-kit push 在分区表场景下交互式提示过多

import { getDb, createDb } from "../index.js";
import { sql } from "drizzle-orm";

async function run() {
  await createDb();
  const db = getDb();

  // 1. 兑换码批次表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS redemption_batches (
      id SERIAL PRIMARY KEY,
      creator_id INTEGER REFERENCES users(id),
      name VARCHAR(200),
      amount DECIMAL(18,6) NOT NULL,
      total_count INTEGER NOT NULL,
      used_count INTEGER DEFAULT 0,
      expires_at TIMESTAMPTZ,
      max_uses INTEGER DEFAULT 1,
      status VARCHAR(20) DEFAULT 'active',
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("✅ redemption_batches");

  // 2. 兑换码表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS redemption_codes (
      id SERIAL PRIMARY KEY,
      batch_id INTEGER REFERENCES redemption_batches(id),
      code VARCHAR(64) UNIQUE NOT NULL,
      amount DECIMAL(18,6) NOT NULL,
      uses_left INTEGER NOT NULL,
      status VARCHAR(20) DEFAULT 'unused',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("✅ redemption_codes");

  // 3. 兑换记录表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS redemption_logs (
      id SERIAL PRIMARY KEY,
      code_id INTEGER REFERENCES redemption_codes(id),
      user_id INTEGER REFERENCES users(id),
      amount DECIMAL(18,6) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("✅ redemption_logs");

  // 4. 管理 API Key 表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_api_keys (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      key_hash VARCHAR(64) NOT NULL UNIQUE,
      key_prefix VARCHAR(10) NOT NULL,
      permissions JSONB NOT NULL DEFAULT '[]',
      status BOOLEAN DEFAULT true,
      expires_at TIMESTAMPTZ,
      last_used_at TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("✅ admin_api_keys");

  // 5. 管理 Key 使用日志表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_key_usage_logs (
      id SERIAL PRIMARY KEY,
      key_id INTEGER REFERENCES admin_api_keys(id),
      method VARCHAR(10),
      path VARCHAR(255),
      ip VARCHAR(45),
      status_code INTEGER,
      duration_ms INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("✅ admin_key_usage_logs");

  // 6. 用户额度表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_quotas (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      quota_type VARCHAR(20) DEFAULT 'monthly',
      quota_amount DECIMAL(18,6),
      used_amount DECIMAL(18,6) DEFAULT 0,
      alert_percent INTEGER DEFAULT 80,
      period_start TIMESTAMPTZ,
      period_end TIMESTAMPTZ,
      set_by INTEGER REFERENCES users(id),
      set_by_role VARCHAR(20),
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("✅ user_quotas");

  // 7. Key 级额度表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS key_quotas (
      id SERIAL PRIMARY KEY,
      api_key_id INTEGER REFERENCES api_keys(id) ON DELETE CASCADE,
      quota_amount DECIMAL(18,6),
      used_amount DECIMAL(18,6) DEFAULT 0,
      alert_percent INTEGER DEFAULT 80,
      period_start TIMESTAMPTZ,
      period_end TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("✅ key_quotas");

  // 8. vendor_models 熔断器字段
  for (const stmt of [
    sql`ALTER TABLE vendor_models ADD COLUMN IF NOT EXISTS circuit_state VARCHAR(10) DEFAULT 'closed'`,
    sql`ALTER TABLE vendor_models ADD COLUMN IF NOT EXISTS circuit_opened_at TIMESTAMPTZ`,
    sql`ALTER TABLE vendor_models ADD COLUMN IF NOT EXISTS circuit_retry_after TIMESTAMPTZ`,
    sql`ALTER TABLE vendor_models ADD COLUMN IF NOT EXISTS circuit_fail_count INTEGER DEFAULT 0`,
  ]) {
    await db.execute(stmt);
  }
  console.log("✅ vendor_models circuit fields");

  // 9. 熔断历史表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS circuit_history (
      id SERIAL PRIMARY KEY,
      vendor_model_id INTEGER REFERENCES vendor_models(id) ON DELETE CASCADE,
      from_state VARCHAR(10),
      to_state VARCHAR(10),
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("✅ circuit_history");

  // 10. 供应商 API Key 表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS vendor_api_keys (
      id SERIAL PRIMARY KEY,
      vendor_id INTEGER REFERENCES vendors(id) ON DELETE CASCADE,
      key_hash VARCHAR(64) NOT NULL UNIQUE,
      key_prefix VARCHAR(10) NOT NULL,
      permissions JSONB NOT NULL DEFAULT '["vendor:*"]',
      status BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("✅ vendor_api_keys");

  // 11. 索引
  const indexes = [
    sql`CREATE INDEX IF NOT EXISTS idx_redemption_codes_batch ON redemption_codes(batch_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_redemption_codes_status ON redemption_codes(status)`,
    sql`CREATE INDEX IF NOT EXISTS idx_redemption_logs_user ON redemption_logs(user_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_user_quotas_user ON user_quotas(user_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_key_quotas_key ON key_quotas(api_key_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_circuit_history_vm ON circuit_history(vendor_model_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_circuit_state ON vendor_models(circuit_state)`,
    sql`CREATE INDEX IF NOT EXISTS idx_admin_api_keys_hash ON admin_api_keys(key_hash)`,
    sql`CREATE INDEX IF NOT EXISTS idx_admin_key_logs_key ON admin_key_usage_logs(key_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_vendor_api_keys_hash ON vendor_api_keys(key_hash)`,
  ];
  for (const idx of indexes) {
    await db.execute(idx);
  }
  console.log("✅ All indexes created");
  console.log("🎉 V2 migration complete!");
  process.exit(0);
}

run().catch((e) => {
  console.error("❌ Migration failed:", e);
  process.exit(1);
});
