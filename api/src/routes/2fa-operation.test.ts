/**
 * 操作级 2FA 端点测试 — POST /auth/2fa/operation-verify（R7，真实 PG + Redis）
 *
 * 覆盖 ARCH §6.3 用例 18/19/20 + 双签 B13/B14：
 *   - TOTP → 200 + op_token（expires_in=300）；备用码 → 200 且一次性移除
 *   - 未启用 2FA → 403 OPERATION_2FA_NOT_ENABLED（§10.2-4 错误码）
 *   - 连续 5 次失败 → 429 OPERATION_2FA_LOCKED（Redis TTL ≈ 15 分钟）；锁定期间正确验证码也 429
 *   - 成功验证重置计数；错误码避开 401
 *   - 与登录 2FA（/2fa/verify）共享失败计数（双签 B14）：操作锁定 → 登录第二步同样 429
 *
 * @see docs/ARCH-整改R5-R7-资金风控.md §4.2 / §4.5 / §6.3
 * @module routes/2fa-operation.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { db, schema } from '../db';
import { eq, inArray } from 'drizzle-orm';
import { generateAccessToken, generate2faTempToken } from '../services/auth/jwt';
import { generateSecret, generateTOTP, generateBackupCodes } from '../services/auth/totp';
import { getRedis } from '../lib/redis';
import { twoFactorRoutes } from './2fa';
import { assertOperationSummary } from '../lib/operation-summary';

process.env.JWT_SECRET = 'test-2fa-operation-secret';

const ts = Date.now();

/** ADR-0008：operation-verify 必须携带 operation_summary 并绑定进令牌 summaryHash */
const OP_SUMMARY = [{ type: 'manual-topup', amount: 50000, target: 'acct-1' }];
const OP_SUMMARY_HASH = assertOperationSummary(OP_SUMMARY);

let userId = 0;
let no2faUserId = 0;
let secret = '';
let backupCodes: string[] = [];
let backupCodeHashes: string[] = [];
let token = '';
let no2faToken = '';

let app: FastifyInstance;

function buildTestApp(): FastifyInstance {
  const instance = Fastify({ logger: false });
  // 对齐生产 app.ts setErrorHandler 契约：{ statusCode, code: err.code, message }
  instance.setErrorHandler((err: any, _request, reply) => {
    const status = Number(err?.statusCode) || 500;
    reply.code(status).send({ statusCode: status, code: err?.code ?? status, message: err?.message ?? 'Internal Server Error' });
  });
  twoFactorRoutes(instance);
  return instance;
}

function auth(t: string) {
  return { authorization: `Bearer ${t}` };
}

const FAIL_KEY = (uid: number) => `op2fa:fail:${uid}`;

beforeAll(async () => {
  const [u] = await db.insert(schema.users).values({
    email: `opv-${ts}@test.com`, passwordHash: 'x', name: 'OpVerify', role: 'admin', status: 'active',
  }).returning({ id: schema.users.id });
  userId = u!.id;

  const [n] = await db.insert(schema.users).values({
    email: `opv-no2fa-${ts}@test.com`, passwordHash: 'x', name: 'OpVerifyNo2fa', role: 'admin', status: 'active',
  }).returning({ id: schema.users.id });
  no2faUserId = n!.id;

  secret = generateSecret();
  const bc = generateBackupCodes(3);
  backupCodes = bc.codes;
  backupCodeHashes = bc.hashes;
  await db.insert(schema.user2fa).values({
    userId, totpSecret: secret, totpEnabled: true, backupCodes: backupCodeHashes,
  });

  token = generateAccessToken({ userId, email: `opv-${ts}@test.com`, role: 'admin' });
  no2faToken = generateAccessToken({ userId: no2faUserId, email: `opv-no2fa-${ts}@test.com`, role: 'admin' });

  app = buildTestApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  try {
    await db.delete(schema.user2fa).where(inArray(schema.user2fa.userId, [userId, no2faUserId]));
    await db.delete(schema.auditLogs).where(eq(schema.auditLogs.userId, userId));
    await db.delete(schema.users).where(inArray(schema.users.id, [userId, no2faUserId]));
    const r = getRedis();
    if (r) {
      await r.del(FAIL_KEY(userId));
      await r.del(FAIL_KEY(no2faUserId));
    }
  } catch (err) {
    console.error('[2fa-operation.test] cleanup failed:', err);
  }
});

