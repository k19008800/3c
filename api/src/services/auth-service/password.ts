import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { config } from "../../config.js";
import { users } from "../../db/schema.js";
import { AppError } from "./types.js";

// ── 密码强度校验 ──
// 至少 8 位、包含大小写字母、数字、特殊字符

export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

export const PASSWORD_MESSAGE =
  "密码必须至少 8 位，且包含大小写字母、数字和特殊字符";

export function validatePasswordStrength(password: string): {
  valid: boolean;
  message: string;
} {
  if (password.length < 8) {
    return { valid: false, message: "密码长度不能少于 8 位" };
  }
  if (!PASSWORD_REGEX.test(password)) {
    return { valid: false, message: PASSWORD_MESSAGE };
  }
  return { valid: true, message: "" };
}

export async function changeUserPassword(userId: number, oldPassword: string, newPassword: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AppError("USER_NOT_FOUND", "用户不存在", 404);
  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) throw new AppError("WRONG_PASSWORD", "原密码错误", 400);
  const passwordHash = await bcrypt.hash(newPassword, config.bcrypt.saltRounds);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function forgotPassword(
  email: string,
  ip?: string,
  userAgent?: string
): Promise<void> {
  const db = getDb();
  const redis = getRedis();
  const [user] = await db.select({ id: users.id, email: users.email, nickname: users.nickname }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!user) return;
  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("hex");
  // MED-2: 绑定 IP 和设备信息到 token，增强安全性
  await redis.setex(`reset:token:${token}`, 1800, JSON.stringify({ userId: user.id, ip: ip || "", userAgent: userAgent || "" }));
  const { sendEmail, loadTemplate, renderTemplate } = await import("../email-service.js");
  const template = await loadTemplate("password_reset");
  if (!template) { console.warn(`[PasswordReset] 未找到邮件模板 "password_reset"`); return; }
  const resetLink = `${config.appUrl}/reset-password?token=${token}`;
  const vars: Record<string, string> = { nickname: user.nickname || "用户", resetLink, expireMinutes: "30" };
  const lang = "zh";
  const subject = lang === "zh" ? renderTemplate(template.subjectZh, vars) : renderTemplate(template.subjectEn, vars);
  const bodyHtml = lang === "zh" ? renderTemplate(template.bodyHtmlZh, vars) : renderTemplate(template.bodyHtmlEn, vars);
  await sendEmail({ to: user.email, subject, html: bodyHtml });
}

/**
 * 检查两个 IP 是否在同一 C 段（A.B.C.x 匹配）
 */
function sameCSegment(ip1: string, ip2: string): boolean {
  if (!ip1 || !ip2) return false;
  const p1 = ip1.split(".");
  const p2 = ip2.split(".");
  if (p1.length !== 4 || p2.length !== 4) return false;
  return p1[0] === p2[0] && p1[1] === p2[1] && p1[2] === p2[2];
}

export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
  currentIp?: string,
  currentUserAgent?: string
): Promise<void> {
  const db = getDb();
  const redis = getRedis();
  const stored = await redis.get(`reset:token:${token}`);
  if (!stored) throw new AppError("INVALID_RESET_TOKEN", "重置链接无效或已过期", 400);

  // MED-2: 解析存储的 JSON（兼容旧格式——纯 userId 字符串）
  let userId: number;
  let storedIp = "";
  let storedUserAgent = "";
  try {
    const parsed = JSON.parse(stored);
    userId = parsed.userId;
    storedIp = parsed.ip || "";
    storedUserAgent = parsed.userAgent || "";
  } catch {
    // 旧格式：纯数字字符串
    userId = parseInt(stored, 10);
  }

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AppError("USER_NOT_FOUND", "用户不存在", 404);

  // MED-2: IP 软比对——仅记录，不阻塞
  if (storedIp && currentIp && storedIp !== currentIp) {
    if (sameCSegment(storedIp, currentIp)) {
      // 同一 C 段，正常通过
      console.info(
        `[Security] 密码重置 IP 变更（同网段）: userId=${userId}, oldIp=${storedIp}, newIp=${currentIp}`
      );
    } else {
      // 跨网段
      const uaChanged =
        storedUserAgent && currentUserAgent &&
        storedUserAgent !== currentUserAgent;
      if (uaChanged) {
        // IP 完全跨网段且 User-Agent 也不同，记录告警
        console.warn(
          `[Security] 密码重置 IP 跨网段且 UA 变更（risk=low）: userId=${userId}, oldIp=${storedIp}, newIp=${currentIp}`
        );
      } else {
        console.info(
          `[Security] 密码重置 IP 变更（跨网段但 UA 一致）: userId=${userId}, oldIp=${storedIp}, newIp=${currentIp}`
        );
      }
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, config.bcrypt.saltRounds);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  await redis.del(`reset:token:${token}`);
  const { revokeAllUserSessions } = await import("../session-manager.js");
  await revokeAllUserSessions(userId);
}
