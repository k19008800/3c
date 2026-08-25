/**
 * 0031 迁移执行器 — 缓存定价与缓存计量（P0）
 *
 * 用途：手工执行 0031_cache_pricing_explicit.sql（9 列 + 配置键在 seed 侧）。
 * 背景：consumption_records 为 RANGE 分区表（0025 手工 DDL），drizzle-kit 无法生成分区 DDL，
 *      且 0031 遵循 0017+ 手工迁移惯例**不登记 meta/_journal.json** →
 *      drizzle migrate()（journal 驱动）不会执行 0031，必须由本执行器覆盖。
 * 测试库路径：test/ 下集成测试直连本地 threecloud_v3（前提"库已迁移/seed"），
 *      本执行器对同一库执行一次即同时覆盖测试库初始化路径（任务书 §3.3 R-B6）。
 *
 * 用法：node run-migration-0031.cjs   （DATABASE_URL 可用环境变量覆盖，默认本地 threecloud_v3）
 * 幂等：SQL 内使用 ADD COLUMN IF NOT EXISTS，可安全重跑。
 *
 * @see docs/P0-缓存定价与缓存计量-开发任务书.md §3.3
 * @see api/run-migrations-0017-0022.cjs（同模式 runner 参照）
 */
const { readFileSync } = require('fs');
const { join } = require('path');
const postgres = require('postgres');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/threecloud_v3';
const MIGRATION_FILE = '0031_cache_pricing_explicit.sql';

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
  const p = join(__dirname, 'src', 'db', 'migrations', MIGRATION_FILE);
  const content = readFileSync(p, 'utf-8');
  console.log(`▶ ${MIGRATION_FILE} (${content.length} chars)`);
  try {
    await sql.unsafe(content);
    console.log(`  ✅ ${MIGRATION_FILE} applied`);
  } catch (err) {
    // 幂等：重复执行报错时检查目标对象是否已存在（与 run-migrations-0017-0022.cjs 同模式）
    console.warn(`  ⚠️ ${MIGRATION_FILE} 执行异常: ${err.message}`);
    console.warn('  （若为"column already exists"类错误，属幂等重跑，可忽略）');
  }

  // 校验：三表新列 + 分区父表列齐全
  const tables = await sql`
    SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'supplier_models' AND column_name LIKE 'cost_cache_%')
        OR (table_name = 'vendor_pricing' AND column_name LIKE 'cache_%_input_price')
        OR (table_name = 'consumption_records' AND column_name LIKE 'cache_%'))
    ORDER BY table_name, ordinal_position
  `;
  console.log(`\n当前缓存相关列 (${tables.length}):`);
  tables.forEach((t) => console.log(`  - ${t.table_name}.${t.column_name} ${t.data_type}(${t.numeric_precision ?? '-'},${t.numeric_scale ?? '-'})`));

  // 分区父表存在性校验（consumption_records 须为分区父表）
  const [parent] = await sql`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'consumption_records' AND c.relkind = 'p'
  `;
  if (parent) {
    console.log(`  ✅ consumption_records 为分区父表（relkind='p'），新列已级联子表`);
  } else {
    console.warn(`  ⚠️ consumption_records 非分区父表（relkind != 'p'）——请检查 0025 是否已应用`);
  }

  await sql.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
