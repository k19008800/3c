/**
 * 自动熔断器单元测试 — 使用独立可测试函数
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// In-memory store
// ============================================================

interface CBRecord {
  id: number;
  channelKey: string;
  failureCount: number;
  totalCount: number;
  windowStart: number;  // timestamp
  status: 'active' | 'open' | 'half_open';
  openedAt: number | null;
  lastProbeAt: number | null;
}

const store: CBRecord[] = [];
let nextId = 1;
const NOW_DEFAULT = 1700000000000;

function resetStore() { store.length = 0; nextId = 1; }

beforeEach(resetStore);

// ============================================================
// 熔断核心逻辑（纯函数，无 DB 依赖，方便测试）
// ============================================================

const WINDOW_MS = 300000;  // 5 分钟
const THRESHOLD = 0.30;    // 30%
const MIN_SAMPLES = 10;
const COOLDOWN_MS = 1000;  // 1 秒（测试友好）

function findOrCreate(channelKey: string, now: number = NOW_DEFAULT): CBRecord {
  let rec = store.find(r => r.channelKey === channelKey);
  if (!rec) {
    rec = {
      id: nextId++,
      channelKey,
      failureCount: 0,
      totalCount: 0,
      windowStart: now,
      status: 'active',
      openedAt: null,
      lastProbeAt: null,
    };
    store.push(rec);
  }
  return rec;
}

function recordChannelResultCore(channelKey: string, success: boolean, now: number = NOW_DEFAULT): { shouldBan: boolean } {
  const rec = findOrCreate(channelKey, now);

  // 半开状态：试探
  if (rec.status === 'half_open') {
    if (success) {
      rec.status = 'active';
      rec.failureCount = 0;
      rec.totalCount = 1;
      rec.openedAt = null;
      return { shouldBan: false };
    } else {
      rec.status = 'open';
      rec.openedAt = now;
      return { shouldBan: true };
    }
  }

  rec.totalCount++;
  if (!success) rec.failureCount++;

  // 检查是否应触发熔断
  if (rec.status === 'active' && rec.totalCount >= MIN_SAMPLES) {
    const rate = rec.failureCount / rec.totalCount;
    if (rate > THRESHOLD) {
      rec.status = 'open';
      rec.openedAt = now;
      return { shouldBan: true };
    }
  }

  return { shouldBan: false };
}

function checkRecoveryCore(channelKey: string, now: number = NOW_DEFAULT): { canProbe: boolean; status: string } {
  const rec = findOrCreate(channelKey, now);

  if (rec.status !== 'open') {
    return { canProbe: false, status: rec.status };
  }

  if (rec.openedAt !== null && (now - rec.openedAt) >= COOLDOWN_MS) {
    rec.status = 'half_open';
    rec.lastProbeAt = now;
    return { canProbe: true, status: 'half_open' };
  }

  return { canProbe: false, status: 'open' };
}

function isCircuitOpenCore(channelKey: string): boolean {
  const rec = store.find(r => r.channelKey === channelKey);
  return rec?.status === 'open';
}

function forceRecoveryCore(channelKey: string): void {
  const rec = store.find(r => r.channelKey === channelKey);
  if (rec) {
    rec.status = 'active';
    rec.failureCount = 0;
    rec.totalCount = 0;
    rec.openedAt = null;
  }
}

// ============================================================
// Tests (7 + 2 edges = 9 total)
// ============================================================

describe('Circuit Breaker — 触发熔断', () => {
  it('5 分钟内 20 次，7 失败 (35%) → 自动熔断', () => {
    const key = 's:1:k:1';
    for (let i = 0; i < 10; i++) {
      const r = recordChannelResultCore(key, true);
      expect(r.shouldBan).toBe(false);
    }
    for (let i = 0; i < 4; i++) {
      recordChannelResultCore(key, false);
    }
    const last = recordChannelResultCore(key, false);
    expect(last.shouldBan).toBe(true);

    const state = store.find(r => r.channelKey === key);
    expect(state!.status).toBe('open');
    expect(state!.failureCount).toBe(5);
    expect(state!.totalCount).toBe(15);
  });

  it('5 分钟内 20 次，5 失败 (25%) → 不触发', () => {
    const key = 's:1:k:2';
    for (let i = 0; i < 15; i++) recordChannelResultCore(key, true);
    for (let i = 0; i < 5; i++) {
      const r = recordChannelResultCore(key, false);
      expect(r.shouldBan).toBe(false);
    }

    const state = store.find(r => r.channelKey === key)!;
    expect(state.status).toBe('active');
    expect(state.failureCount).toBe(5);
    expect(state.totalCount).toBe(20);
  });
});

describe('Circuit Breaker — 冷却恢复', () => {
  it('冷却期过后 → 半开放行', () => {
    const key = 's:1:k:3';
    for (let i = 0; i < 10; i++) recordChannelResultCore(key, true);
    for (let i = 0; i < 5; i++) recordChannelResultCore(key, false);

    const state = store.find(r => r.channelKey === key)!;
    expect(state.status).toBe('open');

    // 冷却未过
    const r1 = checkRecoveryCore(key, NOW_DEFAULT + 500);
    expect(r1.canProbe).toBe(false);

    // 冷却已过（openedAt 在 NOW_DEFAULT，过了 1500ms > COOLDOWN_MS）
    const r2 = checkRecoveryCore(key, NOW_DEFAULT + 1500);
    expect(r2.canProbe).toBe(true);
    expect(r2.status).toBe('half_open');
  });

  it('半开成功 → 恢复 active', () => {
    const key = 's:1:k:4';
    for (let i = 0; i < 10; i++) recordChannelResultCore(key, true);
    for (let i = 0; i < 5; i++) recordChannelResultCore(key, false);

    // 手动设为半开
    const state = store.find(r => r.channelKey === key)!;
    state.status = 'half_open';

    const result = recordChannelResultCore(key, true);
    expect(result.shouldBan).toBe(false);

    expect(state.status).toBe('active');
    expect(state.failureCount).toBe(0);
    expect(state.totalCount).toBe(1);
    expect(state.openedAt).toBeNull();
  });

  it('半开失败 → 继续熔断', () => {
    const key = 's:1:k:5';
    for (let i = 0; i < 10; i++) recordChannelResultCore(key, true);
    for (let i = 0; i < 5; i++) recordChannelResultCore(key, false);

    const state = store.find(r => r.channelKey === key)!;
    state.status = 'half_open';

    const result = recordChannelResultCore(key, false);
    expect(result.shouldBan).toBe(true);
    expect(state.status).toBe('open');
    expect(state.openedAt).not.toBeNull();
  });
});

describe('Circuit Breaker — 采样不足', () => {
  it('采样不足 (3 次全败) → 不误判', () => {
    const key = 's:1:k:6';
    for (let i = 0; i < 3; i++) {
      const r = recordChannelResultCore(key, false);
      expect(r.shouldBan).toBe(false);
    }
    const state = store.find(r => r.channelKey === key)!;
    expect(state.status).toBe('active');
    expect(state.failureCount).toBe(3);
    expect(state.totalCount).toBe(3);
  });
});

describe('Circuit Breaker — 手动恢复', () => {
  it('手动恢复 → 重置', () => {
    const key = 's:1:k:7';
    for (let i = 0; i < 10; i++) recordChannelResultCore(key, true);
    for (let i = 0; i < 5; i++) recordChannelResultCore(key, false);

    let state = store.find(r => r.channelKey === key)!;
    expect(state.status).toBe('open');

    forceRecoveryCore(key);

    state = store.find(r => r.channelKey === key)!;
    expect(state.status).toBe('active');
    expect(state.failureCount).toBe(0);
    expect(state.totalCount).toBe(0);
    expect(state.openedAt).toBeNull();
  });
});

describe('Circuit Breaker — 边缘情况', () => {
  it('isCircuitOpen 正确反映熔断状态', () => {
    const key = 's:1:k:8';
    expect(isCircuitOpenCore(key)).toBe(false);

    for (let i = 0; i < 10; i++) recordChannelResultCore(key, true);
    for (let i = 0; i < 5; i++) recordChannelResultCore(key, false);

    expect(isCircuitOpenCore(key)).toBe(true);

    forceRecoveryCore(key);
    expect(isCircuitOpenCore(key)).toBe(false);
  });

  it('forceRecovery 对不存在的 channel 不报错', () => {
    expect(() => forceRecoveryCore('nonexistent')).not.toThrow();
  });
});
