/**
 * 用户端 Webhook 路由 — /api/v1/me/webhooks（P1-1）
 *
 * 实现（对齐 SPEC-§22.4 用户端 Webhook 配置）：
 *   GET    /api/v1/me/webhooks                      — Webhook 列表（本人，不含 secret）
 *   POST   /api/v1/me/webhooks                      — 创建（自动生成 secret，仅返回一次）
 *   PUT    /api/v1/me/webhooks/:id                  — 更新（本人）
 *   DELETE /api/v1/me/webhooks/:id                  — 删除（本人）
 *   POST   /api/v1/me/webhooks/:id/regenerate-secret — 重置密钥（返回新 secret 一次）
 *   POST   /api/v1/me/webhooks/:id/test             — 测试投递（HMAC-SHA256 签名，10s 超时）
 *
 * 投递签名：X-3Cloud-Signature: sha256=<HMAC-SHA256(JSON payload, secret)>（SPEC-§32）。
 * 越权访问一律 404（不暴露资源是否存在）。
 *
 * @module routes
 * @see docs/SPEC-§22-用户端体验增强.md §22.4
 * @see docs/SPEC-§32-第三方集成与SSO.md
 */

import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db, schema } from '../db';
import { eq, and, desc } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { UnauthorizedError, ValidationError, NotFoundError } from '../lib/errors';

// ── JWT auth ─────────────────────────────────────────────
async function jwtAuth(request: any, _reply: any) {
  const token = request.headers.authorization?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid token');
  request.userContext = payload;
}

function userId(request: any): number {
  return (request as any).userContext.userId;
}

/** 生成 Webhook 签名密钥（32 字节 hex = 64 字符），创建/regenerate 时仅返回一次 */
function generateSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** 回调 URL 必须为 http(s) */
function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** 序列化 Webhook（列表/更新响应不暴露 secret） */
function serializeWebhook(w: any) {
  return {
    id: w.id,
    name: w.name,
    url: w.url,
    events: Array.isArray(w.events) ? w.events : [],
    balance_threshold: w.balanceThreshold,
    usage_spike_multiplier: w.usageSpikeMultiplier,
    failure_rate_threshold: w.failureRateThreshold,
    enabled: w.enabled,
    consecutive_failures: w.consecutiveFailures,
    last_sent_at: w.lastSentAt,
    last_status: w.lastStatus,
    last_response_code: w.lastResponseCode,
    last_failed_reason: w.lastFailedReason,
    created_at: w.createdAt,
    updated_at: w.updatedAt,
  };
}

/** 校验创建/更新公共字段（name/url/events/阈值），仅返回出现在 body 中的字段 */
function pickFields(body: Record<string, unknown>): {
  name?: string;
  url?: string;
  events?: string[];
  balanceThreshold?: number | null;
  usageSpikeMultiplier?: number | null;
  failureRateThreshold?: number | null;
} {
  const out: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new ValidationError('Webhook 名称不能为空');
    if (name.length > 100) throw new ValidationError('Webhook 名称过长');
    out.name = name;
  }
  if (body.url !== undefined) {
    const url = String(body.url).trim();
    if (!isValidUrl(url)) throw new ValidationError('回调 URL 必须是 http(s) 地址');
    out.url = url;
  }
  if (body.events !== undefined) {
    if (!Array.isArray(body.events) || body.events.length === 0 || !body.events.every((e) => typeof e === 'string' && e.trim().length > 0)) {
      throw new ValidationError('events 必须是非空字符串数组');
    }
    out.events = body.events.map((e) => String(e).trim());
  }
  for (const key of ['balanceThreshold', 'usageSpikeMultiplier', 'failureRateThreshold'] as const) {
    if (body[key] !== undefined && body[key] !== null) {
      const n = Number(body[key]);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
        throw new ValidationError(`${key} 必须是非负整数`);
      }
      out[key] = n;
    } else if (body[key] === null) {
      out[key] = null;
    }
  }
  return out as any;
}

