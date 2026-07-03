import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const exists = await pool.query("SELECT 1 FROM pg_class WHERE relname = 'commission_daily_rollup'");
  if (exists.rows.length > 0) {
    console.log("✅ commission_daily_rollup already exists");
    await pool.end();
    return;
  }

  await pool.query(`
    CREATE TABLE commission_daily_rollup (
      id                      SERIAL PRIMARY KEY,
      agent_id                INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      report_date             VARCHAR(10) NOT NULL,
      total_records           INTEGER NOT NULL DEFAULT 0,
      total_call_cost         NUMERIC(18,6) DEFAULT '0.000000',
      total_commission_amount NUMERIC(18,6) DEFAULT '0.000000',
      total_fee_amount        NUMERIC(18,6) DEFAULT '0.000000',
      total_net_amount        NUMERIC(18,6) DEFAULT '0.000000',
      pending_count           INTEGER DEFAULT 0,
      settled_count           INTEGER DEFAULT 0,
      cancelled_count         INTEGER DEFAULT 0,
      pending_amount          NUMERIC(18,6) DEFAULT '0.000000',
      settled_amount          NUMERIC(18,6) DEFAULT '0.000000',
      cancelled_amount        NUMERIC(18,6) DEFAULT '0.000000',
      sale_count              INTEGER DEFAULT 0,
      renewal_count           INTEGER DEFAULT 0,
      activity_count          INTEGER DEFAULT 0,
      sale_amount             NUMERIC(18,6) DEFAULT '0.000000',
      renewal_amount          NUMERIC(18,6) DEFAULT '0.000000',
      activity_amount         NUMERIC(18,6) DEFAULT '0.000000',
      agent_total_commission  NUMERIC(18,6) DEFAULT '0.000000',
      agent_settled_commission NUMERIC(18,6) DEFAULT '0.000000',
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query("CREATE UNIQUE INDEX comm_rollup_agent_date_idx ON commission_daily_rollup (agent_id, report_date)");
  await pool.query("CREATE INDEX comm_rollup_date_idx ON commission_daily_rollup (report_date)");

  console.log("✅ commission_daily_rollup 表已创建");
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
