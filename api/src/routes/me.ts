/**
 * 用户端「本人」域路由 — /api/v1/me/*
 *
 * 契约对齐（见 docs/api-contract.md §1 MVP 切片）：
 *   GET /me/stats · /me/keys · /me/models · /me/logs
 *   GET /me/billing/current · /me/billing/history · /me/billing/current/daily
 *       /me/billing/history/:month · /me/billing/history/:month/download
 */

import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { db, schema } from '../db';
import { eq, and, sql, count, desc, inArray } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { getBalance } from '../services/billing/balance';
import { getUserGroup } from '../services/groups';
import { AppError, UnauthorizedError, ValidationError, NotFoundError } from '../lib/errors';

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

// ── 实名认证状态文案 ─────────────────────────────────────
const REAL_NAME_STATUS_LABEL: Record<string, string> = {
  unverified: '未认证',
  pending_review: '待审核',
  approved: '已认证',
  rejected: '已驳回',
};
const REAL_NAME_TYPE_LABEL: Record<string, string> = { individual: '个人', enterprise: '企业' };

// ── Playground 默认模型目录（mock 回退接受的模型集）──────
// context: 上下文窗口（单位 tokens），随模型信息一并返回供前端展示
const DEFAULT_MODELS = [
  { id: 1, name: 'deepseek-chat', provider: 'DeepSeek', context: 128_000, inputPrice: 0.5, outputPrice: 1.3 },
  { id: 2, name: 'deepseek-r1', provider: 'DeepSeek', context: 128_000, inputPrice: 0.5, outputPrice: 1.3 },
  { id: 3, name: 'deepseek-v4-pro', provider: 'DeepSeek', context: 256_000, inputPrice: 2.0, outputPrice: 5.0 },
  { id: 4, name: 'deepseek-v4-flash', provider: 'DeepSeek', context: 256_000, inputPrice: 0.8, outputPrice: 2.4 },
  { id: 5, name: 'gpt-5.4', provider: 'OpenAI', context: 400_000, inputPrice: 4.0, outputPrice: 12.0 },
  { id: 6, name: 'gpt-5.4-mini', provider: 'OpenAI', context: 400_000, inputPrice: 0.4, outputPrice: 1.2 },
  { id: 7, name: 'claude-sonnet-4.6', provider: 'Anthropic', context: 200_000, inputPrice: 3.0, outputPrice: 15.0 },
  { id: 8, name: 'claude-opus-4.5', provider: 'Anthropic', context: 200_000, inputPrice: 15.0, outputPrice: 75.0 },
  { id: 9, name: 'glm-5.2', provider: 'Zhipu', context: 256_000, inputPrice: 0.6, outputPrice: 2.0 },
  { id: 10, name: 'glm-4v-flash', provider: 'Zhipu', context: 128_000, inputPrice: 0.001, outputPrice: 0.005 },
  { id: 11, name: 'qwen3.7-max', provider: 'Alibaba', context: 256_000, inputPrice: 2.0, outputPrice: 6.0 },
  { id: 12, name: 'qwen3.6-plus', provider: 'Alibaba', context: 256_000, inputPrice: 0.8, outputPrice: 2.0 },
  { id: 13, name: 'qwen3.5-9b', provider: 'Alibaba', context: 128_000, inputPrice: 0.2, outputPrice: 0.6 },
  { id: 14, name: 'kimi-k3', provider: 'Moonshot', context: 256_000, inputPrice: 1.0, outputPrice: 4.0 },
  { id: 15, name: 'minimax-m2.7', provider: 'MiniMax', context: 256_000, inputPrice: 0.6, outputPrice: 2.0 },
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

  // ═══ /me/real-name — 我的实名认证状态 ═══
  app.get('/api/v1/me/real-name', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const [u] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        realNameStatus: schema.users.realNameStatus,
        customerType: schema.users.customerType,
      })
      .from(schema.users)
      .where(eq(schema.users.id, uid));
    if (!u) throw new UnauthorizedError('User not found');

    const [rec] = await db
      .select()
      .from(schema.realNameRecords)
      .where(eq(schema.realNameRecords.userId, uid))
      .orderBy(desc(schema.realNameRecords.createdAt))
      .limit(1);

    const status = rec?.status ?? u.realNameStatus ?? 'unverified';
    return reply.send({
      data: {
        status,
        status_label: REAL_NAME_STATUS_LABEL[status] ?? '未认证',
        type: rec?.type ?? null,
        type_label: rec?.type ? (REAL_NAME_TYPE_LABEL[rec.type] ?? rec.type) : null,
        real_name: rec?.realName ? schema.maskIdSmart(rec.realName, rec.type) : null,
        id_number: rec?.idNumber ? schema.maskIdSmart(rec.idNumber, rec.type) : null,
        phone: rec?.phone ?? null,
        company: rec?.type === 'enterprise'
          ? { legal_person: rec.legalPerson, company_address: rec.companyAddress }
          : null,
        reject_reason: rec?.rejectReason ?? null,
        reviewed_at: rec?.reviewedAt ?? null,
        user_real_name_status: u.realNameStatus,
      },
    });
  });

  // ═══ /me/real-name — 提交 / 重新提交实名申请 ═══
  app.post('/api/v1/me/real-name', { preHandler: [jwtAuth] }, async (request: any, reply) => {
    const uid = userId(request);
    const b = (request.body || {}) as {
      type?: string;
      real_name: string;
      id_number: string;
      phone?: string;
      legal_person?: string;
      company_address?: string;
    };

    if (!b.real_name?.trim()) throw new ValidationError('请填写真实姓名 / 企业名称');
    if (!b.id_number?.trim()) throw new ValidationError('请填写证件号');
    const type = b.type === 'enterprise' ? 'enterprise' : 'individual';
    if (type === 'enterprise' && !b.legal_person?.trim()) throw new ValidationError('企业认证需填写法人代表');

    const idNum = b.id_number.trim();
    if (type === 'individual' && !/^\d{17}[\dXx]$/.test(idNum)) {
      throw new ValidationError('身份证号格式有误（需 18 位）');
    }
    if (type === 'enterprise' && (idNum.length < 8 || idNum.length > 20)) {
      throw new ValidationError('统一社会信用代码格式有误');
    }

    // 已有审核中 / 已通过的实名，拒绝重复提交
    const [cur] = await db
      .select()
      .from(schema.realNameRecords)
      .where(eq(schema.realNameRecords.userId, uid))
      .orderBy(desc(schema.realNameRecords.createdAt))
      .limit(1);
    if (cur && (cur.status === 'pending_review' || cur.status === 'approved')) {
      return reply.code(400).send({
        code: 400,
        error: 'EXISTS',
        message: cur.status === 'approved' ? '已完成实名认证，无需重复提交' : '已有进行中的实名认证，请等待审核',
      });
    }

    let recordId: number;
    const now = new Date();
    if (cur) {
      // 驳回后重新提交：覆盖原记录为 pending_review
      const [upd] = await db
        .update(schema.realNameRecords)
        .set({
          type,
          realName: b.real_name.trim(),
          idNumber: idNum,
          phone: b.phone ?? null,
          legalPerson: type === 'enterprise' ? (b.legal_person ?? null) : null,
          companyAddress: type === 'enterprise' ? (b.company_address ?? null) : null,
          status: 'pending_review',
          reviewerId: null,
          rejectReason: null,
          reviewedAt: null,
          updatedAt: now,
        })
        .where(eq(schema.realNameRecords.id, cur.id))
        .returning({ id: schema.realNameRecords.id });
      if (!upd) throw new Error('Failed to update real-name record');
      recordId = upd.id;
    } else {
      const [created] = await db
        .insert(schema.realNameRecords)
        .values({
          userId: uid,
          type,
          realName: b.real_name.trim(),
          idNumber: idNum,
          phone: b.phone ?? null,
          legalPerson: type === 'enterprise' ? (b.legal_person ?? null) : null,
          companyAddress: type === 'enterprise' ? (b.company_address ?? null) : null,
          status: 'pending_review',
        })
        .returning({ id: schema.realNameRecords.id });
      if (!created) throw new Error('Failed to create real-name record');
      recordId = created.id;
    }

    // 同步 users.real_name_status
    await db.update(schema.users).set({ realNameStatus: 'pending_review' }).where(eq(schema.users.id, uid));

    return reply.send({
      data: { id: recordId, status: 'pending_review', status_label: '待审核' },
      message: '实名认证申请已提交，等待审核',
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

  // ═══ /me/notifications — 通知中心（价格变更 / 系统公告 / 安全 / 工单） ═══
  // 前端契约对齐 NotificationPage.tsx：category 分组、未读数、全部已读

  const NOTIFICATION_CATEGORY: Record<string, { category: string; label: string; icon: string }> = {
    price_change: { category: 'consume', label: '价格变更', icon: '📈' },
    announcement: { category: 'system', label: '系统公告', icon: '📢' },
    system: { category: 'system', label: '系统公告', icon: '📢' },
    maintenance: { category: 'system', label: '系统公告', icon: '🛠️' },
    security: { category: 'security', label: '安全', icon: '🔒' },
    login: { category: 'security', label: '安全', icon: '🔒' },
    password: { category: 'security', label: '安全', icon: '🔒' },
    ticket: { category: 'ticket', label: '工单', icon: '🎫' },
  };

  const categoryOf = (type: string) => NOTIFICATION_CATEGORY[type] ?? { category: 'system', label: '系统公告', icon: '📢' };
  const htmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const toBodyHtml = (content: string) => htmlEscape(content).replace(/\n/g, '<br/>');

  app.get('/api/v1/me/notifications', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const q = (request.query || {}) as { category?: string; page?: string; page_size?: string };
    const category = String(q.category || 'all');
    const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(q.page_size || '50', 10) || 50));
    const offset = (page - 1) * pageSize;

    const rows = await db.select().from(schema.notifications)
      .where(eq(schema.notifications.userId, uid))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(pageSize).offset(offset);

    const list = rows
      .filter((n) => category === 'all' || categoryOf(n.type).category === category)
      .map((n) => {
        const cat = categoryOf(n.type);
        return {
          id: n.id,
          category: cat.category,
          category_label: cat.label,
          icon: cat.icon,
          title: n.title,
          desc: n.content.replace(/\s+/g, ' ').slice(0, 80),
          body_html: toBodyHtml(n.content),
          created_at: n.createdAt.toISOString(),
          is_read: n.read,
        };
      });

    // 未读数（同分类口径，供顶部「X 条未读」展示）
    const unreadCond = category !== 'all'
      ? and(
          eq(schema.notifications.userId, uid),
          eq(schema.notifications.read, false),
          inArray(schema.notifications.type, Object.keys(NOTIFICATION_CATEGORY).filter((t) => categoryOf(t).category === category)),
        )
      : and(eq(schema.notifications.userId, uid), eq(schema.notifications.read, false));
    const [totalResult, unreadResult] = await Promise.all([
      db.select({ v: sql<number>`count(*)` }).from(schema.notifications).where(eq(schema.notifications.userId, uid)),
      db.select({ v: sql<number>`count(*)` }).from(schema.notifications).where(unreadCond),
    ]);

    return reply.send({
      data: {
        list,
        total: Number(totalResult[0]?.v ?? 0),
        unread: Number(unreadResult[0]?.v ?? 0),
        page,
        page_size: pageSize,
      },
    });
  });

  app.post('/api/v1/me/notifications/:id/read', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const id = parseInt(String((request.params as Record<string, unknown>).id), 10);
    if (isNaN(id)) throw new ValidationError('Invalid notification id');
    const [row] = await db.update(schema.notifications)
      .set({ read: true, readAt: new Date() })
      .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, uid)))
      .returning({ id: schema.notifications.id });
    if (!row) throw new NotFoundError('Notification', id);
    return reply.send({ data: { ok: true, id } });
  });

  app.post('/api/v1/me/notifications/read-all', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const r = await db.update(schema.notifications)
      .set({ read: true, readAt: new Date() })
      .where(and(eq(schema.notifications.userId, uid), eq(schema.notifications.read, false)))
      .returning({ id: schema.notifications.id });
    return reply.send({ data: { ok: true, updated: r.length } });
  });

  // 通知设置（本期返回空结构，设置页展示空态；按类型邮件开关后续迭代）
  app.get('/api/v1/me/notification-settings', { preHandler: [jwtAuth] }, async (_request, reply) => {
    return reply.send({ data: { types: {}, prefs: {} } });
  });

  // ═══ /me/group — 我的分组信息 ═══
  // 返回当前用户所属分组（含限流 / 额度配置与模型白名单）；无任何分组时 data 为 null。
  app.get('/api/v1/me/group', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const group = await getUserGroup(uid);
    if (!group) {
      return reply.send({ data: null, message: '当前无可用分组' });
    }
    return reply.send({
      data: {
        id: group.id,
        name: group.name,
        description: group.description,
        pricingGroup: group.pricingGroup,
        rateLimitQps: group.rateLimitQps,
        rateLimitTpm: group.rateLimitTpm,
        dailyQuota: group.dailyQuota != null ? Number(group.dailyQuota) : null,
        modelWhitelist: Array.isArray(group.modelWhitelist) ? group.modelWhitelist : [],
        isDefault: group.isDefault,
        status: group.status,
      },
    });
  });

  // ═══ /me/group/models — 我可用模型列表 ═══
  // 白名单为空 → 返回全部 active 平台模型名（去重）；非空 → 只返回白名单内且存在 active 的模型。
  app.get('/api/v1/me/group/models', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const group = await getUserGroup(uid);
    const whitelist = group && Array.isArray(group.modelWhitelist) ? group.modelWhitelist : [];

    const activeRows = await db
      .select({
        platformModel: schema.supplierModels.platformModel,
      })
      .from(schema.supplierModels)
      .where(eq(schema.supplierModels.status, 'active'));

    // 同一平台模型可能由多个供应商提供 → 去重
    const allModels = [...new Set(activeRows.map((r) => r.platformModel).filter(Boolean))];

    const models = whitelist.length === 0 ? allModels : allModels.filter((m) => whitelist.includes(m));
    return reply.send({ data: models });
  });

  // ═══ /me/change-password — 修改密码（P1-1）═══
  // 旧密码 bcrypt 校验 → 更新 passwordHash → 使该用户全部会话失效（提示重新登录）。
  app.post('/api/v1/me/change-password', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const body = (request.body || {}) as Record<string, unknown>;
    const oldPassword = String(body.oldPassword ?? '');
    const newPassword = String(body.newPassword ?? '');

    if (!oldPassword) throw new ValidationError('旧密码不能为空');
    if (newPassword.length < 8) throw new ValidationError('新密码至少 8 位');

    const [user] = await db
      .select({ id: schema.users.id, passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.id, uid))
      .limit(1);
    if (!user) throw new UnauthorizedError('User not found');
    if (!bcrypt.compareSync(oldPassword, user.passwordHash)) {
      throw new UnauthorizedError('旧密码不正确');
    }

    await db.update(schema.users)
      .set({ passwordHash: bcrypt.hashSync(newPassword, 12), updatedAt: new Date() })
      .where(eq(schema.users.id, uid));

    // 使该用户全部会话失效：旧 refresh token 立即不可用；access token 为无状态 JWT，
    // 15 分钟内自然过期（复用现有 session 机制，前端提示重新登录）。
    await db.delete(schema.userSessions).where(eq(schema.userSessions.userId, uid));

    return reply.send({ message: '密码已更新，请重新登录' });
  });

  // ═══ /me/change-email — 修改邮箱（P1-1）═══
  // 新邮箱唯一性校验（409 EMAIL_EXISTS）→ 更新 users.email。
  app.post('/api/v1/me/change-email', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const body = (request.body || {}) as Record<string, unknown>;
    const newEmail = String(body.newEmail || body.email || '').toLowerCase().trim();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) throw new ValidationError('邮箱格式不正确');

    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, newEmail))
      .limit(1);
    if (existing && existing.id !== uid) {
      throw new AppError('邮箱已被使用', 409, 'EMAIL_EXISTS');
    }

    const [user] = await db.update(schema.users)
      .set({ email: newEmail, updatedAt: new Date() })
      .where(eq(schema.users.id, uid))
      .returning({ id: schema.users.id, email: schema.users.email });
    if (!user) throw new UnauthorizedError('User not found');

    return reply.send({ message: '邮箱已更新', data: { email: user.email } });
  });

  // ═══ /me/invoices — 我的发票列表（P1-1）═══
  app.get('/api/v1/me/invoices', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const q = (request.query || {}) as Record<string, string>;
    const page = Math.max(parseInt(q.page || '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(q.page_size || '20', 10) || 20, 1), 100);

    const [rows, countResult] = await Promise.all([
      db.select()
        .from(schema.invoices)
        .where(eq(schema.invoices.userId, uid))
        .orderBy(desc(schema.invoices.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(schema.invoices)
        .where(eq(schema.invoices.userId, uid)),
    ]);

    const list = rows.map((r) => ({
      id: r.id,
      invoice_no: r.invoiceNo,
      amount: Number(r.amount ?? 0),
      tax: Number(r.tax ?? 0),
      status: r.status,
      title: r.title,
      tax_id: r.taxId,
      recipient: r.recipient,
      issued_at: r.issuedAt,
      created_at: r.createdAt,
    }));

    return reply.send({
      data: { list, pagination: { page, pageSize, total: Number(countResult[0]?.count ?? 0) } },
    });
  });

  // ═══ /me/invoices/:id/download — 发票下载（P1-1）═══
  // 必须属于当前用户（越权一律 404 防枚举）；无真实 PDF 时返回结构化 JSON 详情
  // + Content-Disposition 附件文件名。
  app.get('/api/v1/me/invoices/:id/download', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const id = parseInt(String((request.params as Record<string, unknown>).id), 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('Invalid invoice id');

    const [inv] = await db.select()
      .from(schema.invoices)
      .where(and(eq(schema.invoices.id, id), eq(schema.invoices.userId, uid)))
      .limit(1);
    if (!inv) throw new NotFoundError('Invoice', id);

    const filename = `invoice-${inv.invoiceNo || inv.id}.json`;
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send({
      id: inv.id,
      invoice_no: inv.invoiceNo,
      amount: Number(inv.amount ?? 0),
      tax: Number(inv.tax ?? 0),
      status: inv.status,
      title: inv.title,
      tax_id: inv.taxId,
      recipient: inv.recipient,
      issued_at: inv.issuedAt,
      created_at: inv.createdAt,
    });
  });

  // ═══ /me/tickets — 我的工单（P1-1）═══
  // 列表：本人工单倒序，回复记录从 metadata.replies 展开。
  app.get('/api/v1/me/tickets', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const q = (request.query || {}) as Record<string, string>;
    const page = Math.max(parseInt(q.page || '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(q.page_size || '20', 10) || 20, 1), 100);

    const [rows, countResult] = await Promise.all([
      db.select()
        .from(schema.tickets)
        .where(eq(schema.tickets.userId, uid))
        .orderBy(desc(schema.tickets.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(schema.tickets)
        .where(eq(schema.tickets.userId, uid)),
    ]);

    const list = rows.map((t) => ({
      id: t.id,
      ticket_no: `TCK${String(t.id).padStart(6, '0')}`,
      type: t.type,
      title: t.title,
      content: t.content,
      status: t.status,
      priority: t.priority,
      resolution: t.resolution,
      resolved_at: t.resolvedAt,
      replies: Array.isArray((t.metadata as any)?.replies) ? (t.metadata as any).replies : [],
      created_at: t.createdAt,
      updated_at: t.updatedAt,
    }));

    return reply.send({
      data: { list, pagination: { page, pageSize, total: Number(countResult[0]?.count ?? 0) } },
    });
  });

  /** POST /api/v1/me/tickets — 创建工单（type/title/content） */
  app.post('/api/v1/me/tickets', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const body = (request.body || {}) as Record<string, unknown>;
    const type = String(body.type || 'general').trim();
    const title = String(body.title || '').trim();
    const content = String(body.content || '').trim();

    if (!title) throw new ValidationError('工单标题不能为空');
    if (!content) throw new ValidationError('工单内容不能为空');
    if (title.length > 200) throw new ValidationError('工单标题过长');

    const [ticket] = await db.insert(schema.tickets).values({
      userId: uid,
      type: type || 'general',
      title,
      content,
      status: 'open',
      priority: 'normal',
      metadata: { replies: [] },
    }).returning();
    if (!ticket) throw new AppError('Failed to create ticket', 500, 'TICKET_CREATE_FAILED');

    return reply.status(201).send({
      data: {
        id: ticket.id,
        ticket_no: `TCK${String(ticket.id).padStart(6, '0')}`,
        type: ticket.type,
        title: ticket.title,
        content: ticket.content,
        status: ticket.status,
        created_at: ticket.createdAt,
      },
    });
  });

  /** POST /api/v1/me/tickets/:id/reply — 追加回复（本人；回复记录存 metadata.replies） */
  app.post('/api/v1/me/tickets/:id/reply', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const id = parseInt(String((request.params as Record<string, unknown>).id), 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('Invalid ticket id');

    const content = String((request.body as Record<string, unknown> | undefined)?.content || '').trim();
    if (!content) throw new ValidationError('回复内容不能为空');

    const [ticket] = await db.select({ id: schema.tickets.id, status: schema.tickets.status, metadata: schema.tickets.metadata })
      .from(schema.tickets)
      .where(and(eq(schema.tickets.id, id), eq(schema.tickets.userId, uid)))
      .limit(1);
    if (!ticket) throw new NotFoundError('Ticket', id);

    const metadata = (ticket.metadata && typeof ticket.metadata === 'object' ? ticket.metadata : {}) as Record<string, unknown>;
    const replies = Array.isArray(metadata.replies) ? metadata.replies : [];
    replies.push({ role: 'user', userId: uid, content, createdAt: new Date().toISOString() });

    // 用户回复：waiting_customer → open（重新回到待处理）；其余状态保持
    const nextStatus = ticket.status === 'waiting_customer' ? 'open' : ticket.status;

    const [updated] = await db.update(schema.tickets)
      .set({ metadata: { ...metadata, replies }, status: nextStatus, updatedAt: new Date() })
      .where(eq(schema.tickets.id, ticket.id))
      .returning({ id: schema.tickets.id, status: schema.tickets.status, metadata: schema.tickets.metadata, updatedAt: schema.tickets.updatedAt });
    if (!updated) throw new NotFoundError('Ticket', id);

    return reply.send({
      data: {
        id: updated.id,
        status: updated.status,
        replies: Array.isArray((updated.metadata as any)?.replies) ? (updated.metadata as any).replies : [],
        updated_at: updated.updatedAt,
      },
    });
  });

  /** POST /api/v1/me/tickets/:id/resolve — 用户标记解决（仅本人工单） */
  app.post('/api/v1/me/tickets/:id/resolve', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const id = parseInt(String((request.params as Record<string, unknown>).id), 10);
    if (isNaN(id) || id <= 0) throw new ValidationError('Invalid ticket id');

    const [updated] = await db.update(schema.tickets)
      .set({ status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.tickets.id, id), eq(schema.tickets.userId, uid)))
      .returning({ id: schema.tickets.id, status: schema.tickets.status, resolvedAt: schema.tickets.resolvedAt });
    if (!updated) throw new NotFoundError('Ticket', id);

    return reply.send({ data: { id: updated.id, status: updated.status, resolved_at: updated.resolvedAt } });
  });

  // ═══ /me/api-keys/revoke-all — 吊销本人全部 API Key（P1-1）═══
  app.post('/api/v1/me/api-keys/revoke-all', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const rows = await db.update(schema.apiKeys)
      .set({ status: 'revoked', updatedAt: new Date() })
      .where(and(eq(schema.apiKeys.userId, uid), sql`${schema.apiKeys.status} != 'revoked'`))
      .returning({ id: schema.apiKeys.id });
    return reply.send({ message: '全部 API Key 已吊销', data: { revoked: rows.length } });
  });
}
