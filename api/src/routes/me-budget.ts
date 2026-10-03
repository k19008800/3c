/**
 * 用户消费预算设置端点 — /api/v1/me/budget（§20.1 用户预算熔断后端）
 *
 *   GET /api/v1/me/budget — 当前预算设置 + 今日/本月已用量（分）
 *   PUT /api/v1/me/budget — 更新日/月限额（分，null=不限）、告警阈值(1-100)、硬阻断开关
 *
 * 权限：任意登录用户（jwtAuth）。未设置记录的用户 GET 返回默认值（不限额）。
 * 网关 pre-consume 前的实际熔断判定见 services/billing/budget.ts。
 *
 * 金额单位：分（整数）。前端展示由分 → 元自行换算。
 *
 * @module routes
 * @see db/schema/user-budget-settings.ts
 * @see services/billing/budget.ts
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt.js';
import { UnauthorizedError, ValidationError } from '../lib/errors.js';
import { getBudgetUsageCents } from '../services/billing/budget.js';

/* ───────── 鉴权（对齐 me-gap.ts 模式） ───────── */

async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
}

function userId(request: any): number {
  return (request as any).userContext.userId;
}

/** 默认设置（用户从未设置预算时 GET 返回）：不限额、告警 80%、硬阻断开 */
const DEFAULT_SETTINGS = {
  dailyLimitCents: null as number | null,
  monthlyLimitCents: null as number | null,
  alertThreshold: 80,
  hardBlock: true,
};

/** 解析限额字段（分）：null/'' → 不限；否则必须是 >= 0 的有限数 */
function parseLimitCents(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new ValidationError(`${field} 必须是 >= 0 的整数（分），或 null 表示不限`);
  }
  return Math.round(n);
}

export async function meBudgetRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/me/budget — 当前预算设置 + 今日/本月已用量
   *
   * 未设置记录 → 返回默认设置（不限额）。用量口径同 /me/stats（今日=CURRENT_DATE）。
   */
  app.get('/api/v1/me/budget', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const [row, usage] = await Promise.all([
      db.select()
        .from(schema.userBudgetSettings)
        .where(eq(schema.userBudgetSettings.userId, uid))
        .limit(1),
      getBudgetUsageCents(uid),
    ]);
    const s = row[0];
    return reply.send({
      data: {
        dailyLimitCents: s?.dailyLimitCents ?? DEFAULT_SETTINGS.dailyLimitCents,
        monthlyLimitCents: s?.monthlyLimitCents ?? DEFAULT_SETTINGS.monthlyLimitCents,
        alertThreshold: s?.alertThreshold ?? DEFAULT_SETTINGS.alertThreshold,
        hardBlock: s?.hardBlock ?? DEFAULT_SETTINGS.hardBlock,
        usage: {
          todayCents: usage.todayCents,
          monthCents: usage.monthCents,
        },
      },
    });
  });

  /**
   * PUT /api/v1/me/budget — 更新预算设置（部分更新，仅传需要改的字段）
   *
   * body（全部可选）：
   *   dailyLimitCents   number|null   日限额（分），null=不限
   *   monthlyLimitCents number|null   月限额（分），null=不限
   *   alertThreshold    number(1-100) 告警阈值百分比，默认 80
   *   hardBlock         boolean       超限是否硬阻断（false=仅告警）
   */
  app.put('/api/v1/me/budget', { preHandler: [jwtAuth] }, async (request, reply) => {
    const uid = userId(request);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if ('dailyLimitCents' in body) {
      patch.dailyLimitCents = parseLimitCents(body.dailyLimitCents, 'dailyLimitCents');
    }
    if ('monthlyLimitCents' in body) {
      patch.monthlyLimitCents = parseLimitCents(body.monthlyLimitCents, 'monthlyLimitCents');
    }
    if ('alertThreshold' in body) {
      const n = Number(body.alertThreshold);
      if (!Number.isInteger(n) || n < 1 || n > 100) {
        throw new ValidationError('alertThreshold 必须是 1-100 的整数（百分比）');
      }
      patch.alertThreshold = n;
    }
    if ('hardBlock' in body) {
      if (typeof body.hardBlock !== 'boolean') {
        throw new ValidationError('hardBlock 必须是布尔值');
      }
      patch.hardBlock = body.hardBlock;
    }
    if (Object.keys(patch).length === 0) {
      throw new ValidationError('未提供任何可更新字段');
    }
    patch.updatedAt = new Date();

    const rows = await db.insert(schema.userBudgetSettings)
      .values({ userId: uid, ...patch })
      .onConflictDoUpdate({
        target: schema.userBudgetSettings.userId,
        set: patch,
      })
      .returning();
    const s = rows[0]!;

    return reply.send({
      data: {
        dailyLimitCents: s.dailyLimitCents,
        monthlyLimitCents: s.monthlyLimitCents,
        alertThreshold: s.alertThreshold,
        hardBlock: s.hardBlock,
      },
    });
  });
}
