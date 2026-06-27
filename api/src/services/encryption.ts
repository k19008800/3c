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

function getKey(): Buffer {
  const keyHex = config.vendorKeyEncryption.key;
  if (!keyHex) {
    throw new Error("VENDOR_KEY_ENCRYPTION_KEY 未配置");
  }
  return Buffer.from(keyHex, KEY_ENCODING);
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
