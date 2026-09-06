/**
 * 操作摘要 canonical 化 / 哈希 / 非空断言 单测（ADR-0008：令牌绑定 operation summary）。
 *
 * 覆盖 ISSUE #25 三缺口之一「operation-summary 绑定」的纯函数层：
 *   - canonical 化：对象键排序、数组保序、undefined 剔除、非有限数拒绝
 *   - 哈希：SHA-256 确定性
 *   - 断言：空摘要（null/undefined/空对象/空数组）一律拒绝
 *
 * @see docs/09-decisions/ADR-0008-operation-2fa.md
 * @module lib/operation-summary.test
 */

import { describe, it, expect } from 'vitest';
import {
  canonicalizeOperationSummary,
  hashOperationSummary,
  assertOperationSummary,
} from './operation-summary.js';

describe('canonicalizeOperationSummary（canonical JSON）', () => {
  it('对象键按字典序排序（与书写顺序无关）', () => {
    const a = canonicalizeOperationSummary({ b: 1, a: 2, c: 3 });
    const b = canonicalizeOperationSummary({ c: 3, a: 2, b: 1 });
    expect(a).toBe('{"a":2,"b":1,"c":3}');
    expect(a).toBe(b);
  });

  it('数组保持元素顺序（顺序变化 → canonical 不同）', () => {
    expect(canonicalizeOperationSummary([1, 2, 3])).toBe('[1,2,3]');
    expect(canonicalizeOperationSummary([1, 2, 3])).not.toBe(canonicalizeOperationSummary([3, 2, 1]));
  });

  it('undefined 字段被剔除，null 保留', () => {
    expect(canonicalizeOperationSummary({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it('嵌套对象递归 canonical 化', () => {
    const a = canonicalizeOperationSummary({ x: { y: 1, z: 2 }, w: [3, { q: 4 }] });
    expect(a).toBe('{"w":[3,{"q":4}],"x":{"y":1,"z":2}}');
  });

  it('非有限数字（NaN/Infinity）→ 抛错', () => {
    expect(() => canonicalizeOperationSummary({ amount: Number.NaN })).toThrow();
    expect(() => canonicalizeOperationSummary({ amount: Infinity })).toThrow();
  });
});

describe('hashOperationSummary（SHA-256）', () => {
  it('同一摘要哈希确定（同输入同输出）', () => {
    const h1 = hashOperationSummary({ type: 'topup', amount: 100 });
    const h2 = hashOperationSummary({ type: 'topup', amount: 100 });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('不同摘要哈希不同', () => {
    expect(hashOperationSummary({ type: 'topup', amount: 100 }))
      .not.toBe(hashOperationSummary({ type: 'topup', amount: 101 }));
  });

  it('键顺序不影响哈希（canonical 保证）', () => {
    expect(hashOperationSummary({ b: 1, a: 2 })).toBe(hashOperationSummary({ a: 2, b: 1 }));
  });
});

describe('assertOperationSummary（非空强制）', () => {
  it('null / undefined → 抛错', () => {
    expect(() => assertOperationSummary(null)).toThrow();
    expect(() => assertOperationSummary(undefined)).toThrow();
  });

  it('空对象 / 空数组 → 抛错（空摘要无法证明用户意图）', () => {
    expect(() => assertOperationSummary({})).toThrow();
    expect(() => assertOperationSummary([])).toThrow();
  });

  it('合法摘要 → 返回其 SHA-256', () => {
    expect(assertOperationSummary({ type: 'refund', amount: 88 }))
      .toBe(hashOperationSummary({ type: 'refund', amount: 88 }));
  });
});
