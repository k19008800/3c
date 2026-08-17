/**
 * 余额预扣（P0-1）集成测试 — 阈值旁路 + Redis Lua 原子冻结 + 多退少补 + TTL 兜底 + 记负风控
 *
 * 依赖真实 PG（threecloud_v3）与真实 Redis（localhost:6379），与 billing.test.ts 同风格。
 * 每个用例使用独立用户（时间戳邮箱）与独立 requestId，测试间互不污染；
 * afterEach 清理本用例创建的 Redis 键（bal:{userId} / freeze:{requestId} / neg:{userId}）。
 *
 * 覆盖 docs/iteration-plan-v2.md P0-1 测试要求（10 项）：
 *   1. 余额 > 阈值 → 旁路：不冻结，事后按实际扣费
 *   2. 余额 ≤ 阈值 → 预扣成功，frozen 增加、available 减少
 *   3. 预扣时余额不足 → 402（PreConsumeFailedError），不调上游
 *   4. 实际消费 < 预扣 → 解冻差额（多退）
 *   5. 实际消费 > 预扣 → 补扣差额（少补），不足时 402 + 解冻全部
 *   6. 并发预扣（10 并发同用户）→ Lua 原子性，不超扣
 *   7. 异常中断 → 超时 TTL 后自动解冻
 *   8. 旁路扣费后余额 < 0 → 记负 + risk_events + 后续请求强制预扣（直到充值回正）
 *   9. 阈值后台可配置：改 billing.balance_threshold 后判定即时生效
 *   10. 流式场景：转发完成后按 determineStreamBilling 结果结算
 *
 * @see docs/iteration-plan-v2.md P0-1
 * @module services/billing
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { db, schema } from '../../db';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { getRedis } from '../../lib/redis';
import {
  shouldBypass,
  preConsume,
  settlePreConsume,
  releasePreConsume,
  cleanupExpiredFreezes,
  invalidateThresholdCache,
  NEGATIVE_BALANCE_RULE_NAME,
} from './pre-consume';
import { PreConsumeFailedError } from '../../lib/errors';
import { getBalance, addBalance } from './balance';
import { settleBilling } from './settle';
import { computeCost } from './pricing';
import { determineStreamBilling } from './settle-stream';
import { balanceLedgerKey, freezeRecordKey, freezeExpiryKey, negativeFlagKey, toLedgerUnits } from './ledger';
import type { PipelineContext } from '../pipeline/types';

/** 生成唯一后缀（用户邮箱 / requestId 用） */
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** 创建带余额的用户 + API Key */
async function createUser(balance: string) {
  const email = `preconsume-${uid()}@test.com`;
  const [user] = await db.insert(schema.users).values({
    email,
    passwordHash: bcrypt.hashSync('Test1234!', 12),
    name: 'PreConsume Test',
    role: 'customer',
    status: 'active',
  }).returning({ id: schema.users.id });
  const userId = user!.id;
  await db.insert(schema.customerBalances).values({
    userId,
    totalBalance: balance,
    availableBalance: balance,
    frozenBalance: '0',
    currency: 'CNY',
  });
  const [ak] = await db.insert(schema.apiKeys).values({
    userId,
    keyHash: `pc-${uid()}`,
    keyPrefix: '3c_test_',
    name: 'PC Test Key',
    status: 'active',
  }).returning({ id: schema.apiKeys.id });
  return { userId, apiKeyId: ak!.id };
}

/** 构造 PipelineContext（requestId 唯一） */
function makeCtx(userId: number, apiKeyId: number): PipelineContext {
  return {
    requestId: `req-${uid()}`,
    userId,
    apiKeyId,
    model: 'test-model',
    body: {},
    stream: false,
    metadata: {},
  };
}

/** 读取用户 PG 余额 */
async function pgBalance(userId: number) {
  const rows = await db.select({
    available: schema.customerBalances.availableBalance,
    frozen: schema.customerBalances.frozenBalance,
  }).from(schema.customerBalances).where(eq(schema.customerBalances.userId, userId)).limit(1);
  return { available: rows[0]!.available, frozen: rows[0]!.frozen };
}

