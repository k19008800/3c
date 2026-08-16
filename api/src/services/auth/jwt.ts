/**
 * JWT 令牌服务 — 生成、验证、刷新
 */

import jwt from 'jsonwebtoken';
import { db, schema } from '../../db';
import { eq } from 'drizzle-orm';

const DEFAULT_SECRET = 'dev-secret-change-in-production';

export interface TokenPayload {
  userId: number;
  email: string;
  role: string;
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
 * Generate an access token (short-lived, 15 min)
 */
export function generateAccessToken(payload: TokenPayload, secret?: string): string {
  return jwt.sign(payload, secret || process.env.JWT_SECRET || DEFAULT_SECRET, { expiresIn: '15m' });
}

/**
 * Generate a refresh token (long-lived, 7 days)
 */
export function generateRefreshToken(payload: TokenPayload, secret?: string): string {
  return jwt.sign(payload, secret || process.env.JWT_SECRET || DEFAULT_SECRET, { expiresIn: '7d' });
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
