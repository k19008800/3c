/**
 * Anthropic Messages API ⇄ OpenAI Chat Completions 格式转换适配器
 *
 * 职责：
 * - claudeToOpenAI：Claude 请求体 → OpenAI 请求体（上游统一走 OpenAI 格式转发）
 * - openAIToClaude：OpenAI 响应体 → Claude 响应体（客户端拿到 Anthropic 兼容格式）
 *
 * 设计约束：
 * - 纯函数：输入输出可预测、无 db / fetch / 网络依赖，便于单元测试
 * - 无法映射的类型（tool_use / tool_result / document 等）原样透传，不丢数据
 *
 * @see newapi-gap-analysis.md Batch 3 任务 3.1（/v1/messages 兼容端点）
 * @see newapi-migration-guide.md §2.1-2.3（转发/计费对照）
 * @module services/upstream
 */

// ============================================================
// 类型定义（只描述本适配器关心的字段，其余字段透传）
// ============================================================

/** Claude 消息 content block（常见类型；未知类型原样透传） */
export interface ClaudeContentBlock {
  type: string;
  text?: string;
  source?: {
    type: string;
    media_type?: string;
    data?: string;
    url?: string;
  };
  [key: string]: unknown;
}

/** Claude 消息（content 可为字符串或 blocks 数组） */
export interface ClaudeMessage {
  role: string;
  content: string | ClaudeContentBlock[];
  [key: string]: unknown;
}

/** Anthropic Messages API 请求体（本适配器关心的字段） */
export interface ClaudeRequest {
  model: string;
  messages: ClaudeMessage[];
  max_tokens?: number;
  system?: string | ClaudeContentBlock[];
  temperature?: number;
  stream?: boolean;
  [key: string]: unknown;
}

// ============================================================
// Claude 请求 → OpenAI 请求
// ============================================================

/**
 * Claude 请求体 → OpenAI Chat Completions 请求体
 *
 * 转换规则：
 * - system 参数并入 messages 开头（role='system'，blocks 数组取 text 拼接）
 * - messages 角色 'user' / 'assistant' / 'system' 与 OpenAI 一一对应，未知角色原样透传
 * - content 为字符串 → 原样；为 blocks 数组 → 多模态数组（text block → 字符串，
 *   image block → image_url，无法映射的类型原样透传）
 * - max_tokens / temperature / stream 及其余顶层字段直接透传
 *
 * @param body - Claude 请求体
 * @returns OpenAI Chat Completions 请求体
 *
 * @example
 * ```ts
 * const openAIBody = claudeToOpenAI({
 *   model: 'claude-3-5-sonnet',
 *   max_tokens: 100,
 *   system: 'You are helpful',
 *   messages: [{ role: 'user', content: 'hi' }],
 * });
 * ```
 */
export function claudeToOpenAI(body: ClaudeRequest): Record<string, unknown> {
  const messages: Array<Record<string, unknown>> = [];

  // system 参数并入 messages 开头（Claude 的 system 与 OpenAI 的 system 消息等价）
  if (body.system !== undefined) {
    messages.push({ role: 'system', content: claudeSystemToText(body.system) });
  }

  for (const msg of body.messages ?? []) {
    const entry: Record<string, unknown> = {
      role: msg.role,
      content: mapClaudeContentToOpenAI(msg.content),
    };
    // 保留 role/content 之外的附加字段（如 name），不丢数据
    for (const [key, value] of Object.entries(msg)) {
      if (key !== 'role' && key !== 'content') entry[key] = value;
    }
    messages.push(entry);
  }

  const out: Record<string, unknown> = { model: body.model, messages };

  // max_tokens / temperature / stream 及其余顶层字段直接透传
  for (const [key, value] of Object.entries(body)) {
    if (key === 'model' || key === 'messages' || key === 'system') continue;
    if (value !== undefined) out[key] = value;
  }

  // stream 缺省 false（与 chat.ts 的 buildUpstreamBody 行为一致）
  if (out.stream === undefined) out.stream = false;

  return out;
}

/**
 * Claude system 参数 → 字符串（供并入 OpenAI system 消息）
 *
 * 字符串原样返回；blocks 数组只取 text block 并用换行拼接；其余类型返回空串。
 *
 * @param system - Claude system 参数
 * @returns 纯文本
 */
function claudeSystemToText(system: string | ClaudeContentBlock[]): string {
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) {
    return system
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n');
  }
  return '';
}

/**
 * Claude content → OpenAI content
 *
 * 字符串原样；blocks 数组逐块转换；其余类型原样透传。
 *
 * @param content - Claude 消息 content
 * @returns OpenAI 兼容 content
 */
function mapClaudeContentToOpenAI(content: string | ClaudeContentBlock[]): unknown {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((block) => claudeBlockToOpenAI(block));
  }
  return content;
}

/**
 * Claude content block → OpenAI content item
 *
 * - text block → 字符串（OpenAI 多模态数组允许纯字符串项，且是最简形式）
 * - image block → { type: 'image_url', image_url: { url } }
 * - 无法映射的类型 → 原样透传
 *
 * @param block - Claude content block
 * @returns OpenAI content item
 */
