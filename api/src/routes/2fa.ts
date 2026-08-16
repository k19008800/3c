/**
 * 2FA Routes — TOTP 双因素认证（setup / enable / disable / verify）
 *
 * 流程：
 *   1. POST /2fa/setup   — 登录后获取 secret + otpauthURL + 备用码（暂存态，不立即启用）
 *   2. POST /2fa/enable  — 用 TOTP 验证后落库启用（写 user_2fa + users.two_factor_enabled='1'）
 *   3. login 检测启用 2FA → 返回 { twoFactorRequired, tempToken }（5 分钟，第二步确认用）
 *   4. POST /2fa/verify  — tempToken + TOTP/备用码 → 签发正式 JWT（备用码一次性，用后移除）
 *   5. POST /2fa/disable — TOTP/备用码验证后关闭（totpEnabled=false + two_factor_enabled='0'）
 *
 * 兼容性：未启用 2FA 的用户 login 行为完全不变（直接发 JWT）。
 * 错误码：token 错误 → 400（enable/disable）/ 401（verify）；未启用 2FA 调 verify → 400。
 *
 * NOTE: setup 暂存态用内存 Map（单实例部署可用；PM2 cluster 多实例需换 Redis）。
 *
 * @see kb/3cloud/tech-architecture.md §3.1 user_2fa
 * @module routes
 */

import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import {
  generateTokenPair,
  verifyToken,
  verify2faTempToken,
  createSession,
} from '../services/auth/jwt';
import {
  generateSecret,
  verifyTOTP,
  generateBackupCodes,
  verifyBackupCode,
  otpauthURL,
} from '../services/auth/totp';
import { AppError, UnauthorizedError, ValidationError } from '../lib/errors';

/** setup 暂存态 TTL：10 分钟，超时需要重新 setup */
const PENDING_SETUP_TTL_MS = 10 * 60 * 1000;

interface PendingSetup {
  secret: string;
  backupCodeHashes: string[];
  expiresAt: number;
}

/**
 * setup → enable 之间的暂存态（内存 Map）。
 * NOTE: 单实例部署可用；PM2 cluster 多实例下需换 Redis，见 tech-architecture.md
 */
const pendingSetups = new Map<number, PendingSetup>();

/** JWT 鉴权 preHandler：从 Authorization: Bearer 解析用户，注入 request.userContext */
async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid token');
  request.userContext = payload;
}

/** 取未过期暂存态（顺带惰性清理过期条目） */
function getPendingSetup(userId: number): PendingSetup | undefined {
  const pending = pendingSetups.get(userId);
  if (!pending) return undefined;
  if (pending.expiresAt < Date.now()) {
    pendingSetups.delete(userId);
    return undefined;
  }
  return pending;
}

