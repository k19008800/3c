/**
 * 用户端「本人」域路由 — /api/v1/me/*
 *
 * 契约对齐（见 docs/api-contract.md §1 MVP 切片）：
 *   GET /me/stats · /me/keys · /me/models · /me/logs
 *   GET /me/billing/current · /me/billing/history · /me/billing/current/daily
 *       /me/billing/history/:month · /me/billing/history/:month/download
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, sql, count } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { getBalance } from '../services/billing/balance';
import { UnauthorizedError, ValidationError } from '../lib/errors';

// ── JWT auth ─────────────────────────────────────────────
async function jwtAuth(request: any, reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid token');
  request.userContext = payload;
}

function userId(request: any): number {
  return (request as any).userContext.userId;
}

// ── Playground 默认模型目录（mock 回退接受的模型集）──────
const DEFAULT_MODELS = [
  { id: 1, name: 'deepseek-chat', provider: 'DeepSeek', inputPrice: 0.002, outputPrice: 0.008 },
  { id: 2, name: 'deepseek-r1', provider: 'DeepSeek', inputPrice: 0.002, outputPrice: 0.008 },
  { id: 3, name: 'gpt-4o', provider: 'OpenAI', inputPrice: 0.0025, outputPrice: 0.01 },
  { id: 4, name: 'gpt-4o-mini', provider: 'OpenAI', inputPrice: 0.00015, outputPrice: 0.0006 },
  { id: 5, name: 'qwen-plus', provider: 'Alibaba', inputPrice: 0.0008, outputPrice: 0.002 },
  { id: 6, name: 'qwen3-max', provider: 'Alibaba', inputPrice: 0.0012, outputPrice: 0.002 },
  { id: 7, name: 'glm-5-pro', provider: 'Zhipu', inputPrice: 0.001, outputPrice: 0.002 },
  { id: 8, name: 'kimi-k2', provider: 'Moonshot', inputPrice: 0.001, outputPrice: 0.002 },
  { id: 9, name: 'claude-3-5-sonnet', provider: 'Anthropic', inputPrice: 0.003, outputPrice: 0.015 },
];

/** 本月第一天 00:00 */
const monthStart = () => sql`date_trunc('month', NOW())`;
/** 今天 00:00 */
const todayStart = () => sql`CURRENT_DATE`;

