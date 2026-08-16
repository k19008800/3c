/**
 * TOTP 服务 — RFC 6238 一次性密码（HMAC-SHA1 + base32 secret，30s 周期，6 位数字）
 *
 * 零依赖实现（node:crypto），不引入 otplib/speakeasy：
 * - generateSecret: 20 字节 CSPRNG → base32 编码
 * - generateTOTP / verifyTOTP: 标准 TOTP，verify 支持 ±window 时间窗口容差（默认 ±1）
 * - generateBackupCodes / verifyBackupCode: 备用码明文 + bcrypt 哈希
 * - otpauthURL: 标准 otpauth:// 链接（供 Authenticator 扫码）
 *
 * @see kb/3cloud/tech-architecture.md §3.1 user_2fa
 * @module services/auth
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/** RFC 4648 base32 字母表（大写 + 2-7） */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const DEFAULT_BACKUP_CODE_COUNT = 10;

/** 备用码字符集：去除易混淆的 0/O/1/I */
const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BACKUP_CODE_GROUPS = 3;
const BACKUP_CODE_GROUP_LENGTH = 4; // 格式 XXXX-XXXX-XXXX

/**
 * 字节数组 → base32 字符串（无填充）。
 *
 * 实现要点：每 5 bit 映射一个字符，末位不足 5 bit 时补零。
 */
function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * base32 字符串 → 字节数组（容忍大小写与缺失的填充符）。
 */
function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/g, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue; // 忽略非法字符，容错输入
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 常量时间比较，防时序攻击（长度不同直接短路） */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 生成随机 base32 TOTP secret。
 *
 * @param byteLength - 随机字节数，默认 20（160 bit，RFC 4226 推荐最小长度）
 * @returns base32 字符串（20 字节 → 32 字符）
 *
 * @example
 * ```ts
 * const secret = generateSecret(); // e.g. 'JBSWY3DPEHPK3PXPMEQ7H7GX7K'
 * ```
 */
export function generateSecret(byteLength = 20): string {
  return base32Encode(crypto.randomBytes(byteLength));
}

/**
 * RFC 6238 核心：由 counter 计算 6 位 TOTP。
 *
 * 算法：HMAC-SHA1(secret, 8 字节大端 counter) → 动态截断 → mod 10^6。
 */
function totpFromCounter(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
}

/**
 * 生成指定时间窗口的 6 位 TOTP 验证码。
 *
 * @param secret - base32 secret
 * @param options.window - 相对当前 30s 窗口的偏移（0=当前，1=下一个，-1=上一个）
 * @returns 6 位数字字符串
 *
 * @example
 * ```ts
 * const code = generateTOTP(secret);              // 当前验证码
 * const prev = generateTOTP(secret, { window: -1 }); // 上一窗口验证码
 * ```
 */
export function generateTOTP(secret: string, options: { window?: number } = {}): string {
  const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS) + (options.window ?? 0);
  return totpFromCounter(secret, counter);
}

/**
 * 校验 TOTP 验证码，允许前后各 window 个时间窗口的容差（默认 ±1，覆盖网络延迟）。
 *
 * @param secret - base32 secret
 * @param token - 用户输入的 6 位验证码
 * @param options.window - 容差窗口数，默认 1
 * @returns true = 校验通过
 *
 * @example
 * ```ts
 * verifyTOTP(secret, code);              // 校验当前 ±1 窗口
 * verifyTOTP(secret, code, { window: 0 }); // 只校验当前窗口
 * ```
 */
export function verifyTOTP(secret: string, token: string, options: { window?: number } = {}): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const window = options.window ?? 1;
  for (let w = -window; w <= window; w++) {
    if (safeEqual(generateTOTP(secret, { window: w }), token)) return true;
  }
  return false;
}

/**
 * 备用码规范化：去分隔符 + 转大写。
 *
 * 用户输入 `abcd-efgh-ijkl` 与 `ABCDEFGHIJKL` 视为同一码。
 */
export function normalizeBackupCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** 规范化码 → 展示格式 XXXX-XXXX-XXXX */
function formatBackupCode(canonical: string): string {
  const groups: string[] = [];
  for (let i = 0; i < BACKUP_CODE_GROUPS; i++) {
    groups.push(canonical.slice(i * BACKUP_CODE_GROUP_LENGTH, (i + 1) * BACKUP_CODE_GROUP_LENGTH));
  }
  return groups.join('-');
}

/**
 * 生成 count 个随机备用码。
 *
 * @param count - 数量，默认 10
 * @returns { codes, hashes } — codes 为明文展示格式（仅此一次可见），
 *          hashes 为对应 bcrypt 哈希（存入 user_2fa.backup_codes）
 *
 * @example
 * ```ts
 * const { codes, hashes } = generateBackupCodes(); // 10 个明文 + 10 个哈希
 * ```
 */
export function generateBackupCodes(count = DEFAULT_BACKUP_CODE_COUNT): { codes: string[]; hashes: string[] } {
  const codes: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i++) {
    let canonical = '';
    for (let j = 0; j < BACKUP_CODE_GROUPS * BACKUP_CODE_GROUP_LENGTH; j++) {
      canonical += BACKUP_CODE_ALPHABET[crypto.randomInt(BACKUP_CODE_ALPHABET.length)];
    }
    codes.push(formatBackupCode(canonical));
    hashes.push(bcrypt.hashSync(canonical, 10));
  }
  return { codes, hashes };
}

/**
 * 校验单个备用码（bcrypt 比对）。
 *
 * @param hash - 存储的 bcrypt 哈希
 * @param code - 用户输入的备用码（自动规范化）
 * @returns true = 匹配
 *
 * @example
 * ```ts
 * if (await verifyBackupCode(hash, 'ABCD-EFGH-IJKL')) { /* 通过 *​/ }
 * ```
 */
export async function verifyBackupCode(hash: string, code: string): Promise<boolean> {
  return bcrypt.compare(normalizeBackupCode(code), hash);
}

/**
 * 生成 otpauth:// 链接（供 Authenticator 扫码/手动录入）。
 *
 * @param secret - base32 secret
 * @param email - 账户邮箱（作为 label 的一部分）
 * @returns 形如 otpauth://totp/3cloud:user@example.com?secret=...&issuer=3cloud
 *
 * @example
 * ```ts
 * const url = otpauthURL(secret, 'user@example.com');
 * ```
 */
export function otpauthURL(secret: string, email: string): string {
  // label 格式 issuer:account（冒号保留字面量，只对 account 做 URL 编码）
  return `otpauth://totp/3cloud:${encodeURIComponent(email)}?secret=${secret}&issuer=3cloud`;
}
