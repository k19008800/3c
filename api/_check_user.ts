import { pool } from "./src/db/index";

async function main() {
  const r = await pool.query("SELECT email, role, status FROM users WHERE email = $1", ["admin@3cloud.dev"]);
  console.log("admin account:", JSON.stringify(r.rows, null, 2));
  
  const all = await pool.query("SELECT email, role, status FROM users LIMIT 10");
  console.log("all users:", JSON.stringify(all.rows, null, 2));
  
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
