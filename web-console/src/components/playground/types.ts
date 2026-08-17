/**
 * Playground 多端点 API 调试器 — 共享类型
 *
 * 对齐后端 OpenAI 兼容端点（/v1/chat/completions、/v1/rerank、/v1/responses、
 * /v1/embeddings、/v1/completions、/v1/messages）的请求/响应形状。
 * 全部端点走 API Key 鉴权（Bearer），经 /api/ 代理 + 后端双注册别名访问。
 *
 * @see docs/api-contract.md §4（/api/v1/v1/* 内部路径别名契约）
 * @module components/playground
 */

/** /me/keys 返回的 Key 行（仅前缀，无完整 Key） */
export interface ApiKeyRow {
  id: number;
  name: string;
  keyPrefix: string;
  status: string;
}

/** /me/models 返回的模型行（用于模型下拉/联想） */
export interface ModelRow {
  id: number;
  name: string;
  provider: string;
  context?: number;
  inputPrice: number;
  outputPrice: number;
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

/** 各 Tab 共享的上下文（Key 选择状态提升到 PlaygroundPage 壳，切换 Tab 不丢） */
export interface PlaygroundTabProps {
  keys?: ApiKeyRow[];
  selectedKeyId: number | null;
  fullKey: string;
  onSelectedKeyId: (id: number | null) => void;
  onFullKey: (v: string) => void;
  models?: ModelRow[];
}
