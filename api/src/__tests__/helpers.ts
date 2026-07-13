// Test helpers: build app, get auth token
import { buildApp } from "../app.js";
import { createDb, closeDb } from "../db/index.js";
import { createRedis } from "../redis.js";
import type { FastifyInstance } from "fastify";

let _app: FastifyInstance;
let _ready = false;

export async function getApp(): Promise<FastifyInstance> {
  if (_ready) return _app;
  // Initialize DB + Redis before buildApp (buildApp expects them ready)
  createDb();
  createRedis();
  _app = await buildApp();

  // Fastify's app.register() creates scoped contexts, so the db plugin's
  // decorate("db") is NOT available on the root FastifyInstance.
  // Route handlers access request.server.db which resolves from the ROOT,
  // so we must decorate at root level explicitly.
  const { getDb } = await import("../db/index.js");
  const { getRedis } = await import("../redis.js");
  if (!_app.hasDecorator("db")) {
    _app.decorate("db", getDb());
  }
  if (!_app.hasDecorator("redis")) {
    _app.decorate("redis", getRedis());
  }

  await _app.ready();
  _ready = true;
  return _app;
}

export async function closeApp() {
  if (_app) {
    await _app.close();
    _ready = false;
  }
}

/**
 * Login and return an access token.
 * Uses supertest so it works in tests.
 */
export async function loginAs(
  email = "testuser@3cloud.dev",
  password = "test123456",
): Promise<string> {
  const app = await getApp();
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password },
  });
  if (res.statusCode !== 200) {
    throw new Error(`Login failed (${res.statusCode}): ${res.body}`);
  }
  const data = JSON.parse(res.body);
  return data.data.accessToken;
}

// Default test user credentials
export const TEST_USER = {
  email: "admin@3cloud.dev",
  password: "admin123",
};

// Default admin test
export const ADMIN_USER = {
  email: "admin@3cloud.ai",
  password: "Admin1234!",
};
