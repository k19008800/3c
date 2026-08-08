/**
 * 路由矩阵 — 单元测试
 *
 * 覆盖 6 个测试用例：
 * 1. selectRoute 正常返回最优候选（mock DB 返回多个映射）
 * 2. selectRoute 返回 null 当无可用映射
 * 3. 手动路由覆盖优先于自动选择（routing_overrides）
 * 4. 熔断中的 supplier 被排除（mock allowRequest 返回 false）
 * 5. 加权轮询分布合理（100 次选择，权重高的被选更多）
 * 6. scoreCandidate 评分计算正确（成本+延迟+可靠性权重）
 *
 * @see development-plan.md §3
 * @module test/routing-matrix
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock DB: uses a queue for sequential select results ──

const { dbSelectQueue } = vi.hoisted(() => {
  const dbSelectQueue: any[] = [];
  return { dbSelectQueue };
});

function resetQueue(): void {
  dbSelectQueue.length = 0;
}

function pushSelectResult(data: any): void {
  dbSelectQueue.push(data);
}

function createChainable(dataFactory: () => any) {
  const chain: Record<string, any> = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    values: () => chain,
    returning: () => chain,
    set: () => chain,
  };
  Object.defineProperty(chain, "then", {
    value: (resolve: Function) => Promise.resolve(resolve(dataFactory())),
  });
  return chain;
}

vi.mock("../src/db/index", () => ({
  db: {
    select: () => createChainable(() => dbSelectQueue.shift() ?? []),
    insert: () => createChainable(() => []),
    update: () => createChainable(() => ({ rowCount: 1 })),
    delete: () => createChainable(() => ({ rowCount: 1 })),
  },
  pool: { query: async () => ({ rows: [] }) },
}));

// ── Mock circuit-breaker ──

const mockAllowRequest = vi.fn();

vi.mock("../src/services/circuit-breaker", () => ({
  allowRequest: (...args: any[]) => mockAllowRequest(...args),
  recordResult: vi.fn().mockResolvedValue(undefined),
  manualOpen: vi.fn().mockResolvedValue(undefined),
  manualClose: vi.fn().mockResolvedValue(undefined),
  getState: vi.fn().mockResolvedValue({ state: "closed", status: "active" }),
}));

// ── Import after mocks ──

import { selectRoute, scoreCandidate } from "../src/services/router";

beforeEach(() => {
  resetQueue();
  mockAllowRequest.mockReset();
  mockAllowRequest.mockResolvedValue(true);
});

describe("路由矩阵 — selectRoute", () => {
  // ─── Test 1: 正常返回最优候选 ───

  it("selectRoute 正常返回最优候选 → 3 个可用映射，按 priority 排序，weight 加权选择", async () => {
    const candidates = [
      { id: 1, vendorId: 10, modelId: 100, upstreamModel: "gpt-4o", weight: 3, priority: 10, isEnabled: true },
      { id: 2, vendorId: 20, modelId: 100, upstreamModel: "claude-sonnet", weight: 1, priority: 5, isEnabled: true },
      { id: 3, vendorId: 30, modelId: 100, upstreamModel: "gpt-4o-mini", weight: 2, priority: 8, isEnabled: true },
    ];

    // First select: routingOverrides lookup → empty (no override)
    pushSelectResult([]);
    // Second select: getAvailableCandidates → get vendorModels
    pushSelectResult(candidates);

    mockAllowRequest.mockResolvedValue(true);

    const result = await selectRoute(100);

    expect(result).not.toBeNull();
    expect(result!.upstreamModel).toBeTruthy();
    expect(candidates.map(c => c.id)).toContain(result!.vendorModelId);
    expect(result!.viaOverride).toBe(false);
  });

  // ─── Test 2: 无可用映射返回 null ───

  it("selectRoute 返回 null → 无启用映射", async () => {
    // No routing override
    pushSelectResult([]);
    // No vendor models
    pushSelectResult([]);

    const result = await selectRoute(999);
    expect(result).toBeNull();
  });

  // ─── Test 3: 加权轮询分布合理 ───

  it("加权轮询分布合理 → 100 次选择，权重高的被选更多", async () => {
    const candidates = [
      { id: 1, vendorId: 10, modelId: 100, upstreamModel: "high-weight", weight: 5, priority: 0, isEnabled: true },
      { id: 2, vendorId: 20, modelId: 100, upstreamModel: "low-weight", weight: 1, priority: 0, isEnabled: true },
      { id: 3, vendorId: 30, modelId: 100, upstreamModel: "mid-weight", weight: 2, priority: 0, isEnabled: true },
    ];

    mockAllowRequest.mockResolvedValue(true);

    const counts = new Map<number, number>();

    for (let i = 0; i < 100; i++) {
      // Each iteration: routing override (empty) + candidates
      pushSelectResult([]);
      pushSelectResult(candidates);

      const result = await selectRoute(100);
      if (result) {
        counts.set(result.vendorModelId, (counts.get(result.vendorModelId) ?? 0) + 1);
      }
    }

    expect(counts.get(1)).toBeGreaterThan(0);
    expect(counts.get(2)).toBeGreaterThan(0);
    expect(counts.get(3)).toBeGreaterThan(0);
    expect(counts.get(1)! > counts.get(2)!).toBe(true);
    expect(counts.get(3)! >= counts.get(2)!).toBe(true);
  });

  // ─── Test 4: 熔断供应商被排除 ───

  it("熔断中的 supplier 被排除 → allowRequest 拒绝 id=2 的候选", async () => {
    const candidates = [
      { id: 1, vendorId: 10, modelId: 100, upstreamModel: "healthy", weight: 1, priority: 0, isEnabled: true },
      { id: 2, vendorId: 20, modelId: 100, upstreamModel: "broken", weight: 5, priority: 0, isEnabled: true },
    ];

    // id=2 熔断，id=1 正常
    mockAllowRequest.mockImplementation(async (vmId: number) => vmId !== 2);

    for (let i = 0; i < 20; i++) {
      pushSelectResult([]);       // routing overrides (empty)
      pushSelectResult(candidates); // candidates

      const result = await selectRoute(100);
      expect(result).not.toBeNull();
      expect(result!.vendorModelId).toBe(1);
    }
  });

  // ─── Test 5: 手动路由覆盖优先 ───

  it("手动路由覆盖优先于自动选择 → 存在永久覆盖时直接返回指定 vendor", async () => {
    // Routing override: permanent override for modelId=100 → vendorId=20
    const override = [{ id: 99, modelId: 100, vendorId: 20, isPermanent: true }];
    // Vendor model lookup for the override
    const overrideVm = [
      { id: 3, vendorId: 20, modelId: 100, upstreamModel: "override-model", weight: 1, priority: 0, isEnabled: true },
    ];
    // Confirmation lookup
    const confirmedVm = [
      { id: 3, vendorId: 20, modelId: 100, upstreamModel: "override-model", weight: 1, priority: 0, isEnabled: true },
    ];

    // Queue: override check → override VM lookup → confirmation
    pushSelectResult(override);     // getManualOverride: routingOverrides
    pushSelectResult(overrideVm);   // getManualOverride: vendorModels (by vendorId)
    pushSelectResult(confirmedVm);  // selectRoute: confirm the VM

    mockAllowRequest.mockResolvedValue(true);

    const result = await selectRoute(100);

    expect(result).not.toBeNull();
    expect(result!.vendorModelId).toBe(3);
    expect(result!.vendorId).toBe(20);
    expect(result!.upstreamModel).toBe("override-model");
    expect(result!.viaOverride).toBe(true);
  });
});

describe("路由矩阵 — scoreCandidate 评分计算", () => {
  it("scoreCandidate → 成本低+延迟低+可靠性高 → 综合分接近 100", () => {
    const result = scoreCandidate({
      avgCostPerCall: 0.001,
      avgLatencyMs: 100,
      successRate: 99.5,
    });

    expect(result.costScore).toBeGreaterThan(70);
    expect(result.latencyScore).toBeGreaterThan(90);
    expect(result.reliabilityScore).toBeGreaterThan(95);
    expect(result.overallScore).toBeGreaterThan(80);
    const expectedOverall = Math.round(result.costScore * 0.3 + result.latencyScore * 0.3 + result.reliabilityScore * 0.4);
    expect(result.overallScore).toBe(expectedOverall);
  });

  it("scoreCandidate → 成本高+延迟高+可靠性低 → 综合分低", () => {
    const result = scoreCandidate({
      avgCostPerCall: 0.01,
      avgLatencyMs: 4000,
      successRate: 50,
    });

    expect(result.costScore).toBe(0);
    expect(result.latencyScore).toBe(20);
    expect(result.reliabilityScore).toBe(50);
    expect(result.overallScore).toBe(26);
  });

  it("scoreCandidate → 自定义 minCost/maxLatencyMs", () => {
    const result = scoreCandidate({
      avgCostPerCall: 0.002,
      avgLatencyMs: 500,
      successRate: 95,
      minCost: 0.002,
      maxLatencyMs: 2000,
    });

    expect(result.costScore).toBe(80);
    expect(result.latencyScore).toBe(75);
    expect(result.reliabilityScore).toBe(95);
    expect(result.overallScore).toBe(85);
  });

  it("scoreCandidate → 边界值：最高分（全部满分）", () => {
    const result = scoreCandidate({
      avgCostPerCall: 0.001,
      avgLatencyMs: 0,
      successRate: 100,
    });

    expect(result.costScore).toBe(80);
    expect(result.latencyScore).toBe(100);
    expect(result.reliabilityScore).toBe(100);
  });

  it("scoreCandidate → 边界值：最低分（全部最差）", () => {
    const result = scoreCandidate({
      avgCostPerCall: 0.1,
      avgLatencyMs: 10000,
      successRate: 0,
    });

    expect(result.costScore).toBe(0);
    expect(result.latencyScore).toBe(0);
    expect(result.reliabilityScore).toBe(0);
    expect(result.overallScore).toBe(0);
  });
});
