/**
 * 用户消费预算熔断（§20.1）单元测试
 *
 * decideBudget 为纯函数，覆盖全部判定分支；assertWithinBudget 用 db mock 验证
 * 「未设置放通 / 超限 429 / 告警放通 / 依赖异常 fail-open」四条主链路。
 *
 * 覆盖任务测试要求：
 *   - 设置日限额 $1.00（100 分），已用 $1.50（150 分）→ 硬阻断拒绝
 *   - 告警阈值 80%，用量到 80% → 记录告警但放通
 *   - 未设置预算的用户 → 不阻断（向后兼容）
 *   - DB 异常 → fail-open 放通
 *
 * @module services/billing
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ───────── mock db（assertWithinBudget 走 db.select + db.execute） ─────────
// vi.mock 被提升到文件顶部，mock 句柄必须用 vi.hoisted 声明
const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  where: vi.fn(),
  from: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('../../db/index.js', () => {
  mocks.where.mockImplementation(() => ({ limit: mocks.limit }));
  mocks.from.mockImplementation(() => ({ where: mocks.where }));
  return {
    db: {
      select: vi.fn(() => ({ from: mocks.from })),
      execute: mocks.execute,
    },
    schema: { userBudgetSettings: { userId: 'user_id' } },
  };
});

import { decideBudget, assertWithinBudget, type UserBudgetRow, type UserBudgetUsage } from './budget.js';
import { BudgetLimitExceededError } from '../../lib/errors.js';

/** 构造预算设置行（按需覆盖） */
function settings(over: Partial<UserBudgetRow> = {}): UserBudgetRow {
  return {
    id: 1,
    userId: 1,
    dailyLimitCents: null,
    monthlyLimitCents: null,
    alertThreshold: 80,
    hardBlock: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as UserBudgetRow;
}

const usage = (todayCents: number, monthCents: number): UserBudgetUsage => ({ todayCents, monthCents });

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════ decideBudget（纯函数）═══════════════

describe('decideBudget', () => {
  it('未设置预算（null）→ 放通，不阻断不告警', () => {
    const d = decideBudget(null, usage(1500, 9000), 100);
    expect(d.allowed).toBe(true);
    expect(d.blocked).toBe(false);
    expect(d.alert).toBe(false);
  });

  it('日限额 $1.00（100 分），已用 $1.50（150 分）→ 硬阻断（daily）', () => {
    const d = decideBudget(settings({ dailyLimitCents: 100, hardBlock: true }), usage(150, 0), 0);
    expect(d.blocked).toBe(true);
    expect(d.allowed).toBe(false);
    expect(d.blockedPeriod).toBe('daily');
  });

  it('日限额内且未到告警阈值 → 放通不告警', () => {
    const d = decideBudget(settings({ dailyLimitCents: 1000 }), usage(500, 0), 200);
    // projected = 700 / 1000 = 70% < 80%
    expect(d.allowed).toBe(true);
    expect(d.blocked).toBe(false);
    expect(d.alert).toBe(false);
  });

  it('用量达 80% 阈值 → 放通但告警', () => {
    const d = decideBudget(settings({ dailyLimitCents: 1000, alertThreshold: 80 }), usage(700, 0), 100);
    // projected = 800 / 1000 = 80% >= 80%
    expect(d.allowed).toBe(true);
    expect(d.blocked).toBe(false);
    expect(d.alert).toBe(true);
    expect(d.alertMessage).toContain('今日');
  });

  it('硬阻断关闭（hardBlock=false）超限额 → 不阻断，仅告警', () => {
    const d = decideBudget(settings({ dailyLimitCents: 100, hardBlock: false }), usage(150, 0), 0);
    expect(d.blocked).toBe(false);
    expect(d.allowed).toBe(true);
    expect(d.alert).toBe(true);
  });

  it('月限额超限 → 硬阻断（monthly）', () => {
    const d = decideBudget(settings({ monthlyLimitCents: 10000, hardBlock: true }), usage(0, 9500), 600);
    // projected month = 10100 > 10000
    expect(d.blocked).toBe(true);
    expect(d.blockedPeriod).toBe('monthly');
  });

  it('限额均为 null（不限）→ 任意用量都放通', () => {
    const d = decideBudget(settings({ dailyLimitCents: null, monthlyLimitCents: null }), usage(999999, 999999), 500);
    expect(d.allowed).toBe(true);
    expect(d.blocked).toBe(false);
    expect(d.alert).toBe(false);
  });

  it('告警阈值调高到 90%，80% 用量 → 不告警', () => {
    const d = decideBudget(settings({ dailyLimitCents: 1000, alertThreshold: 90 }), usage(800, 0), 0);
    expect(d.alert).toBe(false);
    expect(d.allowed).toBe(true);
  });
});

// ═══════════════ assertWithinBudget（db mock）═══════════════

describe('assertWithinBudget', () => {
  it('未设置预算的用户 → 不阻断', async () => {
    mocks.limit.mockResolvedValue([]); // getBudgetSettings → 无记录
    mocks.execute.mockResolvedValue([{ today_cost: '5.00', month_cost: '10.00' }]);
    await expect(assertWithinBudget(1, 2.0)).resolves.toBeUndefined();
  });

  it('日限额 $1.00、已用 $1.50、本次 $0.50 → 抛 BudgetLimitExceededError(429)', async () => {
    mocks.limit.mockResolvedValue([settings({ dailyLimitCents: 100, hardBlock: true })]);
    // today_cost=1.50 → 150 分；本次 0.50 元 → 50 分；projected=200 > 100
    mocks.execute.mockResolvedValue([{ today_cost: '1.50', month_cost: '1.50' }]);
    const err = await assertWithinBudget(1, 0.5).catch((e) => e);
    expect(err).toBeInstanceOf(BudgetLimitExceededError);
    expect((err as BudgetLimitExceededError).statusCode).toBe(429);
    expect((err as BudgetLimitExceededError).code).toBe('BUDGET_LIMIT_EXCEEDED');
  });

  it('用量到 80% 阈值 → 放通不抛错（告警仅记日志）', async () => {
    mocks.limit.mockResolvedValue([settings({ dailyLimitCents: 1000, alertThreshold: 80, hardBlock: true })]);
    // today 7.00 元=700 分；本次 1.00 元=100 分；projected=800=80%
    mocks.execute.mockResolvedValue([{ today_cost: '7.00', month_cost: '7.00' }]);
    await expect(assertWithinBudget(1, 1.0)).resolves.toBeUndefined();
  });

  it('预估费用 <= 0 → 直接放通，不查库', async () => {
    await expect(assertWithinBudget(1, 0)).resolves.toBeUndefined();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('DB 查询异常 → fail-open 放通（不阻断主链路）', async () => {
    mocks.execute.mockRejectedValue(new Error('connection refused'));
    await expect(assertWithinBudget(1, 1.0)).resolves.toBeUndefined();
  });
});
