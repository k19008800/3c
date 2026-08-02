import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, "../migrations/0023_account_deletion.sql"), "utf8");
console.log("SQL 长度:", sql.length, "bytes");

const pool = new Pool({
  user: "postgres",
  password: "postgres",
  host: "localhost",
  port: 5432,
  database: "threecloud_v2",
});
try {
  await pool.query(sql);
  console.log("✅ 账号注销表创建完成");
} catch (e) {
  console.error("❌ 失败:", e.message);
} finally {
  await pool.end();
}
