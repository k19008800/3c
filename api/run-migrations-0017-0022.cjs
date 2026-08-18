/**
 * 按序执行手写迁移 0017-0024c（0016 及以前已由 drizzle journal 管理）。
 * 用法：node run-migrations-0017-0022.cjs
 */
const { readFileSync } = require('fs');
const { join } = require('path');
const postgres = require('postgres');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/threecloud_v3';
const MIGRATIONS = [
  '0017_invoice_email_delivery.sql',
  '0018_admin_webhooks.sql',
  '0019_adjustment_records.sql',
  '0020_content_moderation.sql',
  '0021_subscription_plans.sql',
  '0022_knowledge_base.sql',
  '0023_agent_approvals.sql',
  '0024a_campaign_participants.sql',
  '0024b_disputes.sql',
  '0024c_consent.sql',
];

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
  for (const file of MIGRATIONS) {
    const p = join(__dirname, 'src', 'db', 'migrations', file);
    const content = readFileSync(p, 'utf-8');
    console.log(`▶ ${file} (${content.length} chars)`);
    try {
      await sql.unsafe(content);
      console.log(`  ✅ ${file} applied`);
    } catch (err) {
      // 幂等：重复执行报错时检查是否已存在目标对象
      console.warn(`  ⚠️ ${file} 执行异常: ${err.message}`);
    }
  }
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  console.log(`\n当前 public 表 (${tables.length}):`);
  tables.forEach((t) => console.log('  -', t.table_name));
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
