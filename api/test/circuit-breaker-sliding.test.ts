/**
 * 自动熔断器滑动窗口方案 — 单元测试
 *
 * 覆盖 7 个测试用例：
 * 1. 触发熔断 — 35% 错误率 → channel 被自动禁用
 * 2. 未达阈值 — 25% 错误率 → 不触发
 * 3. 冷却恢复 — 60s 后自动半开
 * 4. 半开成功 — 探针成功 → 恢复 active，窗口清零
 * 5. 半开失败 — 探针失败 → 继续熔断，重置冷却
 * 6. 采样不足不误判 — 3 次全失败也不触发（最小样本 10）
 * 7. 手动恢复覆盖自动熔断 — 管理员启用 → active，计数器重置
 *
 * @see development-plan.md §1.5
 * @module test/circuit-breaker-sliding
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock Redis 存储（vi.hoisted 确保在 vi.mock 之前初始化） ──

const { store, zsetStore } = vi.hoisted(() => {
  const store = new Map<string, string>();
  const zsetStore = new Map<string, Map<string, number>>();
  return { store, zsetStore };
});

/** 重置所有 mock 存储 */
function resetStores(): void {
  store.clear();
  zsetStore.clear();
}

// ── Mock Redis 模块 ──

vi.mock("../src/lib/redis", () => {
  function createPipeline() {
    const commands: Array<() => any> = [];
    const pipeline = {
      set(key: string, value: any) {
        commands.push(() => {
          store.set(key, String(value));
          return "OK";
        });
        return pipeline;
      },
      del(...keys: string[]) {
        commands.push(() => {
          let count = 0;
          for (const k of keys) {
            if (store.has(k)) { store.delete(k); count++; }
            if (zsetStore.has(k)) { zsetStore.delete(k); count++; }
          }
          return count;
        });
        return pipeline;
      },
      async exec() {
        const results: Array<[null, any]> = [];
        for (const cmd of commands) {
          results.push([null, cmd()]);
        }
        return results;
      },
    };
    return pipeline;
  }

  return {
    redis: {
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async set(...args: any[]) {
        const [key, value, ...rest] = args as [string, any, ...string[]];
        // 处理 SET key value [PX ms] [NX]
        if (rest.includes("NX") && store.has(key)) {
          return null; // NX 失败
        }
        store.set(key, String(value));
        return "OK";
      },
      async del(...keys: string[]) {
        let count = 0;
        for (const k of keys) {
          if (store.has(k)) { store.delete(k); count++; }
          if (zsetStore.has(k)) { zsetStore.delete(k); count++; }
        }
        return count;
      },
      async zadd(key: string, score: number, member: string) {
        if (!zsetStore.has(key)) zsetStore.set(key, new Map());
        zsetStore.get(key)!.set(member, score);
        return 1;
      },
      async zcount(key: string, min: number, max: number) {
        const zset = zsetStore.get(key);
        if (!zset) return 0;
        let count = 0;
        for (const [, score] of zset) {
          if (score >= min && score <= max) count++;
        }
        return count;
      },
      async zrangebyscore(key: string, min: number, max: number) {
        const zset = zsetStore.get(key);
        if (!zset) return [];
        const result: string[] = [];
        for (const [member, score] of zset) {
          if (score >= min && score <= max) result.push(member);
        }
        return result;
      },
      async zremrangebyscore(key: string, min: number, max: number) {
        const zset = zsetStore.get(key);
        if (!zset) return 0;
        let count = 0;
        for (const [member, score] of zset) {
          if (score >= min && score <= max) {
            zset.delete(member);
            count++;
          }
        }
        return count;
      },
      multi() {
        return createPipeline();
      },
    },
  };
});

// ── 导入被测试模块 ──

import {
  allowRequest,
  recordResult,
  manualOpen,
  manualClose,
  getState,
} from "../src/services/circuit-breaker";

// ── 测试常量 ──

