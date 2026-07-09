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
import { users, agents, agentClients, balanceLogs, userLoginHistory } from "../db/schema.js";

// ── 类型 ──

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // access token 有效期（秒）
}

export interface TokenPayload {
  userId: number;
  role: string;
  impersonatorId?: number;
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
  return {
    userId: payload.userId,
    role: payload.role,
    impersonatorId: payload.impersonatorId,
  };
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
  password: string,
  refCode?: string
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
  const passwordHash = await bcrypt.hash(password, config.bcrypt.saltRounds);

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

  // 5. 处理静默推荐码（代理商邀请链接）
  if (refCode) {
    const agentIdStr = await redis.get(`ref:link:${refCode}`);
    if (agentIdStr) {
      const agentId = parseInt(agentIdStr, 10);
      // 检查客户是否已被其他代理商绑定
      const [existingBinding] = await db
        .select({ id: agentClients.id })
        .from(agentClients)
        .where(eq(agentClients.clientUserId, newUser.id))
        .limit(1);

      if (!existingBinding) {
        await db.insert(agentClients).values({
          agentId,
          clientUserId: newUser.id,
        });
      }
      // 静默处理：失败不影响注册，不抛出错误

      // 注册奖励：查活动规则配置
      try {
        const { processActivityCommission } = await import("./billing.js");
        await processActivityCommission(
          db, agentId, newUser.id, "register_bonus", undefined, undefined
        );
      } catch {
        // 活动奖励失败不影响注册
      }
    }
  }

  // 6. 生成验证码（6 位数字，存 Redis 5 分钟）
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

// ── 登录（含风控） ──

export interface LoginResult {
  user: AuthResult["user"] | null;
  tokens: TokenPair | null;
  captchaRequired?: boolean;
  captchaSession?: string;
}

export async function loginUser(
  email: string,
  password: string,
  ip?: string,
  userAgent?: string,
  captcha?: string,
  captchaSession?: string,
): Promise<LoginResult> {
  const db = getDb();
  const { preLoginCheck, handleLoginFailure, handleLoginSuccess, verifyCaptchaSession, isUserBanned } = await import("./login-security.js");
  const { createSession, revokeAllUserSessions } = await import("./session-manager.js");
  const { recordSecurityEvent } = await import("./security-event.js");

  // 辅助：记录登录历史
  async function recordLogin(userId: number | null, success: boolean, failReason?: string) {
    if (!userId) return;
    await db.insert(userLoginHistory).values({
      userId,
      ip: ip ?? "unknown",
      userAgent: userAgent ?? undefined,
      success,
      failReason: failReason ?? undefined,
    }).catch(() => {}); // 静默失败，不影响登录流程
  }

  // 1. 查找用户（先查用户以获取 userId，但还未验证密码）
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  // 2. 登录前风控检查
  const userId = user?.id ?? null;
  const preCheck = await preLoginCheck(ip ?? "unknown", userId, email);

  if (!preCheck.allowed) {
    // 记录失败的登录历史
    if (userId) {
      await recordLogin(userId, false, preCheck.blockedReason === "IP 已被临时封禁" ? "ip_banned" : "user_banned");
    }
    throw new AppError(
      "LOGIN_BLOCKED",
      preCheck.blockedReason ?? "登录被拒绝，请稍后重试",
      429,
    );
  }

  if (preCheck.requireCaptcha) {
    // 用户有 captchaSession 参数 → 正常走验证码验证
    if (captchaSession) {
      if (captcha) {
        const captchaResult = await verifyCaptchaSession(captchaSession, captcha);
        if (!captchaResult.valid || captchaResult.userId !== userId) {
          if (userId) {
            await recordLogin(userId, false, "wrong_captcha");
          }
          throw new AppError("INVALID_CAPTCHA", "验证码错误或已过期", 400);
        }
      } else {
        if (userId) {
          await recordLogin(userId, false, "captcha_required");
        }
        return {
          user: null as any,
          tokens: null as any,
          captchaRequired: true,
          captchaSession,
        };
      }
    } else {
      // 前端未传 captchaSession → 使用 preCheck 返回的 session 引导前端弹验证码
      const newSession = preCheck.captchaSession!;
      if (userId) {
        await recordLogin(userId, false, "captcha_required");
      }
      return {
        user: null as any,
        tokens: null as any,
        captchaRequired: true,
        captchaSession: newSession,
      };
    }
  }

  // 3. 如果没有用户，直接返回错误（在前置风控之后才暴露「用户不存在」）
  if (!user) {
    // 即使邮箱不存在，也记录失败到 IP 级计数器
    await handleLoginFailure(ip ?? "unknown", null, email);
    throw new AppError("INVALID_CREDENTIALS", "邮箱或密码错误", 401);
  }

  // 4. 检查状态
  if (user.status === "disabled") {
    await recordLogin(user.id, false, "user_disabled");
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
    await recordLogin(user.id, false, "user_deleted");
    throw new AppError("USER_DELETED", "账号已注销", 403);
  }

  // 5. 检查 DB 级 force_logout_at（管理端强制下线标记）
  if (user.forceLogoutAt) {
    await recordLogin(user.id, false, "force_logout");
    throw new AppError("FORCE_LOGOUT", "账号已被管理员强制下线，请联系客服", 403);
  }

  // 6. 验证密码
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await recordLogin(user.id, false, "wrong_password");
    // 触发风控计数器
    await handleLoginFailure(ip ?? "unknown", user.id, email);
    throw new AppError("INVALID_CREDENTIALS", "邮箱或密码错误", 401);
  }

