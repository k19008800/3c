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

import { db, schema } from '../../db/index.js';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { selectKey, type SupplierKey as SelectableKey } from './key-selector.js';
import { isCircuitOpen } from './circuit-breaker.js';
import { getUserGroup } from '../groups.js';
import {
  ModelCodeNotFoundError,
  ModelCodeUnavailableError,
  GroupForbiddenError,
} from './errors.js';

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

// ============================================================
// 模型编码解析辅助（纯编码、无自动、无兼容窗口 — M-S-04/05）
// ============================================================

/**
 * 模型编码进制校验 + 模型编码不存在检查（预扣前校验用，纯查询无副作用）
 *
 * 判定无效（抛 ModelCodeNotFoundError，404）：
 *   - modelCode 为空/空串
 *   - modelCode 含 '@'（旧 model@vendor 语义，明令禁止）
 *   - 数据库 `supplier_models.model_code` 无该编码
 * 判定分组排除（抛 GroupForbiddenError，403）：
 *   - 供应商 allowed_groups 非空且与调用方分组无交集
 *
 * @param modelCode - 用户传入的 model_code
 * @param userGroups - 调用方分组名数组；undefined = 不限制
 * @returns 匹配的 supplier_models 行（模型编码 + model_name + platform_model + supplier）
 */
export async function assertModelCodeAvailable(
  modelCode: string,
  userGroups?: string[],
): Promise<{
  row: { id: number; supplierId: number; modelName: string; platformModel: string; status: string; modelCode: string | null };
  supplier: Supplier;
}> {
  if (!modelCode || !modelCode.trim()) throw new ModelCodeNotFoundError(modelCode || '');
  if (modelCode.includes('@')) throw new ModelCodeNotFoundError(modelCode);

  const [row] = await db
    .select({
      id: schema.supplierModels.id,
      supplierId: schema.supplierModels.supplierId,
      modelName: schema.supplierModels.modelName,
      platformModel: schema.supplierModels.platformModel,
      status: schema.supplierModels.status,
      modelCode: schema.supplierModels.modelCode,
    })
    .from(schema.supplierModels)
    .innerJoin(schema.suppliers, eq(schema.supplierModels.supplierId, schema.suppliers.id))
    .where(and(
      eq(schema.supplierModels.modelCode, modelCode),
    ))
    .limit(1);

  if (!row) throw new ModelCodeNotFoundError(modelCode);

  const supplier: Supplier = {
    id: row.supplierId,
    name: '',
    code: '',
    baseUrl: '',
    status: 'active',
    healthStatus: null,
    allowedGroups: [],
  };
  const [supp] = await db
    .select({
      id: schema.suppliers.id,
      name: schema.suppliers.name,
      code: schema.suppliers.code,
      baseUrl: schema.suppliers.baseUrl,
      status: schema.suppliers.status,
      healthStatus: schema.suppliers.healthStatus,
      allowedGroups: schema.suppliers.allowedGroups,
    })
    .from(schema.suppliers)
    .where(eq(schema.suppliers.id, row.supplierId))
    .limit(1);
  if (supp) {
    supplier.id = supp.id;
    supplier.name = supp.name;
    supplier.code = supp.code;
    supplier.baseUrl = supp.baseUrl;
    supplier.status = supp.status;
    supplier.healthStatus = supp.healthStatus;
    supplier.allowedGroups = Array.isArray(supp.allowedGroups) ? supp.allowedGroups : [];
  }

  // 供应商/映射活性：非 active → 400 MODEL_CODE_UNAVAILABLE（预扣前拦截）
  if (supplier.status !== 'active' || row.status !== 'active') {
    throw new ModelCodeUnavailableError(modelCode, await listAvailableCodesForUser(userGroups));
  }

  // 分组供给过滤：allowed_groups 非空且与调用方分组无交集 → 403
  if (!channelServesGroups(supplier.allowedGroups, userGroups)) {
    throw new GroupForbiddenError(modelCode);
  }

  return { row, supplier };
}

