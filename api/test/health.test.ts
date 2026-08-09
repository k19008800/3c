import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { FastifyInstance } from 'fastify';

describe('Health Check', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      envOverrides: {
        LOG_LEVEL: 'error',
        DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
        REDIS_URL: 'redis://localhost:6379',
        JWT_SECRET: 'test-secret-12345678',
        PORT: '3031',
      },
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
    expect(typeof body.uptime).toBe('number');
  });

  it('GET /docs returns swagger UI', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs' });
    expect(res.statusCode).toBe(200);
  });
});
