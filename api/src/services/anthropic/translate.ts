/**
 * Anthropic Messages API ↔ OpenAI Chat Completions 双向翻译（纯函数，无 IO）
 *
 * 目标：让 3cloud 网关像 DeepSeek 一样提供 Anthropic 兼容入口
 *   base_url (OpenAI)     → /v1/chat/completions
 *   base_url (Anthropic)  → /anthropic/v1/messages（Anthropic SDK 会自动拼 /v1/messages）
 *
 * 翻译方向：
 *   1. Anthropic 请求 → OpenAI 请求（发给上游供应商，上游按 OpenAI 兼容 /v1/chat/completions）
 *   2. OpenAI 响应   → Anthropic Messages 响应（返回给 Anthropic SDK 客户端）
 *   3. OpenAI SSE chunk → Anthropic SSE 事件（流式）
 *
 * 覆盖的 Anthropic 内容块：
 *   - text 文本块
 *   - image（source: base64 / url）→ OpenAI image_url（多模态计费走 estimateMultimodalContentTokens）
 *   - tool_use → OpenAI tool_calls
 *   - tool_result → OpenAI role=tool 消息
 *   - tools（input_schema）→ OpenAI tools（function.parameters）
 *   - system 参数（string 或内容块数组）
 *
 * @module services/anthropic/translate
 * @see docs/api-contract.md（Anthropic 兼容入口说明）
 */

// ============================================================
// 类型
// ============================================================

/** Anthropic 内容块（支持的子集） */
export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64' | 'url'; media_type?: string; data?: string; url?: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | AnthropicContentBlock[] };

/** Anthropic Messages API 请求体（兼容子集） */
export interface AnthropicMessageRequest {
  model: string;
  max_tokens?: number;
  system?: string | AnthropicContentBlock[];
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | AnthropicContentBlock[];
  }>;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: Array<{ name: string; description?: string; input_schema: Record<string, unknown> }>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/** 翻译后的 OpenAI chat 消息（estimateInputTokens 可直接消费） */
export interface OpenAIChatMessage {
  role: string;
  content: unknown;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

/** 翻译结果：OpenAI chat/completions 请求体（部分字段由路由层补充 platformModel） */
export interface TranslatedOpenAIRequest {
  messages: OpenAIChatMessage[];
  stream: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string[];
  tools?: Array<{ type: string; function: { name: string; description?: string; parameters: Record<string, unknown> } }>;
}

/** Anthropic Messages 响应（非流式） */
export interface AnthropicMessage {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: Array<{ type: 'text'; text: string }>;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | null;
  stop_sequence: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

// ============================================================
// 请求翻译：Anthropic → OpenAI
// ============================================================

/** 内容块数组 → OpenAI content（text 拼接 + image 转 image_url；tool 块由调用方另行展开） */
export function blocksToOpenAIContent(blocks: AnthropicContentBlock[]): unknown[] {
  const parts: unknown[] = [];
  for (const b of blocks) {
    if (b.type === 'text') {
      if (b.text) parts.push({ type: 'text', text: b.text });
    } else if (b.type === 'image') {
      const src = b.source;
      if (src.type === 'base64' && src.data && src.media_type) {
        parts.push({ type: 'image_url', image_url: { url: `data:${src.media_type};base64,${src.data}` } });
      } else if (src.type === 'url' && src.url) {
        parts.push({ type: 'image_url', image_url: { url: src.url } });
      }
    }
    // tool_use / tool_result 不在这里展开（由 expandMessage 处理）
  }
  return parts;
}

/** 提取内容中的纯文本（用于 system / tool_result 内容扁平化） */
export function contentToText(content: string | AnthropicContentBlock[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((b): b is Extract<AnthropicContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

/**
 * 展开一条 Anthropic 消息为若干条 OpenAI 消息（保持顺序）：
 * - text/image 部分 → 一条 { role, content: [...] }（content 为字符串时保持字符串）
 * - 每个 tool_use 块 → 一条 { role: 'assistant', tool_calls }（无文本时）
 * - 每个 tool_result 块 → 一条 { role: 'tool', tool_call_id, content }
 */
export function expandAnthropicMessage(
  role: 'user' | 'assistant',
  content: string | AnthropicContentBlock[],
): OpenAIChatMessage[] {
  if (typeof content === 'string') {
    return [{ role, content }];
  }

  const result: OpenAIChatMessage[] = [];
  const textParts: unknown[] = [];
  let hasTextLike = false;

  for (const block of content) {
    if (block.type === 'text') {
      if (block.text) {
        textParts.push({ type: 'text', text: block.text });
        hasTextLike = true;
      }
    } else if (block.type === 'image') {
      const src = block.source;
      if ((src.type === 'base64' && src.data && src.media_type) || (src.type === 'url' && src.url)) {
        textParts.push(blocksToOpenAIContent([block])[0]!);
        hasTextLike = true;
      }
    } else if (block.type === 'tool_use') {
      // tool_use 与同消息文本并存时，OpenAI 允许 assistant 消息同时带 content + tool_calls
      result.push({
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
        }],
      });
    } else if (block.type === 'tool_result') {
      result.push({
        role: 'tool',
        tool_call_id: block.tool_use_id,
        content: typeof block.content === 'string' ? block.content : contentToText(block.content),
      });
    }
  }

  if (hasTextLike) {
    result.unshift({ role, content: textParts });
  }
  return result;
}

/**
 * 校验并翻译 Anthropic 请求 → OpenAI chat/completions 请求体
 *
 * @param body - Anthropic Messages API 请求体
 * @returns 翻译结果（OpenAI 消息数组 + 透传参数）
 * @throws {Error} model / messages 缺失或非法
 */
export function translateAnthropicRequest(body: unknown): TranslatedOpenAIRequest {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body is required');
  }
  const req = body as AnthropicMessageRequest;

  if (typeof req.model !== 'string' || !req.model) {
    throw new Error('"model" is required');
  }
  if (!Array.isArray(req.messages) || req.messages.length === 0) {
    throw new Error('"messages" is required and must be a non-empty array');
  }

  const messages: OpenAIChatMessage[] = [];

  // system 参数（string 或内容块数组）→ 首条 system 消息
  if (req.system !== undefined && req.system !== null && req.system !== '') {
    messages.push({ role: 'system', content: contentToText(req.system) });
  }

  for (const m of req.messages) {
    if (m.role !== 'user' && m.role !== 'assistant') {
      throw new Error(`Unsupported message role: ${String(m.role)}`);
    }
    messages.push(...expandAnthropicMessage(m.role, m.content));
  }

  const out: TranslatedOpenAIRequest = { messages, stream: req.stream === true };

  if (req.max_tokens !== undefined) out.max_tokens = req.max_tokens;
  if (req.temperature !== undefined) out.temperature = req.temperature;
  if (req.top_p !== undefined) out.top_p = req.top_p;
  if (Array.isArray(req.stop_sequences) && req.stop_sequences.length > 0) out.stop = req.stop_sequences;

  // tools：Anthropic input_schema → OpenAI function.parameters
  if (Array.isArray(req.tools) && req.tools.length > 0) {
    out.tools = req.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        ...(t.description ? { description: t.description } : {}),
        parameters: t.input_schema ?? {},
      },
    }));
  }

  return out;
}

