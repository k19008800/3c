// ============================================================
//  3cloud (3C) — 双因素认证 — 管理操作
// ============================================================

import { getDb } from "../../db/index.js";
import { users } from "../../db/schema/users.js";
import { eq } from "drizzle-orm";
import { generateSecret, generateBackupCodes, verifyTOTP, verifyBackupCode } from "./core.js";

export async function setup2FA(userId: number): Promise<{ secret: string; otpauth: string; backupCodes: string[] }> {
  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { email: true } });
  if (!user) throw new Error("用户不存在");
  const { secret, otpauth } = generateSecret(user.email);
  const backupCodes = generateBackupCodes();
  await db.update(users).set({ twoFactorSecret: secret, twoFactorBackupCodes: backupCodes, updatedAt: new Date() }).where(eq(users.id, userId));
  return { secret, otpauth, backupCodes };
}

export async function enable2FA(userId: number, token: string): Promise<boolean> {
  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { twoFactorSecret: true } });
  if (!user?.twoFactorSecret) throw new Error("请先初始化 2FA 设置");
  if (!verifyTOTP(user.twoFactorSecret, token)) throw new Error("验证码错误");
  await db.update(users).set({ twoFactorEnabled: true, updatedAt: new Date() }).where(eq(users.id, userId));
  return true;
}

export async function disable2FA(userId: number): Promise<void> {
  const db = getDb();
  await db.update(users).set({ twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: null, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function regenerateBackupCodes(userId: number): Promise<string[]> {
  const db = getDb();
  const backupCodes = generateBackupCodes();
  await db.update(users).set({ twoFactorBackupCodes: backupCodes, updatedAt: new Date() }).where(eq(users.id, userId));
  return backupCodes;
}

export async function verify2FA(userId: number, token: string): Promise<{ valid: boolean; usedBackupCode?: boolean }> {
  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { twoFactorEnabled: true, twoFactorSecret: true, twoFactorBackupCodes: true } });
  if (!user?.twoFactorEnabled) return { valid: false };
  if (user.twoFactorSecret && verifyTOTP(user.twoFactorSecret, token)) return { valid: true, usedBackupCode: false };
  const backupResult = await verifyBackupCode(userId, token);
  if (backupResult.valid && backupResult.remainingCodes) {
    await db.update(users).set({ twoFactorBackupCodes: backupResult.remainingCodes, updatedAt: new Date() }).where(eq(users.id, userId));
    return { valid: true, usedBackupCode: true };
  }
  return { valid: false };
}
