// ============================================================
//  API Key Auth — 类型定义
// ============================================================

import type { ApiKeyPermissions } from "../../db/schema.js";

/**
 * API Key 权限验证结果
 */
export interface ApiKeyAuthResult {
  isValid: boolean;
  message?: string;
  keyId?: number;
  userId?: number;
  permissions?: ApiKeyPermissions;
  dailyUsage?: number;
  monthlyUsage?: number;
}
