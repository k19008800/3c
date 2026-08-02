import pg from "pg";
const { Pool } = pg;
// 尝试不带密码
const pool = new Pool({
  connectionString: "postgres://postgres:***@localhost:5432/threecloud_v2",
});
try {
  const r = await pool.query("SELECT current_database(), version()");
  console.log("连接成功:", r.rows[0]);
} catch (e) {
  console.error("连接失败:", e.message);
} finally {
  await pool.end();
}
