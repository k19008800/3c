/**
 * 模型编码生成核心 + 模板配置服务 —「模型编码化改造」阶段 B
 *
 * 职责：
 * - B1：模板渲染 + 清洗 + 唯一性冲突序号兜底（纯函数 renderModelCode），
 *       以及按 supplier_models 行生成并落库编码（generateModelCodeForSupplierModel）。
 * - B2：编码规则模板（system_config 键 model_code.template）的读写服务，
 *       Redis 60s 缓存 + 默认模板兜底 + 保存校验（变量白名单 / 含 @ 拒绝 / 非空）。
 *
 * 编码规则规格（PRD v1.2 M-C-01R / M-C-07 + 补充1 §2）：
 * - 默认模板 {supplier_code}-{model_name}（「厂商+模型」）；后台可自定义。
 * - 变量白名单：supplier_code / supplier_name / model_name / model_short / platform_model / seq。
 * - 渲染结果仅保留 [a-zA-Z0-9_-]，其余替换为 -；连续 - 合并；首尾 - 去除；截断 200。
 * - 含 @ 一律拒绝；渲染后为空 → 报错「变量值不可编码」。
 * - 唯一冲突：自动追加 -{seq}（2,3,…）；仍冲突则报错。
 *
 * @see docs/PRD-模型编码化改造与去除用户供应商选择.md（M-C-01R / M-C-07）
 * @see docs/PRD-模型编码化改造与去除用户供应商选择-补充1-编码规则自定义.md（§2）
 * @module services/upstream
 */

import { db, schema } from '../../db/index.js';
import { eq, isNotNull } from 'drizzle-orm';
import { cacheGet, cacheSet, cacheDel } from '../../lib/redis.js';
import { ValidationError } from '../../lib/errors.js';

// ============================================================
// 常量与类型
// ============================================================

/** 模板渲染变量：取自 supplier_models + suppliers 行 */
export interface ModelCodeTemplateVars {
  /** suppliers.code（ASCII 安全、稳定） */
  supplierCode: string;
  /** suppliers.name */
  supplierName: string;
  /** supplier_models.model_name（逻辑模型名） */
  modelName: string;
  /** supplier_models.platform_model（上游真实模型名） */
  platformModel: string;
}

/** 默认模板：「厂商+模型」（M-C-01R） */
export const MODEL_CODE_DEFAULT_TEMPLATE = '{supplier_code}-{model_name}';

/** 模板变量白名单（补充1 §2.2） */
export const MODEL_CODE_ALLOWED_VARS = [
  'supplier_code',
  'supplier_name',
  'model_name',
  'model_short',
  'platform_model',
  'seq',
] as const;

/** system_config 中编码规则模板配置键（M-C-07） */
export const MODEL_CODE_TEMPLATE_CONFIG_KEY = 'model_code.template';

/** 模板 Redis 缓存键 + TTL（60s，后台修改后即时失效） */
const MODEL_CODE_TEMPLATE_CACHE_KEY = 'model_code:template';
const MODEL_CODE_TEMPLATE_CACHE_TTL = 60;

/** 编码最大长度（varchar 200，补充1 §2.3.2） */
const MODEL_CODE_MAX_LENGTH = 200;

/** {model_short} 缩写截断长度（与旧 slugModelName 同为 12，但保留连字符） */
const MODEL_SHORT_MAX_LENGTH = 12;

/** 冲突序号兜底上限（超过即报错，避免死循环） */
const MODEL_CODE_SEQ_MAX = 1000;

/** 变量占位符提取正则：{xxx}，xxx 由小写字母/下划线组成 */
const TEMPLATE_VAR_RE = /\{([a-z_]+)\}/g;

// ============================================================
// 内部纯函数：清洗 / 缩写
// ============================================================

/**
 * 清洗编码片段：仅保留 [a-zA-Z0-9_-]，其余替换为 -；
 * 连续 - 合并为一个；首尾 - 去除；截断 maxLen 后再去一次首尾残留 -。
 *
 * @param s - 待清洗字符串（变量值或渲染结果）
 * @param maxLen - 截断长度（默认 200）
 * @returns 清洗后的编码片段
 */
