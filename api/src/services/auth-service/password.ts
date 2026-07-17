import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { config } from "../../config.js";
import { users } from "../../db/schema.js";
import { AppError } from "./types.js";

export async function changeUserPassword(userId: number, oldPassword: string, newPassword: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AppError("USER_NOT_FOUND", "用户不存在", 404);
  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) throw new AppError("WRONG_PASSWORD", "原密码错误", 400);
  const passwordHash = await bcrypt.hash(newPassword, config.bcrypt.saltRounds);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function forgotPassword(email: string): Promise<void> {
  const db = getDb();
  const redis = getRedis();
  const [user] = await db.select({ id: users.id, email: users.email, nickname: users.nickname }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!user) return;
  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("hex");
  await redis.setex(`reset:token:${token}`, 1800, String(user.id));
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

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  const db = getDb();
  const redis = getRedis();
  const userIdStr = await redis.get(`reset:token:${token}`);
  if (!userIdStr) throw new AppError("INVALID_RESET_TOKEN", "重置链接无效或已过期", 400);
  const userId = parseInt(userIdStr, 10);
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AppError("USER_NOT_FOUND", "用户不存在", 404);
  const passwordHash = await bcrypt.hash(newPassword, config.bcrypt.saltRounds);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  await redis.del(`reset:token:${token}`);
  const { revokeAllUserSessions } = await import("../session-manager.js");
  await revokeAllUserSessions(userId);
}
