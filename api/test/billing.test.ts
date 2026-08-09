import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../src/db';
import { eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:***@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-billing-secret',
  PORT: '3033',
};

describe('Billing Engine', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let testUserId: number;

  beforeAll(async () => {
    app = await buildApp({ envOverrides: testEnv });
    await app.ready();

    // Create test user with balance
    const email = `bill-test-${Date.now()}@test.com`;
    const [user] = await db.insert(schema.users).values({
      email,
      passwordHash: bcrypt.hashSync('Test1234!', 12),
      name: 'Billing Test',
      role: 'customer',
    }).returning({ id: schema.users.id });
    testUserId = user!.id;

    // Init balance with 1000 CNY
    await db.insert(schema.customerBalances).values({
      userId: testUserId,
      totalBalance: '1000.0000',
      availableBalance: '1000.0000',
      frozenBalance: '0',
      currency: 'CNY',
    });

    // Login to get token
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'Test1234!' },
    });
    accessToken = JSON.parse(res.payload).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('deductBalance - successful deduction', async () => {
    const { deductBalance } = await import('../src/services/billing/balance');
    const result = await deductBalance(testUserId, '50.0000', 'consumption', 'req-test-1');
    expect(parseFloat(result.balanceAfter)).toBeCloseTo(950, 0);
  });

  it('deductBalance - insufficient balance throws', async () => {
    const { deductBalance } = await import('../src/services/billing/balance');
    await expect(deductBalance(testUserId, '10000.0000', 'consumption', 'req-test-2'))
      .rejects.toThrow();
  });

  it('addBalance - successful recharge', async () => {
    const { addBalance } = await import('../src/services/billing/balance');
    const before = await db.select({ bal: schema.customerBalances.availableBalance })
      .from(schema.customerBalances).where(eq(schema.customerBalances.userId, testUserId)).limit(1);
    const beforeBal = parseFloat(before[0]!.bal);

    const result = await addBalance(testUserId, '500.0000', 'recharge', 'recharge_order', 'RO-001');
    expect(parseFloat(result.balanceAfter)).toBeCloseTo(beforeBal + 500, 0);
  });

  it('getBalance - returns balance object', async () => {
    const { getBalance } = await import('../src/services/billing/balance');
    const result = await getBalance(testUserId);
    expect(result).toHaveProperty('totalBalance');
    expect(result).toHaveProperty('availableBalance');
    expect(result).toHaveProperty('frozenBalance');
    expect(result.currency).toBe('CNY');
  });

  it('transaction log is recorded on deduction', async () => {
    const txs = await db.select({ count: sql`count(*)` })
      .from(schema.balanceTransactions)
      .where(eq(schema.balanceTransactions.userId, testUserId));
    expect(Number(txs[0]!.count)).toBeGreaterThan(0);
  });

  it('consumption record can be created', async () => {
    // Create an API key first (needed for FK)
    const [ak] = await db.insert(schema.apiKeys).values({
      userId: testUserId,
      keyHash: `test-hash-${Date.now()}`,
      keyPrefix: '3c_test_',
      name: 'Test Key',
      status: 'active',
    }).returning({ id: schema.apiKeys.id });

    const { recordConsumption } = await import('../src/services/billing/consumption-log');
    const record = await recordConsumption({
      userId: testUserId,
      apiKeyId: ak!.id,
      model: 'deepseek-v3',
      inputTokens: 100,
      outputTokens: 50,
      cost: '0.0150',
      trustUpstream: true,
      fallback: false,
      streamed: false,
    });

    expect(record).toBeDefined();
    expect(record!.inputTokens).toBe(100);
    expect(record!.outputTokens).toBe(50);
    expect(record!.cost).toBe('0.01500000');
  });

  it('getUserConsumptionStats returns valid data', async () => {
    const { getUserConsumptionStats } = await import('../src/services/billing/consumption-log');
    const stats = await getUserConsumptionStats(testUserId, 30);
    expect(stats.totalCalls).toBeGreaterThanOrEqual(1);
    expect(stats.totalTokens).toBeGreaterThanOrEqual(150);
  });
});
