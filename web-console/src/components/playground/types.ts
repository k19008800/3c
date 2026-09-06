/**
 * Playground 多端点 API 调试器 — 共享类型
 *
 * 对齐后端 OpenAI 兼容端点（/v1/chat/completions、/v1/rerank、/v1/responses、
 * /v1/embeddings、/v1/completions、/v1/messages）的请求/响应形状。
 * 全部端点走 API Key 鉴权（Bearer），经 /api/ 代理 + 后端双注册别名访问。
 *
 * 模型编码化改造（M-S-02/04）：`/me/models` 按 (模型×供应商) 展开为模型编码条目，
 * 请求体 `model` 权威值 = `model_code`，编码即锁定供应商；不再有「渠道/供应商」选择。
 *
 * @see docs/SPEC-模型编码化改造与去除用户供应商选择.md §3.4 / §五
 * @module components/playground
 */

/** /me/keys 返回的 Key 行（仅前缀，无完整 Key） */
export interface ApiKeyRow {
  id: number;
  name: string;
  keyPrefix: string;
  status: string;
}

/**
 * /me/models 返回的模型编码行（用于模型选择/联想）。
 *
 * 后端按 (模型 × 供应商) 展开：同一逻辑模型 `model_name` 由多个供应商提供时，
 * 系统内对应多条唯一 `model_code`；前端选择条目即选择供应商。
 *
 * 说明：DB 无编码数据时后端回退旧 `DEFAULT_MODELS`（无 model_code），渲染侧需
 * 以 `Boolean(m.model_code)` 过滤，空态展示占位、不崩溃（M-S-06）。
 */
export interface ModelRow {
  /** 唯一模型编码（API `model` 权威值，一对一路由到供应商） */
  model_code: string;
  /** 逻辑模型名（如 deepseek-v4-flash） */
  model_name: string;
  /** 展示名：模型名（供应商名） */
  display_name: string;
  /** 供应商 code */
  supplier_code: string;
  /** 供应商名 */
  supplier_name: string;
  /** 上下文窗口（tokens），可空 */
  context?: number | null;
  /** available | maintenance */
  status: string;
  /** 生效价格组 */
  pricing_group: string;
  /** 健康分（字符串枚举或数值），可空 */
  health?: string | number | null;
  /** 延迟（毫秒），可空 */
  latency_ms?: number | null;
  /** 是否推荐 */
  recommended: boolean;
  /** 是否维护中 */
  maintenance: boolean;
  /** 该编码对当前用户分组的生效价 */
  prices: {
    input_price: string | number;
    output_price: string | number;
    cache_read_input_price?: string | number | null;
    cache_write_input_price?: string | number | null;
  };
}

/** 单个 SSE 事件（chat 流只有 data 行，event 名为 null；Responses 流带 event 名） */
export interface StreamEvent {
  event: string | null;
  data: string;
}

/** 一次调试请求的结果（非流式 JSON / 流式 SSE 统一收敛） */
export interface ProxyResult {
  /** 是否 2xx */
  ok: boolean;
  /** HTTP 状态码；网络失败为 0 */
  status: number;
  /** 请求耗时（毫秒） */
  latencyMs: number;
  /** 非流式响应解析出的 JSON（非 JSON 时为 null） */
  json: unknown | null;
  /** 原始响应文本（兜底展示用） */
  text: string;
  /** 流式响应解析出的 SSE 事件序列 */
  streamEvents: StreamEvent[];
  /** 错误信息（ok 时为 null） */
  error: string | null;
}

/**
 * 各 Tab 共享的上下文（Key 选择 + 模型编码选择均提升到 PlaygroundPage 壳，
 * 切换 Tab 不丢）。请求体 `model` 一律取 `model`（model_code），不做名称→编码映射。
 */
export interface PlaygroundTabProps {
  keys?: ApiKeyRow[];
  selectedKeyId: number | null;
  fullKey: string;
  onSelectedKeyId: (id: number | null) => void;
  onFullKey: (v: string) => void;
  /** /me/models 模型编码列表 */
  models?: ModelRow[];
  /** 当前所选模型编码（请求体 model 权威值） */
  model: string;
  /** 更新所选模型编码 */
  onModelChange: (v: string) => void;
}
