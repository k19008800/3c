import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Hoisted mock state ──
const { mockDbResult, mockPoolQuery } = vi.hoisted(() => ({
  mockDbResult: vi.fn(),
  mockPoolQuery: vi.fn(),
}));

// ── Mock db — factory defined inline to avoid hoisting issues ──
vi.mock("../src/db/index", () => {
  const chain: any = {
    then(resolve: any) {
      return resolve(mockDbResult());
    },
    catch(reject: any) {
      // no-op for .catch(() => {}) in api-auth.ts
      return reject(undefined);
    },
  };
  ["select", "from", "where", "limit", "orderBy", "offset", "returning", "insert", "values", "update", "set"].forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  return {
    db: chain,
    pool: { query: mockPoolQuery, connect: vi.fn(), end: vi.fn() },
  };
});

// ── Mock bcryptjs ──
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async (s: string) => `$2a$10$hashed_${s.slice(0, 8)}`),
    compare: vi.fn(async (plain: string, hash: string) => hash.includes(plain.slice(0, 8))),
  },
}));

// ── Import after mocks ──
import { generateTwoFactorSetup, verifyTotp, generateRecoveryCodes, verifyRecoveryCode, remainingRecoveryCodes } from "../src/services/two-factor";

// ── Helper ──
function mockPoolResultOnce(rows: any[]) {
  mockPoolQuery.mockResolvedValueOnce({ rows });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDbResult.mockReset();
  mockDbResult.mockResolvedValue(undefined);
  mockPoolQuery.mockReset();
  mockPoolQuery.mockResolvedValue({ rows: [] });
});

// ═══════════════════════════════════════════════════════════════════
describe("two-factor", () => {
  // ── generateTwoFactorSetup ──
  describe("generateTwoFactorSetup", () => {
    it("应返回 secret + otpauth URI + manualKey", () => {
      const result = generateTwoFactorSetup("test@3cloud.io");
      expect(result.secret).toBeDefined();
      expect(typeof result.secret).toBe("string");
      expect(result.secret.length).toBeGreaterThanOrEqual(16);
      expect(result.otpauth).toContain("otpauth://totp/");
      // @ is URL-encoded as %40 in keyuri
      expect(result.otpauth).toContain("test%403cloud.io");
      expect(result.otpauth).toContain("3Cloud");
      expect(result.manualKey).toBe(result.secret);
    });

    it("应为不同邮箱生成不同 secret", () => {
      const r1 = generateTwoFactorSetup("a@x.com");
      const r2 = generateTwoFactorSetup("b@x.com");
      expect(r1.secret).not.toBe(r2.secret);
    });
  });

  // ── verifyTotp ──
  describe("verifyTotp", () => {
    it("应接受正确的 TOTP token（通过 otplib 验证）", () => {
      const { secret } = generateTwoFactorSetup("test@x.com");
      const { authenticator } = require("@otplib/preset-default");
      const validToken = authenticator.generate(secret);
      expect(verifyTotp(secret, validToken)).toBe(true);
    });

    it("应拒绝错误的 TOTP token", () => {
      const { secret } = generateTwoFactorSetup("test@x.com");
      expect(verifyTotp(secret, "000000")).toBe(false);
    });

    it("应拒绝空 token", () => {
      const { secret } = generateTwoFactorSetup("test@x.com");
      expect(verifyTotp(secret, "")).toBe(false);
    });

    it("应拒绝随机字符串 token", () => {
      const { secret } = generateTwoFactorSetup("test@x.com");
      expect(verifyTotp(secret, "abcdef")).toBe(false);
    });
  });

  // ── generateRecoveryCodes ──
  describe("generateRecoveryCodes", () => {
    it("应返回 10 个 XXXX-XXXX-XXXX-XXXX 格式恢复码", async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });
      const codes = await generateRecoveryCodes(1);
      expect(codes).toHaveLength(10);
      for (const c of codes) {
        expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      }
    });

    it("应生成不重复的恢复码", async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });
      const codes = await generateRecoveryCodes(1);
      const unique = new Set(codes);
      expect(unique.size).toBe(10);
    });

    it("应为不同用户生成不同的恢复码", async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });
      const c1 = await generateRecoveryCodes(1);
      const c2 = await generateRecoveryCodes(2);
      expect(c1.join(",")).not.toBe(c2.join(","));
    });
  });

  // ── verifyRecoveryCode ──
  describe("verifyRecoveryCode", () => {
    it("应接受正确的恢复码并标记已使用", async () => {
      // Mock for generateRecoveryCodes: UPDATE old codes
      mockPoolQuery.mockResolvedValue({ rows: [] });
      const freshCodes = await generateRecoveryCodes(1);

      // Mock for verifyRecoveryCode
      mockPoolQuery.mockReset();
      const codeToTest = freshCodes[0]!;
      const expectedHash = `$2a$10$hashed_${codeToTest.slice(0, 8)}`;
      mockPoolResultOnce([{ id: 1, code: expectedHash }]);
      mockPoolResultOnce([]);

      const result = await verifyRecoveryCode(1, codeToTest);
      expect(result).toBe(true);
      expect(mockPoolQuery).toHaveBeenCalledTimes(2);
    });

    it("应拒绝错误的恢复码", async () => {
      mockPoolResultOnce([{ id: 1, code: "$2a$10$hashed_COMPLETELY_DIFF" }]);

      const result = await verifyRecoveryCode(1, "WRONG-CODE-TEST-SAMPLE");
      expect(result).toBe(false);
    });

    it("应拒绝已使用的恢复码（used=true 不匹配）", async () => {
      mockPoolResultOnce([]);

      const result = await verifyRecoveryCode(1, "USED-CODE-TEST-SAMPLE");
      expect(result).toBe(false);
    });
  });

  // ── remainingRecoveryCodes ──
  describe("remainingRecoveryCodes", () => {
    it("应返回未使用的恢复码数量", async () => {
      mockPoolResultOnce([{ c: 5 }]);
      const count = await remainingRecoveryCodes(1);
      expect(count).toBe(5);
    });

    it("无未使用码时返回 0", async () => {
      mockPoolResultOnce([{ c: 0 }]);
      const count = await remainingRecoveryCodes(1);
      expect(count).toBe(0);
    });
  });
});
