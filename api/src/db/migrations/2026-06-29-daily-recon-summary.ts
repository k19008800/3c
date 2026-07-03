// ============================================================
//  Migration: daily_recon_summary — 日对账汇总表
//  2026-06-29
// ============================================================

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const exists = await client.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'daily_recon_summary')`
    );
    if (!exists.rows[0].exists) {
      await client.query(`
        CREATE TABLE daily_recon_summary (
          id SERIAL PRIMARY KEY,
          report_date VARCHAR(10) NOT NULL UNIQUE,
          -- 佣金
          commission_count INTEGER NOT NULL DEFAULT 0,
          commission_total DECIMAL(18,6) DEFAULT '0.000000',
          commission_fee DECIMAL(18,6) DEFAULT '0.000000',
          commission_net DECIMAL(18,6) DEFAULT '0.000000',
          -- 提现
          withdraw_count INTEGER NOT NULL DEFAULT 0,
          withdraw_total DECIMAL(18,6) DEFAULT '0.000000',
          withdraw_fee DECIMAL(18,6) DEFAULT '0.000000',
          withdraw_actual DECIMAL(18,6) DEFAULT '0.000000',
          -- 充值
          recharge_count INTEGER NOT NULL DEFAULT 0,
          recharge_total DECIMAL(18,6) DEFAULT '0.000000',
          -- 消耗
          consumption_total DECIMAL(18,6) DEFAULT '0.000000',
          -- 资金平衡
          balance_diff DECIMAL(18,6) DEFAULT '0.000000',
          is_balanced BOOLEAN NOT NULL DEFAULT TRUE,
          -- 元数据
          version INTEGER NOT NULL DEFAULT 1,
          computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE UNIQUE INDEX daily_recon_summary_date_idx ON daily_recon_summary(report_date);
      `);

      await client.query(`
        CREATE INDEX daily_recon_summary_balanced_idx ON daily_recon_summary(is_balanced);
      `);

      console.log("✅ daily_recon_summary table created");
    } else {
      console.log("ℹ️ daily_recon_summary already exists");
    }

    await client.query("COMMIT");
    console.log("✅ Migration completed");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
