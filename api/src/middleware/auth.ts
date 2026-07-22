// ============================================================
//  3cloud (3C) — 鉴权中间件
//  JWT Access Token / API Key 双认证体系
// ============================================================

import { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken, AppError } from "../services/auth-service/index.js";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { getRedis } from "../redis.js";
import { users, vendors, apiKeys } from "../db/schema.js";
import { createHash } from "node:crypto"; // PERF: 静态 import 替代 await import()

// ── 声明 FastifyRequest.user ──

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      userId: number;
      role: string;
      impersonatorId?: number;
    };
    apiKey?: {
      id: number;
      userId: number;
    };
    vendor?: {
      id: number;
      userId: number | null;
      name: string;
    };
  }
}

// ── JWT Access Token 鉴权 ──

export async function authenticateJWT(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 跳过 CORS 预检请求
  if (request.method === "OPTIONS") return;

  // 如果 adminKey 中间件已验证通过，跳过 JWT
  if (request.user) return;

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

    // ── 用户状态检查（含 Redis 缓存）──
    if (request.user) {
      const redis = getRedis();
      const cacheKey = `auth:user:status:${request.user.userId}`;
      let userStatus = await redis.get(cacheKey);

      if (!userStatus) {
        const db = getDb();
        const [user] = await db
          .select({ status: users.status, deletedAt: users.deletedAt })
          .from(users)
          .where(eq(users.id, request.user.userId))
          .limit(1);

        if (!user) {
          reply.status(401).send({ code: 401, data: null, message: "用户不存在" });
          return;
        }

        userStatus = user.deletedAt ? 'deleted' : user.status;
        await redis.setex(cacheKey, 60, userStatus);
      }

      if (userStatus === 'disabled') {
        reply.status(403).send({ code: 403, data: null, message: "账号已被禁用" });
        return;
      }
      if (userStatus === 'deleted') {
        reply.status(403).send({ code: 403, data: null, message: "账号已注销" });
        return;
      }
    }
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

// ── Vendor JWT 鉴权 ──

export async function authenticateVendorJWT(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (request.method === "OPTIONS") return;

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

    if (payload.role !== "vendor") {
      reply.status(403).send({
        code: 403,
        data: null,
        message: "非供应商 Token，无法访问",
      });
      return;
    }

    // 查 vendors 表验证 vendor 存在且状态正常
    const db = getDb();
    const [vendor] = await db
      .select({ id: vendors.id, name: vendors.name, status: vendors.status, userId: vendors.userId })
      .from(vendors)
      .where(eq(vendors.id, payload.userId))
      .limit(1);

    if (!vendor) {
      reply.status(401).send({ code: 401, data: null, message: "供应商不存在" });
      return;
    }

    if (vendor.status !== "active") {
      reply.status(403).send({ code: 403, data: null, message: `供应商状态异常: ${vendor.status}` });
      return;
    }

    request.vendor = {
      id: vendor.id,
      userId: vendor.userId,
      name: vendor.name,
    };
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      reply.status(401).send({ code: 401, data: null, message: "Token 已过期" });
      return;
    }
    reply.status(401).send({ code: 401, data: null, message: "无效的 Token" });
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
  // PERF: createHash 已静态 import
  const keyHash = createHash("sha256").update(apiKey).digest("hex");

  const db = getDb();
  const [keyRecord] = await db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      status: apiKeys.status,
      expiresAt: apiKeys.expiresAt,
      userStatus: users.status,
      userRealNameStatus: users.realNameStatus,
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

  // 检查实名认证状态（个人/企业都需要实名通过才能调用 API）
  // PERF: 可通过 schema 类型化替代 as any，为保持兼容保留
  const realNameStatus = (keyRecord as any).userRealNameStatus;
  if (realNameStatus && realNameStatus !== "approved") {
    const statusMsg =
      realNameStatus === "pending_review" ? "实名认证审核中，请等待审核通过" :
      realNameStatus === "rejected" ? "实名认证已被拒绝" :
      "请先完成实名认证";
    reply.status(403).send({
      error: { message: statusMsg, type: "access_denied" },
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

// ── 模拟态拦截：禁止敏感操作 ──

export async function guardNotImpersonating(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (request.user?.impersonatorId) {
    reply.status(403).send({
      code: 403,
      data: null,
      message: "模拟模式下不允许执行此操作",
    });
    return;
  }
}

/**
 * 模拟态拦截变体：允许只读/查询操作（不修改资金或配置）
 * 用于 impersonate 下允许查看数据但不允许写操作
 */
export async function guardNotImpersonatingWrite(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (request.method !== "GET" && request.user?.impersonatorId) {
    reply.status(403).send({
      code: 403,
      data: null,
      message: "模拟模式下不允许执行此操作",
    });
    return;
  }
  // GET 请求允许放行
}

// ══════════════════════════════════════════════
//  Role-based Permission Bitset (Phase 2)
// ══════════════════════════════════════════════

// Permission bit constants (64-bit BigInt)
export const Perm = {
  NONE:                0n,
  DASHBOARD_VIEW:      1n << 0n,
  USER_LIST:           1n << 1n,
  USER_VIEW:           1n << 2n,
  USER_EDIT:           1n << 3n,
  USER_DELETE:          1n << 4n,
  USER_CREATE:          1n << 5n,
  USER_RESET_PWD:       1n << 6n,
  USER_CHANGE_ROLE:     1n << 7n,
  USER_BALANCE:         1n << 8n,
  USER_IMPERSONATE:     1n << 9n,
  REVIEW_LIST:          1n << 10n,
  REVIEW_ACTION:        1n << 11n,
  MODEL_MANAGE:         1n << 12n,
  FINANCE_VIEW:         1n << 13n,
  FINANCE_COMMISSION:   1n << 14n,
  FINANCE_WITHDRAW:     1n << 15n,
  FINANCE_RECHARGE:     1n << 16n,
  CONFIG_VIEW:          1n << 17n,
  CONFIG_EDIT:          1n << 18n,
  SECURITY_VIEW:        1n << 19n,
  SECURITY_ACTION:      1n << 20n,
  AUDIT_VIEW:           1n << 21n,
  AGENT_LIST:           1n << 22n,
  AGENT_MANAGE:         1n << 23n,
  LOG_VIEW:             1n << 24n,
  OPS_READ:             1n << 25n,
  RECONCILIATION_VIEW:  1n << 26n,
  SECURITY_EDIT:        1n << 27n,
  AUDIT_REVIEW:         1n << 28n,
} as const;

// Role -> Permission map
export const ROLE_PERMISSIONS: Record<string, bigint> = {
  super_admin: ~0n,

  // admin: 日常运营管理员 — 能动用户/资源/安全/审计，不能碰钱和系统配置
  admin: 
    Perm.DASHBOARD_VIEW |
    Perm.USER_LIST | Perm.USER_VIEW | Perm.USER_EDIT | Perm.USER_CREATE |
    Perm.USER_RESET_PWD | Perm.USER_DELETE |
    Perm.USER_CHANGE_ROLE | Perm.USER_IMPERSONATE | Perm.USER_BALANCE |
    Perm.REVIEW_LIST | Perm.REVIEW_ACTION |
    Perm.MODEL_MANAGE | Perm.AGENT_LIST | Perm.AGENT_MANAGE |
    Perm.SECURITY_VIEW | Perm.SECURITY_ACTION |
    Perm.CONFIG_VIEW | Perm.CONFIG_EDIT |
    Perm.LOG_VIEW | Perm.AUDIT_VIEW | Perm.AUDIT_REVIEW |
    Perm.FINANCE_VIEW | Perm.FINANCE_COMMISSION |
    Perm.FINANCE_WITHDRAW | Perm.FINANCE_RECHARGE |
    Perm.RECONCILIATION_VIEW,

  // finance_ops: 财务专员 — 仪表盘 + 全部财务功能 + 用户查看(充值审核需要看到用户信息)
  finance_ops:
    Perm.DASHBOARD_VIEW |
    Perm.USER_LIST | Perm.USER_VIEW | Perm.USER_BALANCE |
    Perm.FINANCE_VIEW | Perm.FINANCE_COMMISSION |
    Perm.FINANCE_WITHDRAW | Perm.FINANCE_RECHARGE |
    Perm.RECONCILIATION_VIEW |
    Perm.LOG_VIEW |
    Perm.AGENT_LIST,

  // ops: 运维工程师 — 看板 + 安全查看 + 配置读写 + 用户/实名查看 + 日志 + 模型管理 + 限流
  ops:
    Perm.DASHBOARD_VIEW | Perm.OPS_READ |
    Perm.USER_LIST | Perm.USER_VIEW |
    Perm.REVIEW_LIST |
    Perm.MODEL_MANAGE |
    Perm.SECURITY_VIEW | Perm.SECURITY_ACTION |
    Perm.CONFIG_VIEW | Perm.CONFIG_EDIT |
    Perm.LOG_VIEW | Perm.AUDIT_VIEW |
    Perm.AGENT_LIST,

  // support: 客服/审核 — 用户管理(不含删除/改角色/模拟) + 实名审核 + 日志
  support:
    Perm.USER_LIST | Perm.USER_VIEW | Perm.USER_RESET_PWD |
    Perm.REVIEW_LIST | Perm.REVIEW_ACTION |
    Perm.LOG_VIEW,

  // auditor: 审计员 — 审计日志 + 对账 + 用户查看 + 日志 + 代理商查看
  auditor:
    Perm.AUDIT_VIEW | Perm.AUDIT_REVIEW | Perm.RECONCILIATION_VIEW |
    Perm.USER_LIST | Perm.USER_VIEW |
    Perm.LOG_VIEW | Perm.AGENT_LIST,

  // Non-admin roles get minimal default
  user: Perm.NONE,
  agent: Perm.NONE,
};

/**
 * Require specific permission bits. All specified bits must be present.
 * Usage: requirePerm(Perm.USER_LIST, Perm.USER_VIEW)
 */
export function requirePerm(...perms: bigint[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      reply.status(401).send({ code: 401, data: null, message: "未认证" });
      return;
    }
    const rolePerms = ROLE_PERMISSIONS[request.user.role];
    if (rolePerms === undefined) {
      reply.status(403).send({ code: 403, data: null, message: "无权限" });
      return;
    }
    const required = perms.length > 0 ? perms.reduce((a, b) => a | b, 0n) : 0n;
    if ((rolePerms & required) !== required) {
      reply.status(403).send({
        code: 403,
        data: null,
        message: "无操作权限",
      });
      return;
    }
  };
}
