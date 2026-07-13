// ============================================================
//  Migration: 用户额度预算 + 熔断器增强 + 熔断历史表
//  2026-07-09
//  Creates:
//    - user_quotas 表
//    - key_quotas 表
//    - circuit_history 表
//    - vendor_models.circuit_state, circuit_opened_at, etc.
//    - ENUM types for quota_type, set_by_role, circuit_state_type
// ============================================================

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1. ENUM types ──

    // quota_type enum
    const qtExists = await client.query(`
      SELECT 1 FROM pg_type WHERE typname = 'quota_type'
    `);
    if (qtExists.rows.length === 0) {
      await client.query(`CREATE TYPE quota_type AS ENUM ('monthly', 'total', 'per_key')`);
      console.log("  + created quota_type enum");
    } else {
      console.log("  ~ quota_type enum already exists");
    }

    // set_by_role enum
    const sbrExists = await client.query(`
      SELECT 1 FROM pg_type WHERE typname = 'set_by_role'
    `);
    if (sbrExists.rows.length === 0) {
      await client.query(`CREATE TYPE set_by_role AS ENUM ('agent', 'admin')`);
      console.log("  + created set_by_role enum");
    } else {
      console.log("  ~ set_by_role enum already exists");
    }

    // circuit_state_type enum
    const cstExists = await client.query(`
      SELECT 1 FROM pg_type WHERE typname = 'circuit_state_type'
    `);
    if (cstExists.rows.length === 0) {
      await client.query(`CREATE TYPE circuit_state_type AS ENUM ('closed', 'half_open', 'open', 'dead')`);
      console.log("  + created circuit_state_type enum");
    } else {
      console.log("  ~ circuit_state_type enum already exists");
    }

    // ── 2. user_quotas table ──
    const uqExists = await client.query(`
      SELECT 1 FROM information_schema.tables WHERE table_name = 'user_quotas'
    `);
    if (uqExists.rows.length === 0) {
      await client.query(`
        CREATE TABLE user_quotas (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          quota_type quota_type NOT NULL DEFAULT 'monthly',
          quota_amount NUMERIC(18,6) NOT NULL DEFAULT '0.000000',
          used_amount NUMERIC(18,6) NOT NULL DEFAULT '0.000000',
          alert_percent NUMERIC(5,2) NOT NULL DEFAULT '80.00',
          period_start TIMESTAMPTZ NOT NULL,
          period_end TIMESTAMPTZ NOT NULL,
          set_by INTEGER REFERENCES users(id),
          set_by_role set_by_role NOT NULL DEFAULT 'admin',
          reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      console.log("  + created user_quotas table");

      // Indexes
      await client.query(`CREATE INDEX idx_user_quotas_user_id ON user_quotas(user_id)`);
      await client.query(`CREATE INDEX idx_user_quotas_period ON user_quotas(user_id, quota_type, period_start)`);
      await client.query(`CREATE INDEX idx_user_quotas_active ON user_quotas(user_id, quota_type, period_end)`);
      console.log("  + created user_quotas indexes");
    } else {
      console.log("  ~ user_quotas table already exists");
    }

    // ── 3. key_quotas table ──
    const kqExists = await client.query(`
      SELECT 1 FROM information_schema.tables WHERE table_name = 'key_quotas'
    `);
    if (kqExists.rows.length === 0) {
      await client.query(`
        CREATE TABLE key_quotas (
          id SERIAL PRIMARY KEY,
          api_key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
          quota_amount NUMERIC(18,6) NOT NULL DEFAULT '0.000000',
          used_amount NUMERIC(18,6) NOT NULL DEFAULT '0.000000',
          alert_percent NUMERIC(5,2) NOT NULL DEFAULT '80.00',
          period_start TIMESTAMPTZ NOT NULL,
          period_end TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      console.log("  + created key_quotas table");

      await client.query(`CREATE UNIQUE INDEX idx_key_quotas_api_key_id ON key_quotas(api_key_id)`);
      console.log("  + created key_quotas index");
    } else {
      console.log("  ~ key_quotas table already exists");
    }

    // ── 4. circuit_history table ──
    const chExists = await client.query(`
      SELECT 1 FROM information_schema.tables WHERE table_name = 'circuit_history'
    `);
    if (chExists.rows.length === 0) {
      await client.query(`
        CREATE TABLE circuit_history (
          id SERIAL PRIMARY KEY,
          vendor_model_id INTEGER NOT NULL REFERENCES vendor_models(id) ON DELETE CASCADE,
          from_state circuit_state_type,
          to_state circuit_state_type NOT NULL,
          reason TEXT,
          fail_count INTEGER DEFAULT 0,
          detail JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      console.log("  + created circuit_history table");

      await client.query(`CREATE INDEX idx_circuit_history_vm_id ON circuit_history(vendor_model_id)`);
      await client.query(`CREATE INDEX idx_circuit_history_created_at ON circuit_history(created_at)`);
      console.log("  + created circuit_history indexes");
    } else {
      console.log("  ~ circuit_history table already exists");
    }

    // ── 5. Add circuit breaker columns to vendor_models ──
    const columns = [
      { name: 'circuit_state', type: 'circuit_state_type', notNull: true, default: "'closed'" },
      { name: 'circuit_opened_at', type: 'TIMESTAMPTZ', notNull: false },
      { name: 'circuit_retry_after', type: 'TIMESTAMPTZ', notNull: false },
      { name: 'circuit_fail_count', type: 'INTEGER', notNull: true, default: '0' },
    ];

    for (const col of columns) {
      const colExists = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'vendor_models' AND column_name = $1
      `, [col.name]);

      if (colExists.rows.length === 0) {
        let sql = `ALTER TABLE vendor_models ADD COLUMN ${col.name} ${col.type}`;
        if (col.notNull) sql += ' NOT NULL';
        if (col.default !== undefined) sql += ` DEFAULT ${col.default}`;
        await client.query(sql);
        console.log(`  + added vendor_models.${col.name}`);
      } else {
        console.log(`  ~ vendor_models.${col.name} already exists`);
      }
    }

    // ── 6. Create indexes on vendor_models circuit columns ──
    const idxExists = await client.query(`
      SELECT 1 FROM pg_indexes WHERE indexname = 'idx_vendor_models_circuit_state'
    `);
    if (idxExists.rows.length === 0) {
      await client.query(`CREATE INDEX idx_vendor_models_circuit_state ON vendor_models(circuit_state)`);
      console.log("  + created idx_vendor_models_circuit_state index");
    }

    // ── 7. Materialized view for daily call stats ──
    const mvExists = await client.query(`
      SELECT 1 FROM pg_matviews WHERE matviewname = 'daily_call_stats'
    `);
    if (mvExists.rows.length === 0) {
      await client.query(`
        CREATE MATERIALIZED VIEW daily_call_stats AS
        SELECT 
          date_trunc('day', created_at) AS stat_date,
          model_id, model_name, vendor_name, user_id,
          SUM(total_tokens) AS total_tokens,
          SUM(prompt_tokens) AS prompt_tokens,
          SUM(completion_tokens) AS completion_tokens,
          SUM(cost) AS total_cost,
          COUNT(*) AS call_count,
          AVG(duration_ms) AS avg_duration_ms
        FROM call_logs
        WHERE status = 'success'
        GROUP BY 1, 2, 3, 4, 5
      `);
      console.log("  + created daily_call_stats materialized view");

      await client.query(`CREATE INDEX idx_daily_call_stats_date ON daily_call_stats(stat_date)`);
      await client.query(`CREATE INDEX idx_daily_call_stats_model ON daily_call_stats(stat_date, model_id)`);
      console.log("  + created daily_call_stats indexes");
    } else {
      console.log("  ~ daily_call_stats materialized view already exists");
    }

    await client.query("COMMIT");
    console.log("\n✅ Migration complete: quotas + circuit breaker + materialized view");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("\n❌ Migration failed:", e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
