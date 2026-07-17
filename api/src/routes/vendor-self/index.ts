// ============================================================
//  3cloud (3C) — 供应商自助管理路由入口
//  委托子模块注册各路由保持向后兼容
//  X-Vendor-Key / JWT 双认证体系
// ============================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb } from "../../db/index.js";
import {
  vendors,
  vendorApiKeys,
} from "../../db/schema.js";
import { authenticateVendorJWT } from "../../middleware/auth.js";
import "./types.js";
import { publicVendorRoutes, meRoutes, jwtVendorRoutes } from "./profile.js";
import { vendorModelRoutes } from "./models.js";
import { vendorStatsRoutes } from "./stats.js";

// ── Vendor key authentication middleware ──

async function authenticateVendorKey(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const vendorKey = request.headers["x-vendor-key"] as string;
  if (!vendorKey) {
    reply.status(401).send({
      code: 401,
      data: null,
      message: "缺少 X-Vendor-Key header",
    });
    return;
  }

  const keyHash = createHash("sha256").update(vendorKey).digest("hex");
  const db = getDb();

  const [keyRecord] = await db
    .select({
      id: vendorApiKeys.id,
      vendorId: vendorApiKeys.vendorId,
      status: vendorApiKeys.status,
      vendorStatus: vendors.status,
      vendorName: vendors.name,
      vendorUserId: vendors.userId,
    })
    .from(vendorApiKeys)
    .innerJoin(vendors, eq(vendorApiKeys.vendorId, vendors.id))
    .where(eq(vendorApiKeys.keyHash, keyHash))
    .limit(1);

  if (!keyRecord) {
    reply.status(401).send({
      code: 401,
      data: null,
      message: "无效的 Vendor Key",
    });
    return;
  }

  if (!keyRecord.status) {
    reply.status(403).send({
      code: 403,
      data: null,
      message: "Vendor Key 已被禁用",
    });
    return;
  }

  if (keyRecord.vendorStatus !== "active" && keyRecord.vendorStatus !== "pending") {
    reply.status(403).send({
      code: 403,
      data: null,
      message: `供应商状态异常: ${keyRecord.vendorStatus}`,
    });
    return;
  }

  request.vendor = {
    id: keyRecord.vendorId,
    userId: keyRecord.vendorUserId,
    name: keyRecord.vendorName,
  };
}

// ── 供应商自助路由（X-Vendor-Key / Bearer JWT 双认证）──

export async function vendorSelfRoutes(app: FastifyInstance) {
  // 公共路由（无需鉴权）
  await publicVendorRoutes(app);

  // ── X-Vendor-Key 鉴权中间件 ──
  app.addHook("preHandler", (request, reply, done) => {
    // 公开路由已注册，走不到这里
    if ((request.url === "/api/vendor/register" && request.method === "POST") ||
        (request.url === "/api/vendor/login" && request.method === "POST")) {
      done();
      return;
    }
    // JWT auth (Authorization: Bearer header) for vendor portal users
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      authenticateVendorJWT(request, reply).then(() => done()).catch((err) => done(err));
      return;
    }
    // Fallback: X-Vendor-Key auth
    authenticateVendorKey(request, reply).then(() => done()).catch((err) => done(err));
  });

  // 受保护路由
  await meRoutes(app);
  await vendorModelRoutes(app);
  await vendorStatsRoutes(app);
}

// ── JWT 鉴权的供应商路由（供门户使用）──

export async function vendorJWTRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateVendorJWT);

  await jwtVendorRoutes(app);
}