  // 7. 登录成功 → 清除风控计数器
  await handleLoginSuccess(ip ?? "unknown", user.id);

  // 8. 异步执行异地登录检测 & 会话管理（不阻塞登录返回）
  const geoPromise = (async () => {
    try {
      const { detectUnusualLogin, lookupGeo } = await import("./geo-check.js");
      const geo = await lookupGeo(ip ?? "unknown");
      if (geo) {
        const risk = await detectUnusualLogin(user.id, ip ?? "unknown", userAgent ?? "", geo);
        if (risk.riskLevel !== "low") {
          // 写安全事件 & 发邮件通知
          await recordSecurityEvent({
            userId: user.id,
            eventType: risk.riskLevel === "critical" ? "unusual_location" : "new_device",
            riskLevel: risk.riskLevel,
            ip,
            userAgent,
            city: geo.city,
            country: geo.countryName,
            detail: { reason: risk.reason },
          });

          // 高风险/严重 → 发邮件提醒
          if (risk.riskLevel === "high" || risk.riskLevel === "critical") {
            const { sendLoginAlertEmail } = await import("./email-service.js");
            sendLoginAlertEmail({
              toEmail: user.email,
              nickname: user.nickname,
              city: geo.city,
              country: geo.countryName,
              ip: ip ?? "unknown",
              device: userAgent ?? "未知设备",
            }).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn(`[GeoCheck] 异地检测失败 (userId=${user.id}):`, err);
    }
  })();

  const sessionPromise = (async () => {
    try {
      // 先检查 force_logout_at 是否过期
      if (user.forceLogoutAt && new Date(user.forceLogoutAt) < new Date()) {
        // 清除标记
        await db.update(users).set({ forceLogoutAt: null }).where(eq(users.id, user.id));
        // 清理旧会话
        await revokeAllUserSessions(user.id);
      }
    } catch {}
  })();

  // 9. 记录成功登录 + 更新最后登录时间
  await Promise.all([
    recordLogin(user.id, true),
    db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id)),
  ]);

  // 10. 生成 token（包含 jti 用于会话管理）
  const tokens = generateTokens(user.id, user.role);

  // 11. 创建会话记录（异步，不阻塞返回）
  createSession({
    userId: user.id,
    jti: tokens.accessToken, // 使用 accessToken 的签名作为 jti
    ip: ip ?? "unknown",
    userAgent: userAgent ?? undefined,
  }).catch((err) => console.warn(`[Session] 创建会话失败 (userId=${user.id}):`, err));

  // 12. 确保异地检测完成后再返回（保证登录历史已写入）
  await geoPromise;
  await sessionPromise;

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
    captchaRequired: false,
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
      idNumber: users.idNumber,
      idFrontImage: users.idFrontImage,
      idBackImage: users.idBackImage,
      companyName: users.companyName,
      companyRegNumber: users.companyRegNumber,
      businessLicense: users.businessLicense,
      bankName: users.bankName,
      bankAccount: users.bankAccount,
      rejectReason: users.rejectReason,
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

  const passwordHash = await bcrypt.hash(newPassword, config.bcrypt.saltRounds);
  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, userId));
}

// ── 忘记密码 ──

export async function forgotPassword(email: string): Promise<void> {
  const db = getDb();
  const redis = getRedis();

  // 1. 检查邮箱是否存在
  const [user] = await db
    .select({ id: users.id, email: users.email, nickname: users.nickname })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  // 无论邮箱是否存在，都回复相同的信息，防止枚举
  if (!user) {
    return;
  }

  // 2. 生成随机 token
  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("hex");

  // 3. 存储到 Redis，TTL 30 分钟
  await redis.setex(
    `reset:token:${token}`,
    1800,
    String(user.id)
  );

  // 4. 发送重置密码邮件
  const { sendEmail, loadTemplate, renderTemplate } = await import("./email-service.js");

  const template = await loadTemplate("password_reset");
  if (!template) {
    console.warn(`[PasswordReset] 未找到邮件模板 "password_reset"`);
    return;
  }

  const resetLink = `${config.appUrl}/reset-password?token=${token}`;
  const vars: Record<string, string> = {
    nickname: user.nickname || "用户",
    resetLink,
    expireMinutes: "30",
  };

  const lang = "zh";
  const subject = lang === "zh"
    ? renderTemplate(template.subjectZh, vars)
    : renderTemplate(template.subjectEn, vars);
  const bodyHtml = lang === "zh"
    ? renderTemplate(template.bodyHtmlZh, vars)
    : renderTemplate(template.bodyHtmlEn, vars);

  await sendEmail({
    to: user.email,
    subject,
    html: bodyHtml,
  });
}

// ── 重置密码 ──

export async function resetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<void> {
  const db = getDb();
  const redis = getRedis();

  // 1. 从 Redis 获取 token 对应的 userId
  const userIdStr = await redis.get(`reset:token:${token}`);
  if (!userIdStr) {
    throw new AppError("INVALID_RESET_TOKEN", "重置链接无效或已过期", 400);
  }

  const userId = parseInt(userIdStr, 10);

  // 2. 确认用户存在
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError("USER_NOT_FOUND", "用户不存在", 404);
  }

  // 3. bcrypt hash 新密码
  const passwordHash = await bcrypt.hash(newPassword, config.bcrypt.saltRounds);

  // 4. 更新 users 表 passwordHash
  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, userId));

  // 5. 删除 Redis token
  await redis.del(`reset:token:${token}`);

  // 6. 撤销用户所有活跃会话
  const { revokeAllUserSessions } = await import("./session-manager.js");
  await revokeAllUserSessions(userId);
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
