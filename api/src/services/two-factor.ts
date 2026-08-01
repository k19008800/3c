import { authenticator } from "@otplib/preset-default";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/index";
import { userRecoveryCodes } from "../db/schema/two-factor";

/**
 * 2FA 服务 对齐 SPEC-§20.2（TOTP / RFC 6238）
 */
const ISSUER = "3Cloud";

/** 生成 Base32 密钥 + otpauth URI */
export function generateTwoFactorSetup(email: string) {
  const secret = authenticator.generateSecret(); // 20 bytes → 32 char Base32
  const otpauth = authenticator.keyuri(email, ISSUER, secret);
  return { secret, otpauth, manualKey: secret };
}

/** 验证 TOTP（±1 时间步长） */
export function verifyTotp(secret: string, token: string): boolean {
  try {
    return authenticator.check(token, secret);
  } catch {
    return false;
  }
}

/** 生成 10 个恢复码（格式 XXXX-XXXX-XXXX-XXXX），bcrypt 存储 */
export async function generateRecoveryCodes(userId: number): Promise<string[]> {
  const codes: string[] = [];
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 10; i++) {
    let c = "";
    for (let j = 0; j < 16; j++) c += charset[Math.floor(Math.random() * charset.length)];
    codes.push(`${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}`);
  }
  // 作废旧码，写入新码（bcrypt）
  await db.update(userRecoveryCodes).set({ used: true, usedAt: new Date() }).where(eq(userRecoveryCodes.userId, userId));
  const hashed = await Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
  for (const h of hashed) {
    await db.insert(userRecoveryCodes).values({ userId, code: h });
  }
  return codes;
}

/** 校验恢复码（命中即作废） */
export async function verifyRecoveryCode(userId: number, code: string): Promise<boolean> {
  const normalized = code.trim().toUpperCase();
  const rows = await pool.query(
    `SELECT id, code FROM user_recovery_codes WHERE user_id=$1 AND used=false`,
    [userId],
  );
  for (const r of rows.rows) {
    const ok = await bcrypt.compare(normalized, r.code);
    if (ok) {
      await pool.query(`UPDATE user_recovery_codes SET used=true, used_at=NOW() WHERE id=$1`, [r.id]);
      return true;
    }
  }
  return false;
}

/** 从未使用恢复码数量 */
export async function remainingRecoveryCodes(userId: number): Promise<number> {
  const r = await pool.query(`SELECT COUNT(*)::int AS c FROM user_recovery_codes WHERE user_id=$1 AND used=false`, [userId]);
  return r.rows[0]?.c ?? 0;
}

/** 信任设备判断：指纹在 30 天内有效则跳过 2FA */
export async function isDeviceTrusted(userId: number, fingerprint: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM session_trusted_devices WHERE user_id=$1 AND device_fingerprint=$2 AND trusted_until > NOW()`,
    [userId, fingerprint],
  );
  return (r.rows[0]?.c ?? 0) > 0;
}

/** 添加信任设备（30 天） */
export async function trustDevice(userId: number, fingerprint: string, days = 30) {
  await pool.query(
    `INSERT INTO session_trusted_devices (user_id, device_fingerprint, trusted_until)
     VALUES ($1,$2, NOW() + ($3 || ' days')::interval)
     ON CONFLICT DO NOTHING`,
    [userId, fingerprint, days],
  );
}

/** 检查 2FA 是否锁定 */
export async function isLocked(userId: number): Promise<Date | null> {
  const r = await pool.query(`SELECT two_factor_locked_until FROM users WHERE id=$1`, [userId]);
  const until = r.rows[0]?.two_factor_locked_until;
  if (!until) return null;
  return until > new Date() ? until : null;
}

/** 登录失败计数 + 触发锁定 */
export async function recordFailedAttempt(userId: number): Promise<{ lockedUntil: Date | null }> {
  const r = await pool.query(`UPDATE users SET two_factor_failed_attempts = COALESCE(two_factor_failed_attempts,0) + 1 WHERE id=$1 RETURNING two_factor_failed_attempts`, [userId]);
  const attempts = r.rows[0]?.two_factor_failed_attempts ?? 0;
  if (attempts >= 5) {
    const until = new Date(Date.now() + 15 * 60 * 1000);
    await pool.query(`UPDATE users SET two_factor_failed_attempts=0, two_factor_locked_until=$2 WHERE id=$1`, [userId, until]);
    return { lockedUntil: until };
  }
  return { lockedUntil: null };
}