const VENDOR_ID = 1;
const WINDOW_MS = 5 * 60 * 1000; // 5 分钟
const COOLDOWN_MS = 60 * 1000; // 60 秒

// ── 辅助函数 ──

/**
 * 直接用 ordered set 种子数据（绕过 recordResult 的 timestamp 逻辑）
 * 用于精确控制窗口内的成功/失败分布
 */
async function seedWindow(
  vendorModelId: number,
  successes: number,
  failures: number,
  baseTime: number,
): Promise<void> {
  // 使用独立的时间偏移，确保 member 唯一
  for (let i = 0; i < successes; i++) {
    const ts = baseTime + i;
    const member = `ok:${ts}`;
    // 直接写入 zsetStore（mock store 可直接操作）
    if (!zsetStore.has(`cb:window:${vendorModelId}`)) {
      zsetStore.set(`cb:window:${vendorModelId}`, new Map());
    }
    zsetStore.get(`cb:window:${vendorModelId}`)!.set(member, ts);
  }
  for (let i = 0; i < failures; i++) {
    const ts = baseTime + successes + i;
    const member = `err:${ts}`;
    if (!zsetStore.has(`cb:window:${vendorModelId}`)) {
      zsetStore.set(`cb:window:${vendorModelId}`, new Map());
    }
    zsetStore.get(`cb:window:${vendorModelId}`)!.set(member, ts);
  }
}

/**
 * 直接设置 Redis 状态值
 */
async function setState(vendorModelId: number, state: "closed" | "open" | "half_open"): Promise<void> {
  store.set(`cb:state:${vendorModelId}`, state);
}

async function setOpenedAt(vendorModelId: number, timestamp: number): Promise<void> {
  store.set(`cb:opened:${vendorModelId}`, String(timestamp));
}

async function setProbe(vendorModelId: number, value: string): Promise<void> {
  store.set(`cb:probe:${vendorModelId}`, value);
}

// ── 测试 ──

beforeEach(() => {
  resetStores();
  vi.useRealTimers();
});

