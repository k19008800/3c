/**
 * 上游路由选择器 — 为指定模型选择最优 supplier + key 组合
 *
 * 算法流程（参照 New API channel_select.go）：
 *   1. 查 vendorPricing 表 → 找到该 model 的所有供应商模型
 *   2. 查 supplierModels 表 → 按 priority 排序
 *   3. 对每个候选供应商，用 selectKey 选 key
 *   4. 检查电路熔断状态：status='open' → 跳过该 key
 *   5. 渠道分组供给过滤：supplier.allowedGroups 非空且与调用方分组无交集 → 跳过
 *   6. 返回第一个可用组合
 *   7. 全部不可用 → 返回 null
 *
 * @see newapi-migration-guide.md §1.4 多 Key 轮询 + §1.5 自动熔断
 * @see newapi-gap-analysis.md Batch 4 遗留「渠道分组供给（allowedGroups）」
 * @module services/upstream
 */

import { db, schema } from '../../db';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { selectKey, type SupplierKey as SelectableKey } from './key-selector';
import { isCircuitOpen } from './circuit-breaker';
import { getUserGroup } from '../groups';

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
  /** 渠道分组供给：该渠道可服务的用户分组名数组（空 = 不限） */
  allowedGroups: string[];
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

/** selectChannel 选项：二选一（groups 优先），都不传 = 不做分组供给过滤（兼容旧行为） */
export interface SelectChannelOptions {
  /** 调用方用户所属分组名列表（显式传入，跳过用户分组解析） */
  groups?: string[];
  /** 调用方用户 ID；未显式传 groups 时内部解析用户分组（Redis 缓存 300s） */
  userId?: number;
}

// ============================================================
// 分组供给工具（纯函数，便于单元测试）
// ============================================================

/**
 * 判断渠道是否服务给定分组（渠道分组供给过滤核心规则）
 *
 * 规则（与 New API 渠道分组一致）：
 * - userGroups 为 undefined（调用方不限制分组）→ 放行
 * - allowedGroups 为空/null（渠道不限分组）→ 放行
 * - 否则要求两组有交集（任一用户分组命中渠道供给列表）
 *
 * @param allowedGroups - 渠道配置的分组供给列表（suppliers.allowed_groups）
 * @param userGroups - 调用方所属分组名列表；undefined = 不限制
 * @returns true = 该渠道可服务此调用方
 *
 * @example
 * ```ts
 * channelServesGroups(['vip'], ['vip'])          // → true
 * channelServesGroups(['vip'], ['default'])      // → false
 * channelServesGroups([], ['vip'])               // → true（渠道不限分组）
 * channelServesGroups(['vip'], undefined)        // → true（调用方不限分组）
 * ```
 */
