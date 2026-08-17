/**
 * auth step — API Key 认证（P0-4）
 *
 * 认证本身由 Fastify preHandler `apiKeyAuth` 强制执行（在路由 handler 之前完成，
 * 失败 → 401 直接拦截，不进入 pipeline）。本 step 负责：
 *   1. 在 pipeline 链路中显式声明认证环节（链路自文档化）；
 *   2. 断言 preHandler 已注入 apiKeyContext（缺失 → 401，防"绕行未认证"的配置错误）。
 *
 * 路由在构建 ctx 时把 `request.apiKeyContext` 写入 STEP_KEYS.apiKeyContext。
 *
 * @module services/pipeline/steps
 * @see docs/iteration-plan-v2.md P0-4
 */

import { AppError } from '../../../lib/errors';
import { createStep } from '../executor';
import { getStepResult, STEP_KEYS } from './context';

/** preHandler apiKeyAuth 注入的认证上下文形状（对齐 services/auth/apikey.ts） */
export interface ApiKeyAuthContext {
  userId: number;
  apiKeyId: number;
  keyHash: string;
}

/**
 * 创建 auth step
 *
 * @returns PipelineStep — 执行时校验认证上下文已就绪
 */
export function authStep() {
  return createStep('auth', async (ctx) => {
    const apiKeyContext = getStepResult<ApiKeyAuthContext>(ctx, STEP_KEYS.apiKeyContext);
    if (!apiKeyContext || typeof apiKeyContext.userId !== 'number') {
      throw new AppError('API key authentication required', 401, 'UNAUTHORIZED');
    }
    // 同步 ctx 上的身份字段（后续步骤/结算直接使用）
    ctx.userId = apiKeyContext.userId;
    ctx.apiKeyId = apiKeyContext.apiKeyId;
    return apiKeyContext;
  });
}
