// ============================================================
//  3cloud (3C) — 鉴权中间件
//  JWT Access Token / API Key 双认证体系
// ============================================================

import { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken, AppError } from "../services/auth-service.js";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { users, apiKeys } from "../db/schema.js";

// ── 声明 FastifyRequest.user ──

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      userId: number;
      role: string;
    };
    apiKey?: {
      id: number;
      userId: number;
    };
  }
}

// ── JWT Access Token 鉴权 ──

export async function authenticateJWT(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    reply.status(401).send({
      code: 401,
      data: null,
      message: "缺少 Authorization header",
    });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    request.user = payload;
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      reply.status(401).send({
        code: 401,
        data: null,
        message: "Token 已过期",
      });
      return;
    }
    reply.status(401).send({
      code: 401,
      data: null,
      message: "无效的 Token",
    });
    return;
  }
}

// ── API Key 鉴权（用于 /v1/* Token Proxy） ──

export async function authenticateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    reply.status(401).send({
      error: {
        message: "Missing API Key",
        type: "invalid_request_error",
        code: "invalid_api_key",
      },
    });
    return;
  }

  const apiKey = authHeader.slice(7);

  // SHA-256 哈希后查询
  const { createHash } = await import("node:crypto");
  const keyHash = createHash("sha256").update(apiKey).digest("hex");

  const db = getDb();
  const [keyRecord] = await db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      status: apiKeys.status,
      expiresAt: apiKeys.expiresAt,
      userStatus: users.status,
      userDisabledUntil: users.disabledUntil,
    })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!keyRecord) {
    reply.status(401).send({
      error: {
        message: "Invalid API Key",
        type: "invalid_request_error",
        code: "invalid_api_key",
      },
    });
    return;
  }

  // 检查 Key 状态
  if (!keyRecord.status) {
    reply.status(401).send({
      error: { message: "API Key 已被禁用", type: "invalid_request_error" },
    });
    return;
  }

  // 检查过期
  if (keyRecord.expiresAt && new Date() > keyRecord.expiresAt) {
    reply.status(401).send({
      error: { message: "API Key 已过期", type: "invalid_request_error" },
    });
    return;
  }

  // 检查用户状态
  if (keyRecord.userStatus === "disabled") {
    reply.status(403).send({
      error: { message: "账号已被禁用", type: "access_denied" },
    });
    return;
  }

  if (keyRecord.userStatus === "deleted") {
    reply.status(403).send({
      error: { message: "账号已注销", type: "access_denied" },
    });
    return;
  }

  // 更新 lastUsedAt
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyRecord.id));

  request.apiKey = { id: keyRecord.id, userId: keyRecord.userId };
  request.user = { userId: keyRecord.userId, role: "user" };
}

// ── 角色权限检查 ──

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      reply.status(401).send({
        code: 401,
        data: null,
        message: "未认证",
      });
      return;
    }

    if (!roles.includes(request.user.role)) {
      reply.status(403).send({
        code: 403,
        data: null,
        message: `需要 ${roles.join("/")} 角色`,
      });
      return;
    }
  };
}
