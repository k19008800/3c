/**
 * Key 选择器 — 从一组 supplier keys 中按指定模式选择一个可用 key
 *
 * 支持三种选择模式：
 * - single：尝试第一个 active key
 * - polling：轮询（递增索引 % keys.length）
 * - random：随机选择
 *
 * 自动跳过 status='disabled' 的 key
 *
 * @see newapi-migration-guide.md §1.4 多 Key 轮询 + §1.5 自动熔断
 * @module services/upstream
 */

export interface SupplierKey {
  id: number;
  supplierId: number;
  keyValue: string;
  name?: string | null;
  status: string; // 'active' | 'disabled'
  selectMode: string; // 'single' | 'polling' | 'random'
  currentBalance?: string | null;
  priority?: number | null;
}

export interface SelectKeyResult {
  key: SupplierKey;
  index: number;
}

/**
 * 从一组 supplier keys 中选择一个可用 key
 *
 * @param keys - 候选 key 数组（包含 active 和 disabled）
 * @param mode - 选择模式：'single' | 'polling' | 'random'
 * @param lastIndex - polling 模式下上次使用的索引（传入上一次的 index，返回新的 index+1）
 * @returns 选中的 key 及其在原数组中的索引，无可用 key 时返回 null
 *
 * @example
 * ```ts
 * // Polling: 传入上次索引，返回新索引
 * const r1 = selectKey(keys, 'polling', 0); // → { key: keys[0], index: 0 }
 * const r2 = selectKey(keys, 'polling', 1); // → { key: keys[1], index: 1 }
 * const r3 = selectKey(keys, 'polling', 2); // → { key: keys[0], index: 0 } (wrap)
 * ```
 */
export function selectKey(
  keys: SupplierKey[],
  mode: 'single' | 'polling' | 'random',
  lastIndex?: number,
): SelectKeyResult | null {
  // 筛选 active keys，保留原始索引
  const activeEntries = keys
    .map((key, idx) => ({ key, idx }))
    .filter(({ key }) => key.status === 'active');

  if (activeEntries.length === 0) {
    return null;
  }

  switch (mode) {
    case 'single': {
      // 直接返回第一个 active key
      const entry = activeEntries[0]!;
      return { key: entry.key, index: entry.idx };
    }

    case 'polling': {
      // 轮询：递增索引 % activeKeys.length
      const next = ((lastIndex ?? -1) + 1) % activeEntries.length;
      const entry = activeEntries[next]!;
      return { key: entry.key, index: next };
    }

    case 'random': {
      // 随机选择
      const randIdx = Math.floor(Math.random() * activeEntries.length);
      const entry = activeEntries[randIdx]!;
      return { key: entry.key, index: entry.idx };
    }

    default:
      return null;
  }
}

/**
 * 获取启用 key 的数量（用于调试/监控）
 */
export function countEnabledKeys(keys: SupplierKey[]): number {
  return keys.filter((k) => k.status === 'active').length;
}
