/**
 * 认证步骤 — API Key 鉴权
 *
 * 职责：
 * - 从 Authorization header 提取 Bearer token
 * - 调用 authenticateApiKey 校验 API Key
 * - 设置 ctx.userId / ctx.apiKeyId
 * - 校验失败 → 401/403，不触发前置回滚（纯校验）
 *
 * @see services/api-auth.ts authenticateApiKey
 * @module pipeline/steps
 */

import type { PipelineStep } from "../types";
import type { GatewayContext } from "../types";
import { authenticateApiKey, extractBearerKey } from "../../api-auth";

/**
 * 创建认证 Pipeline 步骤
 *
 * execute: 提取 Bearer key → 鉴权 → 设置 ctx.userId / ctx.apiKeyId
 * rollback: 无（纯校验，失败时不触发前置步骤回滚）
 * noRollbackOn: true
 *
 * @returns Pipeline 步骤对象
 */
export function createAuthStep(): PipelineStep<GatewayContext> {
  return {
    name: "auth",
    noRollbackOn: true,
    execute: async (ctx) => {
      const authorization = ctx.req.headers.authorization as string | undefined;
      const secret = extractBearerKey(authorization);
      if (!secret) {
        throw Object.assign(new Error("缺少 Authorization 头"), { _httpStatus: 401, _code: "UNAUTHORIZED" });
      }

      const auth = await authenticateApiKey(secret);
      if (!auth.ok) {
        const statusMap: Record<string, number> = {
          KEY_INVALID: 401,
          KEY_DISABLED: 403,
          KEY_EXPIRED: 403,
          USER_NOT_FOUND: 401,
          USER_DISABLED: 403,
          INSUFFICIENT_BALANCE: 402,
        };
        const httpStatus = statusMap[auth.code] ?? 401;
        throw Object.assign(new Error(auth.error), { _httpStatus: httpStatus, _code: auth.code });
      }

      ctx.userId = auth.ctx.userId;
      ctx.apiKeyId = auth.ctx.apiKeyId;
    },
  };
}
