import type { FastifyReply } from "fastify";

/**
 * 用户限流配置缓存条目
 */
export interface UserLimitCacheEntry {
  userType: "personal" | "enterprise";
  rpmOverride: number | null;
  tpmOverride: number | null;
  expiresAt: number;
}

/**
 * FastifyReply 扩展：标记响应是否已由 handler 直接写入
 */
declare module "fastify" {
  interface FastifyReply {
    hijacked?: boolean;
  }
}

/**
 * OpenAI 兼容错误响应构建
 */
export function openaiError(status: number, message: string, type: string, code: string) {
  return {
    error: { message, type, code },
  };
}
