/**
 * 后台「模型编码维护 + 编码规则配置」API 调用层 — T5 前端联调用。
 *
 * 职责：
 * - 按《开发任务书-阶段B-前端模型编码化改造》§3 与《后端模型编码规则接口》§3 契约，
 *   封装 admin 编码列表 / 启停 / 重新生成 / 规则模板读写 / 模板预览共 6 个接口；
 * - 接口路径、请求体、响应体严格对齐契约，后端实现后可直接联调，不得漂移；
 * - 统一解包项目 `{ data: T }` 响应包裹（兼容直返 T）。
 *
 * 说明：
 * - 编码规则：默认模板 `{supplier_code}-{model_name}`（「厂商+模型」），
 *   后台可自定义；变更只对未生成编码的映射生效（M-C-01R / M-C-07）。
 * - 后端 6 个 admin 接口已上线（命名与任务书 §3 一致），真实响应统一为 `{ data: T }` 包裹，
 *   本层 `unwrap` 剥一层后返回 T；下表字段名/枚举均已对齐后端实测：
 *   - 列表 prices 字段为 input/output/cache_read_input/cache_write_input（非 *_price）；
 *   - 编码状态枚举为 active/inactive/deprecated/beta（非 disabled）；
 *   - pagination 为 { page, pageSize, total }。
 *
 * @see docs/开发任务书-阶段B-前端模型编码化改造.md（§3 后端接口契约 / T5）
 * @see docs/开发任务书-阶段B-后端模型编码规则接口.md（§3 前端依赖契约）
 * @see docs/PRD-模型编码化改造与去除用户供应商选择-补充1-编码规则自定义.md（§2）
 * @module lib/adminModelCodes
 */
import { api } from "./api";

/** 编码状态枚举（对齐后端：active 可调用 / inactive 停用 / deprecated 已弃用 / beta 公测） */
export type ModelCodeStatus = "active" | "inactive" | "deprecated" | "beta";

/**
 * 后台模型编码行（GET /admin/model-codes 列表项）。
 * 字段对齐后端契约：一个（模型 × 供应商）= 一条全局唯一 model_code。
 */
export interface ModelCodeRow {
  /** supplier_models 行主键（启停/重新生成按此 id） */
  id: number;
  /** supplier_models.id（契约字段，可选透出） */
  supplier_model_id?: number;
  /** 全局唯一模型编码（API model 权威值） */
  model_code: string;
  /** 逻辑模型名 */
  model_name: string;
  /** 显示名（同模型多编码时 = 模型名（供应商名）） */
  display_name: string;
  /** 供应商 code */
  supplier_code: string;
  /** 供应商名称 */
  supplier_name: string;
  /** 编码状态：active/inactive/deprecated/beta（停用不物理删除，防复用） */
  status: ModelCodeStatus | (string & {});
  /** 上游真实模型名（可选透出） */
  platform_model?: string;
  /** 定价分组：非 default 组名逗号拼接，无则 'default'（可选透出） */
  pricing_group?: string;
  /** 该编码生效价（字段名对齐后端：input/output/cache_read_input/cache_write_input，可空） */
  prices?: {
    input?: string | number | null;
    output?: string | number | null;
    cache_read_input?: string | number | null;
    cache_write_input?: string | number | null;
  };
}

