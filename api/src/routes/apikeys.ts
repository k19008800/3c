/**
 * API Key 管理路由 — CRUD + 生成/撤销
 *
 * 契约对齐（见 docs/api-contract.md §1）：
 *   GET    /api/v1/me/api-keys        → { list: [...] }
 *   POST   /api/v1/me/api-keys        → { key: "<rawKey 仅一次>", warning }
 *   PATCH  /api/v1/me/api-keys/:id    → body { status } → active|disabled
 *   DELETE /api/v1/me/api-keys/:id    → { message }
 *
 * 旧路径 /api/v1/customers/me/keys 保留为别名（向后兼容 + 集成测试）。
 */

import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db, schema } from '../db';
import { eq, and, sql, count } from 'drizzle-orm';
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

/** 计算用户各 key 今日调用数（单查询） */
async function todayCallsByKey(userId: number): Promise<Record<number, number>> {
  const rows = await db.select({
    apiKeyId: schema.consumptionRecords.apiKeyId,
    calls: count(),
  })
    .from(schema.consumptionRecords)
    .where(
      and(
        eq(schema.consumptionRecords.userId, userId),
        sql`${schema.consumptionRecords.createdAt} >= CURRENT_DATE`,
      ),
    )
    .groupBy(schema.consumptionRecords.apiKeyId);

  const map: Record<number, number> = {};
  for (const r of rows) {
    if (r.apiKeyId != null) map[r.apiKeyId] = r.calls;
  }
  return map;
}

function serializeKey(k: any, todayCalls: number) {
  return {
    id: k.id,
    name: k.name,
    keyPrefix: k.keyPrefix,
    status: k.status,
    mode: 'unlimited',
    expiresAt: k.expiresAt,
    lastUsedAt: k.lastUsedAt,
    todayCalls,
    createdAt: k.createdAt,
  };
}

export async function apiKeyRoutes(app: FastifyInstance) {
  // ── 列表 ─────────────────────────────────────────────
  async function listKeys(request: any, reply: any) {
    const { userId } = (request as any).userContext;
    const keys = await db.select({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      keyPrefix: schema.apiKeys.keyPrefix,
      status: schema.apiKeys.status,
      expiresAt: schema.apiKeys.expiresAt,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    }).from(schema.apiKeys).where(eq(schema.apiKeys.userId, userId))
      .orderBy(sql`${schema.apiKeys.createdAt} DESC`);

    const calls = await todayCallsByKey(userId);
    return reply.send({ list: keys.map((k) => serializeKey(k, calls[k.id] ?? 0)) });
  }

  // ── 创建 ─────────────────────────────────────────────
  async function createKey(request: any, reply: any) {
    const { userId } = (request as any).userContext;
    const body = request.body as Record<string, unknown>;
    const name = String(body.name || 'Default Key').trim();

    const rawKey = `3c_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = hashApiKey(rawKey);
    const keyPrefix = rawKey.slice(0, 12);

    const values: Record<string, unknown> = {
      userId,
      keyHash,
      keyPrefix,
      name,
      status: 'active',
    };
    // expires_at → expiresAt（若提供）
    if (body.expires_at) {
      const d = new Date(String(body.expires_at));
      if (!isNaN(d.getTime())) values.expiresAt = d;
    }

    await db.insert(schema.apiKeys).values(values as any);

    return reply.status(201).send({
      key: rawKey,
      warning: 'Store this key securely — it will not be shown again.',
    });
  }

  // ── 更新状态（active / disabled）──────────────────────
  async function patchKey(request: any, reply: any) {
    const { userId } = (request as any).userContext;
    const params = request.params as { id: string };
    const keyId = parseInt(params.id, 10);
    if (isNaN(keyId)) throw new ValidationError('Invalid key id');

    const body = request.body as Record<string, unknown>;
    const status = String(body.status || '').trim();
    if (!['active', 'disabled'].includes(status)) {
      throw new ValidationError('status must be active or disabled');
    }

    const keys = await db.select({ id: schema.apiKeys.id })
      .from(schema.apiKeys)
      .where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.userId, userId)))
      .limit(1);
    if (keys.length === 0) throw new NotFoundError('API key', params.id);

    await db.update(schema.apiKeys)
      .set({ status: status as any, updatedAt: new Date() })
      .where(eq(schema.apiKeys.id, keyId));

    return reply.send({ message: 'API key updated', id: keyId, status });
  }

  // ── 删除 / 撤销 ──────────────────────────────────────
  async function deleteKey(request: any, reply: any) {
    const { userId } = (request as any).userContext;
    const params = request.params as { id: string };
    const keyId = parseInt(params.id, 10);
    if (isNaN(keyId)) throw new ValidationError('Invalid key id');

    const keys = await db.select({ id: schema.apiKeys.id })
      .from(schema.apiKeys)
      .where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.userId, userId)))
      .limit(1);
    if (keys.length === 0) throw new NotFoundError('API key', params.id);

    await db.update(schema.apiKeys)
      .set({ status: 'revoked', updatedAt: new Date() })
      .where(eq(schema.apiKeys.id, keyId));

    return reply.send({ message: 'API key revoked', id: keyId });
  }

  // ── 新契约路径 ───────────────────────────────────────
  app.get('/api/v1/me/api-keys', { preHandler: [jwtAuth] }, listKeys);
  app.post('/api/v1/me/api-keys', { preHandler: [jwtAuth] }, createKey);
  app.patch('/api/v1/me/api-keys/:id', { preHandler: [jwtAuth] }, patchKey);
  app.delete('/api/v1/me/api-keys/:id', { preHandler: [jwtAuth] }, deleteKey);

  // ── 旧路径别名（向后兼容）──────────────────────────────
  app.get('/api/v1/customers/me/keys', { preHandler: [jwtAuth] }, listKeys);
  app.post('/api/v1/customers/me/keys', { preHandler: [jwtAuth] }, createKey);
  app.delete('/api/v1/customers/me/keys/:id', { preHandler: [jwtAuth] }, deleteKey);
}
