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

// ============================================================
// P0-1 余额 frozen 语义（预扣 PG 镜像 + allowNegative 记负）
// ============================================================

describe('Billing frozen semantics (P0-1)', () => {
  let userId: number;

  beforeAll(async () => {
    const email = `frozen-test-${Date.now()}@test.com`;
    const [user] = await db.insert(schema.users).values({
      email,
      passwordHash: bcrypt.hashSync('Test1234!', 12),
      name: 'Frozen Test',
      role: 'customer',
      status: 'active',
    }).returning({ id: schema.users.id });
    userId = user!.id;
    await db.insert(schema.customerBalances).values({
      userId,
      totalBalance: '100',
      availableBalance: '100',
      frozenBalance: '0',
      currency: 'CNY',
    });
  });

  afterAll(async () => {
    await db.delete(schema.users).where(eq(schema.users.id, userId)).catch(() => {});
  });

  it('freezeBalance: available 减、frozen 增（总余额不变）', async () => {
    const { freezeBalance } = await import('../src/services/billing/balance');
    await freezeBalance(userId, '30', 'req-freeze-1');

    const row = await db.select({
      available: schema.customerBalances.availableBalance,
      frozen: schema.customerBalances.frozenBalance,
      total: schema.customerBalances.totalBalance,
    }).from(schema.customerBalances).where(eq(schema.customerBalances.userId, userId)).limit(1);
    expect(Number(row[0]!.available)).toBeCloseTo(70, 4);
    expect(Number(row[0]!.frozen)).toBeCloseTo(30, 4);
    // 总余额不变：available + frozen = total
    expect(Number(row[0]!.available) + Number(row[0]!.frozen)).toBeCloseTo(Number(row[0]!.total), 4);
  });

  it('settleFrozenBalance: 实际 < 冻结 → 多退（available 只减实际，frozen 清 0）', async () => {
    const { settleFrozenBalance } = await import('../src/services/billing/balance');
    // 冻结 30，实际消费 12 → 退 18
    await settleFrozenBalance(userId, '30', '12', 'req-settle-1');

    const row = await db.select({
      available: schema.customerBalances.availableBalance,
      frozen: schema.customerBalances.frozenBalance,
    }).from(schema.customerBalances).where(eq(schema.customerBalances.userId, userId)).limit(1);
    // 初始 100 → 冻结 30 → 结算 12：available = 100 - 12 = 88
    expect(Number(row[0]!.available)).toBeCloseTo(88, 4);
    expect(Number(row[0]!.frozen)).toBeCloseTo(0, 4);
  });

  it('settleFrozenBalance: 实际 > 冻结 → 少补（差额从 available 扣）', async () => {
    const { freezeBalance, settleFrozenBalance } = await import('../src/services/billing/balance');
    // 先冻结 20，再结算 25 → 少补 5：available = 88 - 20（冻结） - 5（补扣）= 63
    await freezeBalance(userId, '20', 'req-freeze-2');
    await settleFrozenBalance(userId, '20', '25', 'req-settle-2');

    const row = await db.select({
      available: schema.customerBalances.availableBalance,
      frozen: schema.customerBalances.frozenBalance,
    }).from(schema.customerBalances).where(eq(schema.customerBalances.userId, userId)).limit(1);
    // 88 → 冻结 20（available=68）→ 结算 25（available += 20-25 = 68-5 = 63）
    expect(Number(row[0]!.available)).toBeCloseTo(63, 4);
    expect(Number(row[0]!.frozen)).toBeCloseTo(0, 4);
  });

  it('releaseFrozenBalance: 解冻全额退回 available', async () => {
    const { freezeBalance, releaseFrozenBalance } = await import('../src/services/billing/balance');
    await freezeBalance(userId, '10', 'req-release-1');
    await releaseFrozenBalance(userId, '10', 'req-release-1');

    const row = await db.select({
      available: schema.customerBalances.availableBalance,
      frozen: schema.customerBalances.frozenBalance,
    }).from(schema.customerBalances).where(eq(schema.customerBalances.userId, userId)).limit(1);
    expect(Number(row[0]!.available)).toBeCloseTo(63, 4); // 回到 63（上一步结算后）
    expect(Number(row[0]!.frozen)).toBeCloseTo(0, 4);
  });

  it('deductBalance allowNegative: 余额不足允许记负（旁路兜底）', async () => {
    const { deductBalance } = await import('../src/services/billing/balance');
    const result = await deductBalance(userId, '100', 'consumption', 'req-negative-1', { allowNegative: true });
    expect(Number(result.balanceAfter)).toBeLessThan(0);

    const row = await db.select({
      available: schema.customerBalances.availableBalance,
    }).from(schema.customerBalances).where(eq(schema.customerBalances.userId, userId)).limit(1);
    expect(Number(row[0]!.available)).toBeCloseTo(Number(result.balanceAfter), 4);
  });

  it('deductBalance 默认严格校验：不足仍抛 InsufficientBalanceError', async () => {
    const { deductBalance } = await import('../src/services/billing/balance');
    await expect(deductBalance(userId, '99999', 'consumption', 'req-negative-2'))
      .rejects.toThrow();
  });
});
