import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "../../db/index.js";
import { users, userLoginHistory } from "../../db/schema.js";
import { AppError, type LoginResult } from "./types.js";
import { generateTokens } from "./tokens.js";

export async function loginUser(email: string, password: string, ip?: string, userAgent?: string, captcha?: string, captchaSession?: string): Promise<LoginResult> {
  const db = getDb();
  const { preLoginCheck, handleLoginFailure, handleLoginSuccess, verifyCaptchaSession } = await import("../login-security.js");
  const { createSession, revokeAllUserSessions } = await import("../session-manager.js");
  const { recordSecurityEvent } = await import("../security-event.js");

  async function recordLogin(userId: number | null, success: boolean, failReason?: string) {
    if (!userId) return;
    await db.insert(userLoginHistory).values({ userId, ip: ip ?? "unknown", userAgent: userAgent ?? undefined, success, failReason: failReason ?? undefined }).catch(() => {});
  }

  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  const userId = user?.id ?? null;
  const preCheck = await preLoginCheck(ip ?? "unknown", userId, email);

  if (!preCheck.allowed) {
    if (userId) await recordLogin(userId, false, preCheck.blockedReason === "IP 已被临时封禁" ? "ip_banned" : "user_banned");
    throw new AppError("LOGIN_BLOCKED", preCheck.blockedReason ?? "登录被拒绝，请稍后重试", 429);
  }

  if (preCheck.requireCaptcha) {
    if (captchaSession) {
      if (captcha) {
        const captchaResult = await verifyCaptchaSession(captchaSession, captcha);
        if (!captchaResult.valid || captchaResult.userId !== userId) {
          if (userId) await recordLogin(userId, false, "wrong_captcha");
          throw new AppError("INVALID_CAPTCHA", "验证码错误或已过期", 400);
        }
      } else {
        if (userId) await recordLogin(userId, false, "captcha_required");
        return { user: null as any, tokens: null as any, captchaRequired: true, captchaSession };
      }
    } else {
      if (userId) await recordLogin(userId, false, "captcha_required");
      return { user: null as any, tokens: null as any, captchaRequired: true, captchaSession: preCheck.captchaSession! };
    }
  }

  if (!user) {
    await handleLoginFailure(ip ?? "unknown", null, email);
    throw new AppError("INVALID_CREDENTIALS", "邮箱或密码错误", 401);
  }

  if (user.status === "disabled") {
    await recordLogin(user.id, false, "user_disabled");
    const until = user.disabledUntil ? `，解封时间: ${user.disabledUntil.toISOString()}` : "（永久封禁）";
    throw new AppError("USER_DISABLED", `账号已被禁用${until}`, 403);
  }
  if (user.status === "deleted") {
    await recordLogin(user.id, false, "user_deleted");
    throw new AppError("USER_DELETED", "账号已注销", 403);
  }
  if (user.forceLogoutAt) {
    await recordLogin(user.id, false, "force_logout");
    throw new AppError("FORCE_LOGOUT", "账号已被管理员强制下线，请联系客服", 403);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await recordLogin(user.id, false, "wrong_password");
    await handleLoginFailure(ip ?? "unknown", user.id, email);
    throw new AppError("INVALID_CREDENTIALS", "邮箱或密码错误", 401);
  }

  await handleLoginSuccess(ip ?? "unknown", user.id);

  const geoPromise = (async () => {
    try {
      const { detectUnusualLogin, lookupGeo } = await import("../geo-check.js");
      const geo = await lookupGeo(ip ?? "unknown");
      if (geo) {
        const risk = await detectUnusualLogin(user.id, ip ?? "unknown", userAgent ?? "", geo);
        if (risk.riskLevel !== "low") {
          await recordSecurityEvent({ userId: user.id, eventType: risk.riskLevel === "critical" ? "unusual_location" : "new_device", riskLevel: risk.riskLevel, ip, userAgent, city: geo.city, country: geo.countryName, detail: { reason: risk.reason } });
          if (risk.riskLevel === "high" || risk.riskLevel === "critical") {
            const { sendLoginAlertEmail } = await import("../email-service.js");
            sendLoginAlertEmail({ toEmail: user.email, nickname: user.nickname, city: geo.city, country: geo.countryName, ip: ip ?? "unknown", device: userAgent ?? "未知设备" }).catch(() => {});
          }
        }
      }
    } catch (err) { console.warn(`[GeoCheck] 异地检测失败 (userId=${user.id}):`, err); }
  })();

  const sessionPromise = (async () => {
    try {
      if (user.forceLogoutAt && new Date(user.forceLogoutAt) < new Date()) {
        await db.update(users).set({ forceLogoutAt: null }).where(eq(users.id, user.id));
        await revokeAllUserSessions(user.id);
      }
    } catch {}
  })();

  await Promise.all([recordLogin(user.id, true), db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))]);

  const tokens = generateTokens(user.id, user.role);
  createSession({ userId: user.id, jti: tokens.accessToken, ip: ip ?? "unknown", userAgent: userAgent ?? undefined }).catch((err) => console.warn(`[Session] 创建会话失败 (userId=${user.id}):`, err));

  await geoPromise;
  await sessionPromise;

  return { user: { id: user.id, email: user.email, nickname: user.nickname, userType: user.userType as "personal" | "enterprise", role: user.role, status: user.status, balance: user.balance, emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null }, tokens, captchaRequired: false };
}
