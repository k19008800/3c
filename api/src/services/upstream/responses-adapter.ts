/**
 * OpenAI Responses API ⇄ Chat Completions 格式转换适配器
 *
 * 背景：GPT-5 / Codex 等新一代客户端默认走 Responses API（/v1/responses），
 * 其请求/响应结构与 Chat Completions 不同。网关采用 New API 的思路（Issue #2941）：
 * 上游统一走 OpenAI 格式 /v1/chat/completions，网关在入口做
 * responses → chat 请求体转换，出口把 chat 响应体映射回 responses 格式。
 *
 * 职责：
 * - responsesToChat：Responses 请求体 → OpenAI Chat Completions 请求体
 * - chatToResponses：OpenAI Chat Completions 响应体 → Responses 响应体
 *
 * 设计约束：
 * - 纯函数：输入输出可预测、无 db / fetch / 网络依赖，便于单元测试
 * - 无法映射的字段原样透传，不丢数据（与 claude-adapter.ts 一致）
 * - 本期仅覆盖非流式路径（流式后续 Batch 单独实现）
 *
 * @see newapi-gap-analysis.md Batch 4 任务 4.4（/v1/responses 兼容端点）
 * @see claude-adapter.ts（同思路的 Claude ⇄ OpenAI 转换器）
 * @module services/upstream
 */

// ============================================================
// 类型定义（只描述本适配器关心的字段，其余字段透传）
// ============================================================

/** Responses API input 数组元素（常见 { role, content } 或 { type:'message', role, content } 包装） */
export interface ResponsesInputItem {
  role?: string;
  content?: unknown;
  type?: string;
  [key: string]: unknown;
}

/** OpenAI Responses API 请求体（本适配器关心的字段） */
export interface ResponsesRequest {
  model: string;
  input: string | ResponsesInputItem[];
  instructions?: string;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  [key: string]: unknown;
}

// ============================================================
// Responses 请求 → OpenAI Chat 请求
// ============================================================

/**
 * Responses 请求体 → OpenAI Chat Completions 请求体
 *
 * 转换规则：
 * - input 为字符串 → [{ role: 'user', content }]
 * - input 为数组 → 逐项映射 { role, content }（role 'developer' → 'system'，
 *   chat API 无 developer 角色，语义等价系统指令）
 * - instructions → system 消息并入 messages 开头
 * - max_output_tokens → max_tokens（同名映射）
 * - 其余顶层字段（temperature / top_p / stream 等）直接透传
 * - content 为数组时，Responses 内容块 input_text/output_text → chat 的 text 块、
 *   input_image → image_url 块（多模态客户端常见格式），未知类型原样透传
 *
 * @param body - Responses API 请求体
 * @returns OpenAI Chat Completions 请求体
 *
 * @example
 * ```ts
 * const chatBody = responsesToChat({
 *   model: 'gpt-5',
 *   instructions: 'You are helpful',
 *   input: 'hi',
 *   max_output_tokens: 100,
 * });
 * ```
 */
export function responsesToChat(body: ResponsesRequest): Record<string, unknown> {
  const messages: Array<Record<string, unknown>> = [];

  // instructions 并入 messages 开头（Responses 的 instructions 与 chat 的 system 消息等价）
  if (typeof body.instructions === 'string' && body.instructions) {
    messages.push({ role: 'system', content: body.instructions });
  }

  if (typeof body.input === 'string') {
    messages.push({ role: 'user', content: body.input });
  } else if (Array.isArray(body.input)) {
    for (const item of body.input) {
      const mapped = mapInputItem(item);
      if (mapped) messages.push(mapped);
    }
  }

  const out: Record<string, unknown> = { model: body.model, messages };

  // 其余顶层字段直接透传；已消费字段（model/input/instructions）与需改名的 max_output_tokens 跳过
  for (const [key, value] of Object.entries(body)) {
    if (key === 'model' || key === 'input' || key === 'instructions' || key === 'max_output_tokens') continue;
    if (value !== undefined) out[key] = value;
  }
  if (body.max_output_tokens !== undefined) out.max_tokens = body.max_output_tokens;

  // stream 缺省 false（与 chat.ts / claude-adapter.ts 行为一致）
  if (out.stream === undefined) out.stream = false;

  return out;
}

/**
 * Responses input 数组元素 → OpenAI chat 消息
 *
 * 元素可能带 { type: 'message' } 包装（真实 Responses 客户端常见），
 * 取 role/content 后映射；非消息类元素（function_call_output 等）无法映射 → 跳过。
 * role/content 之外的附加字段（如 name）保留，不丢数据。
 *
 * @param item - Responses input 数组元素
 * @returns OpenAI chat 消息；无法映射时返回 null
 */
