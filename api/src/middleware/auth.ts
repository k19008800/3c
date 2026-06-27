// ============================================================
//  3cloud (3C) — 鉴权中间件
//  JWT Access Token / API Key 双认证体系
//  占位 — 后续开发实现
// ============================================================

import { FastifyRequest, FastifyReply } from "fastify";

/**
 * JWT Access Token 鉴权
 * 用途：管理后台 / 用户控制台 API 认证
 */
export async function authenticateJWT(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // TODO: 实现 JWT 验证
  // 1. 从 Authorization header 提取 Bearer token
  // 2. 验证 JWT 签名和过期时间
  // 3. 查询 users 表获取用户信息
  // 4. 注入 request.user
}

/**
 * API Key 鉴权
 * 用途：Token Proxy 接口 (/v1/*) 认证
 */
export async function authenticateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // TODO: 实现 API Key 验证
  // 1. 从 Authorization header 提取 Bearer token
  // 2. SHA-256 哈希后查询 api_keys 表
  // 3. 检查状态和过期时间
  // 4. 更新 lastUsedAt
  // 5. 注入 request.user 和 request.apiKey
}

/**
 * 角色权限检查
 */
export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // TODO: 检查 request.user.role 是否在 roles 中
  };
}