export function channelServesGroups(
  allowedGroups: string[] | null | undefined,
  userGroups: string[] | undefined,
): boolean {
  if (userGroups === undefined) return true;
  const allowed = Array.isArray(allowedGroups) ? allowedGroups.filter(Boolean) : [];
  if (allowed.length === 0) return true;
  return allowed.some((g) => userGroups.includes(g));
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
 * 5. 渠道分组供给过滤：供应商 allowed_groups 非空且与 opts.groups / 用户分组无交集 → 跳过
 * 6. 返回第一个可用组合
 *
 * @param model - 用户请求的模型名（如 "gpt-4o"、"deepseek-chat"）
 * @param opts - 分组供给选项：{ groups } 显式传分组名；{ userId } 内部解析用户分组；
 *   都不传 = 不做分组过滤（与旧行为一致，供系统内部/测试调用）
 * @returns 选择结果，无可供应时返回 null
 *
 * @example
 * ```ts
 * const channel = await selectChannel('deepseek-chat', { userId: 42 });
 * if (!channel) throw new ChannelUnavailableError();
 * // channel.supplier.baseUrl + channel.key.keyValue → 发起上游请求
 * ```
 */
export async function selectChannel(model: string, opts?: SelectChannelOptions): Promise<SelectedChannel | null> {
  // 0. 解析生效分组名列表（显式 groups 优先；否则按 userId 解析用户分组）
  let userGroups: string[] | undefined = opts?.groups;
  if (userGroups === undefined && opts?.userId) {
    const group = await getUserGroup(opts.userId);
    userGroups = group ? [group.name] : undefined;
  }

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
      supplierAllowedGroups: schema.suppliers.allowedGroups,
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
      // 渠道分组供给：allowedGroups 非空且与调用方分组无交集 → 直接排除该渠道
      if (!channelServesGroups(row.supplierAllowedGroups, userGroups)) {
        continue;
      }
      supplierMap.set(row.supplierId, {
        supplier: {
          id: row.supplierId,
          name: row.supplierName,
          code: row.supplierCode,
          baseUrl: row.supplierBaseUrl,
          status: row.supplierStatus,
          healthStatus: row.supplierHealthStatus,
          allowedGroups: Array.isArray(row.supplierAllowedGroups) ? row.supplierAllowedGroups : [],
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

// ============================================================
// 任务型渠道选择（Midjourney / Suno 等，请求体不含模型名）
// ============================================================

/**
 * 为任务型渠道（apiType = midjourney / suno）选择 supplier + key 组合
 *
 * 与 selectChannel 的差异：任务 API（/mj/submit、/suno/submit 等）请求体不含
 * 模型名，只能按渠道类型（suppliers.api_type）选择；modelMapping 取该供应商首个
 * active 模型（仅供记账关联 supplier_model_id，不参与上游 URL 构造）。
 *
 * 算法流程：
 *   1. 查 suppliers 表 apiType = type 且 status = 'active'
 *   2. 渠道分组供给过滤（allowedGroups，规则同 selectChannel）
 *   3. 对每个候选供应商取 active keys，按 priority 降序，跳过熔断的 key
 *   4. 返回第一个可用组合；全部不可用 → null
 *
 * @param apiType - 供应商 apiType（如 'midjourney' / 'suno'）
 * @param opts - 分组供给选项（同 selectChannel：{ groups } 或 { userId }）
 * @returns 选择结果（modelMapping 可能为占位空模型），无可供应时返回 null
 *
 * @example
 * ```ts
 * const channel = await selectTaskChannel('midjourney', { userId: 42 });
 * if (channel) await fetch(`${channel.supplier.baseUrl}/mj/submit/imagine`, ...);
 * ```
 */
export async function selectTaskChannel(
  apiType: string,
  opts?: SelectChannelOptions,
): Promise<SelectedChannel | null> {
  // 0. 解析生效分组名列表（同 selectChannel）
  let userGroups: string[] | undefined = opts?.groups;
  if (userGroups === undefined && opts?.userId) {
    const group = await getUserGroup(opts.userId);
    userGroups = group ? [group.name] : undefined;
  }

  // 1. 查候选供应商（任务型渠道按 apiType 匹配）
  const suppliers = await db
    .select({
      id: schema.suppliers.id,
      name: schema.suppliers.name,
      code: schema.suppliers.code,
      baseUrl: schema.suppliers.baseUrl,
      allowedGroups: schema.suppliers.allowedGroups,
      status: schema.suppliers.status,
      healthStatus: schema.suppliers.healthStatus,
    })
    .from(schema.suppliers)
    .where(and(
      eq(schema.suppliers.apiType, apiType),
      eq(schema.suppliers.status, 'active'),
    ))
    .orderBy(asc(schema.suppliers.id));

  // 2-4. 依次尝试每个供应商
  for (const sup of suppliers) {
    // 渠道分组供给：allowedGroups 非空且与调用方分组无交集 → 跳过
    if (!channelServesGroups(sup.allowedGroups, userGroups)) continue;

    // 取 active keys，按 priority 降序
    const keys = await db
      .select({
        id: schema.supplierKeys.id,
        supplierId: schema.supplierKeys.supplierId,
        keyValue: schema.supplierKeys.keyValue,
        name: schema.supplierKeys.name,
        status: schema.supplierKeys.status,
        selectMode: schema.supplierKeys.selectMode,
        priority: schema.supplierKeys.priority,
        currentBalance: schema.supplierKeys.currentBalance,
      })
      .from(schema.supplierKeys)
      .where(and(
        eq(schema.supplierKeys.supplierId, sup.id),
        eq(schema.supplierKeys.status, 'active'),
      ))
      .orderBy(desc(schema.supplierKeys.priority));

    if (keys.length === 0) continue;

    // 选第一个未熔断的 key
    let selectedKey: (typeof keys)[number] | null = null;
    for (const k of keys) {
      const cbKey = `supplier:${sup.id}:key:${k.id}`;
      if (await isCircuitOpen(cbKey)) continue;
      selectedKey = k;
      break;
    }
    if (!selectedKey) continue;

    // 取该供应商首个 active 模型作为 modelMapping（记账关联用；无模型时用占位）
    const [model] = await db
      .select({
        id: schema.supplierModels.id,
        modelName: schema.supplierModels.modelName,
        platformModel: schema.supplierModels.platformModel,
        status: schema.supplierModels.status,
      })
      .from(schema.supplierModels)
      .where(and(
        eq(schema.supplierModels.supplierId, sup.id),
        eq(schema.supplierModels.status, 'active'),
      ))
      .limit(1);

    return {
      supplier: {
        id: sup.id,
        name: sup.name,
        code: sup.code,
        baseUrl: sup.baseUrl,
        status: sup.status,
        healthStatus: sup.healthStatus,
        allowedGroups: Array.isArray(sup.allowedGroups) ? sup.allowedGroups : [],
      },
      key: {
        id: selectedKey.id,
        supplierId: selectedKey.supplierId,
        keyValue: selectedKey.keyValue,
        name: selectedKey.name,
        status: selectedKey.status,
        selectMode: selectedKey.selectMode,
        priority: selectedKey.priority,
        currentBalance: selectedKey.currentBalance,
      },
      modelMapping: model
        ? { id: model.id, supplierId: sup.id, modelName: model.modelName, platformModel: model.platformModel, status: model.status }
        : { id: 0, supplierId: sup.id, modelName: '', platformModel: '', status: 'active' },
    };
  }

  return null;
}
