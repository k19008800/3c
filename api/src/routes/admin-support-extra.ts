/**
 * 客服辅助缺失端点 — /api/v1/admin/support/*
 *
 * 对齐 gap-fix-spec-2026-08-18 §8（客服辅助，AdminSupportPage Tab3/4/5/6）：
 *   - GET  /admin/support/assist/diagnose/:id   用户自动诊断（聚合 users / consumption_records / api_keys / customer_balances）
 *   - POST /admin/support/assist/intent         关键词规则意图识别（充值/账单/密钥/退款/鉴权/调用错误）
 *   - GET  /admin/support/test-keys             客服测试 Key 列表（support_test_keys，按创建时间倒序）
 *   - POST /admin/support/test-key              生成 24h 有效测试 Key（key_hash 落库，明文仅此一次返回）
 *   - POST /admin/support/test-key/:id/revoke   撤销测试 Key（revoked=true）
 *   - GET  /admin/support/audit-logs            客服操作审计（audit_logs 中 resource 或 action 含 support）
 *
 * 全部端点 adminAuth（JWT + role ∈ {admin, super_admin}），写操作写 audit_logs。
 * 新建独立文件（admin-support-extra.ts）与 admin-support-missing.ts 隔离；注册由主 agent 在 app.ts 完成。
 */
import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { db, schema } from '../db';
import { eq, or, like, desc, inArray } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors';

/* ───────── 鉴权（对齐 admin-finance.ts / admin-support-missing.ts 模式） ───────── */

async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
}

async function adminAuth(request: any, reply: any) {
  await jwtAuth(request, reply);
  const { role } = request.userContext as { role: string };
  if (role !== 'admin' && role !== 'super_admin') {
    throw new ForbiddenError('Admin access required');
  }
}

/* ───────── 工具函数 ───────── */

/** 正整数解析（非法回退默认值，超上限截断） */
function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const n = parseInt(String(value ?? ''), 10);
  if (isNaN(n) || n <= 0) return fallback;
  return max && n > max ? max : n;
}

/** 统一分页参数：page（默认 1）/ pageSize（默认 20，上限 100） */
function parsePageQuery(q: Record<string, unknown>): { page: number; pageSize: number } {
  return {
    page: parsePositiveInt(q.page, 1),
    pageSize: parsePositiveInt(q.pageSize ?? q.page_size, 20, 100),
  };
}

/** numeric/字符串金额 → number（JS 展示用，保留精度交给前端格式化） */
function toNumber(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** 写审计日志（操作留痕，资源归属本文件端点） */
async function writeAudit(request: any, action: string, resource: string, resourceId: string | null, details: unknown) {
  const ctx = request.userContext ?? {};
  await db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action,
    resource,
    resourceId,
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
    createdAt: new Date(),
  });
}

/* ───────── 意图识别规则表 ───────── */

interface IntentRule {
  intent: string;
  keywords: string[];
  confidence: number;
  action: string;
  suggestedReply: string;
  /** 前端「建议操作」按钮列表（AdminSupportPage 展示） */
  suggestedActions: { label: string; action: string }[];
}

