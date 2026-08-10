/**
 * 全流程数据核对 — 直接从 PostgreSQL 读取三角色留存数据与记账一致性
 * 用法：node scripts/verify-fullflow-data.cjs
 */
const path = require('path');
const postgres = require(path.join(__dirname, '..', 'api', 'node_modules', 'postgres'));

const sql = postgres('postgres://postgres:postgres@localhost:5432/threecloud_v3');

async function q(label, query) {
  const rows = await query;
  console.log(`\n── ${label} ──`);
  for (const row of rows) console.log(Object.values(row).join(' | '));
}

(async () => {
  const uid = sql`(SELECT id FROM users WHERE email='verify-user@3cloud.dev')`;

  await q('BALANCE', sql`SELECT u.email, cb.available_balance, cb.version FROM customer_balances cb JOIN users u ON u.id=cb.user_id WHERE u.email='verify-user@3cloud.dev'`);
  await q('RECHARGE_ORDERS', sql`SELECT order_no, amount, status, paid_at IS NOT NULL AS paid FROM recharge_orders WHERE user_id=${uid} ORDER BY id DESC LIMIT 3`);
  await q('BT_RECHARGE', sql`SELECT COUNT(*)::int AS cnt, SUM(amount::numeric) AS sum FROM balance_transactions WHERE reference_type='recharge_order' AND user_id=${uid}`);
  await q('CONSUMPTION_RECORDS', sql`SELECT COUNT(*)::int AS cnt, SUM(cost::numeric) AS cost, SUM(total_tokens) AS tokens FROM consumption_records WHERE user_id=${uid}`);
  await q('BT_CONSUMPTION', sql`SELECT COUNT(*)::int AS cnt, SUM(amount::numeric) AS sum FROM balance_transactions WHERE type='consumption' AND user_id=${uid}`);
  await q('USERS', sql`SELECT id, email, role FROM users WHERE email LIKE 'verify-%@3cloud.dev' ORDER BY id`);
  await q('AGENT', sql`SELECT u.id, u.email, u.role, a.level, a.commission_rate, a.status, a.invite_code FROM users u LEFT JOIN agents a ON a.user_id=u.id WHERE u.email='verify-agent@3cloud.dev'`);

  // 记账一致性：消费记录 sum(cost) 应等于 balance_transactions 中 consumption 的 |sum(amount)|
  // 注：balance_transactions 消费类型记负数（扣减），consumption_records.cost 记正数
  const [con] = await sql`SELECT COALESCE(SUM(cost::numeric),0) AS c FROM consumption_records WHERE user_id=${uid}`;
  const [btc] = await sql`SELECT COALESCE(SUM(amount::numeric),0) AS a FROM balance_transactions WHERE type='consumption' AND user_id=${uid}`;
  const cost = Number(con.c), billed = Math.abs(Number(btc.a));
  console.log(`\n🎯 消费记账一致性: consumption_records sum(cost)=${cost} vs |balance_transactions sum(amount)|=${billed} → ${Math.abs(cost - billed) < 0.000001 ? '一致 ✅' : `不一致 ❌ 差 ${(cost - billed).toFixed(8)}`}`);

  // 余额核对：10(赠金) + 500(充值) - 消费 应等于当前余额
  const [bal] = await sql`SELECT available_balance::numeric AS b FROM customer_balances cb JOIN users u ON u.id=cb.user_id WHERE u.email='verify-user@3cloud.dev'`;
  const expected = Number((10 + 500 - cost).toFixed(8));
  const actual = Number(bal.b);
  console.log(`🎯 余额核对: 10+500-消费(${cost}) = ${expected} vs 实际余额 ${actual} → ${Math.abs(expected - actual) < 0.000001 ? '一致 ✅' : `不一致 ❌ 差 ${(expected - actual).toFixed(8)}`}`);

  await sql.end();
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