function mapInputItem(item: unknown): Record<string, unknown> | null {
  if (!item || typeof item !== 'object') return null;
  const it = item as ResponsesInputItem;

  // 非消息类 item（function_call_output 等）没有 role，无法映射为 chat 消息 → 跳过
  if (it.type && it.type !== 'message' && typeof it.role !== 'string') return null;

  const role = typeof it.role === 'string' && it.role ? it.role : 'user';
  const entry: Record<string, unknown> = {
    role: mapRoleToChat(role),
    content: mapResponsesContent(it.content) ?? '',
  };

  // 保留 role/content/type 之外的附加字段（如 name），不丢数据
  for (const [key, value] of Object.entries(it)) {
    if (key !== 'role' && key !== 'content' && key !== 'type') entry[key] = value;
  }
  return entry;
}

/**
 * Responses 角色 → OpenAI chat 角色
 *
 * 'developer' 是 Responses API 独有角色，chat API 无此角色，
 * 语义等价系统指令 → 映射为 'system'；其余角色原样返回。
 *
 * @param role - Responses 角色名
 * @returns OpenAI chat 兼容角色
 */
function mapRoleToChat(role: string): string {
  if (role === 'developer') return 'system';
  return role;
}

/**
 * Responses content → OpenAI chat content
 *
 * 字符串原样；数组逐块转换：input_text/output_text → text 块（chat 的文本块类型）、
 * input_image → image_url 块，未知类型原样透传；其余类型原样透传。
 *
 * @param content - Responses 消息 content
 * @returns OpenAI 兼容 content
 */
function mapResponsesContent(content: unknown): unknown {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (part && typeof part === 'object') {
        const p = part as Record<string, unknown>;
        if ((p.type === 'input_text' || p.type === 'output_text') && typeof p.text === 'string') {
          return { type: 'text', text: p.text };
        }
        if (p.type === 'input_image' && typeof p.image_url === 'string') {
          return { type: 'image_url', image_url: { url: p.image_url } };
        }
      }
      return part;
    });
  }
  return content;
}

// ============================================================
// OpenAI Chat 响应 → Responses 响应
// ============================================================

/**
 * OpenAI Chat Completions 响应体 → Responses API 响应体
 *
 * 转换规则：
 * - choices[0].message.content → output: [{ type: 'message', role: 'assistant',
 *   content: [{ type: 'output_text', text }] }]
 * - usage → { input_tokens: prompt_tokens, output_tokens: completion_tokens,
 *   total_tokens: 两者之和 }
 * - id：传 requestId 时生成 resp_{requestId}；否则 resp_unknown
 * - object → 'response'
 * - finish_reason → status（stop→completed、length→incomplete(max_output_tokens)、
 *   content_filter→incomplete(content_filter)、其余→completed）
 *
 * @param chatResp - 上游返回的 OpenAI 格式响应
 * @param requestId - 网关请求 ID（生成 resp_xxx 格式 id）
 * @returns Responses API 格式响应体
 *
 * @example
 * ```ts
 * const responsesBody = chatToResponses(upstreamJson, pipelineCtx.requestId);
 * ```
 */
export function chatToResponses(
  chatResp: Record<string, unknown>,
  requestId?: string,
): Record<string, unknown> {
  const choices = (chatResp.choices as Array<Record<string, unknown>> | undefined) ?? [];
  const choice = choices[0] ?? {};
  const message = (choice.message as Record<string, unknown> | undefined) ?? {};
  const usage = (chatResp.usage as Record<string, unknown> | undefined) ?? {};

  const inputTokens = Number(usage.prompt_tokens) || 0;
  const outputTokens = Number(usage.completion_tokens) || 0;
  const finishReason = String(choice.finish_reason ?? 'stop');
  const { status, incompleteDetails } = mapResponsesStatus(finishReason);
  // 非字符串 content（工具调用等多模态场景）本期只取纯文本；空值 → 空串
  const text = typeof message.content === 'string' ? message.content : '';

  const rid = requestId ?? 'unknown';

  return {
    id: `resp_${rid}`,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status,
    error: null,
    incomplete_details: incompleteDetails,
    model: typeof chatResp.model === 'string' ? chatResp.model : null,
    output: [
      {
        id: `msg_${rid}`,
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text }],
      },
    ],
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
  };
}

/**
 * OpenAI finish_reason → Responses status
 *
 * 映射表：stop→completed、length→incomplete(max_output_tokens)、
 * content_filter→incomplete(content_filter)；其余（tool_calls 等）归为 completed。
 *
 * @param finishReason - OpenAI finish_reason
 * @returns Responses status + incomplete_details（completed 时为 null）
 */
export function mapResponsesStatus(finishReason: string): { status: string; incompleteDetails: { reason: string } | null } {
  switch (finishReason) {
    case 'length':
      return { status: 'incomplete', incompleteDetails: { reason: 'max_output_tokens' } };
    case 'content_filter':
      return { status: 'incomplete', incompleteDetails: { reason: 'content_filter' } };
    default:
      return { status: 'completed', incompleteDetails: null };
  }
}
