// ============================================================
//  Migration: Create user_real_name_reviews table
//  2026-06-28
// ============================================================

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const exists = await client.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_real_name_reviews')`
    );

    if (!exists.rows[0].exists) {
      await client.query(`
        CREATE TABLE user_real_name_reviews (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          version INTEGER NOT NULL,
          real_name VARCHAR(100),
          id_number VARCHAR(30),
          id_front_image VARCHAR(500),
          id_back_image VARCHAR(500),
          company_name VARCHAR(255),
          company_reg_number VARCHAR(50),
          business_license VARCHAR(500),
          bank_name VARCHAR(255),
          bank_account VARCHAR(100),
          bank_address VARCHAR(500),
          invoice_title VARCHAR(255),
          invoice_tax_id VARCHAR(50),
          status real_name_status NOT NULL DEFAULT 'pending_review',
          reviewer_id INTEGER REFERENCES users(id),
          reject_reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          reviewed_at TIMESTAMPTZ
        )
      `);

      await client.query(
        "CREATE UNIQUE INDEX user_real_name_user_version_idx ON user_real_name_reviews(user_id, version)"
      );
      await client.query(
        "CREATE INDEX user_real_name_user_id_idx ON user_real_name_reviews(user_id)"
      );
      await client.query(
        "CREATE INDEX user_real_name_status_idx ON user_real_name_reviews(status)"
      );

      // Migrate existing real-name data into the history table
      const existingUsers = await client.query(`
        SELECT id, real_name, id_number, id_front_image, id_back_image,
               company_name, company_reg_number, business_license,
               bank_name, bank_account, bank_address,
               invoice_title, invoice_tax_id,
               real_name_status, reject_reason
        FROM users
        WHERE real_name_status IS DISTINCT FROM 'unverified'
      `);

      let migrated = 0;
      for (const u of existingUsers.rows) {
        const status = u.real_name_status;
        const isReviewed = status === 'approved' || status === 'rejected';
        await client.query(`
          INSERT INTO user_real_name_reviews
            (user_id, version, real_name, id_number, id_front_image, id_back_image,
             company_name, company_reg_number, business_license,
             bank_name, bank_account, bank_address,
             invoice_title, invoice_tax_id,
             status, reject_reason, created_at, reviewed_at)
          VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), $16)
        `, [
          u.id, 1,
          u.real_name, u.id_number, u.id_front_image, u.id_back_image,
          u.company_name, u.company_reg_number, u.business_license,
          u.bank_name, u.bank_account, u.bank_address,
          u.invoice_title, u.invoice_tax_id,
          status, u.reject_reason,
          isReviewed ? new Date() : null,
        ]);
        migrated++;
      }

      console.log(`  + user_real_name_reviews table + indexes`);
      console.log(`  + migrated ${migrated} existing records`);
    } else {
      console.log("  ~ user_real_name_reviews already exists");
    }

    await client.query("COMMIT");
    console.log("\n✅ Real-name reviews migration complete");
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
