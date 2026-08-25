/**
 * 测试辅助 — R5–R7 集成测试共用（启用操作员 2FA / 签发操作令牌头 / 限额计数清理）
 *
 * R7 强制 2FA（双签 B12/Q3）后，资金写端点要求操作者已启用 2FA 且携带
 * X-Operation-Token。测试直接落 user_2fa 行 + 用 generateOperationToken 签发
 * 令牌（绕过 /2fa/operation-verify 端点本身，后者在 2fa-operation.test.ts 单独覆盖）。
 *
 * @module routes/test-helpers
 */

import { db, schema } from '../db';
import { inArray } from 'drizzle-orm';
import { generateOperationToken } from '../services/auth/jwt';
import { generateSecret } from '../services/auth/totp';
import { getRedis } from '../lib/redis';

/**
 * 为测试操作员启用 2FA（user_2fa 行 totp_enabled=true；幂等 upsert）。
 *
 * @param userId - 操作员用户 ID
 */
export async function enableTest2fa(userId: number): Promise<void> {
  await db.insert(schema.user2fa)
    .values({ userId, totpSecret: generateSecret(), totpEnabled: true, backupCodes: [] })
    .onConflictDoUpdate({ target: schema.user2fa.userId, set: { totpEnabled: true, updatedAt: new Date() } });
}

/**
 * 组装资金写操作请求头（登录 JWT + 操作令牌 + 二次确认标记）。
 *
 * R7（ARCH v1.1 §4.1/§4.4）：二次确认 = `X-Operation-Confirm: confirmed`（E30 AND，
 * 与操作令牌共同构成资金操作放行的两个必要条件）。
 *
 * @param token - 登录 JWT（generateAccessToken 签发）
 * @param userId - 操作员用户 ID（与 token payload 一致）
 * @param email - 操作员邮箱
 * @param role - 操作员角色（admin / finance / super_admin）
 * @returns { authorization, 'x-operation-token', 'x-operation-confirm' }
 */
export function op2faHeaders(token: string, userId: number, email: string, role: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    'x-operation-token': generateOperationToken({ userId, email, role, seq: 1 }),
    'x-operation-confirm': 'confirmed',
  };
}

/**
 * 清理测试遗留的限额事件行（credit_limit_events）与 Redis lim:* 键、
 * op2fa:* 键（fail/revoked/issued_seq），避免跨测试文件污染。
 *
 * @param userIds - 涉及的用户 ID 集合（操作人 + 被入账用户）
 */
export async function clearCreditCounters(userIds: number[]): Promise<void> {
  const ids = userIds.filter((x) => x > 0);
  if (ids.length === 0) return;
  try {
    await db.delete(schema.creditLimitEvents).where(inArray(schema.creditLimitEvents.userId, ids));
  } catch (err) {
    console.error('[test-helpers] clear credit events failed:', err);
  }
  const r = getRedis();
  if (r) {
    try {
      const keys = await r.keys('lim:*');
      const failKeys = await r.keys('op2fa:fail:*');
      const revokedKeys = await r.keys('op2fa:revoked:*');
      const issuedKeys = await r.keys('op2fa:issued_seq:*');
      const toDel = [...keys, ...failKeys, ...revokedKeys, ...issuedKeys].filter((k) => {
        // 仅清理本测试用户相关的键（lim:op:{id}:* / lim:user:{id}:* / op2fa:*:{id}）
        const m = k.match(/lim:(?:op|user):(\d+)/);
        const mf = k.match(/op2fa:(?:fail|revoked|issued_seq):(\d+)/);
        const uid = m ? Number(m[1]) : mf ? Number(mf[1]) : NaN;
        return Number.isFinite(uid) && ids.includes(uid);
      });
      if (toDel.length > 0) await r.del(...toDel);
    } catch {
      /* 清理失败静默 */
    }
  }
}
