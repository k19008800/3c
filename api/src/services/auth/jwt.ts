/**
 * JWT 令牌服务 — 生成、验证、刷新
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db, schema } from '../../db';
import { eq } from 'drizzle-orm';

const DEFAULT_SECRET = 'dev-secret-change-in-production';

export interface TokenPayload {
  userId: number;
  email: string;
  role: string;
  /** 令牌唯一 ID：同秒内同 payload 的重复签发（如注册后立即登录）会产生相同 JWT，
   *  而 user_sessions.token 有唯一约束 → 500 重复键。jti 保证每次签发唯一。 */
  jti?: string;
  /** 新增：模拟发起者信息（管理员以用户身份登录）。普通登录令牌无此字段；
   *  带此字段 = 模拟令牌，用于「以用户身份登录」功能（见 kb/3cloud/admin-impersonate.md）。
   *  敏感资金/权限写端点据此拒绝（403 IMPERSONATION_BLOCKED）。 */
  impersonateBy?: {
    adminId: number;
    adminEmail: string;
  };
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** 2FA 第二步确认用的临时令牌 payload（login 签发，5 分钟有效） */
export interface TwoFactorTempPayload {
  purpose: '2fa';
  userId: number;
  email: string;
  role: string;
}

/**
 * 操作级 2FA 令牌 payload（R7，ARCH v1.1 §4.3）：purpose 恒为 'operation'。
 *
 * 与登录 2FA 临时令牌（purpose='2fa'）通过 purpose 字段隔离，交叉使用即无效；
 * 令牌绑定操作者、完整 operation summary，并在最终 confirmed 请求时一次性消费。
 * `seq` = 签发序号（Redis `op2fa:issued_seq:{userId}` 递增；E27 失效联动：2FA 禁用后
 * 旧令牌 seq ≤ revoked 版本 → 中间件 403 OPERATION_2FA_EXPIRED）。
 */
export interface OperationTokenPayload {
  purpose: 'operation';
  userId: number;
  email: string;
  role: string;
  seq: number;
  jti?: string;
  /** SHA-256 of the canonical operation summary bound at verification time. */
  summaryHash?: string;
}

/**
 * Generate an access token (short-lived, 15 min)
 *
 * 带 jti（随机 UUID）保证同秒内同 payload 多次签发 token 唯一：
 * user_sessions.token 唯一约束下，注册后立即登录（同秒）会因 iat 秒级精度
 * 产生完全相同 JWT → 重复键 500。jti 消除该竞态。
 */
export function generateAccessToken(payload: TokenPayload, secret?: string): string {
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, secret || process.env.JWT_SECRET || DEFAULT_SECRET, { expiresIn: '15m' });
}

/**
 * Generate a refresh token (long-lived, 7 days)
 */
export function generateRefreshToken(payload: TokenPayload, secret?: string): string {
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, secret || process.env.JWT_SECRET || DEFAULT_SECRET, { expiresIn: '7d' });
}

/**
 * Generate both access + refresh tokens
 */