export async function twoFactorRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/2fa/setup — 生成 secret + otpauthURL + 备用码（暂存，不启用）
  app.post('/api/v1/auth/2fa/setup', { preHandler: [jwtAuth] }, async (request: any, reply) => {
    const { userId, email } = request.userContext;
    const secret = generateSecret();
    const { codes, hashes } = generateBackupCodes();

    pendingSetups.set(userId, {
      secret,
      backupCodeHashes: hashes,
      expiresAt: Date.now() + PENDING_SETUP_TTL_MS,
    });

    return reply.send({
      secret,
      otpauthUrl: otpauthURL(secret, email),
      backupCodes: codes,
    });
  });

  // POST /api/v1/auth/2fa/enable — TOTP 验证通过后启用 2FA
  app.post('/api/v1/auth/2fa/enable', { preHandler: [jwtAuth] }, async (request: any, reply) => {
    const { userId } = request.userContext;
    const body = request.body as Record<string, unknown>;
    const token = String(body.token || '');

    if (!token) {
      throw new ValidationError('TOTP token is required');
    }

    const pending = getPendingSetup(userId);
    if (!pending) {
      throw new AppError('2FA setup session expired, please run setup again', 400, 'SETUP_SESSION_EXPIRED');
    }

    if (!verifyTOTP(pending.secret, token)) {
      throw new AppError('Invalid TOTP token', 400, 'INVALID_TOTP_TOKEN');
    }

    // 已启用 → 拒绝重复开启
    const existing = await db.select({
      id: schema.user2fa.id,
      totpEnabled: schema.user2fa.totpEnabled,
    })
      .from(schema.user2fa)
      .where(eq(schema.user2fa.userId, userId))
      .limit(1);

    if (existing.length > 0 && existing[0]!.totpEnabled) {
      throw new AppError('2FA is already enabled', 409, 'TWO_FACTOR_ALREADY_ENABLED');
    }

    if (existing.length > 0) {
      await db.update(schema.user2fa)
        .set({
          totpSecret: pending.secret,
          totpEnabled: true,
          backupCodes: pending.backupCodeHashes,
          updatedAt: new Date(),
        })
        .where(eq(schema.user2fa.userId, userId));
    } else {
      await db.insert(schema.user2fa).values({
        userId,
        totpSecret: pending.secret,
        totpEnabled: true,
        backupCodes: pending.backupCodeHashes,
      });
    }

    // 同步 users.two_factor_enabled（两处状态保持一致）
    await db.update(schema.users)
      .set({ twoFactorEnabled: '1', updatedAt: new Date() })
      .where(eq(schema.users.id, userId));

    pendingSetups.delete(userId);

    return reply.send({ message: '2FA enabled' });
  });

  // POST /api/v1/auth/2fa/disable — TOTP 或备用码验证通过后关闭 2FA
  app.post('/api/v1/auth/2fa/disable', { preHandler: [jwtAuth] }, async (request: any, reply) => {
    const { userId } = request.userContext;
    const body = request.body as Record<string, unknown>;
    const token = String(body.token || '');
    const backupCode = String(body.backupCode || '');

    if (!token && !backupCode) {
      throw new ValidationError('Either token or backupCode is required');
    }

    const rows = await db.select({
      totpSecret: schema.user2fa.totpSecret,
      totpEnabled: schema.user2fa.totpEnabled,
      backupCodes: schema.user2fa.backupCodes,
    })
      .from(schema.user2fa)
      .where(eq(schema.user2fa.userId, userId))
      .limit(1);

    if (rows.length === 0 || !rows[0]!.totpEnabled) {
      throw new AppError('2FA is not enabled', 400, 'TWO_FACTOR_NOT_ENABLED');
    }

    const row = rows[0]!;
    let valid = false;
    if (token) {
      valid = verifyTOTP(row.totpSecret, token);
    } else {
      for (const hash of row.backupCodes ?? []) {
        if (await verifyBackupCode(hash, backupCode)) {
          valid = true;
          break;
        }
      }
    }
    if (!valid) {
      throw new AppError('Invalid TOTP token or backup code', 400, 'INVALID_2FA_CREDENTIAL');
    }

    await db.update(schema.user2fa)
      .set({ totpEnabled: false, updatedAt: new Date() })
      .where(eq(schema.user2fa.userId, userId));

    await db.update(schema.users)
      .set({ twoFactorEnabled: '0', updatedAt: new Date() })
      .where(eq(schema.users.id, userId));

    return reply.send({ message: '2FA disabled' });
  });

  // POST /api/v1/auth/2fa/verify — 第二步：tempToken + TOTP/备用码 → 正式 JWT
  app.post('/api/v1/auth/2fa/verify', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const tempToken = String(body.tempToken || '');
    const token = String(body.token || '');
    const backupCode = String(body.backupCode || '');

    if (!tempToken) {
      throw new ValidationError('tempToken is required');
    }
    if (!token && !backupCode) {
      throw new ValidationError('Either token or backupCode is required');
    }

    const payload = verify2faTempToken(tempToken);
    if (!payload) {
      throw new UnauthorizedError('Invalid or expired 2FA temp token');
    }

    const users = await db.select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
    })
      .from(schema.users)
      .where(eq(schema.users.id, payload.userId))
      .limit(1);
    if (users.length === 0) {
      throw new UnauthorizedError('User not found');
    }
    const user = users[0]!;

    const rows = await db.select({
      totpSecret: schema.user2fa.totpSecret,
      totpEnabled: schema.user2fa.totpEnabled,
      backupCodes: schema.user2fa.backupCodes,
    })
      .from(schema.user2fa)
      .where(eq(schema.user2fa.userId, payload.userId))
      .limit(1);

    if (rows.length === 0 || !rows[0]!.totpEnabled) {
      throw new AppError('2FA is not enabled for this account', 400, 'TWO_FACTOR_NOT_ENABLED');
    }

    const row = rows[0]!;
    let usedBackupHash: string | null = null;

    if (token) {
      if (!verifyTOTP(row.totpSecret, token)) {
        throw new UnauthorizedError('Invalid 2FA token');
      }
    } else {
      for (const hash of row.backupCodes ?? []) {
        if (await verifyBackupCode(hash, backupCode)) {
          usedBackupHash = hash;
          break;
        }
      }
      if (!usedBackupHash) {
        throw new UnauthorizedError('Invalid backup code');
      }
      // 备用码一次性：从哈希数组中移除已使用的
      const remaining = (row.backupCodes ?? []).filter((h) => h !== usedBackupHash);
      await db.update(schema.user2fa)
        .set({ backupCodes: remaining, updatedAt: new Date() })
        .where(eq(schema.user2fa.userId, payload.userId));
    }

    // 校验通过 → 签发正式 JWT + 建会话（与未启用 2FA 用户的 login 行为对齐）
    const tokens = generateTokenPair({ userId: payload.userId, email: payload.email, role: payload.role });
    await createSession(payload.userId, tokens.accessToken, tokens.refreshToken, request.ip);

    await db.update(schema.users)
      .set({ lastLoginAt: new Date(), lastLoginIp: request.ip || null })
      .where(eq(schema.users.id, payload.userId));

    return reply.send({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      ...tokens,
    });
  });
}
