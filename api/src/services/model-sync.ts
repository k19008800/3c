/**
 * 模型广场自动同步服务 — 从上游 `/v1/models` 拉取模型列表并自动填充 supplier_models
 *
 * 对标 New API 的"模型倍率同步模块"（见 kb/3cloud/newapi-gap-analysis.md Batch 4 任务 4.2）：
 * New API 会从渠道上游自动拉取模型并填充倍率/定价，3cloud 目前 supplier_models 为手动添加，
 * 本服务把"手动配模型"变成"一键同步"，这是模型广场自动化的核心。
 *
 * 设计原则（依赖注入，便于纯单测）：
 *   - fetch 通过 deps.fetchImpl 注入，默认用全局 fetch（Node 18+ 内置）；
 *   - DB 通过 deps.db 注入，默认用 src/db 的 drizzle 实例；
 *   - 本服务只做「拉取 → 比对 → 落库」的纯逻辑编排，HTTP 状态由路由层决定：
 *     所有失败路径返回带 error 字段的业务对象，不抛异常。
 *
 * 同步策略：
 *   1. 用第一个 active key 调 `${baseUrl}/v1/models`（GET，Bearer 鉴权，10s 超时）；
 *   2. 对上游每个模型 id：不存在 → INSERT（modelName=platformModel=id, status='active'）；
 *      已存在 → 更新（platformModel 不一致则对齐、inactive 恢复 active、刷新 syncedAt）；
 *   3. 每个新 INSERT 的模型顺带尝试创建一条 draft 定价占位（input/outputPrice=0），
 *      失败静默跳过 —— 同步后运营只需改价、不用手动建行；
 *   4. markMissingInactive=true 时把上游已下架的现有模型标记为 inactive（默认关闭，避免误杀）。
 *
 * @module services/model-sync
 * @see kb/3cloud/newapi-gap-analysis.md Batch 4 任务 4.2
 */

import { db as defaultDb, schema } from '../db';
import { eq, and, asc } from 'drizzle-orm';

/** 上游 /v1/models 拉取超时（ms） */
export const MODEL_SYNC_TIMEOUT_MS = 10_000;

/** 同步结果（全部路径返回此结构；error 存在时其余计数为 0） */
export interface ModelSyncResult {
  /** 成功处理的模型数（created + updated） */
  synced: number;
  /** 新建的模型数 */
  created: number;
  /** 已存在并更新的模型数 */
  updated: number;
  /** 单模型落库失败数（DB 异常，不影响其他模型） */
  failed: number;
  /** 本次同步到的模型 id 列表（= 上游返回的 id，去重） */
  models: string[];
  /** 业务错误：supplier not found / no active key / upstream http N / fetch 错误 / 响应解析失败 */
  error?: string;
}

/** 可注入依赖（测试注入 mock db / mock fetch） */
export interface SyncDeps {
  fetchImpl?: typeof fetch;
  db?: typeof defaultDb;
}

/** 同步选项 */
export interface SyncOptions {
  /** 是否把不在上游列表中的现有模型标记为 inactive（默认 false，避免误杀） */
  markMissingInactive?: boolean;
}

/** 批量同步汇总结果 */
export interface SyncAllResult {
  /** 参与同步的供应商总数 */
  total: number;
  /** 同步成功的供应商数 */
  succeeded: number;
  /** 同步失败的供应商数 */
  failed: number;
  /** 每个供应商的明细（成功带 result，失败带 error） */
  results: Array<{
    supplierId: number;
    name: string;
    result?: ModelSyncResult;
    error?: string;
  }>;
}

const EMPTY_RESULT: ModelSyncResult = { synced: 0, created: 0, updated: 0, failed: 0, models: [] };

/** 规整 baseUrl：去掉末尾斜杠，避免拼接出双斜杠 */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/**
 * 为新模型创建 draft 定价占位（仅当该 supplierModelId 无任何定价记录时）。
 *
 * 目的：同步后定价行已存在，运营只需改价、不用手动建行。
 * 任何异常静默跳过，不阻断模型同步主流程。
 *
 * @param d               - DB 实例
 * @param supplierModelId - 新创建的 supplier_models.id
 */
