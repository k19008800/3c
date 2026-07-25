// ============================================================
//  3cloud (3C) — API Key 权限验证服务
//  负责验证 API Key 的权限、额度、时间限制等
// ============================================================

import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { apiKeys, type ApiKeyPermissions } from "../db/schema.js";
import { isIpAllowed } from "../schemas/api-keys.js";

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

/**
 * API Key 验证服务
 */
export class ApiKeyAuthService {
  /**
   * 验证 API Key 的权限
   */
  async validateApiKey(
    keyHash: string,
    clientIp: string,
    modelName?: string,
    endpoint?: string,
    cost?: number
  ): Promise<ApiKeyAuthResult> {
    const db = getDb();

    // 1. 查找 API Key
    const [key] = await db
      .select({
        id: apiKeys.id,
        userId: apiKeys.userId,
        status: apiKeys.status,
        expiresAt: apiKeys.expiresAt,
        permissions: apiKeys.permissions,
        quotaBalance: apiKeys.quotaBalance,
        dailyUsage: apiKeys.dailyUsage,
        monthlyUsage: apiKeys.monthlyUsage,
        lastResetDaily: apiKeys.lastResetDaily,
        lastResetMonthly: apiKeys.lastResetMonthly,
      })
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);

    if (!key) {
      return { isValid: false, message: "API Key 不存在" };
    }

    if (!key.status) {
      return { isValid: false, message: "API Key 已禁用" };
    }

    if (key.expiresAt && key.expiresAt < new Date()) {
      return { isValid: false, message: "API Key 已过期" };
    }

    // 2. 验证基本权限
    const permissions = key.permissions as ApiKeyPermissions | undefined;
    const validationResult = this.validatePermissions(
      permissions,
      clientIp,
      modelName,
      endpoint,
      cost,
      key.dailyUsage ?? 0,
      key.monthlyUsage ?? 0
    );

    if (!validationResult.isValid) {
      return {
        isValid: false,
        message: validationResult.message,
        keyId: key.id,
        userId: key.userId,
        permissions,
        dailyUsage: Number(key.dailyUsage) || 0,
        monthlyUsage: Number(key.monthlyUsage) || 0,
      };
    }

    // 3. 验证额度限制
    if (key.quotaBalance !== null) {
      const quotaBalance = Number(key.quotaBalance);
      if (cost !== undefined && cost > quotaBalance) {
        return {
          isValid: false,
          message: `额度不足，剩余额度: ${quotaBalance.toFixed(2)}元，本次请求需要: ${cost.toFixed(2)}元`,
          keyId: key.id,
          userId: key.userId,
          permissions,
          dailyUsage: Number(key.dailyUsage) || 0,
          monthlyUsage: Number(key.monthlyUsage) || 0,
        };
      }
    }

    // 4. 重置每日/每月使用统计（如果需要）
    await this.resetUsageStatsIfNeeded(key.id, key.lastResetDaily, key.lastResetMonthly);

