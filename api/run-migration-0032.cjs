/**
 * 0032 迁移执行器 — users.language（i18n 用户语言偏好，Gate-1）
 *
 * 用途：手工执行 0032_user_language_i18n.sql（users 新增 language 列，非空默认 zh-CN）。
 * 背景：遵循 0017+ 手工迁移惯例**不登记 meta/_journal.json** → drizzle migrate()
 *       （journal 驱动）不会执行本文件，必须由本执行器覆盖。
 *       测试库路径：test/ 下集成测试直连本地 threecloud_v3，本执行器对同一库
 *       执行一次即同时覆盖测试库初始化路径。
 *
 * 用法：node run-migration-0032.cjs  （DATABASE_URL 可用环境变量覆盖，默认本地三个）
 *
 * 幂等：SQL 内使用 ADD COLUMN IF NOT EXISTS，可安全重跑。
 *
 * @see docs/多语言i18n改造方案.md §2.3（users.language，≤1 条幂等 migration）
 * @see api/run-migration-0031.cjs（同模式 runner 参照）
 */
const { readFileSync } = require('fs');
const { join } = require('path');
const postgres = require('postgres');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/threecloud_v3';
const MIGRATION_FILE = '0032_user_language_i18n.sql';

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
  const p = join(__dirname, 'src', 'db', 'migrations', MIGRATION_FILE);
  const content = readFileSync(p, 'utf-8');
  console.log(`▶ ${MIGRATION_FILE} (${content.length} chars)`);
  try {
    await sql.unsafe(content);
    console.log(`  ✅ ${MIGRATION_FILE} applied`);
  } catch (err) {
    // 幂等：重复执行报错时检查目标对象是否已存在（与 run-migration-0031.cjs 同模式）
    console.warn(`  ⚠️ ${MIGRATION_FILE} 执行异常: ${err.message}`);
    console.warn('  （若为"column already exists"类错误，属幂等重跑，可忽略）');
  }

  // 校验：users.language 存在且带默认值
  const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'language'
  `;
  if (cols.length > 0) {
    const c = cols[0];
    console.log(`  ✅ users.${c.column_name} ${c.data_type} null=${c.is_nullable} default=${c.column_default}`);
  } else {
    console.warn('  ⚠️ users.language 列未找到 — 请检查 0032 SQL 是否执行成功');
  }

  await sql.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});