import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../src/db';
import { eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:***@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-agent-commission-secret',
  PORT: '3034',
};

describe('Agent Commission (实时结算 + 退款冲销)', () => {
  let app: FastifyInstance;
  let agentId: number;
  let customerId: number;
  let unboundedCustomerId: number;
  const agentRate = 15; // 15%

  // consumption_record_id 为 int4，Date.now() 会溢出 → 用时间截断的小自增 id（每次运行唯一）
  let nextCid = 400000 + (Date.now() % 500000);
  const nextConsumptionId = (): number => (nextCid += 1);

  /** 读取代理商当前可提现余额（numeric → number） */
  async function agentBalance(): Promise<number> {
    const rows = await db
      .select({ bal: schema.agents.availableBalance })
      .from(schema.agents)
      .where(eq(schema.agents.id, agentId))
      .limit(1);
    return Number(rows[0]?.bal ?? 0);
  }

  /** 读取某笔消费对应的佣金状态 */
  async function commissionStatus(consumptionRecordId: number): Promise<string | null> {
    const rows = await db
      .select({ status: schema.agentCommissions.status })
      .from(schema.agentCommissions)
      .where(eq(schema.agentCommissions.consumptionRecordId, consumptionRecordId));
    return rows[0]?.status ?? null;
  }

  beforeAll(async () => {
    app = await buildApp({ envOverrides: testEnv });
    await app.ready();

    // 代理商用户 + agents 行（初始余额 0，比例 15%）
    const agentEmail = `agent-comm-${Date.now()}@test.com`;
    const [agentUser] = await db.insert(schema.users).values({
      email: agentEmail,
      passwordHash: bcrypt.hashSync('Test1234!', 12),
      name: '佣金测试代理',
      role: 'agent',
    }).returning({ id: schema.users.id });
    const [agent] = await db.insert(schema.agents).values({
      userId: agentUser!.id,
      commissionRate: agentRate.toFixed(2),
      availableBalance: '0',
      totalEarnings: '0',
    }).returning({ id: schema.agents.id });
    agentId = agent!.id;

    // 已绑定客户（有余额）
    const customerEmail = `agent-cust-${Date.now()}@test.com`;
    const [customer] = await db.insert(schema.users).values({
      email: customerEmail,
      passwordHash: bcrypt.hashSync('Test1234!', 12),
      name: '佣金测试客户',
      role: 'customer',
    }).returning({ id: schema.users.id });
    customerId = customer!.id;
    await db.insert(schema.customerBalances).values({
      userId: customerId,
      totalBalance: '1000.0000',
      availableBalance: '1000.0000',
      frozenBalance: '0',
      currency: 'CNY',
    });
    await db.insert(schema.agentCustomers).values({
      agentId,
      customerUserId: customerId,
      status: 'active',
      source: 'test',
    });

    // 未绑定客户
    const ubEmail = `agent-ub-${Date.now()}@test.com`;
    const [ub] = await db.insert(schema.users).values({
      email: ubEmail,
      passwordHash: bcrypt.hashSync('Test1234!', 12),
      name: '未绑定客户',
      role: 'customer',
    }).returning({ id: schema.users.id });
    unboundedCustomerId = ub!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('生成：有 active 代理绑定 → 产生 settled 佣金 + 代理余额增加', async () => {
    const { generateCommissionForConsumption } = await import('../src/services/agent/commission');
    const cid = nextConsumptionId();
    const before = await agentBalance();

    const comm = await generateCommissionForConsumption({ userId: customerId, consumptionRecordId: cid, cost: '100.0000' });
    expect(comm).not.toBeNull();
    expect(comm!.status).toBe('settled');
    expect(comm!.settledAt).toBeTruthy();
    // 100 × 15% = 15.00
    expect(Number(comm!.amount)).toBeCloseTo(15, 2);
    expect(Number(comm!.rate)).toBeCloseTo(agentRate, 2);

    const after = await agentBalance();
    expect(after).toBeCloseTo(before + 15, 2);
  });

  it('生成：无代理绑定 → null（跳过）', async () => {
    const { generateCommissionForConsumption } = await import('../src/services/agent/commission');
    const res = await generateCommissionForConsumption({ userId: unboundedCustomerId, consumptionRecordId: nextConsumptionId(), cost: '50.0000' });
    expect(res).toBeNull();
  });

  it('生成：同笔消费重复调用幂等（唯一索引 onConflictDoNothing）', async () => {
    const { generateCommissionForConsumption } = await import('../src/services/agent/commission');
    const cid = nextConsumptionId();

    const first = await generateCommissionForConsumption({ userId: customerId, consumptionRecordId: cid, cost: '200.0000' });
    expect(first).not.toBeNull();
    const balAfterFirst = await agentBalance();

    const second = await generateCommissionForConsumption({ userId: customerId, consumptionRecordId: cid, cost: '200.0000' });
    expect(second).toBeNull();
    expect(await agentBalance()).toBeCloseTo(balAfterFirst, 2);

    const rows = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.agentCommissions)
      .where(eq(schema.agentCommissions.consumptionRecordId, cid));
    expect(Number(rows[0]?.count ?? 0)).toBe(1);
  });

  it('冲销：settled 佣金置 cancelled + 代理余额回冲', async () => {
    const { generateCommissionForConsumption, cancelCommissionsForConsumption } = await import('../src/services/agent/commission');
    const cid = nextConsumptionId();

    await generateCommissionForConsumption({ userId: customerId, consumptionRecordId: cid, cost: '80.0000' });
    expect(await commissionStatus(cid)).toBe('settled');
    const balWithCommission = await agentBalance();

    await cancelCommissionsForConsumption({ consumptionRecordId: cid });
    expect(await commissionStatus(cid)).toBe('cancelled');
    // 80 × 15% = 12.00 回冲
    expect(await agentBalance()).toBeCloseTo(balWithCommission - 12, 2);

    // 幂等：重复冲销不报错、余额不再变动
    await cancelCommissionsForConsumption({ consumptionRecordId: cid });
    expect(await agentBalance()).toBeCloseTo(balWithCommission - 12, 2);
  });

  it('平衡层挂接：addBalance(refund, consumption) 触发佣金冲销', async () => {
    const { generateCommissionForConsumption } = await import('../src/services/agent/commission');
    const { addBalance } = await import('../src/services/billing/balance');
    const cid = nextConsumptionId();

    await generateCommissionForConsumption({ userId: customerId, consumptionRecordId: cid, cost: '60.0000' });
    expect(await commissionStatus(cid)).toBe('settled');
    const balWithCommission = await agentBalance();

    // 退款（referenceType=consumption，referenceId=该消费 id 的字符串形式）
    const res = await addBalance(customerId, '60.0000', 'refund', 'consumption', String(cid));
    expect(Number(res.balanceAfter)).toBeGreaterThan(0);

    expect(await commissionStatus(cid)).toBe('cancelled');
    // 60 × 15% = 9.00 回冲
    expect(await agentBalance()).toBeCloseTo(balWithCommission - 9, 2);

    // 退款流水已记账
    const txs = await db.select({ count: sql<number>`count(*)::int` })
      .from(schema.balanceTransactions)
      .where(sql`user_id = ${customerId} and type = 'refund'`);
    expect(Number(txs[0]?.count ?? 0)).toBeGreaterThanOrEqual(1);
  });
});
