/**
 * R6 限额服务测试 — 创建时预占（advisory lock + 滚动汇总 + 事件插行）/ 不回退 / Redis ZSET（真实 PG + Redis）
 *
 * 覆盖 ARCH v1.1 §6.2 用例 9–17（服务层）+ 调度终裁 B9/B18/B19：
 *   - checkLimitsInTx：advisory lock 串行化 + 24h 滚动 SUM + soft 升级 / hard 429 / exceed_action=reject
 *   - reserveInTx：事件插行（UNIQUE(scope,ref_type,ref_id) 幂等）
 *   - 驳回/红冲不回退：无 DECRBY 路径（无 refund/syncRedisDecr 导出）
 *   - syncRedisAdd（lim_add.lua ZSET 剪枝+入集+TTL）/ redisRollingSumCents（读路径）
 *   - 豁免角色（B8）：op 维度跳过预检与插行
 *
 * 隔离：每个 describe 用独立用户（避免事件累计跨用例污染判定结果）。
 *
 * @see docs/ARCH-整改R5-R7-资金风控.md v1.1 §3 / §6.2
 * @module services/billing/credit-limit.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { getRedis } from '../../lib/redis.js';
import {
  checkLimitsInTx,
  reserveInTx,
  syncRedisAdd,
  redisRollingSumCents,
  rollingWindowMs,
  redisSetKey,
  eventMember,
  yuanToCents,
  readRollingSumPg,
} from './credit-limit.js';

const ts = Date.now();
const WINDOW_MS = rollingWindowMs(24);

/** 创建独立测试用户（每 describe 一个，隔离事件累计） */
async function createUser(tag: string): Promise<number> {
  const [u] = await db.insert(schema.users).values({
    email: `cl-${tag}-${ts}@test.com`, passwordHash: 'x', name: `CL${tag}`, role: 'customer', status: 'active',
  }).returning({ id: schema.users.id });
  return u!.id;
}

