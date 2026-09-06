/**
 * 2FA Routes — TOTP 双因素认证（setup / enable / disable / verify）
 *
 * 流程：
 *   1. POST /2fa/setup   — 登录后获取 secret + otpauthURL + 备用码（暂存态，不立即启用）
 *   2. POST /2fa/enable  — 用 TOTP 验证后落库启用（写 user_2fa + users.two_factor_enabled='1'）
 *   3. login 检测启用 2FA → 返回 { twoFactorRequired, tempToken }（5 分钟，第二步确认用）
 *   4. POST /2fa/verify  — tempToken + TOTP/备用码 → 签发正式 JWT（备用码一次性，用后移除）
 *   5. POST /2fa/disable — TOTP/备用码验证后关闭（totpEnabled=false + two_factor_enabled='0'）
 *   6. GET  /2fa/status   — 查询当前用户 2FA 启用状态（安全中心状态徽标）
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
  generateOperationToken,
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
import { getRedis } from '../lib/redis';
import { getOperation2faConfig, type Operation2faConfig } from '../lib/finance-rules';
import { assertOperationSummary } from '../lib/operation-summary';

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

/* ───────── 操作级 2FA 失败计数 / 锁定（R7，双签 B14：与登录共享计数） ─────────
 *
 * 键：op2fa:fail:{userId} —— 登录 2FA 第二步（/2fa/verify）与操作级 2FA
 * （/2fa/operation-verify）共用同一计数与锁定状态：任一链路连续失败达阈值，
 * 两条链路同时锁定（防攻击者分链路分别试探）。Redis 不可用 → fail-open
 * （跳过计数与锁定，仅影响暴力破解防护，不影响正常验证，与 lib/redis 降级一致）。
 */

const OP2FA_FAIL_KEY_PREFIX = 'op2fa:fail:';

/** 读失败计数；Redis 不可用 → null（调用方跳过锁定检查，fail-open） */
async function getOp2faFailCount(userId: number): Promise<number | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const raw = await r.get(`${OP2FA_FAIL_KEY_PREFIX}${userId}`);
    if (raw == null) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return null;
  }
}

/** 失败计数 +1（首次 INCR 时 EXPIRE lockMinutes 分钟；达阈值写审计 operation_2fa.lock） */
async function incrOp2faFail(userId: number, cfg: Operation2faConfig): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    const key = `${OP2FA_FAIL_KEY_PREFIX}${userId}`;
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, cfg.lockMinutes * 60);
    if (n >= cfg.lockThreshold) {
      // 审计对齐 ARCH §4.5：达锁定阈值写 audit_logs（失败静默不影响主链路）
      await db.insert(schema.auditLogs).values({
        userId,
        action: 'operation_2fa.lock',
        resource: 'user_2fa',
        resourceId: String(userId),
        details: { threshold: cfg.lockThreshold, lockMinutes: cfg.lockMinutes } as any,
      }).catch(() => { /* 审计写失败不阻断 */ });
    }
  } catch {
    /* 计数失败静默（fail-open） */
  }
}

/** 操作级 2FA 验证失败审计（P2-4：operation_2fa.fail；仅操作链路写，登录链路失败不混淆） */
async function auditOp2faFail(userId: number, method: 'totp' | 'backup_code', ip: string | null): Promise<void> {
  await db.insert(schema.auditLogs).values({
    userId,
    action: 'operation_2fa.fail',
    resource: 'user_2fa',
    resourceId: String(userId),
    details: { method, scope: 'operation' } as any,
    ipAddress: ip,
  }).catch(() => { /* 审计写失败不阻断 */ });
}

/** 验证成功 → 清零计数（两条链路共享同一键） */
async function clearOp2faFail(userId: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(`${OP2FA_FAIL_KEY_PREFIX}${userId}`);
  } catch {
    /* 静默 */
  }
}

