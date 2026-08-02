import pg from "pg";
const { Pool } = pg;
const pool = new Pool({
  connectionString: "postgres://postgres:***@localhost:5432/threecloud_v2",
});
try {
  const r = await pool.query("SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_name='account_deletion_requests')");
  console.log("表存在:", r.rows[0].exists);
} catch (e) {
  console.error(e.message);
} finally {
  await pool.end();
}