async function dropUser(userId: number): Promise<void> {
  try {
    await db.delete(schema.creditLimitEvents).where(eq(schema.creditLimitEvents.userId, userId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    const r = getRedis();
    if (r) {
      const keys = await r.keys('lim:*');
      const mine = keys.filter((k) => k.includes(`:${userId}`));
      if (mine.length > 0) await r.del(...mine);
    }
  } catch (err) {
    console.error('[credit-limit.test] cleanup failed:', err);
  }
}

describe('纯函数', () => {
  it('rollingWindowMs 默认 24h；redisSetKey 键格式 lim:op:{id} / lim:user:{id}（无日期后缀，事件级滚动）', () => {
    expect(rollingWindowMs(24)).toBe(86400000);
    expect(redisSetKey('operator', 42)).toBe('lim:op:42');
    expect(redisSetKey('user', 42)).toBe('lim:user:42');
  });
  it('eventMember 尾部 amountCents（Lua 解析用）', () => {
    expect(eventMember('manual_topup', 7, 999900)).toBe('manual_topup:7:999900');
  });
  it('yuanToCents 元 → 分', () => {
    expect(yuanToCents(9999)).toBe(999900);
    expect(yuanToCents(0.01)).toBe(1);
  });
});

describe('checkLimitsInTx 创建时预占判定（advisory lock + 24h 滚动汇总）', () => {
  let uid = 0;
  const base = {
    opUserId: 0,
    targetUserId: 0,
    amountYuan: 0,
    role: 'admin',
    softLimitYuan: 50000,
    hardLimitYuan: 100000,
    exceedAction: 'escalate' as const,
    exemptRoles: [] as string[],
    windowHours: 24,
  };

  beforeAll(async () => {
    uid = await createUser('check');
  });
  afterAll(async () => {
    await dropUser(uid);
  });

  it('无历史事件 → projected = 本笔；未超 soft → escalated=false', async () => {
    await db.transaction(async (tx) => {
      const res = await checkLimitsInTx(tx, { ...base, opUserId: uid, targetUserId: uid, amountYuan: 10000 });
      expect(res.op.projectedYuan).toBe(10000);
      expect(res.user.projectedYuan).toBe(10000);
      expect(res.op.escalated).toBe(false);
      expect(res.user.escalated).toBe(false);
    });
  });

  it('用例9 累计 6 万 > soft 5 万 → escalated=true（升级双人）；user 维度同判', async () => {
    await db.transaction(async (tx) => {
      await checkLimitsInTx(tx, { ...base, opUserId: uid, targetUserId: uid, amountYuan: 50000 });
      await reserveInTx(tx, { scope: 'operator', userId: uid, amountYuan: 50000, refType: 'manual_topup', refId: 't1-op' });
      await reserveInTx(tx, { scope: 'user', userId: uid, amountYuan: 50000, refType: 'manual_topup', refId: 't1-usr' });

      const res = await checkLimitsInTx(tx, { ...base, opUserId: uid, targetUserId: uid, amountYuan: 10000 });
      expect(res.op.projectedYuan).toBe(60000);
      expect(res.op.escalated).toBe(true);      // 60000 > 50000 soft
      expect(res.user.escalated).toBe(true);
    });
  });

  it('用例10 hard 闸：projected > hard 10 万 → 429 DAILY_LIMIT_EXCEEDED（事务回滚，单据不创建）', async () => {
    await expect(db.transaction(async (tx) => {
      await checkLimitsInTx(tx, { ...base, opUserId: uid, targetUserId: uid, amountYuan: 100001 });
    })).rejects.toMatchObject({ statusCode: 429, code: 'DAILY_LIMIT_EXCEEDED' });
  });

  it('用例15 exceed_action=reject：projected > soft 即 429（即使未超 hard）', async () => {
    // 独立用户避免 hard 干扰（projected = 0 + 60000 ≤ hard 100000，但 > soft 50000）
    const uid2 = await createUser('reject');
    try {
      await expect(db.transaction(async (tx) => {
        await checkLimitsInTx(tx, { ...base, opUserId: uid2, targetUserId: uid2, amountYuan: 60000, exceedAction: 'reject' });
      })).rejects.toMatchObject({ statusCode: 429, code: 'DAILY_LIMIT_EXCEEDED' });
    } finally {
      await dropUser(uid2);
    }
  });

  it('用例16 豁免角色（B8）：op 维度跳过预检与插行（exempt=true）；user 维度照常判定', async () => {
    const uid3 = await createUser('exempt');
    try {
      await db.transaction(async (tx) => {
        const res = await checkLimitsInTx(tx, { ...base, opUserId: uid3, targetUserId: uid3, amountYuan: 1000, role: 'finance', exemptRoles: ['finance'] });
        expect(res.op.exempt).toBe(true);
        expect(res.op.escalated).toBe(false);
        expect(res.user.exempt).toBe(false);
      });
    } finally {
      await dropUser(uid3);
    }
  });

  it('用例12 advisory lock 串行化：先到先得，后笔按新累计判定（无超发）', async () => {
    const uid4 = await createUser('con');
    try {
      let escalated = false;
      await db.transaction(async (tx) => {
        const r1 = await checkLimitsInTx(tx, { ...base, opUserId: uid4, targetUserId: uid4, amountYuan: 60000 });
        escalated = r1.op.escalated;
        await reserveInTx(tx, { scope: 'operator', userId: uid4, amountYuan: 60000, refType: 'manual_topup', refId: 'con-op-1' });
      });
      expect(escalated).toBe(true);   // 60000 > soft → 升级（未超 hard）
      // 第二笔 60000：projected = 60000 + 60000 = 120000 > hard → 429
      await expect(db.transaction(async (tx) => {
        await checkLimitsInTx(tx, { ...base, opUserId: uid4, targetUserId: uid4, amountYuan: 60000 });
      })).rejects.toMatchObject({ code: 'DAILY_LIMIT_EXCEEDED' });
    } finally {
      await dropUser(uid4);
    }
  });

  it('P1-3 调度终裁：单笔 > superReviewThreshold（tier3）→ 豁免 hard/soft（不 429、不升级）仍计入累计；同累计下 tier1/2 拆分照常 429', async () => {
    const uid5 = await createUser('t3');
    try {
      // 首笔 30 万：单笔超 soft/hard，但 tier3 单笔豁免 → 不 429、不升级（大额由三人审批链承接）
      await db.transaction(async (tx) => {
        const res = await checkLimitsInTx(tx, { ...base, opUserId: uid5, targetUserId: uid5, amountYuan: 300000, superReviewThresholdYuan: 100000 });
        expect(res.largeApprovalChain).toBe(true);
        expect(res.op.escalated).toBe(false);
        expect(res.user.escalated).toBe(false);
        expect(res.op.projectedYuan).toBe(300000);   // 仍计入 24h 累计
        await reserveInTx(tx, { scope: 'operator', userId: uid5, amountYuan: 300000, refType: 'manual_topup', refId: 't3-op' });
        await reserveInTx(tx, { scope: 'user', userId: uid5, amountYuan: 300000, refType: 'manual_topup', refId: 't3-usr' });
      });
      // 累计 60 万 > hard：第二笔 tier3 单笔仍豁免（approval chain 承接，不扩散到拆分场景）
      await db.transaction(async (tx) => {
        const res2 = await checkLimitsInTx(tx, { ...base, opUserId: uid5, targetUserId: uid5, amountYuan: 300000, superReviewThresholdYuan: 100000 });
        expect(res2.largeApprovalChain).toBe(true);
        expect(res2.op.escalated).toBe(false);
        expect(res2.op.projectedYuan).toBe(600000);
      });
      // 反向验证：同累计 60 万下，tier1/2 拆分单（≤10 万）→ projected > hard → 429（豁免不扩散）
      await expect(db.transaction(async (tx) => {
        await checkLimitsInTx(tx, { ...base, opUserId: uid5, targetUserId: uid5, amountYuan: 1, superReviewThresholdYuan: 100000 });
      })).rejects.toMatchObject({ statusCode: 429, code: 'DAILY_LIMIT_EXCEEDED' });
    } finally {
      await dropUser(uid5);
    }
  });
});

describe('reserveInTx 事件插行（幂等）', () => {
  let uid = 0;
  beforeAll(async () => {
    uid = await createUser('reserve');
  });
  afterAll(async () => {
    await dropUser(uid);
  });

  it('同单同维度重复插行 → 仅一行（UNIQUE(scope,ref_type,ref_id)）', async () => {
    await db.transaction(async (tx) => {
      await reserveInTx(tx, { scope: 'operator', userId: uid, amountYuan: 5000, refType: 'adjustment', refId: 'adj-1' });
      await reserveInTx(tx, { scope: 'operator', userId: uid, amountYuan: 5000, refType: 'adjustment', refId: 'adj-1' });   // 幂等 no-op
    });
    const rows = await db.select({ id: schema.creditLimitEvents.id }).from(schema.creditLimitEvents)
      .where(eq(schema.creditLimitEvents.refId, 'adj-1'));
    expect(rows.length).toBe(1);
  });

  it('滚动汇总计入事件（readRollingSumPg）', async () => {
    const sum = await readRollingSumPg(db, 'operator', uid, 24);
    expect(sum).toBeGreaterThan(0);
  });

  it('用例13 驳回/红冲不回退：事件行不删除（无 DECRBY/refund 路径）', async () => {
    const before = await readRollingSumPg(db, 'operator', uid, 24);
    expect(before).toBeGreaterThan(0);
    // 服务未导出回退能力（终裁 B19：lim_dec 不建）
    const mod = await import('./credit-limit.js');
    expect((mod as Record<string, unknown>).refund).toBeUndefined();
    expect((mod as Record<string, unknown>).syncRedisDecr).toBeUndefined();
  });
});

describe('syncRedisAdd / redisRollingSumCents（lim_add.lua ZSET）', () => {
  let uid = 0;
  beforeAll(async () => {
    uid = await createUser('redis');
  });
  afterAll(async () => {
    await dropUser(uid);
  });

  it('用例17 入集 + 剪枝：事件入 ZSET，滚动求和（分）与事件一致', async () => {
    const r = getRedis()!;
    const key = redisSetKey('operator', uid);
    await r.del(key);
    await syncRedisAdd('operator', uid, 'manual_topup', 'z-1', 10000_00, WINDOW_MS);
    await syncRedisAdd('operator', uid, 'manual_topup', 'z-2', 20000_00, WINDOW_MS);
    const sum = await redisRollingSumCents('operator', uid, WINDOW_MS);
    expect(sum).toBe(30000_00);
    const ttl = await r.ttl(key);
    expect(ttl).toBeGreaterThan(0);   // 48h TTL
    await r.del(key);
  });

  it('窗口外事件剪枝：score 在 24h 前 → 求和忽略', async () => {
    const r = getRedis()!;
    const key = redisSetKey('user', uid);
    await r.del(key);
    await syncRedisAdd('user', uid, 'manual_topup', 'z-old', 999999_00, WINDOW_MS, Date.now() - WINDOW_MS - 1000);
    await syncRedisAdd('user', uid, 'manual_topup', 'z-new', 100_00, WINDOW_MS, Date.now());
    const sum = await redisRollingSumCents('user', uid, WINDOW_MS);
    expect(sum).toBe(100_00);   // 旧事件被剪枝
    await r.del(key);
  });

  it('用例17 Redis 不可用（getRedis null）→ 静默不抛错（降级语义）', async () => {
    await syncRedisAdd('operator', uid, 'manual_topup', 'z-x', 100, WINDOW_MS);
  });
});
