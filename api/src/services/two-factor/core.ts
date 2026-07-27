// ============================================================
//  3cloud (3C) — 双因素认证 — 核心加密功能
// ============================================================

import * as otplib from "otplib";
import crypto from "node:crypto";
import { getDb } from "../../db/index.js";
import { users } from "../../db/schema/users.js";
import { eq } from "drizzle-orm";
const authenticator = otplib.authenticator;

const APP_NAME = process.env.TWO_FACTOR_APP_NAME || "3Cloud";
const BACKUP_CODES_COUNT = 10;

export function generateSecret(email: string): { secret: string; otpauth: string } {
  const secret = authenticator.generateSecret();
  return { secret, otpauth: authenticator.keyuri(email, APP_NAME, secret) };
}

export function verifyTOTP(secret: string, token: string): boolean {
  try { authenticator.options = { window: 1 }; return authenticator.check(token, secret); }
  catch { return false; }
}

export function generateBackupCodes(count: number = BACKUP_CODES_COUNT): string[] {
  return Array.from({ length: count }, () => crypto.randomBytes(4).toString("hex").toUpperCase());
}

export async function verifyBackupCode(userId: number, code: string): Promise<{ valid: boolean; remainingCodes: string[] | null }> {
  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { twoFactorBackupCodes: true } });
  if (!user?.twoFactorBackupCodes) return { valid: false, remainingCodes: null };
  const backupCodes = user.twoFactorBackupCodes as string[];
  const codeIndex = backupCodes.indexOf(code.toUpperCase());
  if (codeIndex === -1) return { valid: false, remainingCodes: null };
  return { valid: true, remainingCodes: backupCodes.filter((_, i) => i !== codeIndex) };
}
