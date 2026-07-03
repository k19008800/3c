// ============================================================
//  Migration: Create ip_geo_blocks table for GeoIP CSV import
//  - CIDR network with GIST index for containment queries (>>=)
//  - Risk flags: anonymous_proxy, anycast, satellite_provider
//  2026-06-29
// ============================================================

import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/threecloud",
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if table exists
    const result = await client.query(`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ip_geo_blocks')
    `);

    if (result.rows[0].exists) {
      console.log("  ~ ip_geo_blocks 已存在，跳过");
      await client.query("COMMIT");
      return;
    }

    await client.query(`
      CREATE TABLE ip_geo_blocks (
        id                              SERIAL PRIMARY KEY,
        network                         cidr NOT NULL,
        geoname_id                      INTEGER,
        registered_country_geoname_id   INTEGER,
        represented_country_geoname_id  INTEGER,
        is_anonymous_proxy              BOOLEAN NOT NULL DEFAULT FALSE,
        is_satellite_provider           BOOLEAN NOT NULL DEFAULT FALSE,
        is_anycast                      BOOLEAN NOT NULL DEFAULT FALSE,
        postal_code                     VARCHAR(20),
        latitude                        DOUBLE PRECISION,
        longitude                       DOUBLE PRECISION,
        accuracy_radius                 INTEGER,
        created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("  + ip_geo_blocks 表已创建");

    // Unique index on network (for ON CONFLICT)
    await client.query(
      "CREATE UNIQUE INDEX idx_geo_blocks_network ON ip_geo_blocks(network)"
    );
    console.log("  + 唯一索引 (network)");

    // GIST index for IP containment queries: network >>= '1.2.3.4'::inet
    await client.query(
      "CREATE INDEX idx_geo_blocks_gist ON ip_geo_blocks USING GIST (network inet_ops)"
    );
    console.log("  + GIST 空间索引 (inet_ops)");

    await client.query("COMMIT");
    console.log("\n✅ Migration complete");
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
