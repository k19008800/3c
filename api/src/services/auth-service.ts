// ============================================================
//  3cloud (3C) — Auth 服务层
//  注册 / 登录 / 邮箱验证 / JWT / 密码管理
// ============================================================

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { getDb } from "../db/index.js";
import { getRedis } from "../redis.js";
import { config } from "../config.js";
import { users, balanceLogs } from "../db/schema.js";

// ── 类型 ──

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // access token 有效期（秒）
}

export interface TokenPayload {
  userId: number;
  role: string;
}

export interface AuthResult {
  user: {
    id: number;
    email: string;
    nickname: string | null;
    userType: "personal" | "enterprise";
    role: string;
    status: string;
    balance: string;
    emailVerifiedAt: string | null;
  };
  tokens: TokenPair;
}

// ── Token 生成 ──

const ACCESS_EXPIRES_SECONDS = 2 * 3600; // 2h
const REFRESH_EXPIRES_SECONDS = 7 * 24 * 3600; // 7d

export function generateTokens(userId: number, role: string): TokenPair {
  const accessToken = jwt.sign(
    { userId, role } satisfies TokenPayload,
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpires as any }
  );

  const refreshToken = jwt.sign(
    { userId, role, type: "refresh" } satisfies TokenPayload & { type: string },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpires as any }
  );

  return { accessToken, refreshToken, expiresIn: ACCESS_EXPIRES_SECONDS };
}

export function verifyAccessToken(token: string): TokenPayload {
  const payload = jwt.verify(token, config.jwt.accessSecret) as TokenPayload;
  return { userId: payload.userId, role: payload.role };
}

export function verifyRefreshToken(token: string): TokenPayload {
  const payload = jwt.verify(token, config.jwt.refreshSecret) as TokenPayload & { type: string };
  if (payload.type !== "refresh") {
    throw new AppError("INVALID_TOKEN", "Token 类型不正确", 401);
  }
  return { userId: payload.userId, role: payload.role };
}

// ── 自定义错误 ──

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "AppError";
  }
}

// ── 注册 ──

export async function registerUser(
  email: string,
  password: string
): Promise<AuthResult> {
  const db = getDb();
  const redis = getRedis();

  // 1. 检查邮箱是否已注册
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    const user = existing[0];
    throw new AppError("EMAIL_EXISTS", "该邮箱已注册", 409);
  }

  // 2. 密码哈希
  const passwordHash = await bcrypt.hash(password, 10);

  // 3. 创建用户
  const [newUser] = await db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      passwordHash,
      status: "pending", // 未验证邮箱
    })
    .returning({
      id: users.id,
      email: users.email,
      nickname: users.nickname,
      userType: users.userType,
      role: users.role,
      status: users.status,
      balance: users.balance,
      emailVerifiedAt: users.emailVerifiedAt,
    });

  // 4. 发放免费体验额度（更新余额 + 写入流水）
  const trialQuota = "50000.000000";
  await db
    .update(users)
    .set({ balance: trialQuota })
    .where(eq(users.id, newUser.id));

  await db.insert(balanceLogs).values({
    userId: newUser.id,
    amount: trialQuota,
    balanceAfter: trialQuota,
    type: "trial_grant",
    description: "新用户免费体验额度",
  });

  // 更新返回中的 balance
  newUser.balance = trialQuota;

  // 5. 生成验证码（6 位数字，存 Redis 5 分钟）
  const verifyCode = Math.random().toString().slice(2, 8);
  await redis.setex(
    `verify:email:${newUser.id}`,
    300, // 5 分钟
    verifyCode
  );

  // 6. 生成 token
  const tokens = generateTokens(newUser.id, newUser.role);

  // TODO: 发送验证码邮件（待 SMTP 配置后实现）

  return {
    user: {
      id: newUser.id,
      email: newUser.email,
      nickname: newUser.nickname,
      userType: newUser.userType as "personal" | "enterprise",
      role: newUser.role,
      status: newUser.status,
      balance: newUser.balance,
      emailVerifiedAt: newUser.emailVerifiedAt?.toISOString() ?? null,
    },
    tokens,
  };
}

