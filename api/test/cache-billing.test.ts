/**
 * 缓存命中打折计费单元测试 — Cache Billing（newapi-gap-analysis.md Batch 3 任务 3.2）
 *
 * 纯单测，无 db / redis 依赖（cache-billing 与 usage-parser 均为纯函数）。
 *
 * 覆盖：
 * - parseCacheTokens：Anthropic（cache_read_input_tokens）/ DeepSeek（hit+miss）/ OpenAI（cached_tokens）
 * - parseCacheTokens：无缓存字段 → hasCacheInfo=false；null/undefined 防御；单边字段推断
 * - computeCacheDiscountedCost：无缓存信息 → 全价；有命中 → 命中 10% 价 + discountAmount 正确；命中超 input 收敛
 * - parseAndDiscount：DeepSeek 混合、100% 命中最低价、Anthropic 端到端
 * - 回归：无缓存字段时输出与旧 computeCost 完全一致
 */

import { describe, it, expect } from 'vitest';
import { parseCacheTokens } from '../src/services/billing/usage-parser.js';
import {
  CACHE_HIT_DISCOUNT,
  computeCacheDiscountedCost,
  parseAndDiscount,
} from '../src/services/billing/cache-billing.js';

// ============================================================
// Helpers
// ============================================================

/** 测试单价（¥ / 1K tokens）：input=1, output=2，便于心算 */
const pricing = { input: 1, output: 2 };

/** 旧版 computeCost（chat.ts / openai-compat.ts 改造前的公式），用于回归对照 */
function oldComputeCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}

// ============================================================
// parseCacheTokens — 三种上游格式
// ============================================================

describe('parseCacheTokens - Anthropic 格式', () => {
  it('cache_read_input_tokens → 命中按该字段，miss = input - hit', () => {
    const usage = {
      prompt_tokens: 1500,
      completion_tokens: 100,
      total_tokens: 1600,
      cache_read_input_tokens: 1200,
      cache_creation_input_tokens: 200, // 写入缓存：全价，不计入命中
    };

    const result = parseCacheTokens(usage);

    expect(result.hasCacheInfo).toBe(true);
    expect(result.cacheHitTokens).toBe(1200);
    expect(result.cacheMissTokens).toBe(300); // 1500 - 1200（含 cache_creation 全价部分）
  });

  it('只有 cache_creation_input_tokens（无读取命中）→ 无缓存打折信息', () => {
    const usage = {
      prompt_tokens: 1000,
      completion_tokens: 100,
      total_tokens: 1100,
      cache_creation_input_tokens: 900,
    };

    const result = parseCacheTokens(usage);

    expect(result.hasCacheInfo).toBe(false);
    expect(result.cacheHitTokens).toBe(0);
    expect(result.cacheMissTokens).toBe(0);
  });
});

describe('parseCacheTokens - DeepSeek 格式', () => {
  it('prompt_cache_hit_tokens + prompt_cache_miss_tokens → 显式采信', () => {
    const usage = {
      prompt_tokens: 1500,
      completion_tokens: 100,
      total_tokens: 1600,
      prompt_cache_hit_tokens: 1000,
      prompt_cache_miss_tokens: 500,
    };

    const result = parseCacheTokens(usage);

    expect(result.hasCacheInfo).toBe(true);
    expect(result.cacheHitTokens).toBe(1000);
    expect(result.cacheMissTokens).toBe(500);
  });

  it('hit + miss 与 prompt_tokens 不一致 → 以显式字段为准，不强行对齐', () => {
    const usage = {
      prompt_tokens: 2000,
      prompt_cache_hit_tokens: 1000,
      prompt_cache_miss_tokens: 500, // 合计 1500 ≠ 2000，但仍原样采信
    };

    const result = parseCacheTokens(usage);

    expect(result.cacheHitTokens).toBe(1000);
    expect(result.cacheMissTokens).toBe(500);
  });

  it('只给 miss → hit 由 prompt_tokens 推断', () => {
    const usage = {
      prompt_tokens: 1500,
      prompt_cache_miss_tokens: 500,
    };

    const result = parseCacheTokens(usage);

    expect(result.hasCacheInfo).toBe(true);
    expect(result.cacheHitTokens).toBe(1000); // 1500 - 500
    expect(result.cacheMissTokens).toBe(500);
  });
});

describe('parseCacheTokens - OpenAI 格式', () => {
  it('prompt_tokens_details.cached_tokens → 命中按该字段，miss = input - hit', () => {
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      prompt_tokens_details: { cached_tokens: 60 },
    };

    const result = parseCacheTokens(usage);

    expect(result.hasCacheInfo).toBe(true);
    expect(result.cacheHitTokens).toBe(60);
    expect(result.cacheMissTokens).toBe(40); // 100 - 60
  });
});

describe('parseCacheTokens - 无缓存信息', () => {
  it('普通 usage（无任何缓存字段）→ hasCacheInfo=false', () => {
    const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };

    const result = parseCacheTokens(usage);

    expect(result.hasCacheInfo).toBe(false);
    expect(result.cacheHitTokens).toBe(0);
    expect(result.cacheMissTokens).toBe(0);
  });

  it('usage 为 null / undefined → hasCacheInfo=false，不抛错', () => {
    expect(parseCacheTokens(null)).toEqual({ cacheHitTokens: 0, cacheMissTokens: 0, hasCacheInfo: false });
    expect(parseCacheTokens(undefined)).toEqual({ cacheHitTokens: 0, cacheMissTokens: 0, hasCacheInfo: false });
    expect(parseCacheTokens('not-an-object')).toEqual({ cacheHitTokens: 0, cacheMissTokens: 0, hasCacheInfo: false });
  });
});

// ============================================================
// computeCacheDiscountedCost
// ============================================================

