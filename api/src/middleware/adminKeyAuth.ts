// ============================================================
//  3cloud (3C) — 管理 API Key 鉴权中间件
//  X-Admin-Key header → SHA-256 → 验证 → 权限检查 → 使用日志
//  adminKey 优先于 JWT：如果 X-Admin-Key 存在则跳过 JWT
// ============================================================

import { FastifyRequest, FastifyReply } from "fastify";
import { createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { adminApiKeys, adminKeyUsageLogs } from "../db/schema.js";

// ── 声明扩展类型 ──

declare module "fastify" {
  interface FastifyRequest {
    adminKey?: {
      id: number;
      name: string;
      permissions: string[];
    };
  }
}

// ── 内置允许的模块与操作 ──

const VALID_MODULES = [
  "users", "finance", "vendors", "models",
  "agents", "security", "system", "audit", "stats",
] as const;

const VALID_ACTIONS = ["read", "write", "delete"] as const;

// ── 权限匹配 ──

function hasPermission(permissions: string[], module: string, action: string): boolean {
  // *:* 表示全权限
  if (permissions.includes("*:*")) return true;

  const required = `${module}:${action}`;
  // 精确匹配
  if (permissions.includes(required)) return true;
  // 模块通配符：模块:*
  if (permissions.includes(`${module}:*`)) return true;

  return false;
}

// ── 获取路由对应的模块和操作 ──

interface ModuleAction {
  module: string;
  action: string;
}

const METHOD_TO_ACTION: Record<string, string> = {
  GET: "read",
  POST: "write",
  PUT: "write",
  PATCH: "write",
  DELETE: "delete",
  OPTIONS: "read",
};

/**
 * 根据请求路径和方法推断出模块和操作。
 * 路由前缀映射规则：
 *   /api/v1/admin/users        → users
 *   /api/v1/admin/finance      → finance
 *   /api/v1/admin/vendors      → vendors
 *   /api/v1/admin/models       → models
 *   /api/v1/admin/agents       → agents
 *   /api/v1/admin/security     → security
 *   /api/v1/admin/system       → system
 *   /api/v1/admin/audit-logs   → audit
 *   /api/v1/admin/dashboard    → stats
 *   /api/v1/admin/logs         → audit
 *   /api/v1/admin/reviews      → users
 *   /api/redemption            → finance
 *   /api/v1/admin/api-keys     → system (管理 API Key 管理)
 */
function inferModuleAction(method: string, path: string): ModuleAction | null {
  // 标准化路径（去掉尾部 /）
  const normalized = path.replace(/\/+$/, "").toLowerCase();
  const methodUpper = method.toUpperCase();
  const action = METHOD_TO_ACTION[methodUpper] || "read";

  // 管理 API Key 自身的操作（/api/v1/admin/api-keys*）→ system
  if (/^\/api\/v1\/admin\/api-keys/.test(normalized)) {
    return { module: "system", action };
  }

  // 兑换码相关 → finance
  if (/^\/api\/redemption/.test(normalized)) {
    return { module: "finance", action };
  }

  // 管理路由
  if (/^\/api\/v1\/admin\//.test(normalized)) {
    const segment = normalized.replace(/^\/api\/v1\/admin\//, "").split("/")[0];

    const moduleMap: Record<string, string> = {
      users: "users",
      finance: "finance",
      vendors: "vendors",
      models: "models",
      agents: "agents",
      security: "security",
      system: "system",
      dashboard: "stats",
      "audit-logs": "audit",
      logs: "audit",
      reviews: "users",
      "recharge": "finance",
      "withdraw": "finance",
      "commission": "finance",
    };

    const mod = moduleMap[segment];
    if (mod) return { module: mod, action };
  }

  return null;
}

// ── 主要中间件 ──

export async function authenticateAdminKey(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 跳过 CORS 预检
  if (request.method === "OPTIONS") return;

  const adminKey = request.headers["x-admin-key"] as string | undefined;

  // 没有 X-Admin-Key header 则跳过（降级到 JWT）
  if (!adminKey) return;

  // ── 验证 Key ──
  const keyHash = createHash("sha256").update(adminKey).digest("hex");
  const db = getDb();
  const startTime = Date.now();

  const [keyRecord] = await db
    .select({
      id: adminApiKeys.id,
      name: adminApiKeys.name,
      permissions: adminApiKeys.permissions,
      status: adminApiKeys.status,
      expiresAt: adminApiKeys.expiresAt,
    })
    .from(adminApiKeys)
    .where(eq(adminApiKeys.keyHash, keyHash))
    .limit(1);

  if (!keyRecord) {
    reply.status(401).send({
      code: 401,
      data: null,
      message: "无效的管理 API Key",
    });
    return;
  }

  // 检查状态
  if (keyRecord.status === "disabled") {
    reply.status(403).send({
      code: 403,
      data: null,
      message: "管理 API Key 已被禁用",
    });
    return;
  }

  // 检查过期
  if (keyRecord.expiresAt && new Date() > new Date(keyRecord.expiresAt)) {
    reply.status(403).send({
      code: 403,
      data: null,
      message: "管理 API Key 已过期",
    });
    return;
  }

  // ── 权限检查 ──
  const permissions: string[] = Array.isArray(keyRecord.permissions)
    ? keyRecord.permissions
    : [];

  const inferred = inferModuleAction(request.method, request.url);

  if (inferred) {
    if (!hasPermission(permissions, inferred.module, inferred.action)) {
      const durationMs = Date.now() - startTime;
      // 记录使用日志（权限不足也记录）
      await db.insert(adminKeyUsageLogs).values({
        keyId: keyRecord.id,
        method: request.method,
        path: request.url,
        ip: request.ip,
        statusCode: 403,
        durationMs,
      }).catch(() => {});

      reply.status(403).send({
        code: 403,
        data: null,
        message: `权限不足：需要 ${inferred.module}:${inferred.action}`,
      });
      return;
    }
  }

  // ── 记录使用日志 ──
  const durationMs = Date.now() - startTime;

  // 异步记录（不阻塞响应）
  db.insert(adminKeyUsageLogs).values({
    keyId: keyRecord.id,
    method: request.method,
    path: request.url,
    ip: request.ip,
    statusCode: null, // 由后续处理器设置
    durationMs,
  }).catch((err) => {
    console.error("[AdminKeyAuth] 使用日志写入失败:", err.message);
  });

  // ── 更新 lastUsedAt ──
  db.update(adminApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(adminApiKeys.id, keyRecord.id))
    .catch(() => {});

  // ── 注入到 request ──
  request.adminKey = {
    id: keyRecord.id,
    name: keyRecord.name,
    permissions,
  };

  // ── 也注入 user 供下游中间件使用（管理 Key 相当于超级管理员）──
  request.user = {
    userId: 0,       // 管理 Key 不关联具体用户
    role: "super_admin",
  };
}
