/**
 * 上游路由选择器 — 为指定模型选择最优 supplier + key 组合
 *
 * 算法流程（参照 New API channel_select.go）：
 *   1. 查 vendorPricing 表 → 找到该 model 的所有供应商模型
 *   2. 查 supplierModels 表 → 按 priority 排序
 *   3. 对每个候选供应商，用 selectKey 选 key
 *   4. 检查电路熔断状态：status='open' → 跳过该 key
 *   5. 返回第一个可用组合
 *   6. 全部不可用 → 返回 null
 *
 * @see newapi-migration-guide.md §1.4 多 Key 轮询 + §1.5 自动熔断
 * @module services/upstream
 */

import { db, schema } from '../../db';
import { eq, and, sql } from 'drizzle-orm';
import { selectKey, type SupplierKey as SelectableKey } from './key-selector';
import { isCircuitOpen } from './circuit-breaker';

// ============================================================
// 类型定义
// ============================================================

/** 供应商信息（精简） */
export interface Supplier {
  id: number;
  name: string;
  code: string;
  baseUrl: string;
  status: string;
  healthStatus: string | null;
}

/** 供应商模型映射 */
export interface SupplierModelMapping {
  id: number;
  supplierId: number;
  modelName: string;
  platformModel: string;
  status: string;
}

/** 选择结果 */
export interface SelectedChannel {
  supplier: Supplier;
  key: SelectableKey;
  modelMapping: SupplierModelMapping;
}

// ============================================================
// 公共 API
// ============================================================

/**
 * 为指定模型选择最优 supplier + key 组合
 *
 * 优先级策略：
 * 1. 通过 vendor_pricing 表找到所有提供该模型的供应商模型
 * 2. 按 supplier_keys.priority DESC 排序
 * 3. 依次尝试每个供应商模型，调用 selectKey 选 key
 * 4. 跳过熔断状态为 'open' 的 key
 * 5. 返回第一个可用组合
 *
 * @param model - 用户请求的模型名（如 "gpt-4o"、"deepseek-chat"）
 * @returns 选择结果，无可供应时返回 null
 *
 * @example
 * ```ts
 * const channel = await selectChannel('deepseek-chat');
 * if (!channel) throw new ChannelUnavailableError();
 * // channel.supplier.baseUrl + channel.key.keyValue → 发起上游请求
 * ```
 */
export async function selectChannel(model: string): Promise<SelectedChannel | null> {
  // 1. 查询 compatible model + active pricing
  const candidates = await db
    .select({
      supplierModelId: schema.vendorPricing.supplierModelId,
      modelName: schema.supplierModels.modelName,
      platformModel: schema.supplierModels.platformModel,
      supplierModelStatus: schema.supplierModels.status,
      supplierId: schema.suppliers.id,
      supplierName: schema.suppliers.name,
      supplierCode: schema.suppliers.code,
      supplierBaseUrl: schema.suppliers.baseUrl,
      supplierStatus: schema.suppliers.status,
      supplierHealthStatus: schema.suppliers.healthStatus,
      keyId: schema.supplierKeys.id,
      keyValue: schema.supplierKeys.keyValue,
      keyName: schema.supplierKeys.name,
      keyStatus: schema.supplierKeys.status,
      keySelectMode: schema.supplierKeys.selectMode,
      keyPriority: schema.supplierKeys.priority,
      keyCurrentBalance: schema.supplierKeys.currentBalance,
    })
    .from(schema.vendorPricing)
    .innerJoin(
      schema.supplierModels,
      eq(schema.vendorPricing.supplierModelId, schema.supplierModels.id),
    )
    .innerJoin(
      schema.suppliers,
      eq(schema.supplierModels.supplierId, schema.suppliers.id),
    )
    .innerJoin(
      schema.supplierKeys,
      eq(schema.supplierKeys.supplierId, schema.suppliers.id),
    )
    .where(
      and(
        eq(schema.supplierModels.modelName, model),
        eq(schema.supplierModels.status, 'active'),
        eq(schema.vendorPricing.status, 'active'),
        eq(schema.suppliers.status, 'active'),
      ),
    )
    .orderBy(sql`${schema.supplierKeys.priority} DESC NULLS LAST`);

  if (candidates.length === 0) {
    return null;
  }

  // 2. 按 supplierId 分组，每个 supplier 收集所有 keys
  const supplierMap = new Map<number, {
    supplier: Supplier;
    modelMapping: SupplierModelMapping;
    keys: SelectableKey[];
  }>();

  for (const row of candidates) {
    if (!supplierMap.has(row.supplierId)) {
      supplierMap.set(row.supplierId, {
        supplier: {
          id: row.supplierId,
          name: row.supplierName,
          code: row.supplierCode,
          baseUrl: row.supplierBaseUrl,
          status: row.supplierStatus,
          healthStatus: row.supplierHealthStatus,
        },
        modelMapping: {
          id: row.supplierModelId,
          supplierId: row.supplierId,
          modelName: row.modelName,
          platformModel: row.platformModel,
          status: row.supplierModelStatus,
        },
        keys: [],
      });
    }

    supplierMap.get(row.supplierId)!.keys.push({
      id: row.keyId,
      supplierId: row.supplierId,
      keyValue: row.keyValue,
      name: row.keyName,
      status: row.keyStatus,
      selectMode: row.keySelectMode,
      priority: row.keyPriority,
      currentBalance: row.keyCurrentBalance,
    });
  }

  // 3. 按 priority 排序 suppliers（取 keys 中最高 priority）
  const sortedSuppliers = Array.from(supplierMap.entries())
    .map(([, group]) => group)
    .sort((a, b) => {
      const aMaxPriority = Math.max(...a.keys.map((k) => k.priority ?? 0));
      const bMaxPriority = Math.max(...b.keys.map((k) => k.priority ?? 0));
      return bMaxPriority - aMaxPriority;
    });

  // 4. 对每个 supplier 尝试选 key，跳过熔断的 key
  for (const group of sortedSuppliers) {
    // 获取可用的 key（非 disabled）
    const availableKeys = group.keys.filter((k) => k.status === 'active');
    if (availableKeys.length === 0) continue;

    if (availableKeys.length === 1) {
      // 单个 key：检查是否熔断
      const key = availableKeys[0]!;
      const cbKey = `supplier:${group.supplier.id}:key:${key.id}`;
      if (await isCircuitOpen(cbKey)) continue;

      return {
        supplier: group.supplier,
        key,
        modelMapping: group.modelMapping,
      };
    }

    // 多个 key：用 selectKey 选择
    const mode = availableKeys[0]!.selectMode;
    const selected = selectKey(availableKeys, mode as 'single' | 'polling' | 'random', undefined);

    if (!selected) continue;

    // 检查该 key 是否熔断
    const cbKey = `supplier:${group.supplier.id}:key:${selected.key.id}`;
    if (await isCircuitOpen(cbKey)) {
      // 尝试下一个 key（排除已否的）
      const remaining = availableKeys.filter((_, i) => i !== selected.index);
      if (remaining.length === 0) continue;

      const retrySelected = selectKey(remaining, mode as 'single' | 'polling' | 'random', undefined);
      if (!retrySelected) continue;

      const cbKey2 = `supplier:${group.supplier.id}:key:${retrySelected.key.id}`;
      if (await isCircuitOpen(cbKey2)) continue;

      return {
        supplier: group.supplier,
        key: retrySelected.key,
        modelMapping: group.modelMapping,
      };
    }

    return {
      supplier: group.supplier,
      key: selected.key,
      modelMapping: group.modelMapping,
    };
  }

  return null;
}