// ============================================================
// 响应翻译：OpenAI → Anthropic（非流式）
// ============================================================

/** OpenAI finish_reason → Anthropic stop_reason */
export function mapStopReason(finishReason: string | null | undefined): AnthropicMessage['stop_reason'] {
  switch (finishReason) {
    case 'stop': return 'end_turn';
    case 'length': return 'max_tokens';
    case 'tool_calls': return 'tool_use';
    case 'content_filter': return 'end_turn';
    default: return finishReason ? (finishReason as AnthropicMessage['stop_reason']) : 'end_turn';
  }
}

/**
 * OpenAI chat/completions 响应体 → Anthropic Messages 响应
 *
 * @param payload - 上游 OpenAI 兼容响应
 * @param model - 用户请求的模型名
 * @param requestId - 网关 requestId（用于 msg_ id）
 */
export function openaiToAnthropicMessage(
  payload: Record<string, unknown>,
  model: string,
  requestId: string,
): AnthropicMessage {
  const choices = (payload.choices as Array<{ message?: { content?: unknown }; finish_reason?: string }> | undefined);
  const choice = choices?.[0];
  const msg = choice?.message;
  const text = typeof msg?.content === 'string' ? msg.content : '';
  const usage = (payload.usage ?? {}) as Record<string, unknown>;

  return {
    id: `msg_${requestId}`,
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text }],
    stop_reason: mapStopReason(choice?.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: Number(usage.prompt_tokens) || 0,
      output_tokens: Number(usage.completion_tokens) || 0,
    },
  };
}

// ============================================================
// 流式：OpenAI SSE chunk → Anthropic SSE 事件
// ============================================================

/** Anthropic SSE 事件（JSON 序列化后以 `event: xxx` + `data: {...}` 输出） */
export type AnthropicStreamEvent = Record<string, unknown> & { type: string };

/** message_start 事件（流开始，携带消息骨架与预估输入 tokens） */
export function anthropicMessageStartEvent(messageId: string, model: string, inputTokens: number): AnthropicStreamEvent {
  return {
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: 0 },
    },
  };
}

/** content_block_start 事件（首个文本增量前发出） */
export function anthropicContentBlockStart(index = 0): AnthropicStreamEvent {
  return { type: 'content_block_start', index, content_block: { type: 'text', text: '' } };
}

/** content_block_delta 事件（文本增量） */
export function anthropicContentBlockDelta(index: number, text: string): AnthropicStreamEvent {
  return { type: 'content_block_delta', index, delta: { type: 'text_delta', text } };
}

/** content_block_stop 事件 */
export function anthropicContentBlockStop(index = 0): AnthropicStreamEvent {
  return { type: 'content_block_stop', index };
}

/** message_delta 事件（结束原因 + 输出 token） */
export function anthropicMessageDelta(stopReason: AnthropicMessage['stop_reason'], outputTokens: number): AnthropicStreamEvent {
  return { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: outputTokens } };
}

/** message_stop 事件（流结束） */
export function anthropicMessageStop(): AnthropicStreamEvent {
  return { type: 'message_stop' };
}

/** 从 OpenAI 流式 chunk 提取增量文本 / finish_reason / usage */
export function extractOpenAIChunk(chunk: Record<string, unknown>): {
  text: string | null;
  finishReason: string | null;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
} {
  const choice = (chunk.choices as Array<Record<string, unknown>> | undefined)?.[0];
  const delta = (choice?.delta ?? {}) as Record<string, unknown>;
  const text = typeof delta.content === 'string' ? delta.content : null;
  const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : null;
  let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null;
  if (chunk.usage && typeof chunk.usage === 'object') {
    const u = chunk.usage as Record<string, unknown>;
    usage = {
      prompt_tokens: Number(u.prompt_tokens) || 0,
      completion_tokens: Number(u.completion_tokens) || 0,
      total_tokens: Number(u.total_tokens) || 0,
    };
  }
  return { text, finishReason, usage };
}