function sanitizeModelCodePart(s: string, maxLen: number = MODEL_CODE_MAX_LENGTH): string {
  return String(s ?? '')
    .replace(/[^a-zA-Z0-9_-]/g, '-') // 非法字符 → -（含中文/空格/./@ 等）
    .replace(/-+/g, '-') // 连续 - 合并
    .replace(/^-+|-+$/g, '') // 首尾 - 去除
    .slice(0, maxLen) // 截断
    .replace(/^-+|-+$/g, ''); // 截断后可能残留首尾 -，再去一次
}

/**
 * 计算 {model_short} 模型名缩写（保留连字符版，与旧 slugModelName 不同）：
 * toLowerCase → 非 [a-z0-9-] 替换为 - → 连续 - 合并 → 首尾去除 → 截断 12 → 再去首尾残留 -。
 *
 * 例：'DeepSeek V4 Flash (Pro)' → 'deepseek-v4'
 *
 * @param name - supplier_models.model_name
 * @returns 模型名缩写
 */
function shortModelName(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MODEL_SHORT_MAX_LENGTH)
    .replace(/^-+|-+$/g, '');
}

// ============================================================
// B1 — 模板校验与渲染
// ============================================================

/**
 * 校验编码规则模板（供 setModelCodeTemplate 与 B3 preview 复用）。
 *
 * 规则：
 * - 空/空白 → ValidationError("模板不能为空")
 * - 含 `@` → ValidationError("模板不得包含 @")
 * - 含白名单外变量 → ValidationError(`未知变量: {var}`)
 * - 字面量（变量外部分）允许任意字符（渲染时统一清洗），仅拒绝 @。
 *
 * @param template - 待校验模板字符串
 * @throws {ValidationError} 模板非法时抛出（400 语义）
 */
export function validateModelCodeTemplate(template: string): void {
  if (!template || !template.trim()) {
    throw new ValidationError('模板不能为空');
  }
  if (template.includes('@')) {
    throw new ValidationError('模板不得包含 @');
  }
  // 提取所有 {xxx} 变量，逐个对照白名单
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  TEMPLATE_VAR_RE.lastIndex = 0;
  while ((m = TEMPLATE_VAR_RE.exec(template)) !== null) {
    const v = m[1]!;
    if (seen.has(v)) continue;
    seen.add(v);
    if (!(MODEL_CODE_ALLOWED_VARS as readonly string[]).includes(v)) {
      throw new ValidationError(`未知变量: {${v}}`);
    }
  }
}

/**
 * 用给定 seq 值渲染模板（内部方法），渲染后立即清洗。
 *
 * @param template - 已通过校验的模板
 * @param vars - 模板变量取值
 * @param seqVal - {seq} 的取值（首次为 '1'，冲突时递增）
 * @returns 清洗后的编码字符串（可能为空，由调用方判定）
 */
function renderOnce(template: string, vars: ModelCodeTemplateVars, seqVal: string): string {
  let out = template;
  out = out.replaceAll('{supplier_code}', String(vars.supplierCode ?? ''));
  out = out.replaceAll('{supplier_name}', String(vars.supplierName ?? ''));
  out = out.replaceAll('{model_name}', String(vars.modelName ?? ''));
  out = out.replaceAll('{platform_model}', String(vars.platformModel ?? ''));
  out = out.replaceAll('{model_short}', shortModelName(String(vars.modelName ?? '')));
  out = out.replaceAll('{seq}', seqVal);
  return sanitizeModelCodePart(out, MODEL_CODE_MAX_LENGTH);
}

/**
 * 渲染模型编码（纯函数，无副作用）。
 *
 * 流程：
 * 1. 校验模板（空 / 含 @ / 未知变量 → ValidationError）；
 * 2. 渲染各变量（{model_short} 为保留连字符的模型缩写）；
 * 3. 清洗结果（仅 [a-zA-Z0-9_-]、连续 - 合并、首尾去除、截断 200）；
 * 4. 清洗后为空 → ValidationError（提示变量值不可编码）；
 * 5. occupied 传入时：
 *    - 模板不含 {seq}：base 占用则追加 -2/-3…；
 *    - 模板含 {seq}：seq 从 1 递增渲染直到不冲突；
 *    - 到上限仍冲突 → ValidationError。
 *
 * @param template - 编码规则模板（须来自白名单变量）
 * @param vars - 模板变量取值
 * @param occupied - 已占用编码集合（可选；传入则做唯一冲突兜底）
 * @returns 清洗后的唯一编码
 * @throws {ValidationError} 模板非法 / 全清洗为空 / 冲突兜底失败时抛出
 */
