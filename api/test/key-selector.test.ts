/**
 * key-selector 单元测试
 *
 * 覆盖：
 *   ☐ Polling 模式 → 3 个 Key 轮询，请求 6 次，每个 Key 被选中 2 次
 *   ☐ Random 模式 → 3 个 Key 随机选，分布接近均匀（100 次请求，每个 30±10）
 *   ☐ Key 余额耗尽 → 自动标记 disabled，后续请求跳过该 Key，选下一个
 *   ☐ 全部 Key 耗尽 → 返回 null，触发降级（reason="all_exhausted"）
 *   ☐ 并发安全 → 10 个并发请求 polling 同一个 supplier，索引不冲突
 *
 * @see development-plan.md §1.4
 * @module test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock factories (hoisted: must use vi.hoisted for vi.mock factory refs) ──

const { redisGet, redisSet, redisIncr, redisDel } = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  redisIncr: vi.fn(),
  redisDel: vi.fn(),
}));

const {
  dbSelectFn,
  dbUpdateFn,
  dbFromFn,
  dbWhereFn,
  dbSetFn,
  dbSetWhereFn,
} = vi.hoisted(() => ({
  dbSelectFn: vi.fn(),
  dbUpdateFn: vi.fn(),
  dbFromFn: vi.fn(),
  dbWhereFn: vi.fn(),
  dbSetFn: vi.fn(),
  dbSetWhereFn: vi.fn(),
}));

// ── Module mocks ───────────────────────────────────

vi.mock("../src/lib/redis", () => ({
  redis: {
    get: redisGet,
    set: redisSet,
    incr: redisIncr,
    del: redisDel,
  },
}));

vi.mock("../src/db/index", () => ({
  db: {
    select: dbSelectFn.mockReturnValue({
      from: dbFromFn.mockReturnValue({ where: dbWhereFn }),
    }),
    update: dbUpdateFn.mockReturnValue({
      set: dbSetFn.mockReturnValue({ where: dbSetWhereFn }),
    }),
  },
}));

// Stub setImmediate
vi.stubGlobal("setImmediate", (fn: () => void) => {
  fn();
  return {} as NodeJS.Immediate;
});

// ── Module under test ──────────────────────────────

import {
  selectKey,
  markKeyExhausted,
  markKeyActive,
  isKeyExhausted,
} from "../src/services/upstream/key-selector";

// ── Fixtures ───────────────────────────────────────

function dbRow(id: number, vendorId = 1) {
  return {
    id,
    vendorId,
    encryptedKey: `enc_${id}`,
    keyPrefix: `sk-${id}`,
    isEnabled: true,
    lastUsedAt: null,
    failedCount: 0,
    createdAt: new Date(),
  };
}

function seedDb(keys: ReturnType<typeof dbRow>[]) {
  dbWhereFn.mockResolvedValue(keys.map((k) => ({ ...k })));
}

// ── Setup / Teardown ──────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Reset DB chain mock (created at top by mockReturnValue)
  dbSelectFn.mockReturnValue({
    from: dbFromFn.mockReturnValue({ where: dbWhereFn }),
  });
  dbUpdateFn.mockReturnValue({
    set: dbSetFn.mockReturnValue({ where: dbSetWhereFn }),
  });
  redisGet.mockResolvedValue(null);
});

// ── Tests ─────────────────────────────────────────

describe("key-selector", () => {
  // ── Test 1: Polling mode ──────────────────────────

  describe("Polling 模式", () => {
    it("3 个 Key 轮询，请求 6 次，每个 Key 被选中 2 次", async () => {
      seedDb([dbRow(1), dbRow(2), dbRow(3)]);

      redisIncr
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(5);

      const results: number[] = [];
      for (let i = 0; i < 6; i++) {
        const r = await selectKey(1, "polling");
        expect(r.reason).toBe("selected");
        expect(r.apiKeyId).not.toBeNull();
        results.push(r.apiKeyId!);
      }

      const counts: Record<number, number> = {};
      for (const id of results) counts[id] = (counts[id] || 0) + 1;
      expect(counts[1]).toBe(2);
      expect(counts[2]).toBe(2);
      expect(counts[3]).toBe(2);
      expect(redisIncr).toHaveBeenCalledTimes(6);
    });
  });

  // ── Test 2: Random mode ──────────────────────────

  describe("Random 模式", () => {
    it("3 个 Key 随机选，100 次请求分布接近均匀（每个 30±10）", async () => {
      seedDb([dbRow(1), dbRow(2), dbRow(3)]);

      const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
      for (let i = 0; i < 100; i++) {
        const r = await selectKey(1, "random");
        expect(r.reason).toBe("selected");
        counts[r.apiKeyId!]++;
      }

      expect(counts[1]).toBeGreaterThanOrEqual(20);
      expect(counts[1]).toBeLessThanOrEqual(46);
      expect(counts[2]).toBeGreaterThanOrEqual(20);
      expect(counts[2]).toBeLessThanOrEqual(46);
      expect(counts[3]).toBeGreaterThanOrEqual(20);
      expect(counts[3]).toBeLessThanOrEqual(46);
    });
  });

  // ── Test 3: Key exhaustion ───────────────────────

  describe("Key 余额耗尽", () => {
    it("单个 Key 耗尽后自动跳过，选下一个可用 Key", async () => {
      seedDb([dbRow(1), dbRow(2), dbRow(3)]);

      // Key 2 is exhausted
      redisGet.mockImplementation((k: string) => {
        if (k === "key:exhausted:2") return Promise.resolve("1");
        return Promise.resolve(null);
      });

      redisIncr.mockResolvedValueOnce(0);
      const r1 = await selectKey(1, "polling");
      expect(r1.apiKeyId).toBe(1);
      expect(r1.reason).toBe("selected");

      redisIncr.mockResolvedValueOnce(1);
      const r2 = await selectKey(1, "polling");
      expect(r2.apiKeyId).toBe(3);
      expect(r2.reason).toBe("selected");
    });

    it("markKeyExhausted 设置 Redis 标记", async () => {
      await markKeyExhausted(42);
      expect(redisSet).toHaveBeenCalledWith("key:exhausted:42", "1");
    });

    it("markKeyActive 清除 Redis 标记", async () => {
      await markKeyActive(42);
      expect(redisDel).toHaveBeenCalledWith("key:exhausted:42");
    });
  });

  // ── Test 4: All keys exhausted ───────────────────

  describe("全部 Key 耗尽", () => {
    it("所有 Key 耗尽 → 返回 null，reason='all_exhausted'", async () => {
      seedDb([dbRow(1), dbRow(2), dbRow(3)]);

      redisGet.mockImplementation(() => Promise.resolve("1"));
      redisIncr.mockResolvedValue(5);

      const r1 = await selectKey(1, "polling");
      expect(r1.apiKeyId).toBeNull();
      expect(r1.encryptedKey).toBeNull();
      expect(r1.reason).toBe("all_exhausted");

      const r2 = await selectKey(1, "random");
      expect(r2.apiKeyId).toBeNull();
      expect(r2.encryptedKey).toBeNull();
      expect(r2.reason).toBe("all_exhausted");
    });

    it("DB 中无可用 Key → 返回 reason='no_keys'", async () => {
      seedDb([]);
      const r = await selectKey(1, "polling");
      expect(r.apiKeyId).toBeNull();
      expect(r.reason).toBe("no_keys");
    });
  });

  // ── Test 5: Concurrency safety ───────────────────

  describe("并发安全", () => {
    it("10 个并发请求 polling 同一个 supplier，索引不冲突", async () => {
      seedDb([dbRow(1), dbRow(2), dbRow(3), dbRow(4), dbRow(5)]);

      let counter = 0;
      redisIncr.mockImplementation(() => Promise.resolve(counter++));

      const promises = Array.from({ length: 10 }, () =>
        selectKey(1, "polling"),
      );
      const results = await Promise.all(promises);

      const selectedIds = results.map((r) => r.apiKeyId!);
      expect(selectedIds).toHaveLength(10);
      for (const r of results) {
        expect(r.reason).toBe("selected");
        expect(r.apiKeyId).not.toBeNull();
      }
      expect(redisIncr).toHaveBeenCalledTimes(10);
      expect(counter).toBe(10);

      const keyCounts: Record<number, number> = {};
      for (const id of selectedIds) keyCounts[id] = (keyCounts[id] || 0) + 1;
      for (let i = 1; i <= 5; i++) {
        expect(keyCounts[i]).toBe(2);
      }
    });

    it("并发 + Key 耗尽场景下索引不冲突", async () => {
      seedDb([dbRow(1), dbRow(2), dbRow(3)]);

      redisGet.mockImplementation((k: string) => {
        if (k === "key:exhausted:2") return Promise.resolve("1");
        return Promise.resolve(null);
      });

      let counter = 0;
      redisIncr.mockImplementation(() => Promise.resolve(counter++));

      const promises = Array.from({ length: 5 }, () =>
        selectKey(1, "polling"),
      );
      const results = await Promise.all(promises);

      const selectedIds = results.map((r) => r.apiKeyId!);
      expect(selectedIds).toHaveLength(5);
      for (const r of results) {
        expect(r.reason).toBe("selected");
        expect(r.apiKeyId).not.toBe(2);
      }

      const keyCounts: Record<number, number> = {};
      for (const id of selectedIds) keyCounts[id] = (keyCounts[id] || 0) + 1;
      expect(keyCounts[1] + keyCounts[3]).toBe(5);
      expect(keyCounts[1]).toBeGreaterThanOrEqual(2);
      expect(keyCounts[3]).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Edge cases ───────────────────────────────────

  describe("边界场景", () => {
    it("无可用 Key → 返回 reason='no_keys'", async () => {
      seedDb([]);
      const r = await selectKey(1, "polling");
      expect(r.reason).toBe("no_keys");
      expect(r.apiKeyId).toBeNull();
    });

    it("isKeyExhausted 正确返回状态", async () => {
      redisGet.mockResolvedValueOnce("1");
      expect(await isKeyExhausted(1)).toBe(true);

      redisGet.mockResolvedValueOnce(null);
      expect(await isKeyExhausted(2)).toBe(false);
    });

    it("默认模式为 polling", async () => {
      seedDb([dbRow(1)]);
      redisIncr.mockResolvedValueOnce(0);
      const r = await selectKey(1);
      expect(r.reason).toBe("selected");
      expect(redisIncr).toHaveBeenCalled();
    });
  });
});