/** 关键词规则：命中词越多置信度越高（最高 0.99）；未命中走 general */
const INTENT_RULES: IntentRule[] = [
  {
    intent: 'recharge',
    keywords: ['充值', '付款', '购买', '续费', '到账', '开通', '套餐', '买'],
    confidence: 0.95,
    action: 'guide_recharge',
    suggestedReply:
      '您好，充值可在控制台「充值中心」选择金额并完成支付（支付宝/微信/对公转账），对公转账需人工审核后到账。请问您遇到的是支付失败还是未到账？我帮您核实订单状态。',
    suggestedActions: [{ label: '引导充值', action: 'guide_recharge' }],
  },
  {
    intent: 'billing',
    keywords: ['余额', '扣费', '消费', '账单', '扣款', '费用', '欠费', '计费', '余额不足'],
    confidence: 0.9,
    action: 'check_balance',
    suggestedReply:
      '您好，我来帮您核实账户余额与消费明细。请提供账户邮箱，我会检查近期的消费记录与扣费情况，确认是否存在异常扣费。',
    suggestedActions: [{ label: '查询余额与消费', action: 'check_balance' }],
  },
  {
    intent: 'apikey',
    keywords: ['key', '密钥', 'apikey', 'api key', 'token', '令牌', 'key过期', 'key失效', 'key不可用'],
    confidence: 0.9,
    action: 'check_keys',
    suggestedReply:
      '您好，API Key 可在控制台「API Keys」中查看与管理。若 Key 失效或鉴权报错，请确认是否被禁用/删除或已过期，我可以帮您检查 Key 状态并协助重新生成。',
    suggestedActions: [{ label: '检查 Key 状态', action: 'check_keys' }],
  },
  {
    intent: 'refund',
    keywords: ['退款', '赔偿', '退钱', '申诉', '维权', '退费'],
    confidence: 0.85,
    action: 'escalate',
    suggestedReply:
      '您好，非常抱歉给您带来不便。退款可在控制台「退款申请」提交，我们会在 1-3 个工作日内审核。请提供订单号或退款金额，我帮您登记并跟进审核进度。',
    suggestedActions: [{ label: '转人工处理退款', action: 'escalate' }],
  },
  {
    intent: 'auth',
    keywords: ['登录', '密码', '验证码', '注册', '账号', '登不进去', '找回', '收不到'],
    confidence: 0.85,
    action: 'guide_auth',
    suggestedReply:
      '您好，登录问题可通过「忘记密码」重置；收不到验证码时请检查垃圾邮件并确认邮箱无误。若仍无法登录，请提供账号邮箱，我协助您排查。',
    suggestedActions: [{ label: '引导账号找回', action: 'guide_auth' }],
  },
  {
    intent: 'api_error',
    keywords: ['报错', '调用失败', '错误', '超时', '限流', '模型', '接口', '429', '500', '502', '503', '失败'],
    confidence: 0.8,
    action: 'check_error_logs',
    suggestedReply:
      '您好，请提供报错时的完整信息（状态码/错误码）和使用的模型，我会查询您的调用日志，定位是限流、余额不足还是上游服务问题，并给出解决方案。',
    suggestedActions: [{ label: '查询调用日志', action: 'check_error_logs' }],
  },
];

/** 通用兜底意图 */
const GENERAL_REPLY =
  '您好，您的问题已收到。为了更快帮您解决，请补充以下信息：账户邮箱、具体操作步骤与报错截图。我们会在 1 个工作日内回复。';

