import { describe, it, expect } from "vitest";
import { calculateCost, applyDiscount, roundCurrency } from "../src/services/pricing";

describe("pricing service", () => {
  describe("calculateCost", () => {
    it("应正确计算费用（元）", () => {
      // 1000 input tokens @ 0.5 元/1K + 500 output tokens @ 0.2 元/1K = 0.5 + 0.1 = 0.6
      expect(calculateCost(1000, 500, 0.5, 0.2)).toBeCloseTo(0.6, 8);
    });

    it("零 token 应返回 0", () => {
      expect(calculateCost(0, 0, 0.5, 0.2)).toBe(0);
    });

    it("负 token 应抛错", () => {
      expect(() => calculateCost(-1, 0, 0.5, 0.2)).toThrow("tokens 不能为负数");
    });

    it("负价格应抛错", () => {
      expect(() => calculateCost(100, 100, -1, 0.2)).toThrow("价格不能为负数");
    });
  });

  describe("applyDiscount", () => {
    it("10% 折扣 = 9 折", () => {
      expect(applyDiscount(100, 10)).toBe(90);
    });

    it("0% 折扣 = 原价", () => {
      expect(applyDiscount(100, 0)).toBe(100);
    });

    it("100% 折扣 = 0", () => {
      expect(applyDiscount(100, 100)).toBe(0);
    });

    it("越界折扣应抛错", () => {
      expect(() => applyDiscount(100, 101)).toThrow("折扣必须在 0-100 之间");
    });
  });

  describe("roundCurrency", () => {
    it("应正确四舍五入", () => {
      expect(roundCurrency(0.123456789, 6)).toBe(0.123457);
    });
  });
});
