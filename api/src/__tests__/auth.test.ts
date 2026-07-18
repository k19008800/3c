// ============================================================
//  3cloud API — 认证 & API Key 集成测试
//  Auth: register / login / me
//  API Keys: create / list / update (soft-delete) / delete
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getApp, closeApp } from "./helpers.js";
import type { FastifyInstance } from "fastify";

function makeEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

describe("Auth API", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getApp();
  });

  afterAll(async () => {
    await closeApp();
  });

  // ──────────────────────────────────────────────
  //  Register
  // ──────────────────────────────────────────────

  describe("POST /api/v1/auth/register", () => {
    const email = makeEmail();
    const password = "Test1234!";

    it("should register a new user successfully", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email,
          password,
          confirmPassword: password,
          nickname: "Tester",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.data).toBeDefined();
      expect(body.data.user).toBeDefined();
      expect(body.data.user.email).toBe(email);
      expect(body.data.accessToken).toBeTruthy();
      expect(body.data.refreshToken).toBeTruthy();
      expect(body.data.expiresIn).toBeGreaterThan(0);
    });

    it("should reject duplicate email with 409", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email,
          password,
          confirmPassword: password,
          nickname: "Duplicate",
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      // Either status code matches body.code or the message contains "已存在"/"already exists"
      expect(body.message).toBeTruthy();
    });

    it("should reject mismatched passwords with 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: makeEmail(),
          password: "Test1234!",
          confirmPassword: "DifferentPass1!",
          nickname: "Mismatch",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(400);
      expect(body.message).toContain("密码");
    });

    it("should reject invalid email with 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "not-an-email",
          password: "Test1234!",
          confirmPassword: "Test1234!",
          nickname: "BadEmail",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(400);
    });

    it("should reject short password with 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: makeEmail(),
          password: "ab",
          confirmPassword: "ab",
          nickname: "ShortPwd",
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ──────────────────────────────────────────────
  //  Login
  // ──────────────────────────────────────────────

  describe("POST /api/v1/auth/login", () => {
    const email = makeEmail();
    const password = "LoginTest123!";

    beforeAll(async () => {
      // Create a user to test login
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: { email, password, confirmPassword: password, nickname: "LoginTester" },
      });
    });

    it("should login successfully with valid credentials", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email, password },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.data).toBeDefined();
      expect(body.data.user).toBeDefined();
      expect(body.data.user.email).toBe(email);
      expect(body.data.accessToken).toBeTruthy();
      expect(typeof body.data.accessToken).toBe("string");
      expect(body.data.refreshToken).toBeTruthy();
      expect(body.data.expiresIn).toBeGreaterThan(0);
    });

    it("should reject invalid password with 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email, password: "WrongPassword1!" },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(401);
    });

    it("should reject non-existent email with 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "nonexistent@example.com", password: "SomePass123!" },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(401);
    });

    it("should reject missing email with 400 validation error", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { password: "Test1234!" },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(400);
      expect(body.message).toBeTruthy();
    });

    it("should reject missing password with 400 validation error", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: makeEmail() },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(400);
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/auth/me
  // ──────────────────────────────────────────────

  describe("GET /api/v1/auth/me", () => {
    let token: string;
    const email = makeEmail();

    beforeAll(async () => {
      const password = "MeTest123!";
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: { email, password, confirmPassword: password, nickname: "MeTester" },
      });
      const body = JSON.parse(res.body);
      token = body.data.accessToken;
    });

    it("should return user profile with valid token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.data).toBeDefined();
      expect(body.data.email).toBe(email);
      // Profile should contain basic user fields
      expect(body.data.id).toBeDefined();
      expect(body.data.role).toBeDefined();
    });

    it("should reject request without token (401)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(401);
    });

    it("should reject request with invalid token (401)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: { authorization: "Bearer invalid.jwt.token" },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(401);
    });

    it("should reject request with malformed Authorization header (401)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: { authorization: "NotBearer token" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ──────────────────────────────────────────────
  //  Token Refresh
  // ──────────────────────────────────────────────

  describe("POST /api/v1/auth/refresh", () => {
    let refreshToken: string;

    beforeAll(async () => {
      const email = makeEmail();
      const password = "RefreshTest1!";
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: { email, password, confirmPassword: password, nickname: "RefreshTester" },
      });
      const body = JSON.parse(res.body);
      refreshToken = body.data.refreshToken;
    });

    it("should return a new access token with valid refresh token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        payload: { refreshToken },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.data.accessToken).toBeTruthy();
      expect(body.data.expiresIn).toBeGreaterThan(0);
    });

    it("should reject missing refresh token with 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });

    it("should reject invalid refresh token with 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        payload: { refreshToken: "totally-fake-token" },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});

// ─────────────────────────────────────────────────────────────
//  API Keys
// ─────────────────────────────────────────────────────────────

describe("API Keys", () => {
  let app: FastifyInstance;
  let token: string;
  let userId: number;

  beforeAll(async () => {
    app = await getApp();

    // Register a fresh user for API key tests
    const email = makeEmail();
    const password = "ApiKeyTest1!";
    const regRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password, confirmPassword: password, nickname: "ApiKeyTester" },
    });
    const regBody = JSON.parse(regRes.body);
    token = regBody.data.accessToken;
    userId = regBody.data.user.id;
  });

  afterAll(async () => {
    await closeApp();
  });

  // ──────────────────────────────────────────────
  //  Create API Key
  // ──────────────────────────────────────────────

  describe("POST /api/v1/api-keys — create", () => {
    it("should create an API key with name only", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "My Test Key" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.data).toBeDefined();
      expect(body.data.id).toBeGreaterThan(0);
      expect(body.data.name).toBe("My Test Key");
      expect(body.data.key).toMatch(/^sk-3c-/);          // Full raw key returned once
      expect(body.data.keyPrefix).toMatch(/^sk-3c-/);    // Prefix is first 8 chars
      expect(body.data.expiresAt).toBeNull();
    });

    it("should create an API key with future expiration", async () => {
      const future = new Date(Date.now() + 86400000 * 30).toISOString(); // 30 days
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Expiring Key", expiresAt: future },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.expiresAt).toBeTruthy();
    });

    it("should reject request without auth token (401)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        payload: { name: "No Auth Key" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("should reject empty name (400)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("should reject missing name field (400)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ──────────────────────────────────────────────
  //  List API Keys
  // ──────────────────────────────────────────────

  describe("GET /api/v1/api-keys — list", () => {
    it("should return list of API keys for the authenticated user", async () => {
      // First create a key so there is at least one
      await app.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "List Test Key" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data.list)).toBe(true);
      expect(body.data.list.length).toBeGreaterThanOrEqual(1);
      expect(body.data.total).toBeGreaterThanOrEqual(1);
      expect(body.data.page).toBe(1);
      expect(body.data.pageSize).toBe(20);

      // Each key should have expected fields
      for (const key of body.data.list) {
        expect(key.id).toBeDefined();
        expect(key.name).toBeDefined();
        expect(key.keyPrefix).toBeDefined();
        expect(key.status).toBeDefined();
        expect(key.createdAt).toBeDefined();
        // keyHash and full key must NOT be exposed
        expect(key.keyHash).toBeUndefined();
        expect(key.key).toBeUndefined();
      }
    });

    it("should reject without auth token (401)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/api-keys",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ──────────────────────────────────────────────
  //  Soft-delete via PATCH (disable status)
  // ──────────────────────────────────────────────

  describe("PATCH /api/v1/api-keys/:id — soft delete / update", () => {
    let keyId: number;

    beforeAll(async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Soft Delete Target" },
      });
      keyId = JSON.parse(res.body).data.id;
    });

    it("should soft-delete a key by setting status=false", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/api-keys/${keyId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: false },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
    });

    it("should reflect soft-deleted status in list", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${token}` },
      });

      const body = JSON.parse(res.body);
      const key = body.data.list.find((k: any) => k.id === keyId);
      expect(key).toBeDefined();
      expect(key.status).toBe(false);
    });

    it("should update name via PATCH", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/api-keys/${keyId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Renamed Key" },
      });

      expect(res.statusCode).toBe(200);

      // Verify the name changed
      const listRes = await app.inject({
        method: "GET",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${token}` },
      });
      const listBody = JSON.parse(listRes.body);
      const key = listBody.data.list.find((k: any) => k.id === keyId);
      expect(key.name).toBe("Renamed Key");
    });

    it("should reject updating another user's key (404)", async () => {
      // Create another user
      const email2 = makeEmail();
      const pw2 = "OtherUser1!";
      const regRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: { email: email2, password: pw2, confirmPassword: pw2, nickname: "OtherUser" },
      });
      const otherToken = JSON.parse(regRes.body).data.accessToken;

      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/api-keys/${keyId}`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { name: "Hacked" },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ──────────────────────────────────────────────
  //  Hard-delete via DELETE
  // ──────────────────────────────────────────────

  describe("DELETE /api/v1/api-keys/:id — hard delete", () => {
    let keyId: number;

    beforeAll(async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Delete Target" },
      });
      keyId = JSON.parse(res.body).data.id;
    });

    it("should delete an API key and return 200", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/api-keys/${keyId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.code).toBe(0);
    });

    it("should reflect soft-deleted status in list", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${token}` },
      });

      const body = JSON.parse(res.body);
      const key = body.data.list.find((k: any) => k.id === keyId);
      expect(key).toBeDefined();
      expect(key.status).toBe(false);
    });

    it("should reject deleting non-existent key (404)", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/api-keys/999999999", // Non-existent ID
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it("should reject deleting another user's key (404)", async () => {
      // Create a key for other user
      const email3 = makeEmail();
      const pw3 = "OtherUser2!";
      const regRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: { email: email3, password: pw3, confirmPassword: pw3, nickname: "OtherUser2" },
      });
      const otherToken = JSON.parse(regRes.body).data.accessToken;

      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/api-keys",
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { name: "Other's Key" },
      });
      const otherKeyId = JSON.parse(createRes.body).data.id;

      // Try to delete it as the first user
      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/api-keys/${otherKeyId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
