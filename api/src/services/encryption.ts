// ============================================================
//  3cloud (3C) — AES-256-GCM 加密/解密
//  用于存储上游厂商 API Key
//  配置：VENDOR_KEY_ENCRYPTION_KEY（32 字节 hex 字符串）
//  存储格式：base64(iv) : base64(authTag) : base64(ciphertext)
// ============================================================

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../config.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;  // GCM 推荐 12 字节
const AUTH_TAG_LENGTH = 16;
const KEY_ENCODING: BufferEncoding = "hex";

// PERF: 缓存 key Buffer，启动后不再变化，避免每次加解密都重新转换
let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey; // PERF: 缓存命中直接返回
  const keyHex = config.vendorKeyEncryption.key;
  if (!keyHex) {
    throw new Error("VENDOR_KEY_ENCRYPTION_KEY 未配置");
  }
  cachedKey = Buffer.from(keyHex, KEY_ENCODING);
  return cachedKey;
}

/**
 * 加密明文 API Key
 * 返回: "base64(iv):base64(authTag):base64(ciphertext)"
 */
export function encryptApiKey(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * 解密密文 API Key
 * 输入: "base64(iv):base64(authTag):base64(ciphertext)"
 * 返回: 原始明文
 *
 * PERF: 对高频使用的 vendor key（如 proxy 路由热路径）
 * 可添加 5 分钟 TTL 内存缓存避免重复 AES 解密：
 *   const decryptCache = new Map<string, { value: string; expiresAt: number }>();
 *   if (cache.has(encrypted) && cache.get(encrypted)!.expiresAt > Date.now()) return cache.get(encrypted)!.value;
 */
export function decryptApiKey(encrypted: string): string {
  const key = getKey();
  const parts = encrypted.split(":");

  if (parts.length !== 3) {
    throw new Error("加密数据格式错误");
  }

  const iv = Buffer.from(parts[0], "base64");
  const authTag = Buffer.from(parts[1], "base64");
  const ciphertext = parts[2];

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
