import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Hoisted mocks ──
const { mockDbResult } = vi.hoisted(() => ({
  mockDbResult: vi.fn(),
}));

// ── Mock db — factory defined inline ──
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
    pool: { query: vi.fn(), connect: vi.fn(), end: vi.fn() },
  };
});

// ── Import after mocks ──
import { hashApiKey, keyPrefixOf, extractBearerKey, authenticateApiKey, isModelAllowed } from "../src/services/api-auth";
import type { AuthenticatedContext } from "../src/services/api-auth";

beforeEach(() => {
  vi.clearAllMocks();
  mockDbResult.mockReset();
  mockDbResult.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════════════════════════
describe("api-keys", () => {

  // ── Utility functions ──
  describe("hashApiKey", () => {
    it("应返回 SHA-256 哈希（64 位 hex）", () => {
      const hash = hashApiKey("sk-test123");
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("相同输入应产生相同哈希", () => {
      expect(hashApiKey("sk-abc")).toBe(hashApiKey("sk-abc"));
    });

    it("不同输入应产生不同哈希", () => {
      expect(hashApiKey("sk-abc")).not.toBe(hashApiKey("sk-xyz"));
    });
  });

  describe("keyPrefixOf", () => {
    it("应从完整 key 提取前 12 位前缀", () => {
      const prefix = keyPrefixOf("sk-1234567890abcdef");
      // "sk-1234567890abcdef" has 19 chars → first 12 = "sk-123456789"
      expect(prefix).toBe("sk-123456789");
      expect(prefix.length).toBe(12);
    });

    it("短 key 直接返回原值", () => {
      expect(keyPrefixOf("sk-short")).toBe("sk-short");
    });
  });

  describe("extractBearerKey", () => {
    it("应从 Authorization header 提取 Bearer token", () => {
      expect(extractBearerKey("Bearer sk-test123")).toBe("sk-test123");
    });

    it("无 token 返回 null", () => {
      expect(extractBearerKey(undefined)).toBeNull();
      expect(extractBearerKey("")).toBeNull();
    });

    it("非 Bearer 格式返回 null", () => {
      expect(extractBearerKey("Basic xxx")).toBeNull();
    });
  });

  describe("isModelAllowed", () => {
    it("空白名单允许所有模型", () => {
      const ctx: AuthenticatedContext = {
        apiKeyId: 1, userId: 1, keyStatus: "active",
        userBalance: 1000, modelWhitelist: null,
      };
      expect(isModelAllowed(ctx, "gpt-4")).toBe(true);
      expect(isModelAllowed(ctx, "claude-3")).toBe(true);
    });

    it("白名单内模型允许", () => {
      const ctx: AuthenticatedContext = {
        apiKeyId: 1, userId: 1, keyStatus: "active",
        userBalance: 1000, modelWhitelist: "gpt-4,claude-3",
      };
      expect(isModelAllowed(ctx, "gpt-4")).toBe(true);
      expect(isModelAllowed(ctx, "claude-3")).toBe(true);
    });

    it("白名单外模型拒绝", () => {
      const ctx: AuthenticatedContext = {
        apiKeyId: 1, userId: 1, keyStatus: "active",
        userBalance: 1000, modelWhitelist: "gpt-4,claude-3",
      };
      expect(isModelAllowed(ctx, "gemini-pro")).toBe(false);
    });
  });

  // ── authenticateApiKey ──
  describe("authenticateApiKey", () => {
    it("应成功鉴权有效的 API Key", async () => {
      const now = new Date();
      // The api-auth service does: select from apiKeys → select from users → update last_used_at
      // Then .catch(() => {}) on the update → also calls mockDbResult
      // Total: 3 calls to mockDbResult
      mockDbResult
        .mockResolvedValueOnce([{
          id: 42, userId: 1, status: "active",
          expiresAt: new Date(now.getTime() + 86400000),
          modelWhitelist: null, deletedAt: null,
        }])
        .mockResolvedValueOnce([{
          id: 1, status: "active", balance: 5000,
        }]);

      const result = await authenticateApiKey("sk-valid-test-key-12345678");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.ctx.apiKeyId).toBe(42);
        expect(result.ctx.userId).toBe(1);
        expect(result.ctx.keyStatus).toBe("active");
        expect(result.ctx.userBalance).toBe(5000);
      }
    });

    it("无效 Key → KEY_INVALID", async () => {
      mockDbResult.mockResolvedValueOnce([]);

      const result = await authenticateApiKey("sk-invalid");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("KEY_INVALID");
      }
    });

    it("禁用的 Key → KEY_DISABLED", async () => {
      mockDbResult.mockResolvedValueOnce([{
        id: 1, userId: 1, status: "disabled",
        expiresAt: null, modelWhitelist: null, deletedAt: null,
      }]);

      const result = await authenticateApiKey("sk-disabled-key");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("KEY_DISABLED");
      }
    });

    it("过期的 Key → KEY_EXPIRED", async () => {
      const past = new Date(Date.now() - 86400000);
      mockDbResult.mockResolvedValueOnce([{
        id: 1, userId: 1, status: "active",
        expiresAt: past,
        modelWhitelist: null, deletedAt: null,
      }]);

      const result = await authenticateApiKey("sk-expired-key");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("KEY_EXPIRED");
      }
    });

    it("status=expired 的 Key → KEY_EXPIRED", async () => {
      const future = new Date(Date.now() + 86400000);
      mockDbResult.mockResolvedValueOnce([{
        id: 1, userId: 1, status: "expired",
        expiresAt: future,
        modelWhitelist: null, deletedAt: null,
      }]);

      const result = await authenticateApiKey("sk-expired-status-key");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("KEY_EXPIRED");
      }
    });

    it("用户被禁用 → USER_DISABLED", async () => {
      mockDbResult
        .mockResolvedValueOnce([{
          id: 1, userId: 1, status: "active",
          expiresAt: null, modelWhitelist: null, deletedAt: null,
        }])
        .mockResolvedValueOnce([{
          id: 1, status: "disabled", balance: 5000,
        }]);

      const result = await authenticateApiKey("sk-user-disabled-key");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("USER_DISABLED");
      }
    });

    it("余额不足 → INSUFFICIENT_BALANCE", async () => {
      mockDbResult
        .mockResolvedValueOnce([{
          id: 1, userId: 1, status: "active",
          expiresAt: null, modelWhitelist: null, deletedAt: null,
        }])
        .mockResolvedValueOnce([{
          id: 1, status: "active", balance: 0,
        }]);

      const result = await authenticateApiKey("sk-no-balance-key");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("INSUFFICIENT_BALANCE");
      }
    });

    it("已软删除的 Key → KEY_INVALID", async () => {
      mockDbResult.mockResolvedValueOnce([]);

      const result = await authenticateApiKey("sk-deleted-key");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("KEY_INVALID");
      }
    });

    it("hashApiKey 存 hash 不存明文", () => {
      const secret = "sk-my-secret-api-key-value";
      const hash = hashApiKey(secret);
      expect(hash).not.toBe(secret);
      expect(hash).not.toContain("sk-my-secret");
    });
  });
});
