/**
 * 操作级 2FA 守卫 preHandler — requireOperation2fa（R7，资金写操作强制）
 *
 * 契约（ARCH v1.1 §4.4 / 双签 §10.2-4）：
 *   - 策略 policy='disabled' → 整体放行（紧急关闭）
 *   - 操作者未启用 2FA → 403 `OPERATION_2FA_NOT_ENABLED`（强制策略，B12/E22）
 *   - 豁免角色命中（limits.exempt_roles）→ 放行 + 审计标记 2fa:'exempt'（B8，默认空）
 *   - 缺 `X-Operation-Token` → 403 `OPERATION_2FA_REQUIRED`
 *   - 令牌过期 → 403 `OPERATION_2FA_EXPIRED`；无效/他人令牌 → 403 `OPERATION_2FA_INVALID`
 *   - 令牌 seq ≤ op2fa:revoked:{userId}（2FA 禁用/重置失效联动）→ 403 `OPERATION_2FA_EXPIRED`（E27）
 *   - 缺 `X-Operation-Confirm: confirmed`（二次确认，E30 AND）→ 403 `OPERATION_CONFIRM_REQUIRED`
 *   - 通过 → 注入 request.opToken
 *   - **错误码全部避开 401**（前端 axios 401 全局拦截器会清 token 跳登录）
 *   - confirmed 最终请求必须依赖 Redis 原子消费；Redis 不可用/异常 → 403 OPERATION_2FA_UNAVAILABLE
 *
 * 挂载方式：`preHandler: [requirePerm(permKey), requireOperation2fa]`
 * （顺序固定：先权限点后 2FA；2FA 不校验权限，只校验身份）。
 *
 * @see docs/ARCH-整改R5-R7-资金风控.md v1.1 §4.4 / §4.8 落点清单
 * @module middleware/require-operation-2fa
 */

import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { AppError } from '../lib/errors.js';
import { verifyOperationToken } from '../services/auth/jwt.js';
import { getOperation2faConfig, getCreditLimits } from '../lib/finance-rules.js';
import { getRedis } from '../lib/redis.js';
import { assertOperationSummary } from '../lib/operation-summary.js';

/**
 * 资金写操作操作级 2FA 守卫（Fastify preHandler）。
 *
 * @param request - Fastify 请求（requirePerm 已注入 request.userContext）
 * @param _reply - Fastify 响应（不使用）
 * @throws {AppError} 403 OPERATION_2FA_NOT_ENABLED / OPERATION_2FA_REQUIRED /
 *                    OPERATION_2FA_EXPIRED / OPERATION_2FA_INVALID / OPERATION_CONFIRM_REQUIRED
 */