/**
 * 模型编码预扣前校验（按 userId 解析分组）
 *
 * 供各主链 validate 步骤在预扣前调用：非空/不含 @/编码存在/供应商与映射 active/
 * 分组可用，任一不满足即抛 404/400/403，从而在预扣前拦截无效编码。
 *
 * @param modelCode - 用户传入的 model_code
 * @param userId - 调用方用户 ID；传则按用户分组校验
 */
export async function validateModelCode(modelCode: string, userId?: number): Promise<void> {
  let userGroups: string[] | undefined;
  if (userId) {
    const group = await getUserGroup(userId);
    userGroups = group ? [group.name] : undefined;
  }
  await assertModelCodeAvailable(modelCode, userGroups);
}

/**
 * 查某 supplier 的全部 active keys（按 priority 降序）
 *
 * 抽出为共享查询：selectChannel（选第一个未熔断）与 selectFailoverChannel
 * （跳过已尝试的 key 选下一个）复用同一候选集与排序口径，避免两处漂移。
 */
async function loadSupplierActiveKeys(supplierId: number) {
  return db
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
      eq(schema.supplierKeys.supplierId, supplierId),
      eq(schema.supplierKeys.status, 'active'),
    ))
    .orderBy(desc(schema.supplierKeys.priority));
}

/**
 * 「模型编码化改造」M-S-04/05：`model` 参数即 model_code，一对一锁定唯一
 * `supplier_models` + supplier；只在该 supplier 的 Key 池内选 Key，不得切换到
 * 其他供应商或其他编码。不再有"按 model_name 自动选第一个供应商"语义。
 *
 * 错误（沿用 errors.ts 模型编码错误）：
 *   - 编码不存在/空/含 @ → ModelCodeNotFoundError(404)
 *   - 分组排除 → GroupForbiddenError(403)
 *   - 供应商/编码停用或 Key 池不可用 → ModelCodeUnavailableError(400)
 *
 * @param modelCode - 用户请求的模型编码（API `model` 参数，须精确命中）
 * @param opts - 分组供给选项：{ groups } 显式传分组名；{ userId } 内部解析用户分组
 * @returns 选择结果（锁定供应商 + 模型映射 + key）
 */
export async function selectChannel(
  modelCode: string,
  opts?: SelectChannelOptions,
): Promise<SelectedChannel> {
  // 0. 解析生效分组名列表（显式 groups 优先；否则按 userId 解析用户分组）
  let userGroups: string[] | undefined = opts?.groups;
  if (userGroups === undefined && opts?.userId) {
    const group = await getUserGroup(opts.userId);
    userGroups = group ? [group.name] : undefined;
  }

  // 1. 模型编码精确校验（不存在/含 @ → 404；分组排除 → 403）
  const { row, supplier } = await assertModelCodeAvailable(modelCode, userGroups);

  // 2. 供应商/映射活性校验
  if (supplier.status !== 'active' || row.status !== 'active') {
    throw new ModelCodeUnavailableError(modelCode, await listAvailableCodesForUser(userGroups));
  }

  // 3. 查该 supplier 的 active keys，按 priority 选（熔断跳过）
  const keys = await loadSupplierActiveKeys(supplier.id);

  // 4. 选第一个未熔断的 key
  let selectedKey: SelectableKey | null = null;
  for (const k of keys) {
    const cbKey = `supplier:${supplier.id}:key:${k.id}`;
    if (await isCircuitOpen(cbKey)) continue;
    selectedKey = k;
    break;
  }

  if (!selectedKey) {
    throw new ModelCodeUnavailableError(modelCode, await listAvailableCodesForUser(userGroups));
  }

  return {
    supplier,
    key: selectedKey,
    modelMapping: {
      id: row.id,
      supplierId: row.supplierId,
      modelName: row.modelName,
      platformModel: row.platformModel,
      status: row.status,
    },
  };
}

