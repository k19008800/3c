import { vi, describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import jwt from "@fastify/jwt";

// ── Hoisted mock state ──
const { mockDbResult, mockPoolQuery } = vi.hoisted(() => ({
  mockDbResult: vi.fn(),
  mockPoolQuery: vi.fn(),
}));

// ── Mock bcryptjs ──
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async () => "$2a$10$hashedmockpassword"),
    compare: vi.fn(async (plain: string, hash: string) => {
      return plain === "correct-password" || hash.startsWith("$2a$10$hashed");
    }),
  },
}));

const bcryptMock = vi.mocked((await import("bcryptjs")).default);

// ── Mock nodemailer (for SMTP test) ──
const mockSendMail = vi.fn().mockResolvedValue({ messageId: "test-msg-id-123" });
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  },
}));

// ── Mock db ──
vi.mock("../src/db/index", () => {
  const chain: any = {
    then(resolve: any) {
      return resolve(mockDbResult());
    },
    catch(reject: any) {
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

// ── Dynamic imports after mocks are registered ──
// vi.mock is hoisted, so these imports will use mocked modules
import { authRoutes } from "../src/routes/auth";
import { sendEmail } from "../src/services/smtp";

// ── Build minimal test app ──
let app: any;

async function buildTestApp() {
  const a = Fastify({ logger: false });
  await a.register(jwt, { secret: "test-secret-p2" });
  await a.register(authRoutes, { prefix: "/api/v1" });
  await a.ready();
  return a;
}

const mockUser = {
  id: 1,
  email: "test@3cloud.io",
  username: "tester",
  phone: null,
  role: "user",
  status: "active",
  balance: 0,
  realNameStatus: "unverified",
  createdAt: new Date("2025-01-01"),
};

beforeEach(async () => {
  vi.clearAllMocks();
  mockDbResult.mockReset();
  mockDbResult.mockResolvedValue([]);
  mockPoolQuery.mockReset();
  mockPoolQuery.mockResolvedValue({ rows: [] });
  bcryptMock.hash.mockReset();
  bcryptMock.hash.mockResolvedValue("$2a$10$hashedmockpassword");
  bcryptMock.compare.mockReset();
  bcryptMock.compare.mockImplementation(async (plain: string, hash: string) => {
    return plain === "correct-password" || (hash.startsWith("$2a$10$hashed") && plain !== "wrong-password");
  });
  mockSendMail.mockReset();
  mockSendMail.mockResolvedValue({ messageId: "test-msg-id-123" });
  app = await buildTestApp();
});

// ═══════════════════════════════════════════════════════════════════
describe("auth-p2", () => {

  // ── Register ──
  describe("注册", () => {
    it("应注册成功 → 201 + JWT token + user 对象（不含 passwordHash）", async () => {
      // First call: check if email exists → empty
      mockDbResult.mockResolvedValueOnce([]);
      // Second call: insert user → created user
      mockDbResult.mockResolvedValueOnce([mockUser]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: { email: "test@3cloud.io", password: "correct-password", username: "tester" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.token).toBeDefined();
      expect(typeof body.token).toBe("string");
      expect(body.user.email).toBe("test@3cloud.io");
      expect(body.user.username).toBe("tester");
      // 不应包含 passwordHash
      expect(body.user.passwordHash).toBeUndefined();
      expect(body.user.password_hash).toBeUndefined();
    });

    it("应重复注册 → 409 EMAIL_EXISTS", async () => {
      // First call: email already exists
      mockDbResult.mockResolvedValueOnce([mockUser]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: { email: "test@3cloud.io", password: "pass123", username: "tester2" },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("EMAIL_EXISTS");
    });
  });

  // ── Login ──
  describe("登录", () => {
    it("应登录成功 → 200 + JWT token", async () => {
      // Find user by email
      mockDbResult.mockResolvedValueOnce([{ ...mockUser, passwordHash: "$2a$10$hashedcorrect-password" }]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "test@3cloud.io", password: "correct-password" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.token).toBeDefined();
      expect(body.user.email).toBe("test@3cloud.io");
    });

    it("应密码错误 → 401", async () => {
      // Find user
      mockDbResult.mockResolvedValueOnce([{ ...mockUser, passwordHash: "$2a$10$hashedcorrect-password" }]);
      // bcrypt compare returns false for wrong password

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "test@3cloud.io", password: "wrong-password" },
      });

      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toBe("INVALID_CREDENTIALS");
    });

    it("应用户不存在 → 401", async () => {
      // No user found
      mockDbResult.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "nonexistent@x.com", password: "anything" },
      });

      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toBe("INVALID_CREDENTIALS");
    });
  });

  // ── Protected routes ──
  describe("受保护路由", () => {
    it("应无 token 访问受保护路由 → 401", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/me" });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toBe("UNAUTHORIZED");
    });

    it("应 JWT 过期 → 401", async () => {
      // Sign a token with very short expiry
      const expiredToken = app.jwt.sign({ sub: "1", role: "user" }, { expiresIn: "1ms" });
      // Wait for it to expire
      await new Promise((r) => setTimeout(r, 10));

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/me",
        headers: { authorization: `Bearer ${expiredToken}` },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── Password reset / SMTP ──
  describe("SMTP 邮件发送", () => {
    it("应发送重置邮件（mock smtp）", async () => {
      // Set SMTP env vars for the test
      process.env.SMTP_HOST = "smtp.test.local";
      process.env.SMTP_PORT = "587";
      process.env.SMTP_USER = "noreply@test.local";
      process.env.SMTP_PASS = "test-pass";
      process.env.SMTP_FROM = "3Cloud <noreply@test.local>";

      const result = await sendEmail({
        to: "user@test.com",
        subject: "密码重置",
        html: "<p>点击 {{link}} 重置密码</p>",
        templateName: "password-reset",
        vars: { link: "https://3cloud.io/reset?token=abc123" },
      });

      expect(result.ok).toBe(true);
      expect(result.message).toBe("邮件已发送");
      expect(mockSendMail).toHaveBeenCalled();
      const call = mockSendMail.mock.calls[0]?.[0];
      expect(call?.to).toBe("user@test.com");
      expect(call?.subject).toBe("密码重置");
      // Template variables should be rendered
      expect(call?.html).toContain("https://3cloud.io/reset?token=abc123");
      expect(call?.html).not.toContain("{{link}}");

      // Cleanup env
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      delete process.env.SMTP_FROM;
    });
  });

  // ── Token-based /me access ──
  describe("/me 路径", () => {
    it("应带有效 token 访问 /me 返回用户信息", async () => {
      const token = app.jwt.sign({ sub: "1", role: "user" });
      // Find user by id
      mockDbResult.mockResolvedValueOnce([mockUser]);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/me",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.email).toBe("test@3cloud.io");
    });

    it("应 /me/stats 返回统计信息", async () => {
      const token = app.jwt.sign({ sub: "1", role: "user" });
      // 3 pool queries for stats
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [{ tokens: 1000, cost_cents: 500, calls: 10 }] })
        .mockResolvedValueOnce({ rows: [{ calls: 3 }] })
        .mockResolvedValueOnce({ rows: [{ balance: 10000 }] });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/me/stats",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(typeof body.totalTokens).toBe("number");
      expect(typeof body.todayCalls).toBe("number");
      expect(typeof body.balance).toBe("number");
    });

    it("应 /me/logs 返回日志列表", async () => {
      const token = app.jwt.sign({ sub: "1", role: "user" });
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 1, provider: "openai" }] });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/me/logs",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).list).toBeDefined();
    });
  });
});