/** 读取用户 Redis 热账本（不存在返回 null） */
async function redisLedger(userId: number) {
  const r = getRedis();
  if (!r) return null;
  const key = balanceLedgerKey(userId);
  if ((await r.exists(key)) === 0) return null;
  const available = await r.hget(key, 'available');
  const frozen = await r.hget(key, 'frozen');
  return { available: Number(available), frozen: Number(frozen) };
}

describe('余额预扣 P0-1（阈值旁路 + Redis Lua 冻结）', () => {
  /** 本用例创建的 Redis 键（afterEach 精确清理，避免并发 worker 相互干扰） */
  let createdKeys: string[] = [];
  let createdUsers: number[] = [];

  beforeAll(async () => {
    // 预置负余额强制预扣风控规则（risk_events.rule_id NOT NULL，P0-1 依赖）
    // risk_rules.name 无唯一约束 → 先查后插（onConflictDoNothing 会因缺约束报错）
    const [existing] = await db.select({ id: schema.riskRules.id }).from(schema.riskRules)
      .where(eq(schema.riskRules.name, NEGATIVE_BALANCE_RULE_NAME)).limit(1);
    if (!existing) {
      await db.insert(schema.riskRules).values({
        name: NEGATIVE_BALANCE_RULE_NAME,
        ruleType: 'balance',
        description: 'test seed',
        config: { action: 'force_preconsume' },
        enabled: true,
      });
    }
    // 确保阈值缓存干净（默认 100 或 DB 现值）
    await invalidateThresholdCache();
  });

  afterAll(async () => {
    await invalidateThresholdCache();
  });

  beforeEach(() => {
    createdKeys = [];
    createdUsers = [];
  });

  afterEach(async () => {
    const r = getRedis();
    if (r && createdKeys.length > 0) {
      await r.del(...createdKeys).catch(() => {});
    }
    // 删除测试用户（级联清理 customer_balances / api_keys / consumption_records）
    for (const userId of createdUsers) {
      await db.delete(schema.users).where(eq(schema.users.id, userId)).catch(() => {});
    }
    // 阈值恢复默认并失效缓存（避免污染其他用例/文件；DB 配置行也删除，防止失败残留）
    await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, 'billing.balance_threshold')).catch(() => {});
    await invalidateThresholdCache();
  });

  /** 记录待清理的 Redis 键 */
  function track(userId: number, ...requestIds: string[]) {
    createdKeys.push(balanceLedgerKey(userId), negativeFlagKey(userId));
    for (const rid of requestIds) {
      createdKeys.push(freezeRecordKey(rid), freezeExpiryKey(rid));
    }
  }

  // ──────────────────────────────────────────────────────────
  // 1. 余额 > 阈值 → 旁路：不冻结，事后按实际扣费
  // ──────────────────────────────────────────────────────────
  it('余额 > 阈值（默认 ¥100）→ 旁路：不冻结，事后按实际扣费', async () => {
    const { userId, apiKeyId } = await createUser('200');
    createdUsers.push(userId);
    const ctx = makeCtx(userId, apiKeyId);
    track(userId, ctx.requestId);

    // 旁路判定
    expect(await shouldBypass({ userId, requestId: ctx.requestId })).toBe(true);

    const pre = await preConsume(ctx, 10, { balance: { availableBalance: '200' } });
    expect(pre.mode).toBe('bypass');
    expect(pre.amount).toBe(0);

    // 未冻结：Redis 热账本不应存在
    expect(await redisLedger(userId)).toBeNull();
    const pg = await pgBalance(userId);
    expect(Number(pg.available)).toBeCloseTo(200, 4);
    expect(Number(pg.frozen)).toBeCloseTo(0, 4);

    // 事后按实际扣费（旁路允许记负，但不触发记负）
    const actualCost = 2.5;
    await settleBilling(ctx, 100, 50, actualCost, null, {
      streamed: false,
      trustUpstream: true,
      fallback: false,
      preConsume: pre,
    });
    const after = await pgBalance(userId);
    expect(Number(after.available)).toBeCloseTo(197.5, 4);
    expect(Number(after.frozen)).toBeCloseTo(0, 4);
  });

  // ──────────────────────────────────────────────────────────
  // 2. 余额 ≤ 阈值 → 预扣成功，frozen 增加、available 减少
  //    金额对齐真实（BOSS 提供 2026-08-17）：deepseek-v4-pro 单笔
  //    input 150,004 tokens ≈ ¥0.4500（¥0.003/1K in）+ output 16~291 ≈ ¥0.0001~0.0017
  //    → 单笔预扣取 ¥0.45（整数单位 1e-8 元，45000000）
  // ──────────────────────────────────────────────────────────
  it('余额 ≤ 阈值 → 预扣成功：Redis frozen 增加、available 减少（PG 镜像同步）', async () => {
    const { userId, apiKeyId } = await createUser('50');
    createdUsers.push(userId);
    const ctx = makeCtx(userId, apiKeyId);
    track(userId, ctx.requestId);

    expect(await shouldBypass({ userId, requestId: ctx.requestId })).toBe(false);

    // 真实单笔 ¥0.45（150K input tokens）
    const pre = await preConsume(ctx, 0.45, { balance: { availableBalance: '50' } });
    expect(pre.mode).toBe('frozen');
    expect(pre.amount).toBeCloseTo(0.45, 6);

    // Redis 热账本：available 50→49.55、frozen 0→0.45（整数单位 1e-8 元）
    const ledger = await redisLedger(userId);
    expect(ledger).not.toBeNull();
    expect(ledger!.available).toBe(toLedgerUnits(49.55));
    expect(ledger!.frozen).toBe(toLedgerUnits(0.45));

    // PG 镜像：available 49.55、frozen 0.45
    const pg = await pgBalance(userId);
    expect(Number(pg.available)).toBeCloseTo(49.55, 4);
    expect(Number(pg.frozen)).toBeCloseTo(0.45, 4);

    // 清理：释放预扣（测试不留冻结残渣）
    await releasePreConsume(ctx, pre);
    const after = await pgBalance(userId);
    expect(Number(after.available)).toBeCloseTo(50, 4);
    expect(Number(after.frozen)).toBeCloseTo(0, 4);
  });

  // ──────────────────────────────────────────────────────────
  // 3. 预扣时余额不足 → 402（PreConsumeFailedError），不调上游
  // ──────────────────────────────────────────────────────────
  it('预扣时余额不足 → 402（PreConsumeFailedError），不产生任何冻结', async () => {
    const { userId, apiKeyId } = await createUser('0.3');
    createdUsers.push(userId);
    const ctx = makeCtx(userId, apiKeyId);
    track(userId, ctx.requestId);

    // 单笔 0.45 > 余额 0.3 → 402
    await expect(preConsume(ctx, 0.45, { balance: { availableBalance: '0.3' } }))
      .rejects.toBeInstanceOf(PreConsumeFailedError);

    // 无冻结残留：Redis 账本缺失或 available 未被扣减，PG 原样
    const ledger = await redisLedger(userId);
    if (ledger) {
      expect(ledger.frozen).toBe(0);
    }
    const pg = await pgBalance(userId);
    expect(Number(pg.available)).toBeCloseTo(0.3, 4);
    expect(Number(pg.frozen)).toBeCloseTo(0, 4);
  });

  // ──────────────────────────────────────────────────────────
  // 4. 实际消费 < 预扣 → 解冻差额（多退）
  // ──────────────────────────────────────────────────────────
  it('实际消费 < 预扣 → 多退：差额退回 available，frozen 清 0', async () => {
    const { userId, apiKeyId } = await createUser('50');
    createdUsers.push(userId);
    const ctx = makeCtx(userId, apiKeyId);
    track(userId, ctx.requestId);

    // 预扣 0.45（150K in），实际 0.1（少量 output）→ 退 0.35
    const pre = await preConsume(ctx, 0.45, { balance: { availableBalance: '50' } });
    await settlePreConsume(ctx, 0.1, pre);

    // Redis：available = 50 - 0.1 = 49.9，frozen = 0
    const ledger = await redisLedger(userId);
    expect(ledger!.available).toBe(toLedgerUnits(49.9));
    expect(ledger!.frozen).toBe(0);
    // 冻结记录已删除
    const r = getRedis()!;
    expect(await r.exists(freezeRecordKey(ctx.requestId))).toBe(0);

    // PG：available 49.9、frozen 0
    const pg = await pgBalance(userId);
    expect(Number(pg.available)).toBeCloseTo(49.9, 4);
    expect(Number(pg.frozen)).toBeCloseTo(0, 4);
  });

  // ──────────────────────────────────────────────────────────
  // 5. 实际消费 > 预扣 → 补扣差额（少补）；不足时 402 + 解冻全部
  // ──────────────────────────────────────────────────────────
  it('实际消费 > 预扣 → 少补：差额从 available 补扣', async () => {
    const { userId, apiKeyId } = await createUser('50');
    createdUsers.push(userId);
    const ctx = makeCtx(userId, apiKeyId);
    track(userId, ctx.requestId);

    // 预扣 0.45，实际 0.6（输出超出预估）→ 补扣 0.15
    const pre = await preConsume(ctx, 0.45, { balance: { availableBalance: '50' } });
    await settlePreConsume(ctx, 0.6, pre);

    // Redis：available = 50 - 0.6 = 49.4，frozen = 0
    const ledger = await redisLedger(userId);
    expect(ledger!.available).toBe(toLedgerUnits(49.4));
    expect(ledger!.frozen).toBe(0);

    const pg = await pgBalance(userId);
    expect(Number(pg.available)).toBeCloseTo(49.4, 4);
    expect(Number(pg.frozen)).toBeCloseTo(0, 4);
  });

  it('实际消费 > 预扣且余额不足 → 402 + 解冻全部（无消费入账）', async () => {
    const { userId, apiKeyId } = await createUser('0.5');
    createdUsers.push(userId);
    const ctx = makeCtx(userId, apiKeyId);
    track(userId, ctx.requestId);

    const pre = await preConsume(ctx, 0.45, { balance: { availableBalance: '0.5' } });
    // 冻结后可用仅剩 0.05，补扣 0.15（实际 0.6 - 预扣 0.45）不足
    await expect(settlePreConsume(ctx, 0.6, pre)).rejects.toBeInstanceOf(PreConsumeFailedError);

    // 已解冻全部：余额回到 0.5，无消费
    const ledger = await redisLedger(userId);
    expect(ledger!.available).toBe(toLedgerUnits(0.5));
    expect(ledger!.frozen).toBe(0);

    const pg = await pgBalance(userId);
    expect(Number(pg.available)).toBeCloseTo(0.5, 4);
    expect(Number(pg.frozen)).toBeCloseTo(0, 4);
  });

  // ──────────────────────────────────────────────────────────
  // 6. 并发预扣（10 并发同用户）→ Lua 原子性，不超扣
  //    真实场景（BOSS 提供）：同秒多笔 deepseek-v4-pro，input 150,004 tokens ≈ ¥0.45/笔。
  //    余额 ¥3.5 → 10 并发 × 0.45 = 4.5 > 3.5 → 成功 7 笔（7×0.45=3.15 ≤ 3.5），失败 3 笔。
  // ──────────────────────────────────────────────────────────
  it('10 并发预扣 → Lua 原子性：只成功 7 笔（7×0.45=3.15 ≤ 3.5），不超扣', async () => {
    const { userId, apiKeyId } = await createUser('3.5');
    createdUsers.push(userId);

    const ctxs = Array.from({ length: 10 }, () => makeCtx(userId, apiKeyId));
    ctxs.forEach((c) => track(userId, c.requestId));

    const results = await Promise.allSettled(
      ctxs.map((c) => preConsume(c, 0.45, { balance: { availableBalance: '3.5' } })),
    );

    const ok = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof preConsume>>>[];
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok.length).toBe(7); // 7 × 0.45 = 3.15 ≤ 3.5
    expect(failed.length).toBe(3);
    for (const f of failed) {
      expect((f as PromiseRejectedResult).reason).toBeInstanceOf(PreConsumeFailedError);
    }

    // 原子性：available = 3.5 - 3.15 = 0.35，frozen = 3.15，无超扣（available ≥ 0）
    const ledger = await redisLedger(userId);
    expect(ledger!.available).toBe(toLedgerUnits(0.35));
    expect(ledger!.frozen).toBe(toLedgerUnits(3.15));

    // PG 镜像一致
    const pg = await pgBalance(userId);
    expect(Number(pg.available)).toBeCloseTo(0.35, 4);
    expect(Number(pg.frozen)).toBeCloseTo(3.15, 4);

    // 全部结算（actual=0.1 → 每笔退 0.35）→ available = 0.35 + 7×0.35 = 2.8
    // ⚠️ 配对：Promise.allSettled 保持输入顺序，但 ok 只含成功项，ok[i] 与 ctxs[i] 不对应。
    //    必须用 result.value.requestId 找对应 ctx（settlePreConsume 按 requestId 定位冻结记录）。
    const settledResults = results
      .map((r, i) => ({ r, ctx: ctxs[i]! }))
      .filter((x) => x.r.status === 'fulfilled') as Array<{
        r: PromiseFulfilledResult<Awaited<ReturnType<typeof preConsume>>>;
        ctx: ReturnType<typeof makeCtx>;
      }>;
    for (const { r, ctx } of settledResults) {
      await settlePreConsume(ctx, 0.1, r.value);
    }
    const after = await pgBalance(userId);
    expect(Number(after.available)).toBeCloseTo(2.8, 4);
    expect(Number(after.frozen)).toBeCloseTo(0, 4);
  });

  // ──────────────────────────────────────────────────────────
  // 7. 异常中断 → 超时 TTL 后自动解冻
  // ──────────────────────────────────────────────────────────
  it('异常中断 → 冻结记录 TTL 过期后 cleanupExpiredFreezes 自动解冻（Redis + PG 自愈）', async () => {
    const { userId, apiKeyId } = await createUser('50');
    createdUsers.push(userId);
    const ctx = makeCtx(userId, apiKeyId);
    track(userId, ctx.requestId);

    // 短 TTL（1s）模拟请求异常中断后无人结算；金额对齐真实单笔 ¥0.45
    const pre = await preConsume(ctx, 0.45, { balance: { availableBalance: '50' }, ttlSeconds: 1 });
    expect(pre.mode).toBe('frozen');

    // 冻结记录 TTL 兜底：1s 后记录自动消失（Redis TTL）
    await new Promise((r) => setTimeout(r, 1200));
    const r = getRedis()!;
    expect(await r.exists(freezeRecordKey(ctx.requestId))).toBe(0);

    // 清理任务按注册表（freeze-exp 无 TTL）释放冻结
    const released = await cleanupExpiredFreezes();
    expect(released).toBeGreaterThanOrEqual(1);

    // Redis 热账本回到初始：available 50、frozen 0
    const ledger = await redisLedger(userId);
    expect(ledger!.available).toBe(toLedgerUnits(50));
    expect(ledger!.frozen).toBe(0);

    // PG 镜像同步回补
    const pg = await pgBalance(userId);
    expect(Number(pg.available)).toBeCloseTo(50, 4);
    expect(Number(pg.frozen)).toBeCloseTo(0, 4);
  });

  // ──────────────────────────────────────────────────────────
  // 8. 旁路扣费后余额 < 0 → 记负 + risk_events + 强制预扣（直到充值回正）
  // ──────────────────────────────────────────────────────────
  it('旁路扣费后余额 < 0 → 记负 + risk_events + 强制预扣；充值回正后恢复旁路', async () => {
    // 阈值调低到 ¥1：余额 5 走旁路
    await db.insert(schema.systemConfig).values({
      key: 'billing.balance_threshold', value: '1', description: 'test',
    }).onConflictDoUpdate({
      target: schema.systemConfig.key,
      set: { value: '1' },
    });
    await invalidateThresholdCache();

    const { userId, apiKeyId } = await createUser('5');
    createdUsers.push(userId);
    const ctx = makeCtx(userId, apiKeyId);
    track(userId, ctx.requestId);

    // 旁路：5 > 1 → bypass
    const pre = await preConsume(ctx, 1, { balance: { availableBalance: '5' } });
    expect(pre.mode).toBe('bypass');

    // 事后扣费 8 > 余额 5 → 允许记负（极端并发竞态兜底）
    await settleBilling(ctx, 0, 0, 8, null, {
      streamed: false,
      trustUpstream: true,
      fallback: false,
      preConsume: pre,
    });

    const pg = await pgBalance(userId);
    expect(Number(pg.available)).toBeCloseTo(-3, 4);

    // risk_events 已写入（引用预置规则）
    const events = await db.select({ id: schema.riskEvents.id })
      .from(schema.riskEvents)
      .where(eq(schema.riskEvents.userId, userId));
    expect(events.length).toBeGreaterThanOrEqual(1);

    // Redis 强制预扣标记已设置 → 后续请求不旁路（强制预扣）
    const r = getRedis()!;
    expect(await r.exists(negativeFlagKey(userId))).toBe(1);
    expect(await shouldBypass({ userId, requestId: ctx.requestId }, { availableBalance: '-3' })).toBe(false);

    // 充值回正（+10 → 7）→ 标记清除 → 恢复旁路判定（7 > 1 → bypass）
    await addBalance(userId, '10', 'recharge', 'recharge_order', `RO-${uid()}`);
    expect(await r.exists(negativeFlagKey(userId))).toBe(0);
    expect(await shouldBypass({ userId, requestId: ctx.requestId }, { availableBalance: '7' })).toBe(true);

    // 清理阈值配置（避免影响其他用例）
    await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, 'billing.balance_threshold'));
    await invalidateThresholdCache();
  });

  // ──────────────────────────────────────────────────────────
  // 9. 阈值后台可配置：改 billing.balance_threshold 后判定即时生效
  // ──────────────────────────────────────────────────────────
  it('阈值后台可配置：改 billing.balance_threshold 后 shouldBypass 即时生效（缓存失效）', async () => {
    const { userId, apiKeyId } = await createUser('500');
    createdUsers.push(userId);
    const ctx = makeCtx(userId, apiKeyId);
    track(userId, ctx.requestId);

    const setThreshold = async (value: string) => {
      await db.insert(schema.systemConfig).values({
        key: 'billing.balance_threshold', value, description: 'test',
      }).onConflictDoUpdate({
        target: schema.systemConfig.key,
        set: { value },
      });
      await invalidateThresholdCache();
    };

    // 默认 100：500 > 100 → 旁路
    expect(await shouldBypass(ctx)).toBe(true);

    // 阈值调高到 1000：500 ≤ 1000 → 预扣
    await setThreshold('1000');
    expect(await shouldBypass(ctx)).toBe(false);

    // 阈值调回 100：500 > 100 → 旁路
    await setThreshold('100');
    expect(await shouldBypass(ctx)).toBe(true);

    await db.delete(schema.systemConfig).where(eq(schema.systemConfig.key, 'billing.balance_threshold'));
    await invalidateThresholdCache();
  });

  // ──────────────────────────────────────────────────────────
  // 10. 流式场景：转发完成后按 determineStreamBilling 结果结算
  // ──────────────────────────────────────────────────────────
  it('流式场景：转发完成后按 determineStreamBilling 结果结算（预扣多退少补）', async () => {
    const { userId, apiKeyId } = await createUser('50');
    createdUsers.push(userId);
    const ctx = makeCtx(userId, apiKeyId);
    track(userId, ctx.requestId);

    // 预扣金额按输入估算（对齐真实：deepseek-v4-pro 150K input，输出封顶 4096）
    const pricing = { input: 0.003, output: 0.006 }; // v4-pro ¥0.003/1K in + ¥0.006/1K out
    const estimatedInputTokens = 150004;
    const estimatedCost = computeCost(ctx.model, estimatedInputTokens, 4096, pricing);
    const pre = await preConsume(ctx, estimatedCost, { balance: { availableBalance: '50' } });
    expect(pre.mode).toBe('frozen');

    // 流式转发完成后的状态：上游最后帧带完整 usage（prompt 150004 / completion 50）
    const state = {
      lastValidUsage: { prompt_tokens: 150004, completion_tokens: 50, total_tokens: 150054 },
      generatedText: 'Hello from upstream',
      finishReason: 'stop',
      totalChunks: 3,
    };
    const billing = determineStreamBilling(state, false, estimatedInputTokens, ctx.model);
    expect(billing.trustUpstream).toBe(true);
    const actualCost = computeCost(ctx.model, billing.promptTokens, billing.completionTokens, pricing);

    await settlePreConsume(ctx, actualCost, pre);

    // 按实际用量结算：50 - actualCost
    const pg = await pgBalance(userId);
    expect(Number(pg.available)).toBeCloseTo(50 - actualCost, 4);
    expect(Number(pg.frozen)).toBeCloseTo(0, 4);
    const ledger = await redisLedger(userId);
    expect(ledger!.available).toBe(toLedgerUnits(50 - actualCost));
    expect(ledger!.frozen).toBe(0);
  });

  // ──────────────────────────────────────────────────────────
  // 附加：releasePreConsume 幂等 + 解冻（异常路径）
  // ──────────────────────────────────────────────────────────
  it('releasePreConsume：上游失败解冻，重复调用幂等（no-op）', async () => {
    const { userId, apiKeyId } = await createUser('50');
    createdUsers.push(userId);
    const ctx = makeCtx(userId, apiKeyId);
    track(userId, ctx.requestId);

    const pre = await preConsume(ctx, 0.45, { balance: { availableBalance: '50' } });
    expect(pre.mode).toBe('frozen');

    await releasePreConsume(ctx, pre);
    const ledger = await redisLedger(userId);
    expect(ledger!.available).toBe(toLedgerUnits(50));
    expect(ledger!.frozen).toBe(0);
    const pg = await pgBalance(userId);
    expect(Number(pg.available)).toBeCloseTo(50, 4);
    expect(Number(pg.frozen)).toBeCloseTo(0, 4);

    // 幂等：再次释放 no-op（金额不重复回补）
    await releasePreConsume(ctx, pre);
    const ledger2 = await redisLedger(userId);
    expect(ledger2!.available).toBe(toLedgerUnits(50));
    expect(ledger2!.frozen).toBe(0);
  });

  it('getBalance 返回值含 frozenBalance（预扣语义对前端可见）', async () => {
    const { userId, apiKeyId } = await createUser('50');
    createdUsers.push(userId);
    const ctx = makeCtx(userId, apiKeyId);
    track(userId, ctx.requestId);

    const pre = await preConsume(ctx, 0.45, { balance: { availableBalance: '50' } });
    const bal = await getBalance(userId);
    expect(Number(bal.frozenBalance)).toBeCloseTo(0.45, 4);
    expect(Number(bal.availableBalance)).toBeCloseTo(49.55, 4);

    await releasePreConsume(ctx, pre);
  });
});