describe('computeCacheDiscountedCost', () => {
  it('无缓存信息 → 全价，discountAmount=0', () => {
    const result = computeCacheDiscountedCost(1000, 200, pricing, {
      cacheHitTokens: 0,
      cacheMissTokens: 0,
      hasCacheInfo: false,
    });

    expect(result.cost).toBeCloseTo(1.4, 9); // 1000/1000*1 + 200/1000*2
    expect(result.discountAmount).toBe(0);
  });

  it('cacheTokens 为 null → 全价', () => {
    const result = computeCacheDiscountedCost(1000, 200, pricing, null);

    expect(result.cost).toBeCloseTo(1.4, 9);
    expect(result.discountAmount).toBe(0);
  });

  it('有命中 → 命中部分按 10% 价，discountAmount = 全价 - 折后价', () => {
    const result = computeCacheDiscountedCost(1000, 200, pricing, {
      cacheHitTokens: 600,
      cacheMissTokens: 400,
      hasCacheInfo: true,
    });

    // 折后 = 600*1*0.1/1000 + 400*1/1000 + 200*2/1000 = 0.06 + 0.4 + 0.4
    expect(result.cost).toBeCloseTo(0.86, 9);
    expect(result.discountAmount).toBeCloseTo(0.54, 9); // 1.4 - 0.86
    expect(result.cacheHitTokens).toBe(600);
    expect(result.cacheMissTokens).toBe(400);
  });

  it('命中数超过 input → 收敛到 input，避免 (input - hit) 为负', () => {
    const result = computeCacheDiscountedCost(100, 0, pricing, {
      cacheHitTokens: 150,
      cacheMissTokens: 0,
      hasCacheInfo: true,
    });

    expect(result.cacheHitTokens).toBe(100);
    expect(result.cacheMissTokens).toBe(0);
    expect(result.cost).toBeCloseTo(0.01, 9); // 100*1*0.1/1000
    expect(result.discountAmount).toBeCloseTo(0.09, 9);
  });
});

// ============================================================
// parseAndDiscount — 端到端组合
// ============================================================

describe('parseAndDiscount', () => {
  it('DeepSeek 1000 hit + 500 miss 混合 → 折后价格正确', () => {
    const usage = {
      prompt_tokens: 1500,
      completion_tokens: 100,
      total_tokens: 1600,
      prompt_cache_hit_tokens: 1000,
      prompt_cache_miss_tokens: 500,
    };

    const result = parseAndDiscount(usage, pricing);

    // 折后 = 1000*1*0.1/1000 + 500*1/1000 + 100*2/1000 = 0.1 + 0.5 + 0.2
    expect(result.cost).toBeCloseTo(0.8, 9);
    expect(result.discountAmount).toBeCloseTo(0.9, 9); // 全价 1.5+0.2，折扣 0.9
    expect(result.cacheHitTokens).toBe(1000);
    expect(result.cacheMissTokens).toBe(500);
  });

  it('命中 100% → 折扣后最低价（输入部分全部按 10%）', () => {
    const usage = {
      prompt_tokens: 1000,
      completion_tokens: 100,
      total_tokens: 1100,
      prompt_cache_hit_tokens: 1000,
      prompt_cache_miss_tokens: 0,
    };

    const result = parseAndDiscount(usage, pricing);

    // 最低价 = 1000*1*0.1/1000 + 100*2/1000 = 0.1 + 0.2
    expect(result.cost).toBeCloseTo(0.3, 9);
    expect(result.cacheHitTokens).toBe(1000);
    expect(result.cacheMissTokens).toBe(0);
    expect(result.cost).toBeLessThan(oldComputeCost(1000, 100)); // 确实低于全价 1.2
  });

  it('Anthropic cache_read 端到端 → 命中打折、cache_creation 全价', () => {
    const usage = {
      prompt_tokens: 1500,
      completion_tokens: 100,
      total_tokens: 1600,
      cache_read_input_tokens: 1200,
      cache_creation_input_tokens: 200,
    };

    const result = parseAndDiscount(usage, pricing);

    // 折后 = 1200*1*0.1/1000 + 300*1/1000 + 100*2/1000 = 0.12 + 0.3 + 0.2
    expect(result.cost).toBeCloseTo(0.62, 9);
    expect(result.discountAmount).toBeCloseTo(1.08, 9); // 1.7 - 0.62
    expect(result.cacheHitTokens).toBe(1200);
    expect(result.cacheMissTokens).toBe(300);
  });

  it('usage 为 null → cost=0，discountAmount=0（不抛错）', () => {
    const result = parseAndDiscount(null, pricing);

    expect(result.cost).toBe(0);
    expect(result.discountAmount).toBe(0);
    expect(result.cacheHitTokens).toBe(0);
  });
});

// ============================================================
// 回归：无缓存信息时与旧 computeCost 完全一致
// ============================================================

describe('回归 - 无缓存字段行为不变', () => {
  it.each([
    [{ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }],
    [{ prompt_tokens: 1234, completion_tokens: 567, total_tokens: 1801 }],
    [{ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }],
    [{ prompt_tokens: 800, completion_tokens: 300, total_tokens: 1100 }],
  ])('usage %o → 折后价 === 旧 computeCost 全价', (usage) => {
    const result = parseAndDiscount(usage, pricing);

    const expected = oldComputeCost(
      Number(usage.prompt_tokens) || 0,
      Number(usage.completion_tokens) || 0,
    );
    expect(result.cost).toBe(expected);
    expect(result.discountAmount).toBe(0);
  });
});

// ============================================================
// 常量
// ============================================================

describe('CACHE_HIT_DISCOUNT', () => {
  it('命中按 10% 计费（可配置常量）', () => {
    expect(CACHE_HIT_DISCOUNT).toBe(0.1);
  });
});
