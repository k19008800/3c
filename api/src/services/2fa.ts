// ============================================================
//  3cloud (3C) — 双因素认证服务
//  TOTP 生成、验证、备用码管理
// ============================================================

import * as otplib from "otplib";
const authenticator = otplib.authenticator;
import crypto from "crypto";
import { getDb } from "../db/index.js";
import { users } from "../db/schema/users.js";
import { eq } from "drizzle-orm";

// ── 配置 ──

const APP_NAME = process.env.TWO_FACTOR_APP_NAME || "3Cloud";
const BACKUP_CODES_COUNT = 10; // 备用码数量

// ── 生成密钥 ──

export function generateSecret(email: string): { secret: string; otpauth: string } {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(email, APP_NAME, secret);
  
  return { secret, otpauth };
}

// ── 验证 TOTP ──

export function verifyTOTP(secret: string, token: string): boolean {
  try {
    // 允许 1 个时间窗口的偏差（前后 30 秒）
    authenticator.options = { window: 1 };
    return authenticator.check(token, secret);
  } catch (error) {
    return false;
  }
}

// ── 生成备用码 ──

export function generateBackupCodes(count: number = BACKUP_CODES_COUNT): string[] {
  const codes: string[] = [];
  
  for (let i = 0; i < count; i++) {
    // 生成 8 位随机码（数字+大写字母）
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    codes.push(code);
  }
  
  return codes;
}

// ── 验证备用码 ──

export async function verifyBackupCode(
  userId: number,
  code: string
): Promise<{ valid: boolean; remainingCodes: string[] | null }> {
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      twoFactorBackupCodes: true,
    },
  });

  if (!user || !user.twoFactorBackupCodes) {
    return { valid: false, remainingCodes: null };
  }

  const backupCodes = user.twoFactorBackupCodes as string[];
  const codeIndex = backupCodes.indexOf(code.toUpperCase());

  if (codeIndex === -1) {
    return { valid: false, remainingCodes: null };
  }

  // 移除已使用的备用码
  const remainingCodes = backupCodes.filter((_, i) => i !== codeIndex);

  return { valid: true, remainingCodes };
}

// ── 设置 2FA ──

export async function setup2FA(userId: number): Promise<{ secret: string; otpauth: string; backupCodes: string[] }> {
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      email: true,
    },
  });

  if (!user) {
    throw new Error("用户不存在");
  }

  const { secret, otpauth } = generateSecret(user.email);
  const backupCodes = generateBackupCodes();

  // 注意：此时不启用 2FA，只存储临时密钥
  // 需要用户验证后才启用
  await db
    .update(users)
    .set({
      twoFactorSecret: secret,
      twoFactorBackupCodes: backupCodes,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return { secret, otpauth, backupCodes };
}

// ── 启用 2FA（验证后）──

export async function enable2FA(userId: number, token: string): Promise<boolean> {
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      twoFactorSecret: true,
    },
  });

  if (!user || !user.twoFactorSecret) {
    throw new Error("请先初始化 2FA 设置");
  }

  if (!verifyTOTP(user.twoFactorSecret, token)) {
    throw new Error("验证码错误");
  }

  await db
    .update(users)
    .set({
      twoFactorEnabled: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return true;
}

// ── 禁用 2FA ──

export async function disable2FA(userId: number): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

// ── 重新生成备用码 ──

export async function regenerateBackupCodes(userId: number): Promise<string[]> {
  const db = getDb();
  const backupCodes = generateBackupCodes();

  await db
    .update(users)
    .set({
      twoFactorBackupCodes: backupCodes,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return backupCodes;
}

// ── 验证 2FA（登录时）──

export async function verify2FA(
  userId: number,
  token: string
): Promise<{ valid: boolean; usedBackupCode?: boolean }> {
  const db = getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      twoFactorEnabled: true,
      twoFactorSecret: true,
      twoFactorBackupCodes: true,
    },
  });

  if (!user || !user.twoFactorEnabled) {
    return { valid: false };
  }

  // 先验证 TOTP
  if (user.twoFactorSecret && verifyTOTP(user.twoFactorSecret, token)) {
    return { valid: true, usedBackupCode: false };
  }

  // 再验证备用码
  const backupResult = await verifyBackupCode(userId, token);
  if (backupResult.valid && backupResult.remainingCodes) {
    // 更新剩余备用码
    await db
      .update(users)
      .set({
        twoFactorBackupCodes: backupResult.remainingCodes,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return { valid: true, usedBackupCode: true };
  }

  return { valid: false };
}
