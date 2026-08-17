/**
 * 数据导出文件服务 — 按 data_scope 聚合用户数据并生成 JSON 导出文件（P2-4）
 *
 * 职责：
 * - 导出目录管理（api/exports/，已加入 .gitignore）
 * - 按 scope 聚合：all / consumption / apikeys / profile
 * - 生成 data-export-<id>-<ts>.json，返回相对路径供 data_requests.file_path 落库
 *
 * 敏感字段策略：导出文件不包含 password_hash / key_hash / 证件号等认证凭据
 * （api_keys 只导出前缀与状态，profile 只导出公开资料）。
 *
 * @module services/compliance
 * @see docs/iteration-plan-v2.md P2-4
 * @see docs/SPEC-§4-管理后台.md 数据生命周期管理
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { resolve, basename } from 'path';
import { db, schema } from '../../db';
import { eq, desc } from 'drizzle-orm';
import { getBalance } from '../billing/balance';

/** 导出文件目录（api/exports/），相对仓库根路径（ESM 下用 import.meta.dirname，Node ≥20.11） */
export const EXPORT_DIR = resolve(import.meta.dirname, '../../../exports');

/** 消费记录导出上限（防止超大文件；超出部分截断并在文件内标注） */
const MAX_CONSUMPTION_RECORDS = 20_000;

/**
 * 确保导出目录存在（幂等）。
 */
export function ensureExportDir(): void {
  mkdirSync(EXPORT_DIR, { recursive: true });
}

/**
 * 判断导出文件是否仍存在磁盘上。
 *
 * @param filePath - DB 中存的相对路径（exports/xxx.json）或绝对路径
 * @returns true = 文件存在
 */
export function exportFileExists(filePath: string | null): boolean {
  if (!filePath) return false;
  // 只取 basename，防止路径穿越
  return existsSync(resolve(EXPORT_DIR, basename(filePath)));
}

/**
 * 聚合用户数据（按 data_scope）。
 *
 * @param userId - 目标用户
 * @param scope - 导出范围：'all' | 'consumption' | 'apikeys' | 'profile'
 * @returns 聚合后的可序列化对象
 * @throws {Error} 未知 scope
 */
export async function gatherUserData(
  userId: number,
  scope: string,
): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = { userId, scope, generatedAt: new Date().toISOString() };

  if (scope === 'all' || scope === 'profile') {
    const [user] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        role: schema.users.role,
        status: schema.users.status,
        customerType: schema.users.customerType,
        realNameStatus: schema.users.realNameStatus,
        isContract: schema.users.isContract,
        phone: schema.users.phone,
        emailVerified: schema.users.emailVerified,
        lastLoginAt: schema.users.lastLoginAt,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    const balance = await getBalance(userId);
    data.profile = user
      ? { ...user, balance: { availableBalance: balance.availableBalance, frozenBalance: balance.frozenBalance, totalBalance: balance.totalBalance, currency: balance.currency } }
      : null;
  }

  if (scope === 'all' || scope === 'apikeys') {
    const keys = await db
      .select({
        id: schema.apiKeys.id,
        name: schema.apiKeys.name,
        keyPrefix: schema.apiKeys.keyPrefix,
        status: schema.apiKeys.status,
        rateLimitPerMinute: schema.apiKeys.rateLimitPerMinute,
        lastUsedAt: schema.apiKeys.lastUsedAt,
        expiresAt: schema.apiKeys.expiresAt,
        createdAt: schema.apiKeys.createdAt,
      })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.userId, userId))
      .orderBy(desc(schema.apiKeys.createdAt));
    // keyHash 为认证凭据，导出时剔除
    data.apiKeys = keys;
  }

  if (scope === 'all' || scope === 'consumption') {
    const records = await db
      .select({
        id: schema.consumptionRecords.id,
        requestId: schema.consumptionRecords.requestId,
        model: schema.consumptionRecords.model,
        supplierId: schema.consumptionRecords.supplierId,
        inputTokens: schema.consumptionRecords.inputTokens,
        outputTokens: schema.consumptionRecords.outputTokens,
        totalTokens: schema.consumptionRecords.totalTokens,
        cost: schema.consumptionRecords.cost,
        currency: schema.consumptionRecords.currency,
        streamed: schema.consumptionRecords.streamed,
        fallback: schema.consumptionRecords.fallback,
        finishReason: schema.consumptionRecords.finishReason,
        errorCode: schema.consumptionRecords.errorCode,
        createdAt: schema.consumptionRecords.createdAt,
      })
      .from(schema.consumptionRecords)
      .where(eq(schema.consumptionRecords.userId, userId))
      .orderBy(desc(schema.consumptionRecords.createdAt))
      .limit(MAX_CONSUMPTION_RECORDS);
    data.consumptionRecords = records;
    if (records.length >= MAX_CONSUMPTION_RECORDS) {
      data.truncated = `consumption records limited to ${MAX_CONSUMPTION_RECORDS}`;
    }
  }

  return data;
}

/**
 * 生成导出 JSON 文件并落盘。
 *
 * @param requestId - data_requests.id（文件名组成部分）
 * @param data - 聚合数据
 * @returns 相对路径（exports/data-export-<id>-<ts>.json），供 file_path 落库
 */
export function writeExportFile(requestId: number, data: Record<string, unknown>): string {
  ensureExportDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `data-export-${requestId}-${ts}.json`;
  writeFileSync(resolve(EXPORT_DIR, fileName), JSON.stringify(data, null, 2), 'utf8');
  return `exports/${fileName}`;
}

/**
 * 由 DB 相对路径解析绝对路径（basename 防路径穿越）。
 *
 * @param filePath - DB 中存的相对路径
 * @returns 绝对路径
 */
export function resolveExportPath(filePath: string): string {
  return resolve(EXPORT_DIR, basename(filePath));
}
