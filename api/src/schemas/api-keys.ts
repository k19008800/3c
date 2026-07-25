// ============================================================
//  3cloud (3C) — API Key Zod Schemas
// ============================================================

import { z } from "zod";

// ── 时间段限制 Schema ──
export const timeRestrictionSchema = z.object({
  startHour: z.number().int().min(0).max(23).optional(),
  endHour: z.number().int().min(0).max(23).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(), // 0=周日
}).optional().nullable();

// ── 额度限制 Schema ──
export const quotaRestrictionsSchema = z.object({
  dailyLimit: z.number().int().min(0).optional(), // 每日额度（分）
  monthlyLimit: z.number().int().min(0).optional(), // 每月额度（分）
  perRequestLimit: z.number().int().min(0).optional(), // 单次请求最大额度（分）
}).optional().nullable();

// ── 权限配置 Schema ──
export const apiKeyPermissionsSchema = z.object({
  allowedModels: z.array(z.string()).nullable().optional(),
  ipWhitelist: z.array(z.string().ip()).nullable().optional(),
  ipBlacklist: z.array(z.string().ip()).nullable().optional(),
  allowedEndpoints: z.array(z.string()).nullable().optional(),
  rateLimitPerMinute: z.number().int().min(1).max(10000).nullable().optional(),
  timeRestrictions: timeRestrictionSchema,
  quotaRestrictions: quotaRestrictionsSchema,
  requireModelCheck: z.boolean().nullable().optional(),
});
export type ApiKeyPermissionsInput = z.infer<typeof apiKeyPermissionsSchema>;

// ── API Key CRUD Schemas ──

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
  templateId: z.number().int().positive().optional(),
  permissions: apiKeyPermissionsSchema.optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export const createApiKeyResponse = z.object({
  id: z.number(),
  name: z.string(),
  key: z.string(), // 原始 Key，仅展示一次
  keyPrefix: z.string(),
  expiresAt: z.string().nullable(),
  templateId: z.number().nullable(),
  permissions: apiKeyPermissionsSchema.nullable(),
});

export const updateApiKeySchema = z.object({
  name: z.string().max(100).optional(),
  status: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  templateId: z.number().int().positive().nullable().optional(),
  permissions: apiKeyPermissionsSchema.nullable().optional(),
});
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;

// ── 权限模板 Schemas ──

export const createPermissionTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  permissions: apiKeyPermissionsSchema,
});
export type CreatePermissionTemplateInput = z.infer<typeof createPermissionTemplateSchema>;

export const updatePermissionTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  permissions: apiKeyPermissionsSchema.optional(),
});
export type UpdatePermissionTemplateInput = z.infer<typeof updatePermissionTemplateSchema>;

// ── IP 地址验证 ──

/**
 * 验证 IP 地址格式（支持 IPv4 和 CIDR）
 */
export function isValidIpOrCidr(value: string): boolean {
  // IPv4 正则
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  // CIDR 正则 (如 192.168.1.0/24)
  const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  
  if (ipv4Regex.test(value)) {
    const parts = value.split('.').map(Number);
    return parts.every(p => p >= 0 && p <= 255);
  }
  
  if (cidrRegex.test(value)) {
    const [ip, prefix] = value.split('/');
    const parts = ip.split('.').map(Number);
    const prefixNum = Number(prefix);
    return parts.every(p => p >= 0 && p <= 255) && prefixNum >= 0 && prefixNum <= 32;
  }
  
  return false;
}

/**
 * 检查 IP 是否匹配白名单（支持 CIDR）
 */
export function isIpAllowed(clientIp: string, whitelist: string[]): boolean {
  if (!whitelist || whitelist.length === 0) return true;
  
  for (const allowed of whitelist) {
    if (allowed === clientIp) return true;
    
    // CIDR 匹配
    if (allowed.includes('/')) {
      const [network, prefixStr] = allowed.split('/');
      const prefix = parseInt(prefixStr, 10);
      if (isIpInCidr(clientIp, network, prefix)) return true;
    }
  }
  
  return false;
}

function isIpInCidr(ip: string, network: string, prefix: number): boolean {
  const ipNum = ipToNumber(ip);
  const networkNum = ipToNumber(network);
  if (ipNum === null || networkNum === null) return false;
  
  const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
  return (ipNum & mask) === (networkNum & mask);
}

function ipToNumber(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}
