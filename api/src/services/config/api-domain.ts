/**
 * API 域名配置 — 对外 API 网关域名（后台可设置，system_config key = api_domain）
 *
 * 用途：独立 API 域名 api.<host> 同域暴露两套 SDK 兼容入口（对齐 DeepSeek）：
 *   OpenAI 客户端   → openaiBaseUrl（POST /v1/chat/completions）
 *   Anthropic SDK   → anthropicBaseUrl（POST /anthropic/v1/messages）
 *
 * 后台设置入口：管理后台 → 系统设置 → API 服务（PUT /api/v1/admin/settings/api）
 * 公开读取：GET /api/v1/public/api-config（Portal / Console 展示用）
 *
 * @module services/config/api-domain
 */

/** 默认 API 域名（未配置 / 配置为空时兜底） */
export const DEFAULT_API_DOMAIN = 'api.unmisa.com';

export interface ApiConfig {
  /** 原始配置值（域名或完整 origin，如 api.unmisa.com / http://localhost:3000） */
  apiDomain: string;
  /** OpenAI 兼容 base_url */
  openaiBaseUrl: string;
  /** Anthropic 兼容 base_url（Anthropic SDK 会自动拼接 /v1/messages） */
  anthropicBaseUrl: string;
  /** OpenAI 聊天端点（快捷展示用） */
  openaiChatUrl: string;
  /** Anthropic 消息端点（快捷展示用） */
  anthropicMessagesUrl: string;
}

/**
 * 把配置值规整为 origin（https:// 前缀 + 去尾部斜杠）
 *
 * - 含 "://" → 视为完整 origin，原样保留协议
 * - 否则 → 视为域名，补 https://
 * - 空 → 回退 DEFAULT_API_DOMAIN
 */
export function normalizeOrigin(raw: string | null | undefined): string {
  const v = (raw ?? '').trim();
  if (!v) return `https://${DEFAULT_API_DOMAIN}`;
  const origin = v.includes('://') ? v : `https://${v}`;
  return origin.replace(/\/+$/, '');
}

/** 由 api_domain 配置值派生全套对外接入地址 */
export function buildApiConfig(apiDomain?: string | null): ApiConfig {
  const origin = normalizeOrigin(apiDomain);
  return {
    apiDomain: origin.replace(/^https?:\/\//, ''),
    // OpenAI SDK base_url 含 /v1 前缀（SDK 自行拼接 /chat/completions），对齐 https://api.openai.com/v1 惯例
    openaiBaseUrl: `${origin}/v1`,
    // Anthropic SDK base_url（SDK 自行拼接 /v1/messages），对齐 https://api.deepseek.com/anthropic 惯例
    anthropicBaseUrl: `${origin}/anthropic`,
    openaiChatUrl: `${origin}/v1/chat/completions`,
    anthropicMessagesUrl: `${origin}/anthropic/v1/messages`,
  };
}