export async function adminSupportExtraRoutes(app: FastifyInstance) {
  /* ═══════════ 1. 用户自动诊断 ═══════════ */

  /**
   * GET /api/v1/admin/support/assist/diagnose/:id — 聚合诊断
   *
   * 数据源：users + customer_balances + consumption_records（最近 10 条）+ api_keys；
   * errors 按 consumption_records.error_code 非空聚合；余额低于阈值给出预警文案。
   */
  app.get('/api/v1/admin/support/assist/diagnose/:id', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法用户 ID');

    const [userRow] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        status: schema.users.status,
        realNameStatus: schema.users.realNameStatus,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    if (!userRow) throw new NotFoundError('用户', id);

    // 余额（customer_balances 优先，缺失回退 0）
    const [balanceRow] = await db
      .select({
        availableBalance: schema.customerBalances.availableBalance,
        totalBalance: schema.customerBalances.totalBalance,
      })
      .from(schema.customerBalances)
      .where(eq(schema.customerBalances.userId, id))
      .limit(1);
    const balance = toNumber(balanceRow?.availableBalance ?? balanceRow?.totalBalance ?? 0);

    // 最近调用记录（最近 10 条，含错误码）
    const recentRows = await db
      .select({
        createdAt: schema.consumptionRecords.createdAt,
        model: schema.consumptionRecords.model,
        supplierId: schema.consumptionRecords.supplierId,
        cost: schema.consumptionRecords.cost,
        errorCode: schema.consumptionRecords.errorCode,
      })
      .from(schema.consumptionRecords)
      .where(eq(schema.consumptionRecords.userId, id))
      .orderBy(desc(schema.consumptionRecords.createdAt))
      .limit(10);

    // 供应商名映射（recent_calls.provider 展示）
    const supplierIds = [...new Set(recentRows.map((r) => r.supplierId).filter((v): v is number => v != null))];
    const supplierRows = supplierIds.length
      ? await db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).where(inArray(schema.suppliers.id, supplierIds))
      : [];
    const supplierName = new Map(supplierRows.map((s) => [s.id, s.name]));

    // 错误聚合：error_code 非空计数
    const errorRows = await db
      .select({ errorCode: schema.consumptionRecords.errorCode })
      .from(schema.consumptionRecords)
      .where(eq(schema.consumptionRecords.userId, id));
    const errorCount = new Map<string, number>();
    for (const r of errorRows) {
      const code = r.errorCode;
      if (code === null || code === undefined || code === '') continue;
      errorCount.set(code, (errorCount.get(code) ?? 0) + 1);
    }
    const errors = [...errorCount.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    // Key 状态
    const keyRows = await db
      .select({
        id: schema.apiKeys.id,
        keyPrefix: schema.apiKeys.keyPrefix,
        status: schema.apiKeys.status,
        expiresAt: schema.apiKeys.expiresAt,
        lastUsedAt: schema.apiKeys.lastUsedAt,
      })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.userId, id));
    const keyStatus = keyRows.map((k) => ({
      id: k.id,
      key_prefix: k.keyPrefix,
      status: k.status,
      expires_at: k.expiresAt,
      last_used_at: k.lastUsedAt,
    }));

    // 余额预警：低于阈值给提示文案
    const BALANCE_ALERT_THRESHOLD = 10; // ¥10
    let balanceAlert: string | null = null;
    if (balance <= 0) {
      balanceAlert = `余额已耗尽（¥0.00），调用将被拒绝，建议提醒用户尽快充值`;
    } else if (balance < BALANCE_ALERT_THRESHOLD) {
      balanceAlert = `余额仅剩 ¥${balance.toFixed(2)}，低于 ¥${BALANCE_ALERT_THRESHOLD} 预警阈值，建议提醒用户充值以免影响调用`;
    }

    // 分析摘要（前端 AdminSupportPage 展示）
    const totalCalls = recentRows.length;
    const failedCount = recentRows.filter((r) => r.errorCode).length;
    const successCount = totalCalls - failedCount;
    let suggestion = '近期调用正常，无需特殊处理。';
    if (failedCount > 0) {
      const codes = [...errorCount.keys()];
      if (codes.some((c) => /429|rate|limit/i.test(c))) suggestion = '存在限流错误（429），建议检查配额与并发控制。';
      else if (codes.some((c) => /401|403|auth|key/i.test(c))) suggestion = '存在鉴权错误，建议检查 API Key 状态与权限。';
      else if (codes.some((c) => /insufficient|balance|402/i.test(c))) suggestion = '存在余额不足错误，建议提醒用户充值。';
      else suggestion = '存在上游/服务错误，建议检查供应商可用性后重试。';
    } else if (totalCalls === 0) {
      suggestion = '该用户暂无调用记录，可引导其先发起一次调用。';
    }

    await writeAudit(request, 'support.diagnose.view', 'support_diagnose', String(id), { balanceAlert });

    return reply.send({
      data: {
        user: {
          id: userRow.id,
          email: userRow.email,
          name: userRow.name,
          username: userRow.name,
          status: userRow.status,
          balance,
          real_name_status: userRow.realNameStatus,
          created_at: userRow.createdAt,
        },
        recent_calls: recentRows.map((r) => ({
          created_at: r.createdAt,
          model: r.model,
          model_name: r.model,
          upstream_model: r.model,
          provider: r.supplierId != null ? supplierName.get(r.supplierId) ?? null : null,
          status: r.errorCode ? 'error' : 'success',
          cost: toNumber(r.cost),
          error_code: r.errorCode,
          latency_ms: null,
        })),
        errors,
        key_status: keyStatus,
        balance_alert: balanceAlert,
        balance_warning: balanceAlert ? { note: balanceAlert } : null,
        analysis: {
          total_calls: totalCalls,
          success_count: successCount,
          failed_count: failedCount,
          success_rate: totalCalls > 0 ? Math.round((successCount / totalCalls) * 100) : 0,
          avg_latency_ms: null,
          suggestion,
        },
      },
    });
  });

  /* ═══════════ 2. 意图识别 ═══════════ */

  /**
   * POST /api/v1/admin/support/assist/intent — 关键词规则识别意图
   *
   * 命中词数越多置信度越高（规则置信度 + 0.02×额外命中数，封顶 0.99）；
   * 未命中 → general（0.5）。返回 suggested_reply（任务契约）+ reply/suggested_actions（前端契约）。
   */
  app.post('/api/v1/admin/support/assist/intent', { preHandler: [adminAuth] }, async (request, reply) => {
    const text = String((request.body as any)?.text ?? '').trim();
    if (!text) throw new ValidationError('text 不能为空');
    if (text.length > 2000) throw new ValidationError('text 过长（上限 2000 字符）');

    const lower = text.toLowerCase();
    let best: { rule: IntentRule; matched: string[] } | null = null;

    for (const rule of INTENT_RULES) {
      const matched = rule.keywords.filter((k) => lower.includes(k.toLowerCase()));
      if (matched.length === 0) continue;
      // 命中词数优先；同数时取规则顺序靠前者
      if (!best || matched.length > best.matched.length) {
        best = { rule, matched };
      }
    }

    let result: {
      intent: string;
      confidence: number;
      suggested_reply: string;
      action: string;
      matched_keywords: string[];
      reply: string;
      suggested_actions: { label: string; action: string }[];
    };

    if (best) {
      const extra = Math.min(best.matched.length - 1, 2); // 每多命中一词 +0.02，最多 +0.04
      const confidence = Math.min(best.rule.confidence + extra * 0.02, 0.99);
      result = {
        intent: best.rule.intent,
        confidence,
        suggested_reply: best.rule.suggestedReply,
        action: best.rule.action,
        matched_keywords: best.matched,
        reply: best.rule.suggestedReply,
        suggested_actions: best.rule.suggestedActions,
      };
    } else {
      result = {
        intent: 'general',
        confidence: 0.5,
        suggested_reply: GENERAL_REPLY,
        action: 'manual_review',
        matched_keywords: [],
        reply: GENERAL_REPLY,
        suggested_actions: [{ label: '转人工客服', action: 'manual_review' }],
      };
    }

    return reply.send({ data: result });
  });

  /* ═══════════ 3. 测试 Key 管理 ═══════════ */

  /** GET /api/v1/admin/support/test-keys — 测试 Key 列表（按创建时间倒序） */
  app.get('/api/v1/admin/support/test-keys', { preHandler: [adminAuth] }, async (request, reply) => {
    const rows = await db
      .select({
        id: schema.supportTestKeys.id,
        name: schema.supportTestKeys.name,
        keyPrefix: schema.supportTestKeys.keyPrefix,
        associatedUserId: schema.supportTestKeys.associatedUserId,
        expiresAt: schema.supportTestKeys.expiresAt,
        revoked: schema.supportTestKeys.revoked,
        createdAt: schema.supportTestKeys.createdAt,
      })
      .from(schema.supportTestKeys)
      .orderBy(desc(schema.supportTestKeys.createdAt));

    const now = new Date();
    const list = rows.map((k) => {
      const expired = !k.revoked && k.expiresAt != null && k.expiresAt <= now;
      return {
        id: k.id,
        name: k.name,
        key_prefix: k.keyPrefix,
        associated_user_id: k.associatedUserId,
        expires_at: k.expiresAt,
        revoked: k.revoked,
        created_at: k.createdAt,
        // 前端状态徽标：active 才显示「撤销」按钮
        status: k.revoked ? 'revoked' : expired ? 'expired' : 'active',
        used_tokens: 0,
        token_limit: 100000,
        cost_limit: 10,
      };
    });

    return reply.send({ data: { list } });
  });

  /**
   * POST /api/v1/admin/support/test-key — 生成 24h 测试 Key
   *
   * key = `tst_` + 随机串；key_prefix 取前 8 位；key_hash = sha256(key)（明文仅本次响应返回）。
   */
  app.post('/api/v1/admin/support/test-key', { preHandler: [adminAuth] }, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = String(body.name ?? '').trim() || '未命名测试Key';
    const associatedUserId = body.associated_user_id != null && body.associated_user_id !== ''
      ? Number(body.associated_user_id)
      : null;

    if (name.length > 100) throw new ValidationError('name 过长（上限 100 字符）');
    if (associatedUserId != null) {
      if (!Number.isInteger(associatedUserId) || associatedUserId <= 0) throw new ValidationError('associated_user_id 非法');
      const [target] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, associatedUserId))
        .limit(1);
      if (!target) throw new NotFoundError('关联用户', associatedUserId);
    }

    const key = `tst_${randomBytes(16).toString('hex')}`;
    const keyPrefix = key.slice(0, 8);
    const keyHash = createHash('sha256').update(key).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const [created] = await db
      .insert(schema.supportTestKeys)
      .values({
        name,
        keyPrefix,
        keyHash,
        associatedUserId,
        expiresAt,
        revoked: false,
        createdBy: (request as any).userContext?.userId ?? null,
        createdAt: new Date(),
      })
      .returning();
    if (!created) throw new ValidationError('测试 Key 创建失败');

    await writeAudit(request, 'support_test_key.create', 'support_test_key', String(created.id), {
      name,
      associatedUserId,
      keyPrefix,
    });

    return reply.send({
      data: {
        id: created.id,
        name: created.name,
        key_prefix: created.keyPrefix,
        associated_user_id: created.associatedUserId,
        key,
        expires_at: created.expiresAt,
        token_limit: 100000,
        cost_limit: 10,
      },
    });
  });

  /** POST /api/v1/admin/support/test-key/:id/revoke — 撤销测试 Key */
  app.post('/api/v1/admin/support/test-key/:id/revoke', { preHandler: [adminAuth] }, async (request, reply) => {
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('非法 Key ID');

    const [updated] = await db
      .update(schema.supportTestKeys)
      .set({ revoked: true })
      .where(eq(schema.supportTestKeys.id, id))
      .returning();
    if (!updated) throw new NotFoundError('测试 Key', id);

    await writeAudit(request, 'support_test_key.revoke', 'support_test_key', String(id), {});
    return reply.send({ data: { id, revoked: true } });
  });

  /* ═══════════ 4. 客服操作审计 ═══════════ */

  /** GET /api/v1/admin/support/audit-logs — resource 或 action 含 support 的审计记录 */
  app.get('/api/v1/admin/support/audit-logs', { preHandler: [adminAuth] }, async (request, reply) => {
    const q = (request.query ?? {}) as Record<string, unknown>;
    const { page, pageSize } = parsePageQuery(q);

    const where = or(
      like(schema.auditLogs.resource, '%support%'),
      like(schema.auditLogs.action, '%support%'),
    );

    const rows = await db
      .select({
        id: schema.auditLogs.id,
        userId: schema.auditLogs.userId,
        action: schema.auditLogs.action,
        resource: schema.auditLogs.resource,
        resourceId: schema.auditLogs.resourceId,
        details: schema.auditLogs.details,
        ipAddress: schema.auditLogs.ipAddress,
        createdAt: schema.auditLogs.createdAt,
      })
      .from(schema.auditLogs)
      .where(where)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // 操作者名（users.name/email）
    const userIds = [...new Set(rows.map((r) => r.userId).filter((v): v is number => v != null))];
    const userRows = userIds.length
      ? await db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, userIds))
      : [];
    const userMap = new Map(userRows.map((u) => [u.id, u]));

    // 总数（支持日志量级小，直接取全部匹配 id 计数）
    const totalRows = await db.select({ id: schema.auditLogs.id }).from(schema.auditLogs).where(where);
    const total = totalRows.length;

    const list = rows.map((r) => {
      const operator = userMap.get(r.userId as number);
      const detail = r.details == null ? '' : typeof r.details === 'string' ? r.details : JSON.stringify(r.details);
      return {
        id: r.id,
        created_at: r.createdAt,
        user_id: r.userId,
        username: operator?.name ?? operator?.email ?? null,
        operator: operator?.name ?? operator?.email ?? String(r.userId ?? ''),
        action: r.action,
        resource: r.resource,
        resource_id: r.resourceId,
        detail,
        ip: r.ipAddress,
      };
    });

    return reply.send({ data: { list, total: list.length, page, pageSize } });
  });
}
