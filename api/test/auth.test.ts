import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:***@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-jwt-secret-phase2',
  PORT: '3032',
};

describe('Auth API', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    app = await buildApp({ envOverrides: testEnv });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const testEmail = `test-${Date.now()}@example.com`;

  it('POST /api/v1/auth/register creates a new user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: testEmail, password: 'Test1234!', name: 'Test User' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.user.email).toBe(testEmail);
    expect(body.user.role).toBe('customer');
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
  });

  it('POST /api/v1/auth/register rejects duplicate email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: testEmail, password: 'Test1234!', name: 'Dupe' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('POST /api/v1/auth/login returns tokens', async () => {
    const loginEmail = `login-${Date.now()}@example.com`;
    // Register first
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: loginEmail, password: 'Test1234!', name: 'Login Test' } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testEmail, password: 'Test1234!' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.accessToken).toBeDefined();
    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
  });

  it('POST /api/v1/auth/login rejects wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testEmail, password: 'WrongPass1!' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/auth/me returns user info', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.user.email).toBe(testEmail);
  });

  it('GET /api/v1/auth/me rejects without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/v1/auth/refresh gets new tokens', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    accessToken = body.accessToken;
  });

  it('POST /api/v1/auth/logout succeeds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