// ── 邮箱验证 ──

export async function verifyUserEmail(
  userId: number,
  code: string
): Promise<void> {
  const redis = getRedis();
  const db = getDb();

  const storedCode = await redis.get(`verify:email:${userId}`);
  if (!storedCode || storedCode !== code) {
    throw new AppError("INVALID_VERIFY_CODE", "验证码错误或已过期", 400);
  }

  // 删除验证码
  await redis.del(`verify:email:${userId}`);

  // 更新用户状态
  await db
    .update(users)
    .set({
      status: "active",
      emailVerifiedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

// ── 登录 ──

export async function loginUser(
  email: string,
  password: string
): Promise<AuthResult> {
  const db = getDb();

  // 1. 查找用户
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!user) {
    throw new AppError("INVALID_CREDENTIALS", "邮箱或密码错误", 401);
  }

  // 2. 检查状态
  if (user.status === "disabled") {
    const until = user.disabledUntil
      ? `，解封时间: ${user.disabledUntil.toISOString()}`
      : "（永久封禁）";
    throw new AppError(
      "USER_DISABLED",
      `账号已被禁用${until}`,
      403
    );
  }

  if (user.status === "deleted") {
    throw new AppError("USER_DELETED", "账号已注销", 403);
  }

  // 3. 验证密码
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError("INVALID_CREDENTIALS", "邮箱或密码错误", 401);
  }

  // 4. 生成 token
  const tokens = generateTokens(user.id, user.role);

  return {
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      userType: user.userType as "personal" | "enterprise",
      role: user.role,
      status: user.status,
      balance: user.balance,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    },
    tokens,
  };
}

// ── 刷新 Token ──

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const payload = verifyRefreshToken(refreshToken);

  const accessToken = jwt.sign(
    { userId: payload.userId, role: payload.role } satisfies TokenPayload,
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpires as any }
  );

  return { accessToken, expiresIn: ACCESS_EXPIRES_SECONDS };
}

// ── 获取用户详情 ──

export async function getUserProfile(userId: number) {
  const db = getDb();

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      nickname: users.nickname,
      userType: users.userType,
      role: users.role,
      status: users.status,
      realNameStatus: users.realNameStatus,
      realName: users.realName,
      balance: users.balance,
      discountRate: users.discountRate,
      rpmOverride: users.rpmOverride,
      tpmOverride: users.tpmOverride,
      teamId: users.teamId,
      teamRole: users.teamRole,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError("USER_NOT_FOUND", "用户不存在", 404);
  }

  return {
    ...user,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    createdAt: user.createdAt?.toISOString() ?? null,
  };
}

// ── 修改密码 ──

export async function changeUserPassword(
  userId: number,
  oldPassword: string,
  newPassword: string
): Promise<void> {
  const db = getDb();

  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError("USER_NOT_FOUND", "用户不存在", 404);
  }

  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) {
    throw new AppError("WRONG_PASSWORD", "原密码错误", 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, userId));
}

// ── 重发验证码 ──

export async function resendVerifyCode(userId: number): Promise<void> {
  const redis = getRedis();
  const db = getDb();

  const [user] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError("USER_NOT_FOUND", "用户不存在", 404);
  }

  if (user.status !== "pending") {
    throw new AppError("ALREADY_VERIFIED", "邮箱已验证，无需重复验证", 400);
  }

  // 检查频率限制（60 秒内不可重发）
  const ttl = await redis.ttl(`verify:email:${userId}`);
  if (ttl > 240) {
    // 5 分钟 TTL，剩余 > 240 秒说明刚发过
    throw new AppError("TOO_FREQUENT", "验证码已发送，请 60 秒后再试", 429);
  }

  const verifyCode = Math.random().toString().slice(2, 8);
  await redis.setex(`verify:email:${userId}`, 300, verifyCode);

  // TODO: 发送邮件
}