async function ensureDraftPricing(d: typeof defaultDb, supplierModelId: number): Promise<void> {
  try {
    const existing = await d.select().from(schema.vendorPricing)
      .where(eq(schema.vendorPricing.supplierModelId, supplierModelId))
      .limit(1);
    if (existing.length > 0) return; // 已有定价（含 draft）→ 不重复建

    await d.insert(schema.vendorPricing).values({
      supplierModelId,
      pricingGroup: 'default',
      inputPrice: '0',
      outputPrice: '0',
      outputMultiplier: '1.0',
      currency: 'CNY',
      status: 'draft',
    }).returning();
  } catch {
    // 定价创建失败 → 静默跳过：模型同步照常成功，运营可后续手动补定价
  }
}

/**
 * 同步单个供应商的模型列表 — 从上游拉取并自动填充 supplier_models。
 *
 * 算法流程：
 *   1. 读供应商（不存在 → error 'supplier not found'）与第一个 active key（无 → error 'no active key'）
 *   2. GET ${baseUrl}/v1/models（Bearer 鉴权，10s 超时 AbortController）
 *   3. 解析 { data: [{ id, object, owned_by }] }；非 2xx → error 'upstream http N'；网络/解析失败 → error
 *   4. 逐模型比对 supplier_models（supplierId + modelName）：
 *      - 存在 → 更新（platformModel 不一致则对齐 / inactive 恢复 active / 刷新 syncedAt），updated++
 *      - 不存在 → INSERT（modelName=platformModel=id, status='active', syncedAt=now），created++，
 *        并顺带尝试建一条 draft 定价（失败静默）
 *      - 单模型 DB 异常 → failed++（不阻断其他模型）
 *   5. markMissingInactive=true 时，把不在上游列表中的现有模型标记为 inactive
 *   6. 供应商存在 syncedAt/lastSyncAt 字段时回写当前时间（当前 suppliers 表无此字段则跳过）
 *
 * @param supplierId - 供应商 id
 * @param deps       - 可注入依赖（fetchImpl / db）
 * @param opts       - 同步选项（markMissingInactive）
 * @returns 同步结果；任何失败路径返回 { ..., error } 而非抛异常，路由层据此决定 HTTP 状态
 *
 * @example
 * ```ts
 * const result = await syncSupplierModels(1);
 * // { synced: 5, created: 3, updated: 2, failed: 0, models: ['gpt-4o', ...] }
 * ```
 */
