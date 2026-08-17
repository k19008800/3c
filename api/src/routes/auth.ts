/**
 * Auth Routes — 注册 / 登录 / 登出 / 刷新 / 密码重置 / Email 验证
 */

import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db, schema } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
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
import { sendMail } from '../services/mailer';
import { getRedis } from '../lib/redis';

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

  // POST /api/v1/auth/forgot-password — 找回密码（P1-1）
  // 生成 32 字节 hex 重置令牌 → sendMail 发送（内容写入 email_logs，10 分钟有效）。
  // 无论邮箱是否存在都返回统一文案，防用户枚举。
  app.post('/api/v1/auth/forgot-password', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const email = String(body.email || '').toLowerCase().trim();
    if (!email) throw new ValidationError('Email is required');

    const users = await db.select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (users.length > 0) {
      const token = crypto.randomBytes(32).toString('hex');
      const resetUrl = `${process.env.FRONTEND_URL || ''}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
      try {
        await sendMail({
          to: email,
          subject: '【3Cloud】重置密码',
          templateName: 'forgot-password',
          html: `
            <p>您好，</p>
            <p>您正在重置 3Cloud 账号（${email}）的登录密码。</p>
            <p>重置令牌（10 分钟内有效）：</p>
            <p><code>${token}</code></p>
            ${resetUrl ? `<p>或点击链接重置：<a href="${resetUrl}">${resetUrl}</a></p>` : ''}
            <p>如非本人操作，请忽略本邮件。</p>
          `,
        });
      } catch {
        /* 邮件发送失败不阻断（SMTP 未配置时 skipped 不抛错；此处防御 email_logs 写入异常） */
      }
    }

    return reply.send({ message: '如邮箱存在将发送重置邮件' });
  });

  // POST /api/v1/auth/reset-password — 重置密码（P1-1）
  // 校验 email_logs 中 10 分钟内的重置令牌 → 更新 passwordHash → 使旧会话失效。
  app.post('/api/v1/auth/reset-password', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const email = String(body.email || '').toLowerCase().trim();
    const token = String(body.token || '').trim();
    const newPassword = String(body.newPassword || '');

    if (!email || !token) throw new ValidationError('Email and token are required');
    if (newPassword.length < 8) throw new ValidationError('Password must be at least 8 characters');

    // 从 email_logs 中匹配「该邮箱 + 该令牌 + 10 分钟内」的最近一条（令牌已随邮件内容落库）
    const logs = await db.select({ id: schema.emailLogs.id })
      .from(schema.emailLogs)
      .where(and(
        eq(schema.emailLogs.toAddress, email),
        sql`${schema.emailLogs.content} LIKE ${'%' + token + '%'}`,
        sql`${schema.emailLogs.createdAt} > NOW() - INTERVAL '10 minutes'`,
      ))
      .orderBy(desc(schema.emailLogs.createdAt))
      .limit(1);
    if (logs.length === 0) throw new ValidationError('Invalid or expired reset token');

    const users = await db.select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    if (users.length === 0) throw new ValidationError('Invalid or expired reset token');

    await db.update(schema.users)
      .set({ passwordHash: bcrypt.hashSync(newPassword, 12), updatedAt: new Date() })
      .where(eq(schema.users.id, users[0]!.id));

    // 密码已重置：使该用户全部会话失效，强制重新登录
    await db.delete(schema.userSessions).where(eq(schema.userSessions.userId, users[0]!.id));

    return reply.send({ message: '密码已重置，请重新登录' });
  });

  // POST /api/v1/auth/send-email-code — 发送邮箱验证码（P1-1）
  // 生成 6 位数字验证码 → 存 Redis `email-code:{email}:{purpose}`（TTL 300s）→ sendMail 发送。
  // 响应统一成功文案，防用户枚举。purpose: verify_email | reset_password | change_email。
  app.post('/api/v1/auth/send-email-code', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const email = String(body.email || '').toLowerCase().trim();
    const purpose = String(body.purpose || '').trim();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ValidationError('Invalid email');
    if (!['verify_email', 'reset_password', 'change_email'].includes(purpose)) {
      throw new ValidationError('purpose must be verify_email | reset_password | change_email');
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));

    // Redis 存验证码（TTL 300s）；Redis 不可用时降级：验证码仍随邮件落库（email_logs）
    const r = getRedis();
    if (r) {
      try {
        await r.set(`email-code:${email}:${purpose}`, code, 'EX', 300);
      } catch {
        /* Redis 写失败不阻断发送 */
      }
    }

    try {
      await sendMail({
        to: email,
        subject: `【3Cloud】邮箱验证码 ${code}`,
        templateName: `email-code-${purpose}`,
        html: `
          <p>您好，</p>
          <p>您的 3Cloud 邮箱验证码（5 分钟内有效）：</p>
          <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p>
          <p>用途：${purpose}。如非本人操作，请忽略本邮件。</p>
        `,
      });
    } catch {
      /* 邮件发送失败不阻断（SMTP 未配置时 skipped 不抛错） */
    }

    return reply.send({ message: '验证码已发送' });
  });
}
