// ============================================================
//  3cloud (3C) — 为无 API Key 的活跃用户创建默认密钥
//  用法: cd api && npx tsx ../scripts/create-default-keys.ts
// ============================================================
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const { Pool } = pg;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const result = await pool.query(`
    SELECT u.id, u.email, u.nickname
    FROM users u
    WHERE u.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM api_keys k WHERE k.user_id = u.id)
    ORDER BY u.id
  `);

  const users = result.rows;
  if (users.length === 0) {
    console.log("所有活跃用户已有 API Key，无需创建。");
    await pool.end();
    return;
  }

  console.log(`将为 ${users.length} 个用户创建默认 API Key:\n`);

  for (const user of users) {
    const rawKey = `sk-3c-${randomBytes(48).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 8);

    await pool.query(
      `INSERT INTO api_keys (user_id, name, key_hash, key_prefix, status, created_at)
       VALUES ($1, '默认密钥', $2, $3, true, NOW())`,
      [user.id, keyHash, keyPrefix]
    );
    console.log(`  ✅ ${(user.email || "?").padEnd(30)} ${user.nickname || ""}`);
    console.log(`     Key: ${rawKey}`);
  }

  console.log(`\n创建完成: ${users.length} 个 API Key`);
  await pool.end();
}

main().catch((err) => {
  console.error("脚本执行失败:", err);
  process.exit(1);
});
