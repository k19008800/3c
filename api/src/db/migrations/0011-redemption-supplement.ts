// ============================================================
//  3cloud (3C) — Migration: 兑换码系统补充字段与新表
//
//  1. 创建 code_templates 表（批次模板）
//  2. 创建 code_notification_logs 表（通知日志）
//  3. 为 redemption_codes 补充财务字段
//  4. 为 redemption_logs 补充追踪字段
//  5. 为 campaigns 补充统计字段
// ============================================================

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/threecloud",
});

async function columnExists(table: string, column: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2",
    [table, column]
  );
  return result.rows.length > 0;
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── 1. code_templates 表 ──
    const ctExists = await client.query(
      "SELECT 1 FROM pg_class WHERE relname = 'code_templates'"
    );
    if (ctExists.rows.length > 0) {
      console.log("  ~ code_templates 已存在，跳过");
    } else {
      await client.query(`
        CREATE TABLE code_templates (
          id              BIGSERIAL PRIMARY KEY,
          name            VARCHAR(128) NOT NULL,
          type            VARCHAR(20) NOT NULL DEFAULT 'fixed_token',
          token_amount    NUMERIC(18,6) NOT NULL,
          valid_days      INTEGER,
          max_per_user    INTEGER NOT NULL DEFAULT 1,
          user_scope      VARCHAR(20) NOT NULL DEFAULT 'all',
          remark          TEXT,
          created_by_type VARCHAR(10) NOT NULL,
          created_by_id   BIGINT NOT NULL,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await client.query(
        "CREATE INDEX IF NOT EXISTS idx_code_templates_creator ON code_templates(created_by_type, created_by_id)"
      );
      console.log("  + code_templates 表已创建");
    }

    // ── 2. code_notification_logs 表 ──
    const cnlExists = await client.query(
      "SELECT 1 FROM pg_class WHERE relname = 'code_notification_logs'"
    );
    if (cnlExists.rows.length > 0) {
      console.log("  ~ code_notification_logs 已存在，跳过");
    } else {
      await client.query(`
        CREATE TABLE code_notification_logs (
          id              BIGSERIAL PRIMARY KEY,
          code_id         BIGINT REFERENCES redemption_codes(id),
          user_id         BIGINT REFERENCES users(id),
          notify_type     VARCHAR(30) NOT NULL,
          channel         VARCHAR(20) NOT NULL,
          title           VARCHAR(128),
          content         TEXT,
          status          VARCHAR(20) NOT NULL DEFAULT 'pending',
          sent_at         TIMESTAMPTZ,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await client.query(
        "CREATE INDEX IF NOT EXISTS idx_codenotif_user ON code_notification_logs(user_id)"
      );
      await client.query(
        "CREATE INDEX IF NOT EXISTS idx_codenotif_status ON code_notification_logs(status)"
      );
      console.log("  + code_notification_logs 表已创建");
    }

    // ── 3. redemption_codes 补充字段 ──
    const codeCols = [
      { name: "type", def: "VARCHAR(20) DEFAULT 'fixed_token'" },
      { name: "cost_price", def: "BIGINT DEFAULT 0" },
      { name: "face_price", def: "BIGINT" },
      { name: "freeze_id", def: "BIGINT" },
      { name: "agent_id", def: "BIGINT REFERENCES agents(id)" },
      { name: "batch_no", def: "VARCHAR(32)" },
      { name: "max_per_user", def: "INTEGER NOT NULL DEFAULT 1" },
      { name: "min_consumption", def: "BIGINT DEFAULT 0" },
      { name: "user_scope", def: "VARCHAR(20) NOT NULL DEFAULT 'all'" },
      { name: "user_group_id", def: "BIGINT" },
      { name: "valid_from", def: "TIMESTAMPTZ NOT NULL DEFAULT NOW()" },
      { name: "expired_at", def: "TIMESTAMPTZ" },
      { name: "pre_status", def: "VARCHAR(20)" },
      { name: "tags", def: "JSONB DEFAULT '[]'" },
      { name: "risk_score", def: "INTEGER DEFAULT 0" },
      { name: "risk_reason", def: "VARCHAR(256)" },
    ];

    for (const col of codeCols) {
      const exists = await columnExists("redemption_codes", col.name);
      if (exists) {
        console.log(`  ~ redemption_codes.${col.name} 已存在，跳过`);
      } else {
        await client.query(`ALTER TABLE redemption_codes ADD COLUMN ${col.name} ${col.def}`);
        console.log(`  + redemption_codes.${col.name} 已添加`);
      }
    }

    // 索引
    await client.query("CREATE INDEX IF NOT EXISTS idx_codes_agent ON redemption_codes(agent_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_codes_batch ON redemption_codes(batch_no)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_codes_user_scope ON redemption_codes(user_scope)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_codes_risk ON redemption_codes(risk_score) WHERE risk_score > 0");
    await client.query("CREATE INDEX IF NOT EXISTS idx_codes_valid ON redemption_codes(valid_from, expired_at)");
    console.log("  + redemption_codes 索引已创建");

    // ── 4. redemption_logs 补充字段 ──
    const logCols = [
      { name: "code_snapshot", def: "VARCHAR(32)" },
      { name: "token_received", def: "BIGINT" },
      { name: "balance_before", def: "BIGINT" },
      { name: "balance_after", def: "BIGINT" },
      { name: "balance_log_id", def: "BIGINT REFERENCES balance_logs(id)" },
      { name: "source_type", def: "VARCHAR(10)" },
      { name: "source_id", def: "BIGINT" },
      { name: "user_agent", def: "TEXT" },
      { name: "device_fingerprint", def: "VARCHAR(128)" },
      { name: "cost_amount", def: "BIGINT" },
      { name: "face_amount", def: "BIGINT" },
    ];

    for (const col of logCols) {
      const exists = await columnExists("redemption_logs", col.name);
      if (exists) {
        console.log(`  ~ redemption_logs.${col.name} 已存在，跳过`);
      } else {
        await client.query(`ALTER TABLE redemption_logs ADD COLUMN ${col.name} ${col.def}`);
        console.log(`  + redemption_logs.${col.name} 已添加`);
      }
    }

    // 索引
    await client.query("CREATE INDEX IF NOT EXISTS idx_redeem_logs_source ON redemption_logs(source_type, source_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_redeem_logs_fingerprint ON redemption_logs(device_fingerprint)");
    console.log("  + redemption_logs 索引已创建");

    // ── 5. campaigns 补充字段 ──
    const campCols = [
      { name: "code_count", def: "INTEGER NOT NULL DEFAULT 0" },
      { name: "used_count", def: "INTEGER NOT NULL DEFAULT 0" },
      { name: "user_reached", def: "INTEGER NOT NULL DEFAULT 0" },
      { name: "cost_amount", def: "BIGINT DEFAULT 0" },
      { name: "revenue_amount", def: "BIGINT DEFAULT 0" },
    ];

    for (const col of campCols) {
      const exists = await columnExists("campaigns", col.name);
      if (exists) {
        console.log(`  ~ campaigns.${col.name} 已存在，跳过`);
      } else {
        await client.query(`ALTER TABLE campaigns ADD COLUMN ${col.name} ${col.def}`);
        console.log(`  + campaigns.${col.name} 已添加`);
      }
    }

    await client.query("COMMIT");
    console.log("\n✅ 0011-redemption-supplement Migration complete");
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
