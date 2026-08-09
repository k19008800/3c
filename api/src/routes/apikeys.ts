/**
 * API Key 管理路由 — CRUD + 生成/撤销
 */

import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { hashApiKey } from '../services/auth/apikey';
import { UnauthorizedError, NotFoundError, ValidationError } from '../lib/errors';

// Helper: JWT auth middleware (extracts user from Authorization header)
async function jwtAuth(request: any, reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid token');
  request.userContext = payload;
}

export async function apiKeyRoutes(app: FastifyInstance) {
  // List API keys for current user
  app.get('/api/v1/customers/me/keys', {
    preHandler: [jwtAuth],
  }, async (request) => {
    const { userId } = (request as any).userContext;
    const keys = await db.select({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      keyPrefix: schema.apiKeys.keyPrefix,
      status: schema.apiKeys.status,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    }).from(schema.apiKeys).where(eq(schema.apiKeys.userId, userId));

    return { keys };
  });

  // Create API key
  app.post('/api/v1/customers/me/keys', {
    preHandler: [jwtAuth],
  }, async (request, reply) => {
    const { userId } = (request as any).userContext;
    const body = request.body as Record<string, unknown>;
    const name = String(body.name || 'Default Key');

    const rawKey = `3c_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = hashApiKey(rawKey);
    const keyPrefix = rawKey.slice(0, 12);

    const [key] = await db.insert(schema.apiKeys).values({
      userId,
      keyHash,
      keyPrefix,
      name,
      status: 'active',
    }).returning({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      keyPrefix: schema.apiKeys.keyPrefix,
      status: schema.apiKeys.status,
    });

    return reply.status(201).send({
      key: { ...key, rawKey },
      warning: 'Store this key securely — it will not be shown again.',
    });
  });

  // Delete/revoke API key
  app.delete('/api/v1/customers/me/keys/:id', {
    preHandler: [jwtAuth],
  }, async (request, reply) => {
    const { userId } = (request as any).userContext;
    const params = request.params as { id: string };
    const keyId = parseInt(params.id);

    const keys = await db.select({ id: schema.apiKeys.id })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.id, keyId))
      .limit(1);

    if (keys.length === 0 || keys[0]!.id !== keyId) {
      throw new NotFoundError('API key', params.id);
    }

    await db.update(schema.apiKeys)
      .set({ status: 'revoked' })
      .where(eq(schema.apiKeys.id, keyId));

    return reply.send({ message: 'API key revoked' });
  });
}