    return {
      isValid: true,
      keyId: key.id,
      userId: key.userId,
      permissions,
      dailyUsage: Number(key.dailyUsage) || 0,
      monthlyUsage: Number(key.monthlyUsage) || 0,
    };
  }

  /**
   * 验证权限配置
   */
  private validatePermissions(
    permissions: ApiKeyPermissions | undefined,
    clientIp: string,
    modelName?: string,
    endpoint?: string,
    cost?: number,
    dailyUsage: number = 0,
    monthlyUsage: number = 0
  ): { isValid: boolean; message?: string } {
    if (!permissions) {
      return { isValid: true };
    }

    // 1. IP 白名单验证
    if (permissions.ipWhitelist && permissions.ipWhitelist.length > 0) {
      if (!isIpAllowed(clientIp, permissions.ipWhitelist)) {
        return {
          isValid: false,
          message: `IP ${clientIp} 不在白名单中`,
        };
      }
    }

    // 2. IP 黑名单验证
    if (permissions.ipBlacklist && permissions.ipBlacklist.length > 0) {
      if (isIpAllowed(clientIp, permissions.ipBlacklist)) {
        return {
          isValid: false,
          message: `IP ${clientIp} 在黑名单中`,
        };
      }
    }

    // 3. 模型权限验证
    if (permissions.requireModelCheck !== false && 
        permissions.allowedModels && 
        permissions.allowedModels.length > 0 &&
        modelName) {
      if (!permissions.allowedModels.includes(modelName)) {
        return {
          isValid: false,
          message: `模型 ${modelName} 不在允许的模型列表中`,
        };
      }
    }

    // 4. 端点权限验证
    if (permissions.allowedEndpoints && permissions.allowedEndpoints.length > 0 && endpoint) {
      const normalizedEndpoint = endpoint.split('?')[0]; // 移除查询参数
      if (!permissions.allowedEndpoints.some(allowed => 
        normalizedEndpoint.startsWith(allowed)
      )) {
        return {
          isValid: false,
          message: `端点 ${endpoint} 不在允许的端点列表中`,
        };
      }
    }

    // 5. 时间段限制验证
    if (permissions.timeRestrictions) {
      const now = new Date();
      const hour = now.getHours();
      const weekday = now.getDay(); // 0=周日

      const { startHour, endHour, weekdays } = permissions.timeRestrictions;

      if (weekdays && weekdays.length > 0) {
        if (!weekdays.includes(weekday)) {
          return {
            isValid: false,
            message: `当前是星期${weekday}，不在允许的星期范围内`,
          };
        }
      }

      if (startHour !== undefined && endHour !== undefined) {
        if (hour < startHour || hour >= endHour) {
          return {
            isValid: false,
            message: `当前时间 ${hour}:00 不在允许的时间段 ${startHour}:00-${endHour}:00`,
          };
        }
      }
    }

    // 6. 额度限制验证
    if (permissions.quotaRestrictions && cost !== undefined) {
      const { dailyLimit, monthlyLimit, perRequestLimit } = permissions.quotaRestrictions;

      if (perRequestLimit !== undefined && cost > perRequestLimit) {
        return {
          isValid: false,
          message: `单次请求额度 ${cost} 超过限制 ${perRequestLimit}`,
        };
      }

      if (dailyLimit !== undefined && (dailyUsage + cost) > dailyLimit) {
        return {
          isValid: false,
          message: `今日额度 ${dailyUsage + cost} 超过每日限制 ${dailyLimit}`,
        };
      }

      if (monthlyLimit !== undefined && (monthlyUsage + cost) > monthlyLimit) {
        return {
          isValid: false,
          message: `本月额度 ${monthlyUsage + cost} 超过每月限制 ${monthlyLimit}`,
        };
      }
    }

    return { isValid: true };
  }

  /**
   * 更新 API Key 使用统计
   */
  async updateUsageStats(
    keyId: number,
    cost: number,
    tokens: number,
    success: boolean = true
  ): Promise<void> {
    const db = getDb();
    const now = new Date();

    // 更新每日/每月使用量
    await db
      .update(apiKeys)
      .set({
        dailyUsage: sql`${apiKeys.dailyUsage} + ${cost}`,
        monthlyUsage: sql`${apiKeys.monthlyUsage} + ${cost}`,
      })
      .where(eq(apiKeys.id, keyId))
      .execute();

    // 更新额度余额（如果有）
    if (cost > 0) {
      await db
        .update(apiKeys)
        .set({
          quotaBalance: sql`${apiKeys.quotaBalance} - ${cost}`,
        })
        .where(eq(apiKeys.id, keyId))
        .execute();
    }

    // 记录到使用统计表
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [existingStat] = await db
      .select({ id: apiKeyUsageStats.id })
      .from(apiKeyUsageStats)
      .where(
        and(
          eq(apiKeyUsageStats.apiKeyId, keyId),
          eq(apiKeyUsageStats.date, today)
        )
      )
      .limit(1);

    if (existingStat) {
      await db
        .update(apiKeyUsageStats)
        .set({
          calls: sql`${apiKeyUsageStats.calls} + 1`,
          tokens: sql`${apiKeyUsageStats.tokens} + ${tokens}`,
          cost: sql`${apiKeyUsageStats.cost} + ${cost}`,
        })
        .where(eq(apiKeyUsageStats.id, existingStat.id))
        .execute();
    } else {
      await db
        .insert(apiKeyUsageStats)
        .values({
          apiKeyId: keyId,
          date: today,
          calls: 1,
          tokens: tokens,
          cost: cost,
        })
        .execute();
    }
  }

  /**
   * 重置每日/每月使用统计（如果需要）
   */
  private async resetUsageStatsIfNeeded(
    keyId: number,
    lastResetDaily?: Date | null,
    lastResetMonthly?: Date | null
  ): Promise<void> {
    const db = getDb();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 重置每日统计
    if (!lastResetDaily || lastResetDaily < today) {
      await db
        .update(apiKeys)
        .set({
          dailyUsage: 0,
          lastResetDaily: today,
        })
        .where(eq(apiKeys.id, keyId))
        .execute();
    }

    // 重置每月统计
    if (!lastResetMonthly || lastResetMonthly < firstDayOfMonth) {
      await db
        .update(apiKeys)
        .set({
          monthlyUsage: 0,
          lastResetMonthly: firstDayOfMonth,
        })
        .where(eq(apiKeys.id, keyId))
        .execute();
    }
  }

  /**
   * 检查 API Key 的可用额度
   */
  async checkQuota(keyId: number, cost: number): Promise<{ hasQuota: boolean; remaining?: number }> {
    const db = getDb();

    const [key] = await db
      .select({
        quotaBalance: apiKeys.quotaBalance,
        dailyUsage: apiKeys.dailyUsage,
        monthlyUsage: apiKeys.monthlyUsage,
        permissions: apiKeys.permissions,
      })
      .from(apiKeys)
      .where(eq(apiKeys.id, keyId))
      .limit(1);

    if (!key) {
      return { hasQuota: false };
    }

    // 检查独立额度
    if (key.quotaBalance !== null) {
      const quotaBalance = Number(key.quotaBalance);
      if (cost > quotaBalance) {
        return { hasQuota: false, remaining: quotaBalance };
      }
    }

    // 检查权限配置中的额度限制
    const permissions = key.permissions as ApiKeyPermissions | undefined;
    if (permissions?.quotaRestrictions) {
      const { dailyLimit, monthlyLimit, perRequestLimit } = permissions.quotaRestrictions;

      if (perRequestLimit !== undefined && cost > perRequestLimit) {
        return { hasQuota: false };
      }

      const dailyUsage = Number(key.dailyUsage) || 0;
      const monthlyUsage = Number(key.monthlyUsage) || 0;

      if (dailyLimit !== undefined && (dailyUsage + cost) > dailyLimit) {
        return { hasQuota: false, remaining: dailyLimit - dailyUsage };
      }

      if (monthlyLimit !== undefined && (monthlyUsage + cost) > monthlyLimit) {
        return { hasQuota: false, remaining: monthlyLimit - monthlyUsage };
      }
    }

    return { hasQuota: true };
  }
}