export function generateTokenPair(payload: TokenPayload, secret?: string): TokenPair {
  return {
    accessToken: generateAccessToken(payload, secret),
    refreshToken: generateRefreshToken(payload, secret),
    expiresIn: 900, // 15 minutes
  };
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string, secret?: string): TokenPayload | null {
  try {
    return jwt.verify(token, secret || process.env.JWT_SECRET || DEFAULT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * 签发 2FA 临时令牌（无状态 JWT，5 分钟过期）。
 *
 * login 检测到用户启用 2FA 时签发，客户端需在 /2fa/verify 中
 * 用它 + TOTP/备用码换取正式 JWT。payload 带 purpose: '2fa' 防止与普通令牌混淆。
 */
export function generate2faTempToken(payload: Omit<TwoFactorTempPayload, 'purpose'>, secret?: string): string {
  return jwt.sign(
    { ...payload, purpose: '2fa' },
    secret || process.env.JWT_SECRET || DEFAULT_SECRET,
    { expiresIn: '5m' },
  );
}

/**
 * 校验 2FA 临时令牌；purpose 必须为 '2fa'，否则视为无效。
 *
 * @returns 解析后的 payload，无效/过期返回 null
 */
export function verify2faTempToken(token: string, secret?: string): TwoFactorTempPayload | null {
  try {
    const payload = jwt.verify(token, secret || process.env.JWT_SECRET || DEFAULT_SECRET) as TwoFactorTempPayload;
    return payload.purpose === '2fa' ? payload : null;
  } catch {
    return null;
  }
}

/**
 * 签发操作级 2FA 令牌（无状态 JWT，token_ttl_seconds 过期，仿 generate2faTempToken）。
 *
 * @param payload - userId / email / role / seq（purpose 自动置 'operation'；seq 由
 *                  operation-verify 端点从 Redis op2fa:issued_seq 递增取号，E27 失效联动）
 * @param secret - 可选覆盖 JWT_SECRET（测试用）
 * @param expiresInSeconds - 有效期（秒，默认 300 = token_ttl_seconds）
 * @returns 操作令牌字符串
 */
export function generateOperationToken(
  payload: Omit<OperationTokenPayload, 'purpose'>,
  secret?: string,
  expiresInSeconds: number = 300,
): string {
  return jwt.sign(
    { ...payload, jti: payload.jti ?? crypto.randomUUID(), purpose: 'operation' },
    secret || process.env.JWT_SECRET || DEFAULT_SECRET,
    { expiresIn: `${expiresInSeconds}s` },
  );
}

/**
 * 校验操作级 2FA 令牌；purpose 必须为 'operation'。
 *
 * @param token - 待校验令牌
 * @param secret - 可选覆盖 JWT_SECRET（测试用）
 * @returns { ok: true, payload } 有效；
 *          { ok: false, reason: 'expired' } 已过期（前端据此重开 2FA 弹窗）；
 *          { ok: false, reason: 'invalid' } 无效（签名错误/伪造 purpose/损坏）
 */
export function verifyOperationToken(
  token: string,
  secret?: string,
): { ok: true; payload: OperationTokenPayload } | { ok: false; reason: 'expired' | 'invalid' } {
  try {
    const payload = jwt.verify(token, secret || process.env.JWT_SECRET || DEFAULT_SECRET) as OperationTokenPayload;
    if (payload.purpose !== 'operation') return { ok: false, reason: 'invalid' };
    return { ok: true, payload };
  } catch (err) {
    // jsonwebtoken：TokenExpiredError → 过期；其余（签名/格式/算法）→ 无效
    const isExpired = err instanceof jwt.TokenExpiredError;
    return { ok: false, reason: isExpired ? 'expired' : 'invalid' };
  }
}

/**
 * Store session in database
 */
export async function createSession(userId: number, accessToken: string, refreshToken: string, ip?: string, userAgent?: string): Promise<void> {
  await db.insert(schema.userSessions).values({
    userId,
    token: accessToken,
    refreshToken,
    ipAddress: ip || null,
    userAgent: userAgent || null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
}

/**
 * Invalidate a session (logout)
 */
export async function invalidateSession(accessToken: string): Promise<void> {
  await db.delete(schema.userSessions).where(eq(schema.userSessions.token, accessToken));
}

/**
 * Refresh access token using a valid refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenPair | null> {
  const payload = verifyToken(refreshToken);
  if (!payload) return null;

  // Check if refresh token exists in DB
  const sessions = await db
    .select()
    .from(schema.userSessions)
    .where(eq(schema.userSessions.refreshToken, refreshToken))
    .limit(1);

  if (sessions.length === 0) return null;

  // Generate new pair
  const pair = generateTokenPair({ userId: payload.userId, email: payload.email, role: payload.role });

  // Update session
  await db.update(schema.userSessions)
    .set({ token: pair.accessToken, refreshToken: pair.refreshToken })
    .where(eq(schema.userSessions.refreshToken, refreshToken));

  return pair;
}