function claudeBlockToOpenAI(block: ClaudeContentBlock): unknown {
  if (block.type === 'text') {
    return typeof block.text === 'string' ? block.text : '';
  }
  if (block.type === 'image' && block.source) {
    return claudeImageToOpenAI(block.source);
  }
  return block;
}

/**
 * Claude image source → OpenAI image_url 项
 *
 * - url 类型 → 直接透传 url
 * - base64 类型 → 拼成 data URL（data:{media_type};base64,{data}）
 * - 其余类型 → 空 url 占位（避免上游解析失败）
 *
 * @param source - Claude image source
 * @returns OpenAI image_url content item
 */
function claudeImageToOpenAI(source: NonNullable<ClaudeContentBlock['source']>): Record<string, unknown> {
  if (source.type === 'url' && typeof source.url === 'string') {
    return { type: 'image_url', image_url: { url: source.url } };
  }
  if (source.type === 'base64' && typeof source.data === 'string') {
    const mediaType = source.media_type || 'image/png';
    return { type: 'image_url', image_url: { url: `data:${mediaType};base64,${source.data}` } };
  }
  return { type: 'image_url', image_url: { url: '' } };
}

// ============================================================
// OpenAI 响应 → Claude 响应
// ============================================================

/**
 * OpenAI Chat Completions 响应体 → Claude Messages 响应体
 *
 * 转换规则：
 * - choices[0].message.content → content: [{ type: 'text', text }]
 *   （字符串 → 单个 text block；多模态数组逐项映射；空 → 空数组）
 * - usage → { input_tokens: prompt_tokens, output_tokens: completion_tokens }
 * - id：传 requestId 时生成 msg_{requestId}；否则保留上游 id（再兜底 msg_unknown）
 * - finish_reason → Anthropic stop_reason（stop→end_turn、length→max_tokens、tool_calls→tool_use）
 *
 * @param openAIResponse - 上游返回的 OpenAI 格式响应
 * @param originalModel - 用户请求的模型名（回显给客户端）
 * @param requestId - 网关请求 ID（生成 msg_xxx 格式 id）
 * @returns Claude Messages 格式响应体
 *
 * @example
 * ```ts
 * const claudeBody = openAIToClaude(upstreamJson, 'claude-3-5-sonnet', pipelineCtx.requestId);
 * ```
 */
export function openAIToClaude(
  openAIResponse: Record<string, unknown>,
  originalModel: string,
  requestId?: string,
): Record<string, unknown> {
  const choices = (openAIResponse.choices as Array<Record<string, unknown>> | undefined) ?? [];
  const choice = choices[0] ?? {};
  const message = (choice.message as Record<string, unknown> | undefined) ?? {};
  const usage = (openAIResponse.usage as Record<string, unknown> | undefined) ?? {};

  const inputTokens = Number(usage.prompt_tokens) || 0;
  const outputTokens = Number(usage.completion_tokens) || 0;
  const finishReason = String(choice.finish_reason ?? 'stop');

  const id = requestId
    ? `msg_${requestId}`
    : (typeof openAIResponse.id === 'string' && openAIResponse.id
        ? openAIResponse.id
        : 'msg_unknown');

  return {
    id,
    type: 'message',
    role: 'assistant',
    model: originalModel,
    content: mapOpenAIContentToClaude(message.content),
    stop_reason: mapFinishReason(finishReason),
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

/**
 * OpenAI content → Claude content blocks 数组
 *
 * 字符串 → 单个 text block；多模态数组逐项映射（text → text block、
 * image_url → image block、其余原样透传）；空/缺失 → 空数组。
 *
 * @param content - OpenAI 响应的 message.content
 * @returns Claude content blocks 数组
 */
function mapOpenAIContentToClaude(content: unknown): ClaudeContentBlock[] {
  if (typeof content === 'string') {
    return content ? [{ type: 'text', text: content }] : [];
  }
  if (Array.isArray(content)) {
    const blocks: ClaudeContentBlock[] = [];
    for (const item of content) {
      if (typeof item === 'string') {
        blocks.push({ type: 'text', text: item });
      } else if (item && typeof item === 'object') {
        const it = item as Record<string, unknown>;
        if (it.type === 'text' && typeof it.text === 'string') {
          blocks.push({ type: 'text', text: it.text });
        } else if (it.type === 'image_url' && it.image_url && typeof it.image_url === 'object') {
          const url = (it.image_url as Record<string, unknown>).url;
          if (typeof url === 'string') {
            blocks.push({ type: 'image', source: { type: 'url', url } });
          }
        } else {
          blocks.push(item as ClaudeContentBlock);
        }
      }
    }
    return blocks;
  }
  return [];
}

/**
 * OpenAI finish_reason → Anthropic stop_reason
 *
 * 映射表：stop→end_turn、length→max_tokens、tool_calls→tool_use；
 * 其余（content_filter 等）统一归为 end_turn，与 Anthropic 枚举保持一致。
 *
 * @param finishReason - OpenAI finish_reason
 * @returns Anthropic stop_reason
 */
function mapFinishReason(finishReason: string): string {
  switch (finishReason) {
    case 'length':
      return 'max_tokens';
    case 'tool_calls':
      return 'tool_use';
    default:
      return 'end_turn';
  }
}
