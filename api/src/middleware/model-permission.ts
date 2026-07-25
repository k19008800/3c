// ============================================================
//  3cloud (3C) — 模型权限检查中间件
//  用于验证 API Key 是否有权限访问特定模型
// ============================================================

import { FastifyRequest, FastifyReply } from "fastify";

/**
 * 检查 API Key 是否有权限访问指定模型
 * 在 /v1/* 路由中使用
 */
export async function checkModelPermission(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 如果没有 apiKey 信息，跳过（可能是其他认证方式）
  if (!request.apiKey) return;

  const permissions = request.apiKey.permissions;
  if (!permissions) return;

  // 如果没有配置模型白名单，允许所有模型
  if (!permissions.allowedModels || permissions.allowedModels.length === 0) {
    return;
  }

  // 从请求体中获取模型名称
  const body = request.body as { model?: string } | undefined;
  const modelName = body?.model;

  if (!modelName) {
    // 如果请求中没有指定模型，由后续逻辑处理
    return;
  }

  // 检查模型是否在白名单中
  const isAllowed = permissions.allowedModels.some((allowed: string) => {
    // 支持前缀匹配，如 gpt-* 匹配所有 gpt 模型
    if (allowed.endsWith('*')) {
      return modelName.startsWith(allowed.slice(0, -1));
    }
    // 支持精确匹配
    return modelName === allowed;
  });

  if (!isAllowed) {
    reply.status(403).send({
      error: {
        message: `模型 "${modelName}" 不在允许列表中`,
        type: "access_denied",
        code: "model_not_allowed",
      },
    });
    return;
  }
}

/**
 * 创建自定义模型权限检查中间件
 * @param getModelName 从请求中提取模型名称的函数
 */
export function createModelPermissionCheck(
  getModelName: (request: FastifyRequest) => string | undefined
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.apiKey) return;

    const permissions = request.apiKey.permissions;
    if (!permissions) return;

    if (!permissions.allowedModels || permissions.allowedModels.length === 0) {
      return;
    }

    const modelName = getModelName(request);
    if (!modelName) return;

    const isAllowed = permissions.allowedModels.some((allowed: string) => {
      if (allowed.endsWith('*')) {
        return modelName.startsWith(allowed.slice(0, -1));
      }
      return modelName === allowed;
    });

    if (!isAllowed) {
      reply.status(403).send({
        error: {
          message: `模型 "${modelName}" 不在允许列表中`,
          type: "access_denied",
          code: "model_not_allowed",
        },
      });
      return;
    }
  };
}
