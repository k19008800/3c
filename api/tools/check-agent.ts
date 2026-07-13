import pg from "pg";

const { Pool } = pg;
const p = new Pool({ connectionString: "postgres://postgres:postgres@localhost:5432/threecloud" });

async function main() {
  // 1. agents 表的列
  const cols = await p.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'agents' ORDER BY ordinal_position");
  console.log("agents columns:", cols.rows.map(c => c.column_name).join(", "));

  // 2. 用户信息
  const u = await p.query("SELECT * FROM users WHERE email = '13819008800@163.com'");
  console.log("\n=== 用户 ===");
  console.table(u.rows);

  if (u.rows.length > 0) {
    const uid = u.rows[0].id;

    // 3. 代理商信息
    const a = await p.query("SELECT * FROM agents WHERE user_id = $1", [uid]);
    console.log("\n=== 代理商 ===");
    console.table(a.rows);

    // 4. 兑换码批次
    const b = await p.query("SELECT id, name, amount, total_count, used_count, status, note, created_at FROM redemption_batches WHERE creator_id = $1 ORDER BY created_at DESC", [uid]);
    console.log("\n=== 兑换码批次 ===");
    console.table(b.rows);
  }

  await p.end();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