/**
 * 请求级故障转移：在同一 supplier 内选下一个「未尝试且未熔断」的 active key
 *
 * 模型编码（M-S-04/05）把 model_code 一对一锁定到唯一 supplier，因此故障转移
 * 不跨供应商，只在该 supplier 的 Key 池内按 priority 降序取下一个 key。
 *
 * 与 selectChannel 的差异：
 *   - 跳过 `triedKeyIds` 中已尝试过的 key（避免同一请求重复打坏 key）；
 *   - 全部候选耗尽 / 供应商停用 → 返回 null（调用方据此判定「无更多 key 可回退」）。
 *
 * 注意：本函数不抛 404/403（模型编码在 route step 已校验通过，此处只读）；
 * 仅在供应商/映射停用或 Key 池耗尽时返回 null，由 proxy step 透传最后一次上游错误。
 *
 * @param modelCode - 用户请求的模型编码（须与 route step 一致）
 * @param opts - 分组供给选项（同 selectChannel：{ groups } 或 { userId }）
 * @param triedKeyIds - 本次请求已尝试过的 key id 集合
 * @returns 下一个可用渠道；无更多候选时返回 null
 */
export async function selectFailoverChannel(
  modelCode: string,
  opts: SelectChannelOptions | undefined,
  triedKeyIds: ReadonlySet<number>,
): Promise<SelectedChannel | null> {
  // 0. 解析生效分组名列表（口径与 selectChannel 完全一致）
  let userGroups: string[] | undefined = opts?.groups;
  if (userGroups === undefined && opts?.userId) {
    const group = await getUserGroup(opts.userId);
    userGroups = group ? [group.name] : undefined;
  }

  // 1. 复用模型编码解析（只读：编码已校验通过，正常不会抛 404/403）
  const { row, supplier } = await assertModelCodeAvailable(modelCode, userGroups);

  // 2. 供应商/映射停用 → 无更多可回退渠道（不抛错，交由 proxy 透传上游错误）
  if (supplier.status !== 'active' || row.status !== 'active') return null;

  // 3. 取该 supplier 全部 active keys（priority 降序），跳过已尝试 + 已熔断
  const keys = await loadSupplierActiveKeys(supplier.id);
  for (const k of keys) {
    if (triedKeyIds.has(k.id)) continue;
    const cbKey = `supplier:${supplier.id}:key:${k.id}`;
    if (await isCircuitOpen(cbKey)) continue;
    return {
      supplier,
      key: k,
      modelMapping: {
        id: row.id,
        supplierId: row.supplierId,
        modelName: row.modelName,
        platformModel: row.platformModel,
        status: row.status,
      },
    };
  }

  return null;
}

/**
 * 列出调用方可用的模型编码清单（供不可用错误的 `availableModelCodes` 载荷）
 *
 * 仅聚合 active 供应商 + active 映射 + 分组供给过滤后的编码。
 *
 * @param userGroups - 调用方分组名数组；undefined = 不限制
 */
export async function listAvailableCodesForUser(userGroups?: string[]): Promise<string[]> {
  const rows = await db
    .select({
      modelCode: schema.supplierModels.modelCode,
      supplierStatus: schema.suppliers.status,
      modelStatus: schema.supplierModels.status,
      allowedGroups: schema.suppliers.allowedGroups,
    })
    .from(schema.supplierModels)
    .innerJoin(schema.suppliers, eq(schema.supplierModels.supplierId, schema.suppliers.id))
    .where(
      and(
        eq(schema.suppliers.status, 'active'),
        eq(schema.supplierModels.status, 'active'),
      ),
    );

  const codes: string[] = [];
  for (const r of rows) {
    if (!r.modelCode) continue;
    const allowed = Array.isArray(r.allowedGroups) ? r.allowedGroups.filter(Boolean) : [];
    if (userGroups === undefined || allowed.length === 0 || allowed.some((g) => userGroups.includes(g))) {
      codes.push(r.modelCode);
    }
  }
  return codes;
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