export async function syncSupplierModels(
  supplierId: number,
  deps: SyncDeps = {},
  opts: SyncOptions = {},
): Promise<ModelSyncResult> {
  const d = deps.db ?? defaultDb;
  const fetchImpl = deps.fetchImpl ?? fetch;

  // 1. 读供应商 + 第一个 active key
  const supplierRows = await d.select().from(schema.suppliers)
    .where(eq(schema.suppliers.id, supplierId))
    .limit(1);
  const supplier = supplierRows[0];
  if (!supplier) return { ...EMPTY_RESULT, error: 'supplier not found' };

  const keyRows = await d.select().from(schema.supplierKeys)
    .where(and(
      eq(schema.supplierKeys.supplierId, supplierId),
      eq(schema.supplierKeys.status, 'active'),
    ))
    .orderBy(asc(schema.supplierKeys.id))
    .limit(1);
  const key = keyRows[0];
  if (!key) return { ...EMPTY_RESULT, error: 'no active key' };

  // 2. 拉取上游模型列表（10s 超时，AbortController 取消）
  let res: Response | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_SYNC_TIMEOUT_MS);
  try {
    res = await fetchImpl(`${normalizeBaseUrl(supplier.baseUrl)}/v1/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key.keyValue}` },
      signal: controller.signal,
    });
  } catch (err) {
    // 网络错误 / 超时：返回业务对象，不抛
    return { ...EMPTY_RESULT, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    return { ...EMPTY_RESULT, error: `upstream http ${res.status}` };
  }

  // 3. 解析响应 { data: [{ id, object, owned_by }] }
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return { ...EMPTY_RESULT, error: 'invalid upstream response' };
  }
  let rawList: unknown;
  if (Array.isArray(payload)) {
    // 兼容直接返回数组的供应商
    rawList = payload;
  } else if (payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).data)) {
    rawList = (payload as Record<string, unknown>).data;
  } else {
    return { ...EMPTY_RESULT, error: 'invalid upstream response' };
  }

  // 提取模型 id 并去重（跳过空 id / 非法条目）
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of rawList as unknown[]) {
    if (item == null || typeof item !== 'object') continue;
    const id = (item as Record<string, unknown>).id;
    if (id == null) continue;
    const modelName = String(id);
    if (modelName === '' || seen.has(modelName)) continue;
    seen.add(modelName);
    ids.push(modelName);
  }

  // 4. 读取现有模型，按 modelName 建索引（本次同步比对基准）
  const existingRows = await d.select().from(schema.supplierModels)
    .where(eq(schema.supplierModels.supplierId, supplierId));
  const existingByModel = new Map(existingRows.map((m) => [m.modelName, m]));

  const now = new Date();
  let created = 0;
  let updated = 0;
  let failed = 0;
  const syncedModels: string[] = [];

  // 5. 逐模型 upsert
  for (const modelName of ids) {
    const existing = existingByModel.get(modelName);
    try {
      if (existing) {
        // 已存在 → 更新：platformModel 不一致则对齐；inactive 恢复 active；刷新 syncedAt
        const patch: Record<string, unknown> = { updatedAt: now, syncedAt: now };
        if (existing.platformModel !== modelName) patch.platformModel = modelName;
        if (existing.status !== 'active') patch.status = 'active';
        await d.update(schema.supplierModels)
          .set(patch as never)
          .where(eq(schema.supplierModels.id, existing.id));
        updated++;
      } else {
        // 不存在 → 新建（modelName=platformModel=id）
        const inserted = await d.insert(schema.supplierModels).values({
          supplierId,
          modelName,
          platformModel: modelName,
          status: 'active',
          syncedAt: now,
        }).returning();
        const createdModel = inserted[0];
        // 定价自动填充：为新建模型补一条 draft 占位（失败静默跳过）
        if (createdModel) await ensureDraftPricing(d, createdModel.id);
        created++;
      }
      syncedModels.push(modelName);
    } catch {
      // 单模型落库失败 → 计数 failed，继续处理下一个模型
      failed++;
    }
  }

  // 6. 可选：把上游已下架的现有模型标记为 inactive（默认关闭，避免误杀）
  if (opts.markMissingInactive) {
    const upstreamIds = new Set(ids);
    for (const m of existingRows) {
      if (!upstreamIds.has(m.modelName) && m.status !== 'inactive') {
        try {
          await d.update(schema.supplierModels)
            .set({ status: 'inactive', updatedAt: now } as never)
            .where(eq(schema.supplierModels.id, m.id));
        } catch {
          // 单模型标记失败不阻断
        }
      }
    }
  }

  // 7. 回写供应商同步时间（如有 syncedAt / lastSyncAt 字段；当前 suppliers 表无此字段则跳过）
  if ('syncedAt' in supplier || 'lastSyncAt' in supplier) {
    const patch: Record<string, unknown> = { updatedAt: now };
    if ('syncedAt' in supplier) patch.syncedAt = now;
    if ('lastSyncAt' in supplier) patch.lastSyncAt = now;
    try {
      await d.update(schema.suppliers)
        .set(patch as never)
        .where(eq(schema.suppliers.id, supplierId));
    } catch {
      // 回写失败仅影响展示，不阻断同步结果
    }
  }

  return { synced: syncedModels.length, created, updated, failed, models: syncedModels };
}

/**
 * 批量同步全部 active 供应商（管理端"一键同步全部"）。
 *
 * 逐个调用 syncSupplierModels，单供应商失败不影响其他供应商；
 * 每个供应商的结果/错误单独记录，便于运营定位失败项。
 *
 * @param deps - 可注入依赖（透传给 syncSupplierModels）
 * @returns 汇总结果：total / succeeded / failed / results[]
 */
export async function syncAllSuppliers(deps: SyncDeps = {}): Promise<SyncAllResult> {
  const d = deps.db ?? defaultDb;

  const activeSuppliers = await d.select().from(schema.suppliers)
    .where(eq(schema.suppliers.status, 'active'));

  const results: SyncAllResult['results'] = [];
  let succeeded = 0;
  let failed = 0;

  for (const s of activeSuppliers) {
    const result = await syncSupplierModels(s.id, deps);
    if (result.error) {
      failed++;
      results.push({ supplierId: s.id, name: s.name, error: result.error });
    } else {
      succeeded++;
      results.push({ supplierId: s.id, name: s.name, result });
    }
  }

  return { total: activeSuppliers.length, succeeded, failed, results };
}
