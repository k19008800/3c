import { describe, it, expect } from "vitest";
import { scoreCandidate } from "../src/services/router";
import { calcCost, round4 } from "../src/services/billing";

describe("router.scoreCandidate（路由推荐评分）", () => {
  it("低成本+低延迟+高可靠 → 高分", () => {
    const s = scoreCandidate({ avgCostPerCall: 0.001, avgLatencyMs: 500, successRate: 99 });
    expect(s.costScore).toBeGreaterThanOrEqual(80);
    expect(s.latencyScore).toBeGreaterThanOrEqual(90);
    expect(s.reliabilityScore).toBe(99);
    expect(s.overallScore).toBeGreaterThanOrEqual(85);
  });

  it("高成本+高延迟+低可靠 → 低分", () => {
    const s = scoreCandidate({ avgCostPerCall: 0.01, avgLatencyMs: 4000, successRate: 60 });
    expect(s.costScore).toBeLessThan(50);
    expect(s.latencyScore).toBeLessThan(30);
    expect(s.reliabilityScore).toBe(60);
    expect(s.overallScore).toBeLessThan(50);
  });

  it("综合分 = 成本30% + 延迟30% + 可靠40%", () => {
    const s = scoreCandidate({ avgCostPerCall: 0.002, avgLatencyMs: 1000, successRate: 90 });
    const expected = Math.round(s.costScore * 0.3 + s.latencyScore * 0.3 + s.reliabilityScore * 0.4);
    expect(s.overallScore).toBe(expected);
  });
});

describe("billing.calcCost / round4（计费计算）", () => {
  it("计算费用 = 输入×输入价 + 输出×输出价", () => {
    // 1000 input @0.5 + 500 output @0.2 = 0.5 + 0.1 = 0.6
    expect(calcCost(1000, 500, 0.5, 0.2)).toBe(0.6);
  });

  it("round4 保留 4 位小数（最小计费单位）", () => {
    expect(round4(0.123456)).toBe(0.1235);
    expect(round4(0.00005)).toBe(0.0001);
  });

  it("token 为 0 时费用为 0", () => {
    expect(calcCost(0, 0, 1, 1)).toBe(0);
  });
});
