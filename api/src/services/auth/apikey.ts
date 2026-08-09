/**
 * API Key 认证 — 从请求头提取并验证 API Key
 */

import { createHash } from 'crypto';
import { db, schema } from '../../db';
import { eq } from 'drizzle-orm';

export interface ApiKeyContext {
  apiKeyId: number;
  userId: number;
  keyHash: string;
  scopes: string[];
}

/**
 * Hash an API key for storage/comparison
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Extract API Key from Bearer token in Authorization header
 */
export function extractApiKeyFromHeader(authHeader?: string): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0]!.toLowerCase() !== 'bearer') return null;
  return parts[1]! || null;
}

/**
 * Verify API Key against database
 * Returns context with userId and apiKeyId if valid, null otherwise
 */
export async function verifyApiKey(rawKey: string): Promise<ApiKeyContext | null> {
  const keyHash = hashApiKey(rawKey);

  const results = await db
    .select({
      id: schema.apiKeys.id,
      userId: schema.apiKeys.userId,
      keyHash: schema.apiKeys.keyHash,
      scopes: schema.apiKeys.scopes,
      status: schema.apiKeys.status,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.keyHash, keyHash))
    .limit(1);

  if (results.length === 0) return null;

  const key = results[0]!;
  if (key.status !== 'active') return null;

  return {
    apiKeyId: key.id,
    userId: key.userId,
    keyHash: key.keyHash,
    scopes: (key.scopes as string[]) || [],
  };
}

/**
 * Fastify preHandler hook: authenticate via API key Bearer token
 */
export async function apiKeyAuth(request: any, reply: any) {
  const authHeader = request.headers.authorization;
  const rawKey = extractApiKeyFromHeader(authHeader);

  if (!rawKey) {
    return reply.status(401).send({
      error: { message: 'Missing API key. Use Authorization: Bearer sk-...', type: 'invalid_request_error', code: 401 },
    });
  }

  const context = await verifyApiKey(rawKey);
  if (!context) {
    return reply.status(401).send({
      error: { message: 'Invalid API key', type: 'invalid_request_error', code: 401 },
    });
  }

  request.apiKeyContext = context;
}