export function renderModelCode(
  template: string,
  vars: ModelCodeTemplateVars,
  occupied?: Set<string>,
): string {
  // 1. 模板校验（与保存校验共用同一规则）
  validateModelCodeTemplate(template);

  const hasSeq = template.includes('{seq}');
  const needConflictResolve = occupied && occupied.size > 0;

  // 2. 无占用集合 → 直接渲染一次（{seq} 取 '1'）
  if (!needConflictResolve) {
    const code = renderOnce(template, vars, '1');
    if (!code) throw new ValidationError('变量值不可编码，请使用厂商 code 或模型名');
    return code;
  }

  // 3. 有占用集合 → 冲突兜底
  if (hasSeq) {
    // 模板自带 {seq}：seq 从 1 递增渲染直到不冲突
    for (let seq = 1; seq <= MODEL_CODE_SEQ_MAX; seq++) {
      const candidate = renderOnce(template, vars, String(seq));
      if (!candidate) continue; // 全清洗为空，跳过该 seq
      if (!occupied.has(candidate)) return candidate;
    }
    throw new ValidationError('模型编码冲突，无法生成唯一编码');
  }

  // 模板不含 {seq}：base 占用则追加 -2/-3…
  const base = renderOnce(template, vars, '1');
  if (!base) throw new ValidationError('变量值不可编码，请使用厂商 code 或模型名');
  if (!occupied.has(base)) return base;
  for (let n = 2; n <= MODEL_CODE_SEQ_MAX; n++) {
    const candidate = `${base}-${n}`; // base 已清洗（仅 [a-zA-Z0-9_-]），追加数字/- 仍合法
    if (!occupied.has(candidate)) return candidate;
  }
  throw new ValidationError('模型编码冲突，无法生成唯一编码');
}

// ============================================================
// B2 — 模板配置服务（system_config + Redis 60s 缓存）
// ============================================================

/**
 * 读取当前生效的编码规则模板。
 *
 * 优先级：Redis 缓存 → DB system_config → 默认模板。
 * DB 读取成功才写缓存（DB 异常不污染缓存，同 getCachePricingMode 模式）；
 * DB/缓存异常一律回退默认模板，不阻断主链路。
 *
 * @returns 模板字符串（无配置时返回 MODEL_CODE_DEFAULT_TEMPLATE）
 */
export async function getModelCodeTemplate(): Promise<string> {
  const cached = await cacheGet(MODEL_CODE_TEMPLATE_CACHE_KEY);
  if (cached != null && typeof cached === 'string' && cached.length > 0) {
    return cached;
  }

  let template = MODEL_CODE_DEFAULT_TEMPLATE;
  let readOk = false; // DB 读取成功才写缓存
  try {
    const rows = await db
      .select({ value: schema.systemConfig.value })
      .from(schema.systemConfig)
      .where(eq(schema.systemConfig.key, MODEL_CODE_TEMPLATE_CONFIG_KEY))
      .limit(1);
    if (rows.length > 0) {
      const v = rows[0]!.value;
      if (typeof v === 'string' && v.length > 0) template = v;
    }
    readOk = true;
  } catch {
    /* DB 异常 → 默认模板 */
  }

  if (readOk) {
    await cacheSet(MODEL_CODE_TEMPLATE_CACHE_KEY, template, MODEL_CODE_TEMPLATE_CACHE_TTL);
  }
  return template;
}

/**
 * 保存编码规则模板（upsert system_config），保存后失效缓存即时生效。
 *
 * @param template - 模板字符串（须通过 validateModelCodeTemplate 校验）
 * @throws {ValidationError} 模板非法时抛出（不落库）
 */
