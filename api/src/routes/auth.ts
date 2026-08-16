/**
 * Auth Routes — 注册 / 登录 / 登出 / 刷新 / 密码重置 / Email 验证
 */

import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import {
  generateTokenPair,
  verifyToken,
  createSession,
  invalidateSession,
  refreshAccessToken,
  generate2faTempToken,
} from '../services/auth/jwt';
import { AppError, UnauthorizedError, ValidationError } from '../lib/errors';
import { initBalance, addBalance, getBalance } from '../services/billing/balance';

// ============================================================
// Helpers
// ============================================================

/** 新用户注册体验金（无充值渠道下让「余额扣减」可演示） */
export const WELCOME_BONUS = '10.00';

function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

// ============================================================
// Routes
// ============================================================

export async function authRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/register
  app.post('/api/v1/auth/register', async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    if (!body.email || !body.password) {
      throw new ValidationError('Email and password are required');
    }

    const email = String(body.email).toLowerCase().trim();
    const password = String(body.password);
    const name = String(body.name || email.split('@')[0]);

    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    // Check existing
    const existing = await db.select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (existing.length > 0) {
      throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
    }

    // Create user
    const passwordHash = hashPassword(password);
    const [user] = await db.insert(schema.users).values({
      email,
      passwordHash,
      name,
      role: 'customer',
    }).returning({ id: schema.users.id, email: schema.users.email, role: schema.users.role, name: schema.users.name });

    if (!user) {
      throw new AppError('Failed to create user', 500, 'REGISTRATION_FAILED');
    }

    // Generate tokens
    const tokens = generateTokenPair({ userId: user.id, email: user.email!, role: user.role! });
    await createSession(user.id, tokens.accessToken, tokens.refreshToken, request.ip);

    // 创建余额账户 + 赠送体验金
    await initBalance(user.id);
    await addBalance(user.id, WELCOME_BONUS, 'adjustment', 'welcome_bonus', String(user.id));

    return reply.status(201).send({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      ...tokens,
    });
  });

  // POST /api/v1/auth/login
  app.post('/api/v1/auth/login', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const email = String(body.email || '').toLowerCase().trim();
    const password = String(body.password || '').trim();

    const users = await db.select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (users.length === 0 || !verifyPassword(password, users[0]!.passwordHash)) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const user = users[0]!;
    if (user.status !== 'active') {
      throw new UnauthorizedError('Account is disabled');
    }

    // 2FA 已启用：先签发 5 分钟临时令牌，第二步 /2fa/verify 校验通过后才发正式 JWT
    // （未启用 2FA 的用户路径完全不变，直接走下方原有逻辑）
    if (user.twoFactorEnabled === '1') {
      const tempToken = generate2faTempToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });
      return reply.send({ twoFactorRequired: true, tempToken });
    }

    const tokens = generateTokenPair({ userId: user.id, email: user.email, role: user.role });
    await createSession(user.id, tokens.accessToken, tokens.refreshToken, request.ip);

    // Update last login
    await db.update(schema.users)
      .set({ lastLoginAt: new Date(), lastLoginIp: request.ip || null })
      .where(eq(schema.users.id, user.id));

    return reply.send({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      ...tokens,
    });
  });

  // POST /api/v1/auth/logout
  app.post('/api/v1/auth/logout', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.split(' ')[1];
    if (token) {
      await invalidateSession(token);
    }
    return reply.send({ message: 'Logged out' });
  });

  // POST /api/v1/auth/refresh
  app.post('/api/v1/auth/refresh', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const refreshToken = String(body.refreshToken || body.refresh_token || '');

    if (!refreshToken) {
      throw new ValidationError('Refresh token is required');
    }

    const tokens = await refreshAccessToken(refreshToken);
    if (!tokens) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    return reply.send(tokens);
  });

  // GET /api/v1/auth/me
  app.get('/api/v1/auth/me', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.split(' ')[1];
    if (!token) throw new UnauthorizedError('Missing token');

    const payload = verifyToken(token);
    if (!payload) throw new UnauthorizedError('Invalid token');

    const users = await db.select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      status: schema.users.status,
    }).from(schema.users).where(eq(schema.users.id, payload.userId)).limit(1);

    if (users.length === 0) throw new UnauthorizedError('User not found');

    return reply.send({ user: users[0] });
  });

  // GET /api/v1/me — 用户端契约：直接返回 user 对象（web-console store/auth.ts fetchMe 期望）
  app.get('/api/v1/me', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.split(' ')[1];
    if (!token) throw new UnauthorizedError('Missing token');

    const payload = verifyToken(token);
    if (!payload) throw new UnauthorizedError('Invalid token');

    const users = await db.select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      status: schema.users.status,
    }).from(schema.users).where(eq(schema.users.id, payload.userId)).limit(1);

    if (users.length === 0) throw new UnauthorizedError('User not found');

    const user = users[0]!;
    const balance = await getBalance(user.id);

    return reply.send({
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.name,
      role: user.role,
      status: user.status,
      balance: Number(balance.availableBalance || 0),
      realNameStatus: null,
    });
  });
}