describe("circuit-breaker 滑动窗口熔断", () => {
  // ─── Test 1: 触发熔断 ───

  it("触发熔断 → 5 分钟内 20 次请求，7 次失败（35%）→ channel 被自动禁用", async () => {
    const now = Date.now();
    // 种子窗口数据：13 成功 + 7 失败 = 20 次，错误率 35%
    await seedWindow(VENDOR_ID, 13, 7, now - 60_000); // 1 分钟前（在窗口内）

    // allowRequest 应该检测到错误率超阈值，触发熔断
    const allowed = await allowRequest(VENDOR_ID);
    expect(allowed).toBe(false);

    // 状态应为 open
    const s = await getState(VENDOR_ID);
    expect(s.state).toBe("open");
    expect(s.status).toBe("tripped");
    expect(s.windowStats?.total).toBe(20);
    expect(s.windowStats?.errors).toBe(7);
    expect(s.windowStats?.errorRate).toBeCloseTo(0.35, 2);
  });

  // ─── Test 2: 未达阈值 ───

  it("未达阈值 → 5 分钟内 20 次请求，5 次失败（25%）→ 不触发", async () => {
    const now = Date.now();
    // 15 成功 + 5 失败 = 20 次，错误率 25%
    await seedWindow(VENDOR_ID, 15, 5, now - 60_000);

    const allowed = await allowRequest(VENDOR_ID);
    expect(allowed).toBe(true);

    const s = await getState(VENDOR_ID);
    expect(s.state).toBe("closed");
    expect(s.status).toBe("active");
  });

  // ─── Test 3: 冷却恢复 ───

  it("冷却恢复 → 熔断 60s 后，自动进入半开状态，放行 1 个试探请求", async () => {
    const now = Date.now();
    // 设为 OPEN 状态，openedAt = 70s 前（已过冷却期）
    await setState(VENDOR_ID, "open");
    await setOpenedAt(VENDOR_ID, now - 70_000);

    const allowed = await allowRequest(VENDOR_ID);

    // 应该放行（冷却到期 → 半开 → 放行探针）
    expect(allowed).toBe(true);

    // Redis 状态应变为 half_open
    const redisState = store.get(`cb:state:${VENDOR_ID}`);
    expect(redisState).toBe("half_open");

    // 探针锁应被持有
    const probe = store.get(`cb:probe:${VENDOR_ID}`);
    expect(probe).toBe("1");

    // 状态查询应反映 half_open
    const s = await getState(VENDOR_ID);
    expect(s.state).toBe("half_open");
  });

  // ─── Test 4: 半开成功 ───

  it("半开成功 → 试探成功 → 恢复 active，错误计数清零", async () => {
    const now = Date.now();
    // 先制造一些失败的窗口数据
    await seedWindow(VENDOR_ID, 3, 7, now - 60_000); // 70% 错误率

    // 设为 half_open（模拟冷却后的半开状态）
    await setState(VENDOR_ID, "half_open");
    await setProbe(VENDOR_ID, "1"); // 探针进行中

    // 记录探针成功
    await recordResult(VENDOR_ID, true);

    // 状态应恢复为 closed
    const s = await getState(VENDOR_ID);
    expect(s.state).toBe("closed");
    expect(s.status).toBe("active");

    // 窗口应被清零
    expect(s.windowStats?.total).toBe(0);
    expect(s.windowStats?.errors).toBe(0);

    // 探针锁应被清除
    const probe = store.get(`cb:probe:${VENDOR_ID}`);
    expect(probe).toBeUndefined();
  });

  // ─── Test 5: 半开失败 ───

  it("半开失败 → 试探失败 → 继续熔断，重置冷却计时", async () => {
    const oldOpenedAt = Date.now() - 80_000; // 旧冷却时间
    const now = Date.now();

    // 设为 half_open
    await setState(VENDOR_ID, "half_open");
    await setOpenedAt(VENDOR_ID, oldOpenedAt);
    await setProbe(VENDOR_ID, "1");

    // 记录探针失败
    await recordResult(VENDOR_ID, false);

    // 状态应回到 open
    const s = await getState(VENDOR_ID);
    expect(s.state).toBe("open");
    expect(s.status).toBe("tripped");

    // 冷却计时应被重置（openedAt 更新为当前时间附近）
    const newOpenedAt = store.get(`cb:opened:${VENDOR_ID}`);
    expect(Number(newOpenedAt)).toBeGreaterThan(oldOpenedAt);

    // 探针锁应被清除
    const probe = store.get(`cb:probe:${VENDOR_ID}`);
    expect(probe).toBeUndefined();
  });

  // ─── Test 6: 采样不足不误判 ───

  it("采样不足不误判 → 5 分钟内只有 3 次请求，即使全失败也不触发（最小样本 10）", async () => {
    const now = Date.now();
    // 只有 3 次，全部失败
    await seedWindow(VENDOR_ID, 0, 3, now - 60_000);

    // allowRequest 应放行（样本 < 10）
    const allowed = await allowRequest(VENDOR_ID);
    expect(allowed).toBe(true);

    const s = await getState(VENDOR_ID);
    expect(s.state).toBe("closed");
    expect(s.windowStats?.total).toBe(3);
    expect(s.windowStats?.errors).toBe(3);
    // 错误率 100%，但因为样本不足不触发
    expect(s.windowStats?.errorRate).toBeCloseTo(1.0, 1);
  });

  // ─── Test 7: 手动恢复覆盖自动熔断 ───

  it("手动恢复覆盖自动熔断 → 管理员手动启用 → 状态变为 active，计数器重置", async () => {
    const now = Date.now();
    // 制造触发熔断的场景
    await seedWindow(VENDOR_ID, 7, 8, now - 60_000); // 53% 错误率
    await setState(VENDOR_ID, "open");
    await setOpenedAt(VENDOR_ID, now - 30_000); // 还在冷却中
    await setProbe(VENDOR_ID, "1");

    // 确认当前是熔断状态
    const beforeOpen = await allowRequest(VENDOR_ID);
    expect(beforeOpen).toBe(false);

    // 管理员手动恢复
    await manualClose(VENDOR_ID);

    // 验证状态恢复
    const s = await getState(VENDOR_ID);
    expect(s.state).toBe("closed");
    expect(s.status).toBe("active");

    // 窗口数据应被清除
    expect(s.windowStats?.total).toBe(0);
    expect(s.windowStats?.errors).toBe(0);

    // 探针锁应被清除
    const probe = store.get(`cb:probe:${VENDOR_ID}`);
    expect(probe).toBeUndefined();

    // openedAt 应被清除
    const openedAt = store.get(`cb:opened:${VENDOR_ID}`);
    expect(openedAt).toBeUndefined();

    // 手动恢复后应该允许请求
    const allowedAfterRestore = await allowRequest(VENDOR_ID);
    expect(allowedAfterRestore).toBe(true);
  });
});