export async function meRoutes(app: FastifyInstance) {
  // ═══ /me/stats — Dashboard 总览 ═══
  app.get('/api/v1/me/stats', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);

    const balance = await getBalance(uid);

    const [monthly, daily] = await Promise.all([
      db.execute(sql`
        SELECT COALESCE(SUM(cost::numeric), 0)::text AS "cost",
               COUNT(*)::int AS "calls"
        FROM consumption_records
        WHERE user_id = ${uid} AND created_at >= ${monthStart()}
      `),
      db.execute(sql`
        SELECT COALESCE(SUM(cost::numeric), 0)::text AS "cost",
               COALESCE(SUM(total_tokens), 0)::int AS "tokens",
               COUNT(*)::int AS "calls"
        FROM consumption_records
        WHERE user_id = ${uid} AND created_at >= ${todayStart()}
      `),
    ]);

    const keys = await db.execute(sql`
      SELECT COUNT(*) FILTER (WHERE status = 'active')::int AS "active",
             COUNT(*)::int AS "total"
      FROM api_keys WHERE user_id = ${uid}
    `);

    const monthlyRow = (monthly[0] as any) || { cost: '0', calls: 0 };
    const dailyRow = (daily[0] as any) || { cost: '0', tokens: 0, calls: 0 };
    const keyRow = (keys[0] as any) || { active: 0, total: 0 };

    const monthlyCost = Number(monthlyRow.cost || 0);
    const todayCost = Number(dailyRow.cost || 0);
    const available = Number(balance.availableBalance || 0);

    return reply.send({
      balance: available,
      monthlyCost,
      todayCalls: dailyRow.calls || 0,
      activeKeys: keyRow.active || 0,
      totalKeys: keyRow.total || 0,
      todayCallCount: dailyRow.calls || 0,
      todayTokenUsage: dailyRow.tokens || 0,
      todayCost,
      estimatedDays: monthlyCost > 0 && available > 0 ? Math.floor(available / (monthlyCost / 30)) : null,
    });
  });

  // ═══ /me/keys — Playground 选 Key（返回数组）═══
  app.get('/api/v1/me/keys', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const keys = await db.select({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      keyPrefix: schema.apiKeys.keyPrefix,
      status: schema.apiKeys.status,
      createdAt: schema.apiKeys.createdAt,
    }).from(schema.apiKeys)
      .where(and(eq(schema.apiKeys.userId, uid), eq(schema.apiKeys.status, 'active')))
      .orderBy(sql`${schema.apiKeys.createdAt} DESC`);

    return reply.send(keys);
  });

  // ═══ /me/models — Playground 模型下拉 ═══
  app.get('/api/v1/me/models', { preHandler: [jwtAuth] }, async (_request, reply) => {
    return reply.send(DEFAULT_MODELS);
  });

  // ═══ /me/logs — 调用日志 ═══
  app.get('/api/v1/me/logs', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const q = (request.query || {}) as Record<string, string>;
    const limit = Math.min(200, Math.max(1, parseInt(q.limit || '100', 10) || 100));

    const conditions: any[] = [eq(schema.consumptionRecords.userId, uid)];
    if (q.model) {
      conditions.push(sql`${schema.consumptionRecords.model} ILIKE ${'%' + q.model + '%'}`);
    }
    if (q.provider) {
      conditions.push(sql`(${schema.suppliers.name} ILIKE ${'%' + q.provider + '%'})`);
    }
    if (q.status === 'success') conditions.push(sql`${schema.consumptionRecords.errorCode} IS NULL`);
    if (q.status === 'failed') conditions.push(sql`${schema.consumptionRecords.errorCode} IS NOT NULL`);

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db.select({
      id: schema.consumptionRecords.id,
      model: schema.consumptionRecords.model,
      inputTokens: schema.consumptionRecords.inputTokens,
      outputTokens: schema.consumptionRecords.outputTokens,
      totalTokens: schema.consumptionRecords.totalTokens,
      cost: schema.consumptionRecords.cost,
      errorCode: schema.consumptionRecords.errorCode,
      createdAt: schema.consumptionRecords.createdAt,
      supplierName: schema.suppliers.name,
    })
      .from(schema.consumptionRecords)
      .leftJoin(schema.suppliers, eq(schema.consumptionRecords.supplierId, schema.suppliers.id))
      .where(whereClause)
      .orderBy(sql`${schema.consumptionRecords.createdAt} DESC`)
      .limit(limit);

    const list = rows.map((r) => ({
      id: r.id,
      provider: r.supplierName,
      upstream_model: r.model,
      request_tokens: r.inputTokens,
      response_tokens: r.outputTokens,
      total_tokens: r.totalTokens,
      cost: Number(r.cost || 0),
      status: r.errorCode ? 'failed' : 'success',
      error_code: r.errorCode,
      latency_ms: null,
      created_at: r.createdAt,
    }));

    return reply.send({ list });
  });

  // ═══ /me/billing/current — 本周期摘要 ═══
  app.get('/api/v1/me/billing/current', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const row = await db.execute(sql`
      SELECT to_char(NOW(), 'YYYY-MM') AS "period",
             COALESCE(SUM(cost::numeric), 0)::text AS "cost",
             COUNT(*)::int AS "calls",
             (EXTRACT(DAY FROM (date_trunc('month', NOW()) + INTERVAL '1 month - 1 day' - NOW())))::int AS "days_left"
      FROM consumption_records
      WHERE user_id = ${uid} AND created_at >= ${monthStart()}
    `);
    const r = (row[0] as any) || {};
    const period = r.period || new Date().toISOString().slice(0, 7);
    const nextBilling = new Date(new Date(`${period}-01T00:00:00Z`).getTime() + 32 * 86400 * 1000);
    return reply.send({
      data: {
        period,
        total_cost: Number(r.cost || 0),
        bill_count: r.calls || 0,
        days_left: Math.max(0, r.days_left || 0),
        next_billing_date: `${new Date(Date.UTC(nextBilling.getUTCFullYear(), nextBilling.getUTCMonth(), 1)).toISOString().slice(0, 10)}`,
      },
    });
  });

  // ═══ /me/billing/current/daily — 本月每日消费 ═══
  app.get('/api/v1/me/billing/current/daily', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const rows = await db.execute(sql`
      SELECT to_char(created_at, 'YYYY-MM-DD') AS "day",
             COALESCE(SUM(cost::numeric), 0)::text AS "cost"
      FROM consumption_records
      WHERE user_id = ${uid} AND created_at >= ${monthStart()}
      GROUP BY to_char(created_at, 'YYYY-MM-DD')
      ORDER BY "day" ASC
    `);
    return reply.send({
      data: { list: rows.map((r: any) => ({ day: r.day, cost: Number(r.cost || 0) })) },
    });
  });

  // ═══ /me/billing/history — 按月历史 ═══
  app.get('/api/v1/me/billing/history', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const rows = await db.execute(sql`
      SELECT to_char(created_at, 'YYYY-MM') AS "month",
             COALESCE(SUM(cost::numeric), 0)::text AS "total_cost",
             COUNT(*)::int AS "bill_count"
      FROM consumption_records
      WHERE user_id = ${uid}
      GROUP BY to_char(created_at, 'YYYY-MM')
      ORDER BY "month" DESC
    `);
    return reply.send({
      data: {
        list: rows.map((r: any) => ({
          month: r.month,
          total_cost: Number(r.total_cost || 0),
          bill_count: r.bill_count || 0,
        })),
      },
    });
  });

  // ═══ /me/billing/history/:month — 单月明细 ═══
  app.get('/api/v1/me/billing/history/:month', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const params = request.params as { month: string };
    const month = String(params.month);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new ValidationError('month must be YYYY-MM');

    const rows = await db.execute(sql`
      SELECT model AS "model",
             COALESCE(SUM(cost::numeric), 0)::text AS "cost",
             COUNT(*)::int AS "calls"
      FROM consumption_records
      WHERE user_id = ${uid} AND to_char(created_at, 'YYYY-MM') = ${month}
      GROUP BY model ORDER BY "cost" DESC
    `);
    const items = rows.map((r: any) => ({
      price_source: r.model,
      cost: Number(r.cost || 0),
      calls: r.calls || 0,
      refund: 0,
    }));

    return reply.send({
      data: {
        month,
        summary: {
          total_cost: items.reduce((s: number, i: any) => s + i.cost, 0),
          total_refund: 0,
          total_calls: items.reduce((s: number, i: any) => s + i.calls, 0),
        },
        items,
        model_items: items.map((i: any) => ({ model: i.price_source, calls: i.calls, cost: i.cost })),
      },
    });
  });

  // ═══ /me/billing/history/:month/download — 账单 CSV ═══
  app.get('/api/v1/me/billing/history/:month/download', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const params = request.params as { month: string };
    const month = String(params.month);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new ValidationError('month must be YYYY-MM');

    const rows = await db.execute(sql`
      SELECT id, model, input_tokens, output_tokens, total_tokens, cost, to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
      FROM consumption_records
      WHERE user_id = ${uid} AND to_char(created_at, 'YYYY-MM') = ${month}
      ORDER BY created_at DESC
    `);

    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['id', 'created_at', 'model', 'input_tokens', 'output_tokens', 'total_tokens', 'cost'].join(',');
    const body = rows.map((r: any) => [r.id, r.created_at, r.model, r.input_tokens, r.output_tokens, r.total_tokens, r.cost].map(esc).join(',')).join('\n');
    const csv = `${header}\n${body}\n`;

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="billing-${month}.csv"`);
    return reply.send(csv);
  });
}