/** 锁定检查：已锁 → 抛 429 OPERATION_2FA_LOCKED（Redis 不可用跳过，fail-open） */
async function assertNotOp2faLocked(userId: number, cfg: Operation2faConfig): Promise<void> {
  const n = await getOp2faFailCount(userId);
  if (n !== null && n >= cfg.lockThreshold) {
    throw new AppError(
      '双因素验证失败次数过多，已锁定，请 15 分钟后再试',
      429,
      'OPERATION_2FA_LOCKED',
      { remainingSeconds: cfg.lockMinutes * 60 },
    );
  }
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

    // E27 失效联动：禁用 2FA → 记录 revoked seq，该用户全部未过期操作令牌立即失效
    // （中间件校验 payload.seq <= op2fa:revoked:{userId} → 403 OPERATION_2FA_EXPIRED；
    //  Redis 不可用 fail-open，跳过）
    const r = getRedis();
    if (r) {
      try {
        const issued = await r.get(`op2fa:issued_seq:${userId}`);
        if (issued) await r.set(`op2fa:revoked:${userId}`, issued);
      } catch {
        /* 失效联动降级静默 */
      }
    }

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

    // 操作级 2FA 与登录 2FA 共享失败计数（双签 B14）：锁定期间登录第二步也拒绝
    const cfg = await getOperation2faConfig();
    await assertNotOp2faLocked(payload.userId, cfg);

    if (token) {
      if (!verifyTOTP(row.totpSecret, token)) {
        await incrOp2faFail(payload.userId, cfg);
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
        await incrOp2faFail(payload.userId, cfg);
        throw new UnauthorizedError('Invalid backup code');
      }
      // 备用码一次性：从哈希数组中移除已使用的
      const remaining = (row.backupCodes ?? []).filter((h) => h !== usedBackupHash);
      await db.update(schema.user2fa)
        .set({ backupCodes: remaining, updatedAt: new Date() })
        .where(eq(schema.user2fa.userId, payload.userId));
    }

    // 验证通过 → 清零共享失败计数（下次验证从 0 开始）
    await clearOp2faFail(payload.userId);

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

  // GET /api/v1/auth/2fa/status — 查询当前用户 2FA 启用状态（安全中心状态徽标用）
  // 状态以 user_2fa.totp_enabled 为权威（与 users.two_factor_enabled 同步维护，见 schema/user-2fa.ts）。
  // 未写入 user_2fa 行的用户视为未启用（enabled=false），不报错。
  app.get('/api/v1/auth/2fa/status', { preHandler: [jwtAuth] }, async (request: any, reply) => {
    const { userId } = request.userContext;
    const rows = await db.select({
      totpEnabled: schema.user2fa.totpEnabled,
    })
      .from(schema.user2fa)
      .where(eq(schema.user2fa.userId, userId))
      .limit(1);

    const enabled = rows.length > 0 && rows[0]!.totpEnabled === true;
    return reply.send({ enabled });
  });

  // POST /api/v1/auth/2fa/operation-verify — 操作级 2FA（R7，资金写操作前置验证）
  //
  // 契约（ARCH §4.2 / 双签 §10.2-4）：
  //   鉴权：Authorization: Bearer <登录 JWT>（jwtAuth；登录态失效 401 允许——本就该登出）
  //   请求体：{ "token"?: string, "backup_code"?: string }  // 至少一个；都传时 token 优先
  //   成功 200：{ "data": { "op_token": "<jwt>", "expires_in": 300 }, "message": "验证通过" }
  //   未启用 2FA → 403 OPERATION_2FA_NOT_ENABLED（强制策略，双签 B12/Q3）
  //   锁定 → 429 OPERATION_2FA_LOCKED（连续 lockThreshold 次失败锁 lockMinutes 分钟，
  //          与登录 2FA 共享计数，双签 B14）
  //   验证失败 → 400 INVALID_OPERATION_2FA（TOTP 或备用码错误，每次失败计数 +1）
  //   参数缺失/非法 → 400 VALIDATION_ERROR
  //   成功 → DEL 失败计数 + 签发 purpose:'operation' 令牌（5 分钟，窗口内可复用，双签 B11/Q4）
  //   错误码全部避开 401（登录 JWT 校验放行路径除外），防前端 axios 401 拦截器误登出。
  app.post('/api/v1/auth/2fa/operation-verify', { preHandler: [jwtAuth] }, async (request: any, reply) => {
    const { userId, email, role } = request.userContext as { userId: number; email: string; role: string };
    const body = (request.body ?? {}) as { token?: string; backup_code?: string };
    const token = String(body.token ?? '').trim();
    const backupCode = String(body.backup_code ?? '').trim();
    const operationSummary = (body as Record<string, unknown>).operation_summary;
    let summaryHash: string;
    try {
      summaryHash = assertOperationSummary(operationSummary);
    } catch {
      throw new ValidationError('operation_summary is required and cannot be empty');
    }

    if (!token && !backupCode) {
      throw new ValidationError('token 与 backup_code 至少提供一个');
    }

    const cfg = await getOperation2faConfig();

    // 1. 操作者 2FA 启用状态（user_2fa.totp_enabled 权威）
    const rows = await db.select({
      totpSecret: schema.user2fa.totpSecret,
      totpEnabled: schema.user2fa.totpEnabled,
      backupCodes: schema.user2fa.backupCodes,
    })
      .from(schema.user2fa)
      .where(eq(schema.user2fa.userId, userId))
      .limit(1);
    if (rows.length === 0 || rows[0]!.totpEnabled !== true) {
      throw new AppError('执行资金操作需先启用双因素认证（2FA），请前往安全中心启用', 403, 'OPERATION_2FA_NOT_ENABLED');
    }
    const row = rows[0]!;

    // 2. 锁定检查（与登录共享计数；Redis 不可用 fail-open）
    await assertNotOp2faLocked(userId, cfg);

    // 3. 校验（token 优先；备用码一次性）
    let usedBackupHash: string | null = null;
    if (token) {
      if (!verifyTOTP(row.totpSecret, token)) {
        await incrOp2faFail(userId, cfg);
        await auditOp2faFail(userId, 'totp', request.ip ?? null);
        throw new AppError('操作验证码错误', 400, 'INVALID_OPERATION_2FA');
      }
    } else {
      if (!cfg.allowBackupCode) {
        throw new ValidationError('当前策略不允许使用备用码，请使用认证器验证');
      }
      for (const hash of row.backupCodes ?? []) {
        if (await verifyBackupCode(hash, backupCode)) {
          usedBackupHash = hash;
          break;
        }
      }
      if (!usedBackupHash) {
        await incrOp2faFail(userId, cfg);
        await auditOp2faFail(userId, 'backup_code', request.ip ?? null);
        throw new AppError('备用码错误或已用尽', 400, 'INVALID_OPERATION_2FA');
      }
      // 备用码一次性：从哈希数组移除（与登录链路同语义）
      const remaining = (row.backupCodes ?? []).filter((h) => h !== usedBackupHash);
      await db.update(schema.user2fa)
        .set({ backupCodes: remaining, updatedAt: new Date() })
        .where(eq(schema.user2fa.userId, userId));
    }

    // 4. 成功：清零计数 + 递增签发序号 + 签发操作令牌（E27 失效联动：disable 时 SET
    //    op2fa:revoked:{userId} = 当前 seq，旧令牌 seq ≤ revoked → 中间件 403 EXPIRED）
    await clearOp2faFail(userId);
    const issuedSeqKey = `op2fa:issued_seq:${userId}`;
    const r = getRedis();
    if (!r) throw new AppError('操作级 2FA 服务暂时不可用，请稍后重试', 403, 'OPERATION_2FA_UNAVAILABLE');
    let seq: number;
    try {
      seq = Number(await r.incr(issuedSeqKey));
      if (!Number.isSafeInteger(seq) || seq < 1) throw new Error('invalid sequence');
    } catch {
      throw new AppError('操作级 2FA 服务暂时不可用，请稍后重试', 403, 'OPERATION_2FA_UNAVAILABLE');
    }
    const opToken = generateOperationToken({ userId, email, role, seq, summaryHash }, undefined, cfg.tokenTtlSeconds);

    // P2-4 审计：操作令牌签发留痕（method：totp / backup_code；seq：令牌序号）
    await db.insert(schema.auditLogs).values({
      userId,
      action: 'operation_2fa.issue',
      resource: 'user_2fa',
      resourceId: String(userId),
      details: { method: usedBackupHash ? 'backup_code' : 'totp', scope: 'operation', seq } as any,
      ipAddress: request.ip ?? null,
    }).catch(() => { /* 审计写失败不阻断 */ });

    return reply.send({
      data: { op_token: opToken, expires_in: cfg.tokenTtlSeconds },
      message: '验证通过',
    });
  });
}
