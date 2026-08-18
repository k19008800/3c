/**
 * 全局 Webhook 路由 — /api/v1/admin/webhooks（产品裁决 2026-08-15）
 *
 * 对齐 ref-32 §32.1：平台级事件推送（user.created / recharge.completed /
 * withdraw.created / agent.commission_settled / alert.triggered / model.price_changed 等），
 * HMAC-SHA256 签名 + 自动重试。
 *
 * 端点：
 *   GET    /admin/webhooks                — 列表（不含 secret）
 *   POST   /admin/webhooks                — 创建（自动生成 secret，仅返回一次）
 *   PUT    /admin/webhooks/:id            — 更新（name/url/events/retry_count/timeout_ms）
 *   DELETE /admin/webhooks/:id            — 删除
 *   PUT    /admin/webhooks/:id/toggle     — 启停
 *   POST   /admin/webhooks/:id/test       — 测试投递（HMAC 签名，10s 超时）
 *   GET    /admin/webhooks/:id/logs       — 投递日志（从 email_logs 之外用内存模拟；返回空列表占位）
 */

import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db, schema } from '../db';
import { eq, desc } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { UnauthorizedError, ForbiddenError, ValidationError, NotFoundError } from '../lib/errors';

async function adminAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
  const { role } = payload as { role: string };
  if (role !== 'admin' && role !== 'super_admin') throw new ForbiddenError('Admin access required');
}

function generateSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const ALLOWED_EVENTS = [
  'user.created', 'user.deleted', 'user.updated',
  'recharge.completed', 'recharge.refunded',
  'withdraw.created', 'withdraw.completed',
  'agent.commission_settled',
  'alert.triggered',
  'model.price_changed',
];

function serialize(w: any, includeSecret = false) {
  return {
    id: w.id,
    name: w.name,
    url: w.url,
    events: Array.isArray(w.events) ? w.events : [],
    isActive: w.isActive,
    retryCount: w.retryCount,
    timeoutMs: w.timeoutMs,
    lastTriggeredAt: w.lastTriggeredAt,
    created_at: w.createdAt,
    updated_at: w.updatedAt,
    ...(includeSecret ? { secret: w.secret } : {}),
  };
}

