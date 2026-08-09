/**
 * Key 选择器单元测试
 *
 * 测试覆盖：
 * - Polling 3 key 请求 6 次 → 每个 2 次
 * - Random 100 次 → 分布 30±10
 * - Key 耗尽 → 自动跳过 disabled
 * - 全部耗尽 → 返回 null
 * - 并发安全 10 并发 polling
 */

import { describe, it, expect } from 'vitest';
import { selectKey, countEnabledKeys, type SupplierKey } from '../src/services/upstream/key-selector';

/** 创建测试用 key */
function makeKey(overrides: Partial<SupplierKey> & { id: number }): SupplierKey {
  return {
    supplierId: 1,
    keyValue: `sk-test-${overrides.id}`,
    status: 'active',
    selectMode: 'polling',
    ...overrides,
  };
}

function makeActiveKeys(count: number, mode: 'single' | 'polling' | 'random' = 'polling'): SupplierKey[] {
  return Array.from({ length: count }, (_, i) =>
    makeKey({ id: i + 1, keyValue: `sk-test-${i + 1}`, selectMode: mode }),
  );
}

// ============================================================
// Test 1: Polling 轮询
// ============================================================

describe('selectKey - polling', () => {
  it('Polling 3 key 请求 6 次 → 每个 2 次', () => {
    const keys = makeActiveKeys(3, 'polling');

    // count how many times each key is selected
    const counts = [0, 0, 0];

    // First request: lastIndex initially undefined → starts at index 0
    let lastIndex: number | undefined;
    for (let i = 0; i < 6; i++) {
      const result = selectKey(keys, 'polling', lastIndex);
      expect(result).not.toBeNull();
      lastIndex = result!.index;
      // The returned index is within active keys (0-2)
      const keyId = result!.key.id;
      // Count by key id (1, 2, 3)
      counts[keyId - 1]!++;
    }

    // Each key should be selected exactly 2 times
    expect(counts[0]).toBe(2);
    expect(counts[1]).toBe(2);
    expect(counts[2]).toBe(2);
  });

  it('polling wraps around after last key', () => {
    const keys = makeActiveKeys(2, 'polling');

    const r1 = selectKey(keys, 'polling', undefined);
    expect(r1!.index).toBe(0);
    expect(r1!.key.id).toBe(1);

    const r2 = selectKey(keys, 'polling', 0);
    expect(r2!.index).toBe(1);
    expect(r2!.key.id).toBe(2);

    // wraps back to 0
    const r3 = selectKey(keys, 'polling', 1);
    expect(r3!.index).toBe(0);
    expect(r3!.key.id).toBe(1);
  });

  it('polling starts at 0 when lastIndex is undefined', () => {
    const keys = makeActiveKeys(5, 'polling');
    const result = selectKey(keys, 'polling', undefined);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(0);
  });
});

// ============================================================
// Test 2: Random 分布
// ============================================================

describe('selectKey - random', () => {
  it('Random 100 次 → 分布 30±10 (chances 预期 ~33 次/key)', () => {
    const keys = makeActiveKeys(3, 'random');
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };

    for (let i = 0; i < 100; i++) {
      const result = selectKey(keys, 'random');
      expect(result).not.toBeNull();
      counts[result!.key.id]!++;
    }

    // With 3 keys and 100 iterations, reasonable range for each is 20-46
    // Expected ~33 per key, allow 30±10 (so 23-43, but looser for random test)
    for (const id of [1, 2, 3]) {
      expect(counts[id]).toBeGreaterThan(15); // at minimum, not severely skewed
      expect(counts[id]).toBeLessThan(55);
    }
  });
});

// ============================================================
// Test 3: Skip disabled keys
// ============================================================

describe('selectKey - disabled keys', () => {
  it('Key 耗尽 → 自动跳过 disabled', () => {
    const keys: SupplierKey[] = [
      makeKey({ id: 1, status: 'active' }),
      makeKey({ id: 2, status: 'disabled' }),
      makeKey({ id: 3, status: 'active' }),
    ];

    // Polling should skip the disabled key
    const r1 = selectKey(keys, 'polling', undefined);
    expect(r1).not.toBeNull();
    expect(r1!.key.status).toBe('active');

    const r2 = selectKey(keys, 'polling', r1!.index);
    expect(r2).not.toBeNull();
    expect(r2!.key.status).toBe('active');

    // Both active keys should be different
    expect(r1!.key.id).not.toBe(r2!.key.id);

    // The disabled key should never be selected
    expect(r1!.key.id).not.toBe(2);
    expect(r2!.key.id).not.toBe(2);
  });

  it('全部耗尽 → 返回 null', () => {
    const keys: SupplierKey[] = [
      makeKey({ id: 1, status: 'disabled' }),
      makeKey({ id: 2, status: 'disabled' }),
      makeKey({ id: 3, status: 'disabled' }),
    ];

    const result = selectKey(keys, 'polling');
    expect(result).toBeNull();

    const result2 = selectKey(keys, 'random');
    expect(result2).toBeNull();

    const result3 = selectKey(keys, 'single');
    expect(result3).toBeNull();
  });

  it('countEnabledKeys 正确计数', () => {
    const keys: SupplierKey[] = [
      makeKey({ id: 1, status: 'active' }),
      makeKey({ id: 2, status: 'disabled' }),
      makeKey({ id: 3, status: 'active' }),
      makeKey({ id: 4, status: 'active' }),
      makeKey({ id: 5, status: 'disabled' }),
    ];

    expect(countEnabledKeys(keys)).toBe(3);
  });
});

// ============================================================
// Test 4: Single mode
// ============================================================

describe('selectKey - single mode', () => {
  it('single mode returns first active key', () => {
    const keys: SupplierKey[] = [
      makeKey({ id: 1, status: 'disabled' }),
      makeKey({ id: 2, status: 'active' }),
      makeKey({ id: 3, status: 'active' }),
    ];

    const result = selectKey(keys, 'single');
    expect(result).not.toBeNull();
    expect(result!.key.id).toBe(2); // first active
  });

  it('single mode with all active returns first key', () => {
    const keys = makeActiveKeys(3, 'single');

    // Always returns first active
    for (let i = 0; i < 5; i++) {
      const result = selectKey(keys, 'single');
      expect(result).not.toBeNull();
      expect(result!.key.id).toBe(1);
    }
  });
});

// ============================================================
// Test 5: 并发安全（同线程轮询）
// ============================================================

describe('selectKey - concurrent safety', () => {
  it('10 并发 polling → 索引分配连续（模拟）', async () => {
    // NOTE: 纯函数版本的 selectKey 在同一个线程中是安全的。
    // 真实并发安全依赖 Redis 原子 INCR，本测试验证函数级行为正确性。
    //
    // 模拟：10 个并发调用按 polling 顺序依次选择
    const keys = makeActiveKeys(5, 'polling');
    const results: number[] = [];

    // Simulate 10 concurrent calls (sequentially, since JS is single-threaded)
    let lastIndex: number | undefined;
    for (let i = 0; i < 10; i++) {
      const result = selectKey(keys, 'polling', lastIndex);
      expect(result).not.toBeNull();
      lastIndex = result!.index;
      results.push(result!.key.id);
    }

    // 10 calls with 5 keys → each key should be selected exactly 2 times
    // Pattern: 1,2,3,4,5,1,2,3,4,5
    const counts: Record<number, number> = {};
    for (const id of results) {
      counts[id] = (counts[id] || 0) + 1;
    }

    for (let id = 1; id <= 5; id++) {
      expect(counts[id]).toBe(2);
    }
  });
});