describe('POST /auth/2fa/operation-verify（R7）', () => {
  it('缺 operation_summary → 400 VALIDATION_ERROR（ADR-0008 摘要强制）', async () => {
    const code = generateTOTP(secret);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/2fa/operation-verify', headers: auth(token),
      payload: { token: code },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('operation_summary 为空数组 → 400 VALIDATION_ERROR（空摘要无法证明意图）', async () => {
    const code = generateTOTP(secret);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/2fa/operation-verify', headers: auth(token),
      payload: { token: code, operation_summary: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('用例18 TOTP 正确 → 200 + data.op_token + expires_in=300 + message；令牌绑定 summaryHash', async () => {
    const code = generateTOTP(secret);
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/2fa/operation-verify', headers: auth(token),
      payload: { token: code, operation_summary: OP_SUMMARY },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('验证通过');
    expect(res.json().data.expires_in).toBe(300);
    expect(typeof res.json().data.op_token).toBe('string');
    expect(res.json().data.op_token.split('.').length).toBe(3);
    // ADR-0008：令牌 payload 必须携带与摘要一致的 summaryHash
    const decoded = jwt.decode(res.json().data.op_token) as Record<string, unknown> | null;
    expect(decoded?.summaryHash).toBe(OP_SUMMARY_HASH);
  });

  it('用例18 备用码正确 → 200 且从 backup_codes 移除（一次性，B13）', async () => {
    const used = backupCodes[0]!;
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/2fa/operation-verify', headers: auth(token),
      payload: { backup_code: used, operation_summary: OP_SUMMARY },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.op_token).toBeTruthy();

    const [row] = await db.select({ backupCodes: schema.user2fa.backupCodes }).from(schema.user2fa)
      .where(eq(schema.user2fa.userId, userId)).limit(1);
    expect(row!.backupCodes.length).toBe(backupCodeHashes.length - 1);
    // 同一备用码二次使用 → 400 INVALID_OPERATION_2FA（已移除）
    const replay = await app.inject({
      method: 'POST', url: '/api/v1/auth/2fa/operation-verify', headers: auth(token),
      payload: { backup_code: used, operation_summary: OP_SUMMARY },
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().code).toBe('INVALID_OPERATION_2FA');
  });

  it('参数缺失（token 与 backup_code 均无）→ 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/2fa/operation-verify', headers: auth(token),
      payload: { operation_summary: OP_SUMMARY },
    });
    expect(res.statusCode).toBe(400);
  });

  it('未启用 2FA → 403 OPERATION_2FA_NOT_ENABLED（强制策略 B12/Q3；错误码非 401）', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/2fa/operation-verify', headers: auth(no2faToken),
      payload: { token: '000000', operation_summary: OP_SUMMARY },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('OPERATION_2FA_NOT_ENABLED');
  });

  it('登录 JWT 缺失 → 401（登录态失效本就该登出，§4.2 允许）', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/2fa/operation-verify',
      payload: { token: generateTOTP(secret), operation_summary: OP_SUMMARY },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('失败计数 / 锁定（双签 B14：连续 5 次锁 15 分钟，与登录共享计数）', () => {
  it('用例19 连续 5 次错误 → 第 5 次达阈值锁定（400）；第 6 次起 429 OPERATION_2FA_LOCKED + Redis TTL ≈ 900s', async () => {
    const r = getRedis()!;
    await r.del(FAIL_KEY(userId));
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/2fa/operation-verify', headers: auth(token),
        payload: { token: '000000', operation_summary: OP_SUMMARY },
      });
      // ARCH §4.2 步骤 5：失败 → INCR（达 5 锁 15 分钟）→ 400 INVALID_OPERATION_2FA；
      // 第 5 次失败本身返回 400（计数达阈值并锁定），第 6 次起锁定 429
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('INVALID_OPERATION_2FA');
    }

    const ttl = await r.ttl(FAIL_KEY(userId));
    expect(ttl).toBeGreaterThan(800);   // 15 分钟（900s），TTL 断言（> 800 允许时钟偏移）
    expect(ttl).toBeLessThanOrEqual(900);

    // 用例19 锁定期间即使正确验证码也 429（第 6 次起）
    const duringLock = await app.inject({
      method: 'POST', url: '/api/v1/auth/2fa/operation-verify', headers: auth(token),
      payload: { token: generateTOTP(secret), operation_summary: OP_SUMMARY },
    });
    expect(duringLock.statusCode).toBe(429);
    expect(duringLock.json().code).toBe('OPERATION_2FA_LOCKED');

    // 清理锁定（供后续用例）
    await r.del(FAIL_KEY(userId));
  });

  it('用例19 成功验证重置计数（DEL）；再次失败从 0 起算', async () => {
    const r = getRedis()!;
    await r.del(FAIL_KEY(userId));
    // 2 次失败 → 计数 2
    await app.inject({ method: 'POST', url: '/api/v1/auth/2fa/operation-verify', headers: auth(token), payload: { token: '000000', operation_summary: OP_SUMMARY } });
    await app.inject({ method: 'POST', url: '/api/v1/auth/2fa/operation-verify', headers: auth(token), payload: { token: '000000', operation_summary: OP_SUMMARY } });
    expect(Number(await r.get(FAIL_KEY(userId)))).toBe(2);
    // 成功 → 清零
    const ok = await app.inject({ method: 'POST', url: '/api/v1/auth/2fa/operation-verify', headers: auth(token), payload: { token: generateTOTP(secret), operation_summary: OP_SUMMARY } });
    expect(ok.statusCode).toBe(200);
    expect(await r.get(FAIL_KEY(userId))).toBeNull();
  });

  it('与登录 2FA 共享计数：操作锁定后 /2fa/verify 同样 429（B14）', async () => {
    const r = getRedis()!;
    await r.del(FAIL_KEY(userId));
    // 先操作链路打满 5 次 → 锁定
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: 'POST', url: '/api/v1/auth/2fa/operation-verify', headers: auth(token), payload: { token: '000000', operation_summary: OP_SUMMARY } });
    }
    // 登录链路第二步（tempToken + 正确 TOTP）→ 共享锁定 429
    const tempToken = generate2faTempToken({ userId, email: `opv-${ts}@test.com`, role: 'admin' });
    const loginVerify = await app.inject({
      method: 'POST', url: '/api/v1/auth/2fa/verify',
      payload: { tempToken, token: generateTOTP(secret) },
    });
    expect(loginVerify.statusCode).toBe(429);
    expect(loginVerify.json().code).toBe('OPERATION_2FA_LOCKED');

    // 清理
    await r.del(FAIL_KEY(userId));
  });
});