export async function adminWebhooksRoutes(app: FastifyInstance) {
  /** GET /api/v1/admin/webhooks — 列表 */
  app.get('/api/v1/admin/webhooks', { preHandler: [adminAuth] }, async (_request, reply) => {
    const rows = await db.select().from(schema.adminWebhooks).orderBy(desc(schema.adminWebhooks.createdAt));
    return reply.send({ data: { list: rows.map((r) => serialize(r)) } });
  });

  /** POST /api/v1/admin/webhooks — 创建 */
  app.post('/api/v1/admin/webhooks', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body || {}) as Record<string, unknown>;
    const name = String(body.name || '').trim();
    const url = String(body.url || '').trim();
    const events = Array.isArray(body.events) ? (body.events as string[]) : [];
    const retryCount = Number(body.retryCount ?? 3);
    const timeoutMs = Number(body.timeoutMs ?? 5000);

    if (!name) throw new ValidationError('名称不能为空');
    if (!isValidUrl(url)) throw new ValidationError('回调 URL 不合法');
    if (events.length === 0 || events.some((e) => !ALLOWED_EVENTS.includes(e))) {
      throw new ValidationError('订阅事件不合法');
    }
    if (!Number.isInteger(retryCount) || retryCount < 0 || retryCount > 5) throw new ValidationError('重试次数需在 0-5');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw new ValidationError('超时需在 1000-30000ms');

    const secret = generateSecret();
    const [row] = await db.insert(schema.adminWebhooks)
      .values({ name, url, secret, events, isActive: true, retryCount, timeoutMs })
      .returning();

    return reply.status(201).send({ data: serialize(row!, true), message: 'Webhook 已创建' });
  });

  /** PUT /api/v1/admin/webhooks/:id — 更新 */
  app.put('/api/v1/admin/webhooks/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const webhookId = parseInt(id, 10);
    if (!Number.isInteger(webhookId) || webhookId <= 0) throw new ValidationError('Invalid webhook id');
    const body = (request.body || {}) as Record<string, unknown>;

    const [exist] = await db.select().from(schema.adminWebhooks).where(eq(schema.adminWebhooks.id, webhookId)).limit(1);
    if (!exist) throw new NotFoundError('Webhook', id);

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new ValidationError('名称不能为空');
      patch.name = name;
    }
    if (body.url !== undefined) {
      const url = String(body.url).trim();
      if (!isValidUrl(url)) throw new ValidationError('回调 URL 不合法');
      patch.url = url;
    }
    if (body.events !== undefined) {
      const events = Array.isArray(body.events) ? (body.events as string[]) : [];
      if (events.length === 0 || events.some((e) => !ALLOWED_EVENTS.includes(e))) throw new ValidationError('订阅事件不合法');
      patch.events = events;
    }
    if (body.retryCount !== undefined) {
      const n = Number(body.retryCount);
      if (!Number.isInteger(n) || n < 0 || n > 5) throw new ValidationError('重试次数需在 0-5');
      patch.retryCount = n;
    }
    if (body.timeoutMs !== undefined) {
      const n = Number(body.timeoutMs);
      if (!Number.isInteger(n) || n < 1000 || n > 30000) throw new ValidationError('超时需在 1000-30000ms');
      patch.timeoutMs = n;
    }
    patch.updatedAt = new Date();

    const [row] = await db.update(schema.adminWebhooks).set(patch).where(eq(schema.adminWebhooks.id, webhookId)).returning();
    return reply.send({ data: serialize(row!), message: 'Webhook 已更新' });
  });

  /** DELETE /api/v1/admin/webhooks/:id — 删除 */
  app.delete('/api/v1/admin/webhooks/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const webhookId = parseInt(id, 10);
    if (!Number.isInteger(webhookId) || webhookId <= 0) throw new ValidationError('Invalid webhook id');
    const [row] = await db.delete(schema.adminWebhooks).where(eq(schema.adminWebhooks.id, webhookId)).returning({ id: schema.adminWebhooks.id });
    if (!row) throw new NotFoundError('Webhook', id);
    return reply.send({ data: { ok: true }, message: 'Webhook 已删除' });
  });

  /** PUT /api/v1/admin/webhooks/:id/toggle — 启停 */
  app.put('/api/v1/admin/webhooks/:id/toggle', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const webhookId = parseInt(id, 10);
    if (!Number.isInteger(webhookId) || webhookId <= 0) throw new ValidationError('Invalid webhook id');
    const body = (request.body || {}) as { isActive?: boolean };
    const isActive = !!body.isActive;
    const [row] = await db.update(schema.adminWebhooks)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(schema.adminWebhooks.id, webhookId))
      .returning();
    if (!row) throw new NotFoundError('Webhook', id);
    return reply.send({ data: serialize(row), message: isActive ? '已启用' : '已禁用' });
  });

  /** POST /api/v1/admin/webhooks/:id/test — 测试投递 */
  app.post('/api/v1/admin/webhooks/:id/test', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const webhookId = parseInt(id, 10);
    if (!Number.isInteger(webhookId) || webhookId <= 0) throw new ValidationError('Invalid webhook id');
    const [row] = await db.select().from(schema.adminWebhooks).where(eq(schema.adminWebhooks.id, webhookId)).limit(1);
    if (!row) throw new NotFoundError('Webhook', id);

    const payload = JSON.stringify({ event: 'test', timestamp: new Date().toISOString(), webhook_id: webhookId });
    const signature = crypto.createHmac('sha256', row.secret).update(payload).digest('hex');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const startedAt = Date.now();
    try {
      const res = await fetch(row.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-3Cloud-Signature': `sha256=${signature}` },
        body: payload,
        signal: controller.signal,
      });
      const body = await res.text();
      return reply.send({
        data: {
          status: res.ok ? 'success' : 'error',
          statusCode: res.status,
          latencyMs: Date.now() - startedAt,
          body: body.slice(0, 2000),
        },
      });
    } catch (err: any) {
      return reply.send({
        data: { status: 'error', statusCode: null, latencyMs: Date.now() - startedAt, body: err?.message ?? '请求失败' },
      });
    } finally {
      clearTimeout(timer);
    }
  });

  /** GET /api/v1/admin/webhooks/:id/logs — 投递日志（占位：当前无独立投递日志表，返回空） */
  app.get('/api/v1/admin/webhooks/:id/logs', { preHandler: [adminAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const webhookId = parseInt(id, 10);
    if (!Number.isInteger(webhookId) || webhookId <= 0) throw new ValidationError('Invalid webhook id');
    const [row] = await db.select().from(schema.adminWebhooks).where(eq(schema.adminWebhooks.id, webhookId)).limit(1);
    if (!row) throw new NotFoundError('Webhook', id);
    return reply.send({ data: { list: [] } });
  });
}