/** GET /admin/model-codes 响应（{ data } 包裹解包后） */
export interface ModelCodeListResp {
  list: ModelCodeRow[];
  /** 分页：{ page, pageSize, total }（对齐后端） */
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

/** GET /admin/model-code-rules 响应（解包后） */
export interface ModelCodeRules {
  /** 当前模板；空串 = 用默认模板 */
  template: string;
  /** 默认模板（厂商+模型） */
  default_template: string;
  /** 允许的模板变量白名单 */
  allowed_vars: string[];
}

/** POST /admin/model-code-rules/preview 预览项 */
export interface ModelCodePreviewItem {
  supplier_code: string;
  model_name: string;
  rendered_code: string;
  /** 无真实数据时后端返回占位示例（前端据此灰显/标注） */
  placeholder?: boolean;
}

/** POST /admin/model-code-rules/preview 响应（解包后） */
export interface ModelCodePreviewResp {
  preview: ModelCodePreviewItem[];
}

/** POST /admin/model-codes/:id/regenerate 响应（解包后） */
export interface RegenerateResult {
  old_code: string;
  new_code: string;
}

/** 编码规则模板变量白名单（前端校验/插入面板用，对齐 PRD 补充1 §2.2） */
export const MODEL_CODE_ALLOWED_VARS = [
  "supplier_code",
  "supplier_name",
  "model_name",
  "model_short",
  "platform_model",
  "seq",
] as const;

/** 默认模板（厂商+模型），对齐 M-C-01R / PRD 补充1 §2.1 */
export const MODEL_CODE_DEFAULT_TEMPLATE = "{supplier_code}-{model_name}";

/**
 * 解包项目统一响应包裹 `{ data: T }`；若 body 本身即 T（无 data 字段）则原样返回。
 * @param body - axios 响应 body
 * @returns 解包后的业务数据
 */
function unwrap<T>(body: any): T {
  if (body && typeof body === "object" && "data" in body && !Array.isArray(body)) {
    return body.data as T;
  }
  return body as T;
}

/**
 * GET /api/v1/admin/model-codes — 后台模型编码列表（含启停状态，可筛选/分页）。
 * 契约：返回 `{ list, pagination }`。
 * @param params - model_name / supplier_id / page / page_size 可选筛选
 * @returns 编码列表与分页
 */
export async function fetchModelCodeList(params?: {
  model_name?: string;
  supplier_id?: number;
  page?: number;
  page_size?: number;
}): Promise<ModelCodeListResp> {
  const qs = new URLSearchParams();
  if (params?.model_name) qs.set("model_name", params.model_name);
  if (params?.supplier_id != null) qs.set("supplier_id", String(params.supplier_id));
  if (params?.page != null) qs.set("page", String(params.page));
  if (params?.page_size != null) qs.set("page_size", String(params.page_size));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const body = (await api.get<unknown>(`/admin/model-codes${suffix}`)).data;
  return unwrap<ModelCodeListResp>(body);
}

/**
 * PUT /api/v1/admin/model-codes/:id/status — 启用/停用编码。
 * body `{ status: 'active'|'inactive'|'deprecated'|'beta' }`；停用不物理删除（防复用）。
 * @param id - 编码行 id
 * @param status - 目标状态
 */
export async function updateModelCodeStatus(
  id: number,
  status: ModelCodeStatus,
): Promise<void> {
  await api.put(`/admin/model-codes/${id}/status`, { status });
}

/**
 * POST /api/v1/admin/model-codes/:id/regenerate — 按当前模板重新生成编码。
 * 响应 `{ old_code, new_code }`；已用旧编码的调用方将 404（前端确认弹窗提示）。
 * @param id - 编码行 id
 * @returns 旧编码与新编码
 */
export async function regenerateModelCode(id: number): Promise<RegenerateResult> {
  const body = (await api.post<unknown>(`/admin/model-codes/${id}/regenerate`)).data;
  return unwrap<RegenerateResult>(body);
}

/**
 * GET /api/v1/admin/model-code-rules — 读取编码规则模板。
 * 返回 `{ template, default_template, allowed_vars }`；空 template = 用默认。
 */
export async function getModelCodeRules(): Promise<ModelCodeRules> {
  const body = (await api.get<unknown>(`/admin/model-code-rules`)).data;
  return unwrap<ModelCodeRules>(body);
}

/**
 * PUT /api/v1/admin/model-code-rules — 保存编码规则模板。
 * body `{ template }`；服务端校验未知变量/非法字符/含 `@` → 400。
 * @param template - 新模板（空串 = 恢复默认）
 * @returns 保存后的模板规则
 */
export async function saveModelCodeRules(template: string): Promise<ModelCodeRules> {
  const body = (await api.put<unknown>(`/admin/model-code-rules`, { template })).data;
  return unwrap<ModelCodeRules>(body);
}

/**
 * POST /api/v1/admin/model-code-rules/preview — 模板渲染预览。
 * body `{ template }`；返回 `{ preview: [{supplier_code, model_name, rendered_code}] }`。
 * @param template - 待预览模板
 */
export async function previewModelCodeRules(
  template: string,
): Promise<ModelCodePreviewResp> {
  const body = (await api.post<unknown>(`/admin/model-code-rules/preview`, { template })).data;
  return unwrap<ModelCodePreviewResp>(body);
}

/**
 * 前端模板合法性预校验（对齐 PRD 补充1 §2.3.4，与后端校验同口径）。
 * 用于即时给出错误提示，避免无效请求直达后端；后端仍会二次校验。
 * @param template - 模板字符串
 * @returns 错误文案；null 表示通过
 */
export function validateModelCodeTemplate(template: string): string | null {
  const t = template.trim();
  if (!t) return "模板不能为空（可恢复默认模板）";
  if (t.includes("@")) return "模板不得包含 @（@ 不作为可调用编码）";
  // 1. 抽取全部 {var}，变量必须来自白名单
  const used = [...t.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1] ?? "").filter(Boolean);
  for (const v of used) {
    if (!(MODEL_CODE_ALLOWED_VARS as readonly string[]).includes(v)) {
      return `未知变量 {${v}}，仅支持：${MODEL_CODE_ALLOWED_VARS.join("/")}`;
    }
  }
  // 2. 字面量（去掉 {var} 后剩余部分）仅允许 [a-zA-Z0-9_-]
  const literal = t.replace(/\{[a-zA-Z0-9_]+\}/g, "");
  if (/[^a-zA-Z0-9_-]/.test(literal)) {
    return "字面量仅允许 [a-zA-Z0-9_-]（中文/空格/@/点号等将被清洗或拒绝）";
  }
  return null;
}
