// ============================================================
//  3cloud (3C) — API Key 认证中间件
//  验证 API Key 的权限、额度、时间限制等
// ============================================================

import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";
import { ApiKeyAuthService } from "../services/api-key-auth-service.js";

const apiKeyAuthService = new ApiKeyAuthService();

/**
 * API Key 认证中间件
 */
export async function authenticateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    // 1. 获取 API Key
    const apiKey = request.headers["authorization"]?.replace(/^Bearer\s+/i, "");
    if (!apiKey) {
      reply.status(401).send({
        code: 401,
        data: null,
        message: "缺少 API Key",
      });
      return;
    }

    // 2. 计算 Key Hash
    const crypto = await import("node:crypto");
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

    // 3. 获取客户端 IP
    const clientIp = request.ip || 
                    (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || 
                    request.socket.remoteAddress ||
                    "unknown";

    // 4. 获取请求信息
    const url = request.url;
    const method = request.method;
    
    // 从请求体中提取模型信息（如果是 Chat/Completions 请求）
    let modelName: string | undefined;
    if (request.body && typeof request.body === "object") {
      const body = request.body as any;
      modelName = body.model || body["model"];
    }

    // 5. 验证 API Key
    const authResult = await apiKeyAuthService.validateApiKey(
      keyHash,
      clientIp,
      modelName,
      url,
      undefined // 费用在请求完成后计算
    );

    if (!authResult.isValid) {
      reply.status(403).send({
        code: 403,
        data: null,
        message: authResult.message || "API Key 权限验证失败",
      });
      return;
    }

    // 6. 将验证结果附加到请求对象
    (request as any).apiKeyAuth = {
      keyId: authResult.keyId!,
      userId: authResult.userId!,
      permissions: authResult.permissions,
      dailyUsage: authResult.dailyUsage,
      monthlyUsage: authResult.monthlyUsage,
    };

    // 7. 更新最后使用时间
    if (authResult.keyId) {
      const db = (await import("../db/index.js")).getDb();
      const { apiKeys } = await import("../db/schema.js");
      
      await db
        .update(apiKeys)
        .set({
          lastUsedAt: new Date(),
        })
        .where(db.eq(apiKeys.id, authResult.keyId))
        .execute();
    }

  } catch (error: any) {
    console.error("API Key 认证错误:", error);
    reply.status(500).send({
      code: 500,
      data: null,
      message: "API Key 认证系统错误",
    });
    return;
  }
}

/**
 * API Key 额度检查中间件（请求后调用）
 */
export async function checkApiKeyQuota(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: any
) {
  try {
    const apiKeyAuth = (request as any).apiKeyAuth;
    if (!apiKeyAuth) {
      return; // 不是 API Key 请求
    }

    // 获取实际费用（从响应中提取或计算）
    let cost = 0;
    if (payload && typeof payload === "object") {
      const response = payload as any;
      
      // 从 Chat Completions 响应中提取费用
      if (response.usage && response.usage.total_tokens) {
        // 这里应该使用定价服务计算实际费用
        // 暂时使用简单的估算：0.002元/1000 tokens
        cost = (response.usage.total_tokens * 0.002) /16120;
      }
    }

    if (cost > 0) {
      // 检查额度
      const quotaCheck = await apiKeyAuthService.checkQuota(apiKeyAuth.keyId, cost);
      if (!quotaCheck.hasQuota) {
        // 额度不足，但请求已经完成，只能记录日志
        console.warn(`API Key ${apiKeyAuth.keyId} 额度不足: 需要 ${cost}, 剩余 ${quotaCheck.remaining}`);
      }

      // 更新使用统计
      const tokens = payload?.usage?.total_tokens || 0;
      await apiKeyAuthService.updateUsageStats(
        apiKeyAuth.keyId,
        cost,
        tokens,
        true // 假设请求成功
      );
    }

  } catch (error) {
    console.error("API Key 额度检查错误:", error);
    // 不中断响应，只记录错误
  }
}

/**
 * API Key 端点权限检查中间件
 */
export function apiKeyEndpointGuard(allowedEndpoints: string[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const apiKeyAuth = (request as any).apiKeyAuth;
    if (!apiKeyAuth) {
      reply.status(401).send({
        code: 401,
        data: null,
        message: "需要 API Key 认证",
      });
      return;
    }

    const permissions = apiKeyAuth.permissions;
    if (!permissions) {
      return; // 没有权限限制
    }

    // 检查端点权限
    if (permissions.allowedEndpoints && permissions.allowedEndpoints.length > 0) {
      const currentEndpoint = request.url.split("?")[0];
      const isAllowed = permissions.allowedEndpoints.some(endpoint => 
        currentEndpoint.startsWith(endpoint)
      );

      if (!isAllowed) {
        reply.status(403).send({
          code: 403,
          data: null,
          message: `API Key 不允许访问端点: ${currentEndpoint}`,
        });
        return;
      }
    }

    // 检查模型权限（如果请求中包含模型信息）
    if (permissions.requireModelCheck !== false && permissions.allowedModels && permissions.allowedModels.length > 0) {
      const body = request.body as any;
      const modelName = body?.model;
      
      if (modelName && !permissions.allowedModels.includes(modelName)) {
        reply.status(403).send({
          code: 403,
          data: null,
          message: `API Key 不允许使用模型: ${modelName}`,
        });
        return;
      }
    }
  };
}