export async function requireOperation2fa(request: any, _reply: any): Promise<void> {
  const cfg = await getOperation2faConfig();
  // 紧急回滚开关（ARCH §7.3）：enabled=false 或 policy=disabled → 整体放行
  if (!cfg.enabled || cfg.policy === 'disabled') return;

  const ctx = request.userContext as { userId?: number; role?: string } | undefined;
  if (!ctx?.userId) {
    // requirePerm 已保证登录态；防御性兜底（不暴露内部细节）
    throw new AppError('未登录', 403, 'OPERATION_2FA_REQUIRED');
  }

  // 1. 操作者 2FA 启用状态（user_2fa.totp_enabled 为权威，与 users.two_factor_enabled 同步维护）
  const rows = await db.select({ totpEnabled: schema.user2fa.totpEnabled })
    .from(schema.user2fa)
    .where(eq(schema.user2fa.userId, ctx.userId))
    .limit(1);
  if (rows.length === 0 || rows[0]!.totpEnabled !== true) {
    throw new AppError('执行资金操作需先启用双因素认证（2FA），请前往安全中心启用', 403, 'OPERATION_2FA_NOT_ENABLED');
  }

  // 2. 豁免角色（B8：limits.exempt_roles 命中 → 放行 + 审计标记；默认空 = 不豁免）
  const limits = await getCreditLimits();
  if (limits.exemptRoles.includes(ctx.role ?? '')) {
    request.opToken = { userId: ctx.userId, role: ctx.role, exempt: true };
    return;
  }

  // 3. 操作令牌头缺失
  const rawHeader = request.headers?.['x-operation-token'];
  const token = typeof rawHeader === 'string' ? rawHeader.trim() : '';
  if (!token) {
    throw new AppError('资金操作需操作级 2FA 验证（X-Operation-Token 缺失）', 403, 'OPERATION_2FA_REQUIRED');
  }

  // 4. 校验令牌（区分过期与无效，供前端重开弹窗）
  const result = verifyOperationToken(token);
  if (!result.ok) {
    if (result.reason === 'expired') {
      throw new AppError('操作级 2FA 验证已过期，请重新验证', 403, 'OPERATION_2FA_EXPIRED');
    }
    throw new AppError('操作级 2FA 令牌无效，请重新验证', 403, 'OPERATION_2FA_INVALID');
  }
  if (result.payload.userId !== ctx.userId) {
    // 他人令牌不可跨操作者使用（PRD §3.3.1 规则 3）
    throw new AppError('操作级 2FA 令牌与当前操作者不匹配', 403, 'OPERATION_2FA_INVALID');
  }

  // 5. operation summary 必须同时由令牌和当前请求证明
  const rawSummary = request.headers?.['x-operation-summary'];
  let summaryHash: string;
  try {
    if (typeof rawSummary !== 'string' || !rawSummary.trim()) throw new Error('missing summary');
    summaryHash = assertOperationSummary(JSON.parse(rawSummary));
  } catch {
    throw new AppError('操作摘要缺失或无效', 403, 'OPERATION_2FA_INVALID');
  }
  if (!result.payload.summaryHash || result.payload.summaryHash !== summaryHash) {
    throw new AppError('操作级 2FA 令牌与操作摘要不匹配', 403, 'OPERATION_2FA_INVALID');
  }

  // 6. E27 失效联动：Redis 是安全依赖；confirmed 请求不得 fail-open
  const r = getRedis();
  if (!r) {
    if (String(request.headers?.['x-operation-confirm'] ?? '').trim() === 'confirmed') {
      throw new AppError('操作级 2FA 服务暂时不可用，请稍后重试', 403, 'OPERATION_2FA_UNAVAILABLE');
    }
  } else {
    try {
      const revoked = await r.get(`op2fa:revoked:${ctx.userId}`);
      if (revoked && Number(revoked) >= result.payload.seq) {
        throw new AppError('操作级 2FA 验证已失效（2FA 已重置/禁用），请重新验证', 403, 'OPERATION_2FA_EXPIRED');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (String(request.headers?.['x-operation-confirm'] ?? '').trim() === 'confirmed') {
        throw new AppError('操作级 2FA 服务暂时不可用，请稍后重试', 403, 'OPERATION_2FA_UNAVAILABLE');
      }
    }
  }

  // 7. 二次确认标记（E30 AND：2FA 是身份凭证，确认标记是意图确认）
  const confirmHeader = request.headers?.['x-operation-confirm'];
  if (String(confirmHeader ?? '').trim() !== 'confirmed') {
    throw new AppError('资金操作需二次确认（X-Operation-Confirm: confirmed 缺失）', 403, 'OPERATION_CONFIRM_REQUIRED');
  }

  // 8. confirmed 最终请求才消费令牌；SET NX 原子保证并发双提交仅一个成功
  if (String(confirmHeader ?? '').trim() === 'confirmed') {
    const redis = getRedis();
    if (!redis) throw new AppError('操作级 2FA 服务暂时不可用，请稍后重试', 403, 'OPERATION_2FA_UNAVAILABLE');
    try {
      const key = `op2fa:consumed:${result.payload.jti ?? token}`;
      const consumed = await redis.set(key, '1', 'EX', 300, 'NX');
      if (consumed !== 'OK') throw new AppError('操作级 2FA 令牌已使用，请重新验证', 403, 'OPERATION_2FA_REPLAYED');
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('操作级 2FA 服务暂时不可用，请稍后重试', 403, 'OPERATION_2FA_UNAVAILABLE');
    }
  }

  // 9. 注入操作令牌 payload（业务 handler / 审计可读）
  request.opToken = result.payload;
}
