/**
 * 佣金工作台 E2E 造数脚本（幂等：重复执行会新增一轮数据而非覆盖）
 *
 * 生成：
 *   - agent-demo@3cloud.dev  (代理 A, 比例 20%) + agent-demo2@3cloud.dev (代理 B, 比例 10%)
 *   - demo-cust@3cloud.dev / demo-cust2@3cloud.dev 两个已绑定客户 + 一笔未绑定客户
 *   - 多笔 consumption_records → generateCommissionForConsumption（走真实结算服务）
 *   - 代理 A 一笔 ¥150 待审核提现（模拟代理已申请，余额已冻结）
 *
 * 用法: pnpm --filter @3cloud/api db:seed:e2e  （或 npx tsx scripts/e2e-commission-seed.ts）
 */
import bcrypt from 'bcryptjs';
import { db, schema } from '../src/db';
import { eq, sql } from 'drizzle-orm';
import { generateCommissionForConsumption } from '../src/services/agent/commission';

const AGENT_EMAIL = 'agent-demo@3cloud.dev';
const AGENT2_EMAIL = 'agent-demo2@3cloud.dev';
const CUST_EMAIL = 'demo-cust@3cloud.dev';
const CUST2_EMAIL = 'demo-cust2@3cloud.dev';
const DEMO_PASSWORD = 'Demo@1234';

async function ensureUser(email: string, name: string, role: 'agent' | 'customer'): Promise<number> {
  const existing = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing[0]) return existing[0].id;
  const [u] = await db.insert(schema.users).values({
    email,
    passwordHash: bcrypt.hashSync(DEMO_PASSWORD, 12),
    name,
    role,
    status: 'active',
  }).returning({ id: schema.users.id });
  return u!.id;
}

async function ensureBalance(userId: number, amount: string) {
  await db.insert(schema.customerBalances).values({
    userId, totalBalance: amount, availableBalance: amount, frozenBalance: '0', currency: 'CNY',
  }).onConflictDoNothing({ target: schema.customerBalances.userId });
}

async function main() {
  // 代理 A
  const agentAUserId = await ensureUser(AGENT_EMAIL, '演示代理-张总', 'agent');
  let [agentA] = await db.select({ id: schema.agents.id }).from(schema.agents).where(eq(schema.agents.userId, agentAUserId)).limit(1);
  if (!agentA) {
    const [ins] = await db.insert(schema.agents).values({
      userId: agentAUserId, commissionRate: '20.00', availableBalance: '0', totalEarnings: '0',
    }).returning({ id: schema.agents.id });
    agentA = ins;
  }
  console.log(`✅ 代理 A id=${agentA.id}（比例 20%）`);

  // 代理 B
  const agentBUserId = await ensureUser(AGENT2_EMAIL, '演示代理-李总', 'agent');
  let [agentB] = await db.select({ id: schema.agents.id }).from(schema.agents).where(eq(schema.agents.userId, agentBUserId)).limit(1);
  if (!agentB) {
    const [ins] = await db.insert(schema.agents).values({
      userId: agentBUserId, commissionRate: '10.00', availableBalance: '0', totalEarnings: '0',
    }).returning({ id: schema.agents.id });
    agentB = ins;
  }
  console.log(`✅ 代理 B id=${agentB.id}（比例 10%）`);

  // 客户 1（绑代理 A，余额 8000）+ 客户 2（绑代理 B，余额 5000）
  const cust1 = await ensureUser(CUST_EMAIL, '演示客户-王五', 'customer');
  await ensureBalance(cust1, '8000.0000');
  const cust2 = await ensureUser(CUST2_EMAIL, '演示客户-赵六', 'customer');
  await ensureBalance(cust2, '5000.0000');

  await db.insert(schema.agentCustomers).values({
    agentId: agentA.id, customerUserId: cust1, status: 'active', source: 'e2e',
  }).onConflictDoNothing();
  await db.insert(schema.agentCustomers).values({
    agentId: agentB.id, customerUserId: cust2, status: 'active', source: 'e2e',
  }).onConflictDoNothing();

  // 每轮插入 3 笔消费（代理 A 两笔 + 代理 B 一笔），走真实佣金结算服务
  async function createConsumption(userId: number, cost: string): Promise<number> {
    const requestId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [cr] = await db.insert(schema.consumptionRecords).values({
      userId,
      requestId,
      model: 'deepseek-chat',
      inputTokens: 500,
      outputTokens: 300,
      totalTokens: 800,
      cost,
      trustUpstream: true,
      fallback: false,
      streamed: false,
      finishReason: 'stop',
    }).returning({ id: schema.consumptionRecords.id });
    return cr!.id;
  }

  const plan = [
    { userId: cust1, cost: '120.0000' },   // 代理 A 20% → 24.00
    { userId: cust1, cost: '360.5000' },   // 代理 A 20% → 72.10
    { userId: cust2, cost: '88.0000' },    // 代理 B 10% → 8.80
  ];
  for (const p of plan) {
    const cid = await createConsumption(p.userId, p.cost);
    const comm = await generateCommissionForConsumption({ userId: p.userId, consumptionRecordId: cid, cost: p.cost });
    console.log(`✅ 消费 #${cid} ¥${p.cost} → 佣金#${comm?.id ?? '-'} ¥${comm?.amount ?? 0}`);
  }

  // 代理 A 一笔 ¥150 待审核提现（模拟已申请，余额按申请时口径冻结）
  const pendingWd = await db.insert(schema.agentWithdrawals).values({
    agentId: agentA.id,
    amount: '150.0000',
    method: 'bank',
    accountInfo: JSON.stringify({ bank_name: '招商银行', account_number: '6225****0001', account_holder: '张总' }),
    status: 'pending',
  }).returning({ id: schema.agentWithdrawals.id });
  await db.execute(sql`
    UPDATE agents SET available_balance = GREATEST(available_balance - 150.0000::numeric, 0) WHERE id = ${agentA.id}
  `);
  console.log(`✅ 代理 A 待审核提现 #${pendingWd[0]!.id} ¥150（余额已冻结）`);

  const [aA] = await db.select({ bal: schema.agents.availableBalance }).from(schema.agents).where(eq(schema.agents.id, agentA.id));
  const [aB] = await db.select({ bal: schema.agents.availableBalance }).from(schema.agents).where(eq(schema.agents.id, agentB.id));
  console.log(`\n📊 当前账本：代理A 可提现=${aA.bal} | 代理B 可提现=${aB.bal}`);
  console.log('✅ E2E 造数完成');
  process.exit(0);
}

main().catch((e) => {
  console.error('E2E seed 失败:', e);
  process.exit(1);
});
