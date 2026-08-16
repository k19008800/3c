// 一次性工具：把 suppliers.allowed_groups 迁移应用到本地 threecloud_v3（幂等）
// 用法（api 目录下）：node scripts/apply-allowed-groups-migration.mjs
import postgres from 'postgres';

const sql = postgres('postgres://postgres:postgres@localhost:5432/threecloud_v3', { max: 1 });

try {
  const cols = await sql`
    select column_name from information_schema.columns
    where table_name = 'suppliers' order by ordinal_position
  `;
  console.log('suppliers columns:', cols.map((c) => c.column_name).join(', '));

  const has = cols.some((c) => c.column_name === 'allowed_groups');
  if (has) {
    console.log('allowed_groups 已存在，跳过');
  } else {
    await sql`ALTER TABLE "suppliers" ADD COLUMN "allowed_groups" jsonb DEFAULT '[]'`;
    console.log('已添加 suppliers.allowed_groups (jsonb DEFAULT \'[]\')');
  }
} finally {
  await sql.end();
}
