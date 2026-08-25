/**
 * 存量余额账户修复（RECT-2026-USER-DRILL-002 / R1）
 *
 * 为「无 customer_balances 行」的历史用户幂等补建零余额账户（等价于注册 initBalance /
 * creditBalance 自动建户语义），并写一条审计（action='balance.bulk_auto_create'）。
 *
 * 用法：node scripts/fix-missing-balance-accounts.cjs
 * 幂等：可重复执行；已建行的用户跳过。
 */
const { execSync } = require('child_process');

const PSQL = '"C:/Program Files/PostgreSQL/17/bin/psql" -h localhost -U postgres -d threecloud_v3 -v ON_ERROR_STOP=1 -t -A';

function run(sql) {
  return execSync(`${PSQL} -c "${sql.replace(/"/g, '\\"')}"`, {
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: 'postgres' },
  }).trim();
}

function main() {
  // 1. 补建缺失余额行（幂等；单行 SQL 避免跨进程换行截断）
  const inserted = run(
    `WITH missing AS (SELECT u.id FROM users u WHERE NOT EXISTS (SELECT 1 FROM customer_balances cb WHERE cb.user_id = u.id)), created AS (INSERT INTO customer_balances (user_id, total_balance, available_balance, frozen_balance, currency) SELECT id, 0, 0, 0, 'CNY' FROM missing RETURNING user_id) SELECT count(*) FROM created;`,
  );
  console.log(`✅ 补建余额账户 ${inserted} 个（幂等；重复执行返回 0）`);

  // 2. 审计一条（避免每用户一条噪音；对账可定位来源）
  if (Number(inserted) > 0) {
    const auditCount = run(
      `INSERT INTO audit_logs (user_id, action, resource, resource_id, details, ip_address) SELECT NULL, 'balance.bulk_auto_create', 'customer_balance', NULL, jsonb_build_object('count', ${inserted}, 'source', 'fix-missing-balance-accounts'), '127.0.0.1' RETURNING id;`,
    );
    console.log(`📝 已写审计 balance.bulk_auto_create（id=${auditCount}）`);
  } else {
    console.log('ℹ️ 无缺失账户，跳过审计');
  }
}

try {
  main();
} catch (e) {
  console.error('FATAL:', e.message);
  process.exit(1);
}
