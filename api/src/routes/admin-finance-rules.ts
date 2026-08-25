/**
 * 风控规则配置端点 — GET/PUT /admin/finance/rules（B17，ARCH v1.1 §4.8 / §1.3）
 *
 * - `GET`：requirePerm('sys.config')，返回 finance_rules 配置（合并默认值，供前端回显）
 * - `PUT`：requirePerm('sys.config') + requireOperation2fa（2FA + 二次确认，敏感写操作）；
 *   保存校验（阈值一致性：single_review_max ≤ dual_review_threshold < super_review_threshold、
 *   soft_limit ≤ hard_limit、金额/数值为正）+ `resetFinanceRulesCache` 即时生效 + 审计；
 *   `operation_2fa` 段仅 super_admin 可改（B17）。
 * - 读失败/配置缺失 → 返回默认常量（与 getFinanceRules 一致）。
 *
 * @see docs/ARCH-整改R5-R7-资金风控.md v1.1 §2.1 / §4.8 / §6 用例 26
 * @module routes/admin-finance-rules
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { ValidationError, ForbiddenError } from '../lib/errors';
import { requirePerm } from '../middleware/require-perm';
import { requireOperation2fa } from '../middleware/require-operation-2fa';
import { getFinanceRules, resetFinanceRulesCache, type FinanceRules } from '../lib/finance-rules';

const CFG_KEY = 'finance_rules';

/** 数字 > 0 校验（非法返回 false） */
function isPositiveNum(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * 保存配置校验（ARCH §2.1 字段约束）：仅校验 body 中提供的段（部分更新合并语义）；
 * 跨字段一致性（single ≤ dual < super、soft ≤ hard）要求相关字段同批提供时校验。
 */
function validateConfig(raw: Record<string, unknown>): void {
  const large = (raw.large_amount ?? {}) as Record<string, unknown>;
  if (raw.large_amount !== undefined) {
    const single = Number(large.single_review_max);
    const dual = Number(large.dual_review_threshold);
    const superMax = Number(large.super_review_threshold);
    if (large.single_review_max !== undefined && !isPositiveNum(single)) throw new ValidationError('large_amount.single_review_max 必须为正数');
    if (large.dual_review_threshold !== undefined && !isPositiveNum(dual)) throw new ValidationError('large_amount.dual_review_threshold 必须为正数');
    if (large.super_review_threshold !== undefined && !isPositiveNum(superMax)) throw new ValidationError('large_amount.super_review_threshold 必须为正数');
    if (isPositiveNum(single) && isPositiveNum(dual) && single > dual) throw new ValidationError('single_review_max 不能大于 dual_review_threshold');
    if (isPositiveNum(dual) && isPositiveNum(superMax) && superMax <= dual) throw new ValidationError('super_review_threshold 必须大于 dual_review_threshold');
    const exempt = (large.review_exempt ?? {}) as Record<string, unknown>;
    if (exempt.enabled !== undefined && typeof exempt.enabled !== 'boolean') throw new ValidationError('review_exempt.enabled 必须为布尔值');
    if (exempt.max_amount !== undefined && !isPositiveNum(Number(exempt.max_amount))) throw new ValidationError('review_exempt.max_amount 必须为正数');
    if (exempt.subjects !== undefined && (!Array.isArray(exempt.subjects) || !exempt.subjects.every((s) => typeof s === 'string'))) {
      throw new ValidationError('review_exempt.subjects 必须为字符串数组');
    }
  }

  const limits = (raw.limits ?? {}) as Record<string, unknown>;
  if (raw.limits !== undefined) {
    const soft = Number(limits.soft_limit);
    const hard = Number(limits.hard_limit);
    if (limits.soft_limit !== undefined && !isPositiveNum(soft)) throw new ValidationError('limits.soft_limit 必须为正数');
    if (limits.hard_limit !== undefined && !isPositiveNum(hard)) throw new ValidationError('limits.hard_limit 必须为正数');
    if (isPositiveNum(soft) && isPositiveNum(hard) && soft > hard) throw new ValidationError('limits.soft_limit 不能大于 hard_limit');
    if (limits.exceed_action !== undefined && limits.exceed_action !== 'escalate' && limits.exceed_action !== 'reject') {
      throw new ValidationError('limits.exceed_action 必须为 escalate 或 reject');
    }
    if (limits.exempt_roles !== undefined && (!Array.isArray(limits.exempt_roles) || !limits.exempt_roles.every((r) => typeof r === 'string'))) {
      throw new ValidationError('limits.exempt_roles 必须为字符串数组');
    }
  }

  const op2fa = (raw.operation_2fa ?? {}) as Record<string, unknown>;
  if (raw.operation_2fa !== undefined) {
    if (op2fa.token_ttl_seconds !== undefined && !isPositiveNum(Number(op2fa.token_ttl_seconds))) throw new ValidationError('operation_2fa.token_ttl_seconds 必须为正数');
    if (op2fa.lock_threshold !== undefined && !isPositiveNum(Number(op2fa.lock_threshold))) throw new ValidationError('operation_2fa.lock_threshold 必须为正数');
    if (op2fa.lock_minutes !== undefined && !isPositiveNum(Number(op2fa.lock_minutes))) throw new ValidationError('operation_2fa.lock_minutes 必须为正数');
    if (op2fa.policy !== undefined && op2fa.policy !== 'mandatory_admin' && op2fa.policy !== 'disabled') {
      throw new ValidationError('operation_2fa.policy 必须为 mandatory_admin 或 disabled');
    }
  }
}

/** 读取现有 finance_rules 原始 JSON（无则 {}） */
async function readRaw(): Promise<Record<string, unknown>> {
  const rows = await db.select({ value: schema.systemConfig.value })
    .from(schema.systemConfig)
    .where(eq(schema.systemConfig.key, CFG_KEY))
    .limit(1);
  if (!rows[0]?.value) return {};
  try {
    const parsed = JSON.parse(rows[0].value);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** 返回给前端的配置（合并默认值，缺省段补齐） */
function toResponse(rules: FinanceRules): Record<string, unknown> {
  return {
    manual_topup: { max_amount: rules.manualTopupMaxAmount },
    large_amount: {
      single_review_max: rules.approval.singleReviewMax,
      dual_review_threshold: rules.approval.dualReviewThreshold,
      super_review_threshold: rules.approval.superReviewThreshold,
      review_exempt: {
        enabled: rules.approval.reviewExemptEnabled,
        max_amount: rules.approval.reviewExemptMaxAmount,
        subjects: rules.approval.reviewExemptSubjects,
      },
      adjustment_decrease_same_tier: rules.approval.adjustmentDecreaseSameTier,
    },
    limits: {
      soft_limit: rules.limits.softLimit,
      hard_limit: rules.limits.hardLimit,
      exceed_action: rules.limits.exceedAction,
      exempt_roles: rules.limits.exemptRoles,
      window_hours: rules.limits.windowHours,
      timezone: rules.limits.timezone,
    },
    operation_2fa: {
      policy: rules.operation2fa.policy,
      token_ttl_seconds: rules.operation2fa.tokenTtlSeconds,
      lock_threshold: rules.operation2fa.lockThreshold,
      lock_minutes: rules.operation2fa.lockMinutes,
      allow_backup_code: rules.operation2fa.allowBackupCode,
      enabled: rules.operation2fa.enabled,
      scopes: rules.operation2fa.scopes,
    },
  };
}

export async function adminFinanceRulesRoutes(app: FastifyInstance) {
  /** GET /api/v1/admin/finance/rules — 读取风控规则配置（B17；requirePerm('sys.config')） */
  app.get('/api/v1/admin/finance/rules', { preHandler: [requirePerm('sys.config')] }, async (_request, reply) => {
    const rules = await getFinanceRules();
    return reply.send({ data: toResponse(rules), message: 'ok' });
  });

  /** PUT /api/v1/admin/finance/rules — 保存风控规则配置（B17；2FA + 二次确认 + 审计） */
  app.put('/api/v1/admin/finance/rules', { preHandler: [requirePerm('sys.config'), requireOperation2fa] }, async (request, reply) => {
    const operator = ((request as any).userContext ?? {}) as { userId?: number; role?: string };
    const body = (request.body ?? {}) as Record<string, unknown>;

    // operation_2fa 段仅 super_admin 可改（B17：2FA 策略属最高安全策略）
    if (body.operation_2fa !== undefined && operator.role !== 'super_admin') {
      throw new ForbiddenError('操作级 2FA 策略仅 super_admin 可配置');
    }

    validateConfig(body);

    // 与既有配置合并（保留未提交段：manual_topup 等）
    const merged = { ...(await readRaw()), ...body };
    await db.insert(schema.systemConfig)
      .values({ key: CFG_KEY, value: JSON.stringify(merged), description: '资金风控规则（finance_rules）', updatedBy: operator.userId ?? null })
      .onConflictDoUpdate({
        target: schema.systemConfig.key,
        set: { value: JSON.stringify(merged), description: '资金风控规则（finance_rules）', updatedBy: operator.userId ?? null, updatedAt: new Date() },
      });

    // 即时生效（60s 缓存失效）
    resetFinanceRulesCache();

    // 审计（前端契约 action='finance.rules.update'；R7 二次确认已在中间件校验；details 含变更字段摘要）
    await db.insert(schema.auditLogs).values({
      userId: operator.userId ?? null,
      action: 'finance.rules.update',
      resource: 'system_config',
      resourceId: CFG_KEY,
      details: { confirmed: true, summary: summarize(merged) } as any,
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });

    const rules = await getFinanceRules();
    return reply.send({ data: toResponse(rules), message: '风控规则已保存' });
  });
}

/** 变更摘要（审计用，不记录密钥类内容——本配置无密钥，仅阈值） */
function summarize(cfg: Record<string, unknown>): Record<string, unknown> {
  const large = (cfg.large_amount ?? {}) as Record<string, unknown>;
  const limits = (cfg.limits ?? {}) as Record<string, unknown>;
  return {
    large_amount: {
      single_review_max: large.single_review_max ?? null,
      dual_review_threshold: large.dual_review_threshold ?? null,
      super_review_threshold: large.super_review_threshold ?? null,
    },
    limits: {
      soft_limit: limits.soft_limit ?? null,
      hard_limit: limits.hard_limit ?? null,
      exceed_action: limits.exceed_action ?? null,
    },
    operation_2fa_policy: (cfg.operation_2fa as Record<string, unknown> | undefined)?.policy ?? null,
  };
}