export async function setModelCodeTemplate(template: string): Promise<void> {
  // 1. 校验（空 / @ / 未知变量）
  validateModelCodeTemplate(template);

  // 2. upsert system_config
  await db
    .insert(schema.systemConfig)
    .values({
      key: MODEL_CODE_TEMPLATE_CONFIG_KEY,
      value: template,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.systemConfig.key],
      set: { value: template, updatedAt: new Date() },
    });

  // 3. 失效缓存（即时生效）
  await cacheDel(MODEL_CODE_TEMPLATE_CACHE_KEY);
}

/**
 * 失效编码规则模板缓存（后台修改后调用，判定即时生效）。
 */
export async function invalidateModelCodeTemplateCache(): Promise<void> {
  await cacheDel(MODEL_CODE_TEMPLATE_CACHE_KEY);
}

// ============================================================
// B1 — 按 supplier_models 行生成并落库编码
// ============================================================

/**
 * 为指定 supplier_models 行生成模型编码并落库。
 *
 * 流程：
 * 1. 查 supplier_models（id/supplierId/modelName/platformModel/status/modelCode）；
 * 2. 查 suppliers（id/code/name/status）；
 * 3. 校验两者均为 active，否则 ValidationError；
 * 4. 读取当前模板（getModelCodeTemplate）；
 * 5. 查所有已占用 model_code（含当前行旧值，防复用）；
 * 6. renderModelCode 渲染 + 冲突兜底；
 * 7. UPDATE supplier_models.model_code = ? 并返回编码。
 *
 * @param id - supplier_models.id
 * @returns 生成并落库的模型编码
 * @throws {ValidationError} 行不存在 / 供应商或映射非 active / 冲突兜底失败
 * @throws {NotFoundError} 行不存在（此处用 ValidationError 统一 400 语义，B3 路由层再判 404）
 */
export async function generateModelCodeForSupplierModel(id: number): Promise<string> {
  // 1. 查 supplier_models 行
  const rows = await db
    .select({
      id: schema.supplierModels.id,
      supplierId: schema.supplierModels.supplierId,
      modelName: schema.supplierModels.modelName,
      platformModel: schema.supplierModels.platformModel,
      status: schema.supplierModels.status,
      modelCode: schema.supplierModels.modelCode,
    })
    .from(schema.supplierModels)
    .where(eq(schema.supplierModels.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new ValidationError(`supplier_models 不存在: id=${id}`);
  }

  // 2. 查 suppliers
  const supRows = await db
    .select({
      id: schema.suppliers.id,
      code: schema.suppliers.code,
      name: schema.suppliers.name,
      status: schema.suppliers.status,
    })
    .from(schema.suppliers)
    .where(eq(schema.suppliers.id, row.supplierId))
    .limit(1);

  const supplier = supRows[0];
  if (!supplier) {
    throw new ValidationError(`supplier 不存在: id=${row.supplierId}`);
  }

  // 3. 活性校验：供应商与映射均须 active
  if (supplier.status !== 'active') {
    throw new ValidationError(`供应商非 active（当前 ${supplier.status}），不可生成编码`);
  }
  if (row.status !== 'active') {
    throw new ValidationError(`模型映射非 active（当前 ${row.status}），不可生成编码`);
  }

  // 4. 读取当前模板（B2）
  const template = await getModelCodeTemplate();

  // 5. 查所有已占用编码（含当前行旧值，重新生成时旧值视为已占用 → 强制新编码，防复用）
  const occupiedRows = await db
    .select({ code: schema.supplierModels.modelCode })
    .from(schema.supplierModels)
    .where(isNotNull(schema.supplierModels.modelCode));
  const occupied = new Set<string>();
  for (const r of occupiedRows) {
    if (r.code) occupied.add(String(r.code));
  }

  // 6. 渲染 + 冲突兜底
  const vars: ModelCodeTemplateVars = {
    supplierCode: supplier.code,
    supplierName: supplier.name,
    modelName: row.modelName,
    platformModel: row.platformModel,
  };
  const code = renderModelCode(template, vars, occupied);

  // 7. 落库
  await db
    .update(schema.supplierModels)
    .set({ modelCode: code, updatedAt: new Date() })
    .where(eq(schema.supplierModels.id, id));

  return code;
}
