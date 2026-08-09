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
} from '../services/auth/jwt';
import { AppError, UnauthorizedError, ValidationError } from '../lib/errors';

// ============================================================
// Helpers
// ============================================================

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

    return reply.status(201).send({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      ...tokens,
    });
  });

  // POST /api/v1/auth/login
  app.post('/api/v1/auth/login', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const raw = JSON.stringify(body);
    console.log(`[LOGIN] body=${raw} email=${body.email} pwd_len=${String(body.password||'').length}`);
    const email = String(body.email || '').toLowerCase().trim();
    const password = String(body.password || '').trim();
    const passwordHex = [...password].map(c => c.charCodeAt(0).toString(16).padStart(2,'0')).join(' ');
    console.log(`[LOGIN] password length=${password.length} hex=${passwordHex}`);

    const users = await db.select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    console.log(`[LOGIN] found=${users.length} hash=${users[0]?.passwordHash?.slice(0,20)}...`);
    if (users.length > 0) {
      const testOk = bcrypt.compareSync(password, users[0]!.passwordHash);
      console.log(`[LOGIN] inline bcrypt=${testOk}`);
      const ok = verifyPassword(password, users[0]!.passwordHash);
      console.log(`[LOGIN] verifyPassword=${ok}`);
    }

    if (users.length === 0 || !verifyPassword(password, users[0]!.passwordHash)) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const user = users[0]!;
    if (user.status !== 'active') {
      throw new UnauthorizedError('Account is disabled');
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
}