describe("circuit-breaker 状态机边界", () => {
  beforeEach(() => {
    resetStores();
  });

  it("OPEN 冷却中 → 拒绝请求", async () => {
    const now = Date.now();
    await setState(VENDOR_ID, "open");
    await setOpenedAt(VENDOR_ID, now - 30_000); // 冷却 30s，未到期

    const allowed = await allowRequest(VENDOR_ID);
    expect(allowed).toBe(false);
  });

  it("HALF_OPEN 已有探针 → 不放行第二个", async () => {
    await setState(VENDOR_ID, "half_open");
    await setProbe(VENDOR_ID, "1"); // 探针已在进行中

    const allowed = await allowRequest(VENDOR_ID);
    // SET NX 应失败，因为 probe key 已存在
    expect(allowed).toBe(false);
  });

  it("CLOSED 正常放行", async () => {
    // 初始状态无任何数据，应为 CLOSED
    const allowed = await allowRequest(VENDOR_ID);
    expect(allowed).toBe(true);

    const s = await getState(VENDOR_ID);
    expect(s.state).toBe("closed");
    expect(s.status).toBe("active");
  });

  it("manualOpen 立即进入 OPEN", async () => {
    // 初始 CLOSED
    await manualOpen(VENDOR_ID);

    const s = await getState(VENDOR_ID);
    expect(s.state).toBe("open");
    expect(s.status).toBe("tripped");

    // 且应立即拒绝
    const allowed = await allowRequest(VENDOR_ID);
    expect(allowed).toBe(false);
  });

  it("getState 在无数据时返回默认 CLOSED", async () => {
    const s = await getState(VENDOR_ID);
    expect(s.state).toBe("closed");
    expect(s.status).toBe("active");
    expect(s.windowStats?.total).toBe(0);
    expect(s.windowStats?.errors).toBe(0);
    expect(s.windowStats?.errorRate).toBe(0);
  });

  it("recordResult 正常写入窗口数据", async () => {
    // 记录一次失败
    await recordResult(VENDOR_ID, false);

    const s = await getState(VENDOR_ID);
    expect(s.windowStats?.total).toBe(1);
    expect(s.windowStats?.errors).toBe(1);
    expect(s.windowStats?.errorRate).toBe(1);
  });

  it("窗口内既有成功又有失败 → 正确统计", async () => {
    const now = Date.now();
    await seedWindow(VENDOR_ID, 8, 2, now - 30_000); // 80% 成功率

    const s = await getState(VENDOR_ID);
    expect(s.windowStats?.total).toBe(10);
    expect(s.windowStats?.errors).toBe(2);
    expect(s.windowStats?.errorRate).toBeCloseTo(0.2, 2);
  });
});