export async function webhooksRoutes(app: FastifyInstance) {
  // ═══ GET /api/v1/me/webhooks — Webhook 列表（本人，不含 secret）═══
  app.get('/api/v1/me/webhooks', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const rows = await db.select()
      .from(schema.userWebhooks)
      .where(eq(schema.userWebhooks.userId, uid))
      .orderBy(desc(schema.userWebhooks.createdAt));
    return reply.send({ webhooks: rows.map(serializeWebhook), total: rows.length });
  });

  // ═══ POST /api/v1/me/webhooks — 创建 Webhook ═══
  app.post('/api/v1/me/webhooks', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const body = (request.body || {}) as Record<string, unknown>;

    // name / url / events 为必填；阈值为可选
    const fields = pickFields({ ...body, name: body.name ?? '', url: body.url ?? '', events: body.events ?? [] });
    if (!fields.name) throw new ValidationError('Webhook 名称不能为空');
    if (!fields.url) throw new ValidationError('回调 URL 不能为空');
    if (!fields.events) throw new ValidationError('events 不能为空');

    const secret = generateSecret();
    const [hook] = await db.insert(schema.userWebhooks).values({
      userId: uid,
      name: fields.name,
      url: fields.url,
      secret,
      events: fields.events,
      balanceThreshold: fields.balanceThreshold ?? 10,        // 默认余额阈值 ¥10
      usageSpikeMultiplier: fields.usageSpikeMultiplier ?? 3, // 默认用量突增 3 倍
      failureRateThreshold: fields.failureRateThreshold ?? 5, // 默认失败率 5%
      enabled: true,
      consecutiveFailures: 0,
    }).returning();
    if (!hook) throw new Error('Failed to create webhook');

    return reply.status(201).send({ webhook: serializeWebhook(hook), secret });
  });

  // ═══ PUT /api/v1/me/webhooks/:id — 更新 Webhook（本人）═══
  app.put('/api/v1/me/webhooks/:id', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const id = parseInt(String((request.params as Record<string, unknown>).id), 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('Invalid webhook id');

    const [existing] = await db.select({ id: schema.userWebhooks.id })
      .from(schema.userWebhooks)
      .where(and(eq(schema.userWebhooks.id, id), eq(schema.userWebhooks.userId, uid)))
      .limit(1);
    if (!existing) throw new NotFoundError('Webhook', id);

    const fields = pickFields((request.body || {}) as Record<string, unknown>);
    const [updated] = await db.update(schema.userWebhooks)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(schema.userWebhooks.id, id))
      .returning();
    if (!updated) throw new NotFoundError('Webhook', id);

    return reply.send({ webhook: serializeWebhook(updated) });
  });

  // ═══ DELETE /api/v1/me/webhooks/:id — 删除 Webhook（本人）═══
  app.delete('/api/v1/me/webhooks/:id', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const id = parseInt(String((request.params as Record<string, unknown>).id), 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('Invalid webhook id');

    const rows = await db.delete(schema.userWebhooks)
      .where(and(eq(schema.userWebhooks.id, id), eq(schema.userWebhooks.userId, uid)))
      .returning({ id: schema.userWebhooks.id });
    if (rows.length === 0) throw new NotFoundError('Webhook', id);

    return reply.send({ message: 'Webhook deleted', id });
  });

  // ═══ POST /api/v1/me/webhooks/:id/regenerate-secret — 重置密钥 ═══
  app.post('/api/v1/me/webhooks/:id/regenerate-secret', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const id = parseInt(String((request.params as Record<string, unknown>).id), 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('Invalid webhook id');

    const secret = generateSecret();
    const rows = await db.update(schema.userWebhooks)
      .set({ secret, updatedAt: new Date() })
      .where(and(eq(schema.userWebhooks.id, id), eq(schema.userWebhooks.userId, uid)))
      .returning({ id: schema.userWebhooks.id });
    if (rows.length === 0) throw new NotFoundError('Webhook', id);

    // secret 仅此一次返回
    return reply.send({ secret });
  });

  // ═══ POST /api/v1/me/webhooks/:id/test — 测试投递 ═══
  // 向回调 URL POST { event: 'test', timestamp }，带 X-3Cloud-Signature: sha256=<HMAC>。
  // 超时 10s；投递失败不抛错，返回 { ok: false, status?, error }。
  app.post('/api/v1/me/webhooks/:id/test', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const id = parseInt(String((request.params as Record<string, unknown>).id), 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('Invalid webhook id');

    const [hook] = await db.select()
      .from(schema.userWebhooks)
      .where(and(eq(schema.userWebhooks.id, id), eq(schema.userWebhooks.userId, uid)))
      .limit(1);
    if (!hook) throw new NotFoundError('Webhook', id);

    const payload = { event: 'test', timestamp: new Date().toISOString() };
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', hook.secret).update(body).digest('hex');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let outcome: { ok: boolean; status?: number; error?: string };
    try {
      const res = await fetch(hook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': '3Cloud-Webhook/1.0',
          'X-3Cloud-Signature': `sha256=${signature}`,
        },
        body,
        signal: controller.signal,
      });
      outcome = { ok: res.ok, status: res.status };
    } catch (err: unknown) {
      outcome = {
        ok: false,
        status: undefined,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }

    // 记录最近一次投递结果（best-effort；不累计 consecutive_failures——那是真实事件投递的语义）
    await db.update(schema.userWebhooks)
      .set({
        lastSentAt: new Date(),
        lastStatus: outcome.ok ? 'success' : 'failed',
        lastResponseCode: outcome.status ?? null,
        lastFailedReason: outcome.ok ? null : String(outcome.error || 'delivery failed').slice(0, 200),
        updatedAt: new Date(),
      })
      .where(eq(schema.userWebhooks.id, hook.id));

    return reply.send(outcome);
  });
}
