import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    // ────────── invoice_requests 表 ──────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        amount DECIMAL(18,6) NOT NULL,
        invoice_type VARCHAR(10) NOT NULL DEFAULT 'normal',
        invoice_title VARCHAR(255) NOT NULL,
        invoice_tax_id VARCHAR(50),
        bank_name VARCHAR(255),
        bank_account VARCHAR(100),
        company_address VARCHAR(500),
        company_phone VARCHAR(20),
        ref_order_id INTEGER REFERENCES recharge_orders(id),

        status VARCHAR(20) NOT NULL DEFAULT 'pending',

        reviewer_id INTEGER REFERENCES users(id),
        reviewed_at TIMESTAMPTZ,
        reject_reason TEXT,

        invoice_no VARCHAR(64),
        invoice_file_url VARCHAR(500),
        issued_at TIMESTAMPTZ,
        issued_by INTEGER REFERENCES users(id),

        express_company VARCHAR(100),
        express_no VARCHAR(100),

        remark TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("  + created invoice_requests table");

    // 索引
    await client.query(`CREATE INDEX IF NOT EXISTS inv_user_idx ON invoice_requests(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS inv_status_idx ON invoice_requests(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS inv_created_idx ON invoice_requests(created_at DESC)`);
    console.log("  + created invoice_requests indexes");

    // ────────── refund_requests 表 ──────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS refund_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        amount DECIMAL(18,6) NOT NULL,
        refund_type VARCHAR(20) NOT NULL,
        reason TEXT NOT NULL,
        ref_call_log_id INTEGER,
        ref_order_id INTEGER REFERENCES recharge_orders(id),

        status VARCHAR(20) NOT NULL DEFAULT 'pending',

        reviewer_id INTEGER REFERENCES users(id),
        reviewed_at TIMESTAMPTZ,
        reject_reason TEXT,
        completed_at TIMESTAMPTZ,

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("  + created refund_requests table");

    await client.query(`CREATE INDEX IF NOT EXISTS ref_user_idx ON refund_requests(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS ref_status_idx ON refund_requests(status)`);
    console.log("  + created refund_requests indexes");

    console.log("\n✅ Invoice & refund tables migration complete");
  } catch (e) {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
