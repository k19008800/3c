#!/usr/bin/env node
/**
 * 手写 SQL 迁移唯一执行器 — 顺序执行、checksum 防篡改与失败即停。
 *
 * Drizzle journal 迁移（0000–0016）完成后，由本文件执行 0017–0032。
 * 迁移失败只记录状态并停止，不自动执行未经验证的破坏性回滚。
 * @module manual-migrations
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const postgres = require('postgres');
const { checksum: fileChecksum, safeErrorMessage } = require('./lib/manual-migrations-runner.cjs');

const DATABASE_URL = process.env.DATABASE_URL;
const LOCK_KEY = 0x33636c6d; // “3clm”，所有环境共用同一 advisory lock
const MIGRATIONS = [
  '0017_invoice_email_delivery.sql', '0018_admin_webhooks.sql',
  '0019_adjustment_records.sql', '0020_content_moderation.sql',
  '0021_subscription_plans.sql', '0022_knowledge_base.sql',
  '0023_agent_approvals.sql', '0024a_campaign_participants.sql',
  '0024b_disputes.sql', '0024c_consent.sql', '0025_partition_big_tables.sql',
  '0026_gap_fix.sql', '0027_recharge_orders_idempotency.sql',
  '0028_recharge_orders_transfer_no_unique.sql', '0029_credit_limit_events.sql',
  '0030_adjustment_pending_super.sql', '0031_cache_pricing_explicit.sql',
  '0032_user_language_i18n.sql', '0033_refund_hardening.sql', '0034_reconciliation.sql',
  '0035_login_history.sql', '0036_data_export_grants.sql',
];

function safeError(error) {
  return safeErrorMessage(error, DATABASE_URL || '');
}

async function ensureMetadataTable(sql) {
  await sql`CREATE TABLE IF NOT EXISTS _3cloud_manual_migrations (
    name varchar(100) PRIMARY KEY,
    checksum varchar(64),
    status varchar(20) NOT NULL DEFAULT 'applied',
    error text,
    started_at timestamptz,
    applied_at timestamptz,
    duration_ms integer
  )`;
  // Existing installations have only name/applied_at. ADD COLUMN is idempotent.
  await sql`ALTER TABLE _3cloud_manual_migrations ADD COLUMN IF NOT EXISTS checksum varchar(64)`;
  await sql`ALTER TABLE _3cloud_manual_migrations ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'applied'`;
  await sql`ALTER TABLE _3cloud_manual_migrations ADD COLUMN IF NOT EXISTS error text`;
  await sql`ALTER TABLE _3cloud_manual_migrations ADD COLUMN IF NOT EXISTS started_at timestamptz`;
  await sql`ALTER TABLE _3cloud_manual_migrations ADD COLUMN IF NOT EXISTS applied_at timestamptz`;
  await sql`ALTER TABLE _3cloud_manual_migrations ADD COLUMN IF NOT EXISTS duration_ms integer`;
}

async function runMigration(sql, name, content, digest) {
  const startedAt = new Date();
  const startedMs = Date.now();
  const [existing] = await sql`SELECT name, checksum, status FROM _3cloud_manual_migrations WHERE name = ${name}`;
  if (existing?.status === 'applied' && existing.checksum && existing.checksum !== digest) {
    throw new Error(`checksum mismatch for ${name}: recorded=${existing.checksum} current=${digest}`);
  }
  // One-time compatibility upgrade: old rows predate checksum tracking. Trust the
  // current file once, then every later run is protected from silent edits.
  if (existing?.status === 'applied' && !existing.checksum) {
    console.warn(`⚠ ${name} has no checksum; recording current file checksum`);
    await sql`UPDATE _3cloud_manual_migrations SET checksum = ${digest}, started_at = COALESCE(started_at, ${startedAt}) WHERE name = ${name}`;
    console.log(`↷ ${name} already applied`);
    return;
  }
  if (existing?.status === 'applied') {
    console.log(`↷ ${name} already applied (checksum ok)`);
    return;
  }

  await sql`
    INSERT INTO _3cloud_manual_migrations (name, checksum, status, error, started_at, applied_at, duration_ms)
    VALUES (${name}, ${digest}, 'running', NULL, ${startedAt}, ${startedAt}, NULL)
    ON CONFLICT (name) DO UPDATE SET checksum = EXCLUDED.checksum, status = 'running', error = NULL, started_at = EXCLUDED.started_at
  `;
  console.log(`▶ ${name} (${content.length} chars, sha256=${digest})`);
  try {
    if (name === '0025_partition_big_tables.sql') {
      await sql.unsafe(content); // file owns BEGIN/COMMIT
    } else {
      await sql.begin(async (tx) => tx.unsafe(content));
    }
    const duration = Date.now() - startedMs;
    await sql`UPDATE _3cloud_manual_migrations SET status = 'applied', applied_at = now(), duration_ms = ${duration}, error = NULL WHERE name = ${name}`;
    console.log(`  ✅ ${name} applied (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - startedMs;
    const detail = safeError(error);
    await sql`UPDATE _3cloud_manual_migrations SET status = 'failed', duration_ms = ${duration}, error = ${detail} WHERE name = ${name}`;
    throw new Error(`${name} failed: ${detail}`);
  }
}

async function postCheck(sql) {
  const [partitioned] = await sql`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='consumption_records' AND c.relkind='p'`;
  if (!partitioned) throw new Error('post-migration check failed: consumption_records is not partitioned');
  const [language] = await sql`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='language'`;
  if (!language) throw new Error('post-migration check failed: users.language is missing');
  const [metadata] = await sql`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='_3cloud_manual_migrations' AND column_name='checksum'`;
  if (!metadata) throw new Error('post-migration check failed: migration checksum is missing');
}

async function main() {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
  let locked = false;
  try {
    const [lock] = await sql`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS acquired`;
    if (!lock.acquired) throw new Error('another manual migration runner is active');
    locked = true;
    await ensureMetadataTable(sql);
    for (const name of MIGRATIONS) {
      const file = join(__dirname, 'src', 'db', 'migrations', name);
      const content = readFileSync(file, 'utf8');
      await runMigration(sql, name, content, fileChecksum(content));
    }
    await postCheck(sql);
    console.log('✅ manual migration verification passed');
  } finally {
    if (locked) {
      try { await sql`SELECT pg_advisory_unlock(${LOCK_KEY})`; } catch (error) { console.error(`⚠ failed to release migration lock: ${safeError(error)}`); }
    }
    await sql.end();
  }
}

if (require.main === module) {
  main().catch((error) => { console.error(`❌ manual migration failed: ${safeError(error)}`); process.exitCode = 1; });
}

module.exports = { fileChecksum, safeError, LOCK_KEY, MIGRATIONS, ensureMetadataTable, runMigration, postCheck };
