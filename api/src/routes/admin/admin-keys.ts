// ============================================================
//  3cloud (3C) — 管理 API Key 路由
//  POST   /api/v1/admin/api-keys              — 创建管理 Key
//  GET    /api/v1/admin/api-keys              — 列表
//  PUT    /api/v1/admin/api-keys/:id          — 更新
//  DELETE /api/v1/admin/api-keys/:id          — 禁用
//  GET    /api/v1/admin/api-keys/:id/logs     — 使用日志
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc, and, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "../../db/index.js";
import { adminApiKeys, adminKeyUsageLogs, auditLogs } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../middleware/auth.js";
import { authenticateAdminKey } from "../../middleware/adminKeyAuth.js";

// ── 有效模块列表 ──

const VALID_MODULES = [
  "users", "finance", "vendors", "models",
  "agents", "security", "system", "audit", "stats",
] as const;

// ── 工具：生成 32 位随机管理 Key ──

function generateAdminKey(): string {
  const prefix = "3c";
  const suffix = randomBytes(24).toString("hex");
  return `${prefix}_${suffix}`;
}

export async function adminKeyManagementRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ════════════════════════════════════════════════
  //  POST /api/v1/admin/api-keys — 创建管理 Key
  // ════════════════════════════════════════════════
  app.post("/api/v1/admin/api-keys", {
    preHandler: [requirePerm(Perm.CONFIG_EDIT)],
    handler: async (request, reply) => {
      try {
        const body = request.body as {
          name?: string;
          permissions?: string[];
          expiresAt?: string;
        };

        if (!body.name) {
          reply.status(400).send({ code: 400, data: null, message: "name 必填" });
          return;
        }

        const name = String(body.name).trim();
        const rawPermissions: string[] = Array.isArray(body.permissions) ? body.permissions : [];
        const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

        // ── 校验权限格式 ──
        for (const perm of rawPermissions) {
          if (perm === "*:*") continue;
          const parts = perm.split(":");
          if (parts.length !== 2) {
            reply.status(400).send({ code: 400, data: null, message: `权限格式错误: ${perm}，应为 模块:操作` });
            return;
          }
          const [mod, act] = parts;
          if (!(VALID_MODULES as readonly string[]).includes(mod)) {
            reply.status(400).send({ code: 400, data: null, message: `无效模块: ${mod}` });
            return;
          }
          if (!["read", "write", "delete", "*"].includes(act)) {
            reply.status(400).send({ code: 400, data: null, message: `无效操作: ${act}，应为 read/write/delete/*` });
            return;
          }
        }

        // ── 生成 Key ──
        const rawKey = generateAdminKey();
        const keyHash = createHash("sha256").update(rawKey).digest("hex");
        const keyPrefix = rawKey.substring(0, 8);

        const db = getDb();

        const [record] = await db
          .insert(adminApiKeys)
          .values({
            name,
            keyHash,
            keyPrefix,
            permissions: rawPermissions,
            status: "active",
            expiresAt,
            createdBy: request.user!.userId,
          })
          .returning();

        // ── 审计日志 ──
        await db.insert(auditLogs).values({
          operatorId: request.user!.userId,
          action: "config_update",
          targetType: "admin_api_key",
          targetId: record.id,
          after: { name, permissions: rawPermissions, expiresAt },
          ip: request.ip,
          description: `创建管理 API Key: ${name}`,
        });

        reply.status(200).send({
          code: 0,
          data: {
            id: record.id,
            name: record.name,
            keyPrefix: record.keyPrefix,
            key: rawKey, // 仅返回一次！
            permissions: rawPermissions,
            expiresAt: record.expiresAt?.toISOString() ?? null,
            createdAt: record.createdAt.toISOString(),
          },
          message: "管理 API Key 创建成功，请立即保存 Key（仅此一次返回）",
        });
      } catch (err: any) {
        if (err?.code === "23505") {
          reply.status(409).send({ code: 409, data: null, message: "Key 哈希冲突，请重试" });
          return;
        }
        throw err;
      }
    },
  });

  // ════════════════════════════════════════════════
  //  GET /api/v1/admin/api-keys — 列表
  // ════════════════════════════════════════════════
  app.get("/api/v1/admin/api-keys", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const query = request.query as {
          page?: string;
          pageSize?: string;
          status?: string;
        };

        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
        const offset = (page - 1) * pageSize;

        const conditions: any[] = [];
        if (query.status) {
          conditions.push(eq(adminApiKeys.status, query.status as any));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const [totalResult] = await db
          .select({ total: sql<number>`count(*)::int` })
          .from(adminApiKeys)
          .where(whereClause);

        const total = totalResult?.total ?? 0;

        const rows = await db
          .select({
            id: adminApiKeys.id,
            name: adminApiKeys.name,
            keyPrefix: adminApiKeys.keyPrefix,
            permissions: adminApiKeys.permissions,
            status: adminApiKeys.status,
            expiresAt: adminApiKeys.expiresAt,
            lastUsedAt: adminApiKeys.lastUsedAt,
            createdBy: adminApiKeys.createdBy,
            createdAt: adminApiKeys.createdAt,
          })
          .from(adminApiKeys)
          .where(whereClause)
          .orderBy(desc(adminApiKeys.createdAt))
          .limit(pageSize)
          .offset(offset);

        reply.status(200).send({
          code: 0,
          data: {
            list: rows.map((r) => ({
              ...r,
              expiresAt: r.expiresAt?.toISOString() ?? null,
              lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
              createdAt: r.createdAt.toISOString(),
            })),
            total,
            page,
            pageSize,
          },
          message: "ok",
        });
      } catch (err: any) {
        throw err;
      }
    },
  });

  // ════════════════════════════════════════════════
  //  PUT /api/v1/admin/api-keys/:id — 更新
  // ════════════════════════════════════════════════
  app.put("/api/v1/admin/api-keys/:id", {
    preHandler: [requirePerm(Perm.CONFIG_EDIT)],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const { id } = request.params as { id: string };
        const keyId = parseInt(id, 10);

        if (isNaN(keyId)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
          return;
        }

        const body = request.body as {
          name?: string;
          permissions?: string[];
        };

        const [existing] = await db
          .select()
          .from(adminApiKeys)
          .where(eq(adminApiKeys.id, keyId))
          .limit(1);

        if (!existing) {
          reply.status(404).send({ code: 404, data: null, message: "管理 API Key 不存在" });
          return;
        }

        const updateData: any = {};

        if (body.name !== undefined) {
          updateData.name = String(body.name).trim();
        }

        if (body.permissions !== undefined) {
          const rawPermissions: string[] = Array.isArray(body.permissions) ? body.permissions : [];
          for (const perm of rawPermissions) {
            if (perm === "*:*") continue;
            const parts = perm.split(":");
            if (parts.length !== 2) {
              reply.status(400).send({ code: 400, data: null, message: `权限格式错误: ${perm}` });
              return;
            }
            const [mod, act] = parts;
            if (!(VALID_MODULES as readonly string[]).includes(mod)) {
              reply.status(400).send({ code: 400, data: null, message: `无效模块: ${mod}` });
              return;
            }
            if (!["read", "write", "delete", "*"].includes(act)) {
              reply.status(400).send({ code: 400, data: null, message: `无效操作: ${act}` });
              return;
            }
          }
          updateData.permissions = rawPermissions;
        }

        if (Object.keys(updateData).length === 0) {
          reply.status(400).send({ code: 400, data: null, message: "没有要更新的字段" });
          return;
        }

        await db
          .update(adminApiKeys)
          .set(updateData)
          .where(eq(adminApiKeys.id, keyId));

        // ── 审计日志 ──
        await db.insert(auditLogs).values({
          operatorId: request.user!.userId,
          action: "config_update",
          targetType: "admin_api_key",
          targetId: keyId,
          before: { name: existing.name, permissions: existing.permissions },
          after: updateData,
          ip: request.ip,
          description: `更新管理 API Key: ${existing.name}`,
        });

        reply.status(200).send({
          code: 0,
          data: null,
          message: "管理 API Key 已更新",
        });
      } catch (err: any) {
        throw err;
      }
    },
  });

  // ════════════════════════════════════════════════
  //  DELETE /api/v1/admin/api-keys/:id — 禁用
  // ════════════════════════════════════════════════
  app.delete("/api/v1/admin/api-keys/:id", {
    preHandler: [requirePerm(Perm.CONFIG_EDIT)],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const { id } = request.params as { id: string };
        const keyId = parseInt(id, 10);

        if (isNaN(keyId)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
          return;
        }

        const [existing] = await db
          .select()
          .from(adminApiKeys)
          .where(eq(adminApiKeys.id, keyId))
          .limit(1);

        if (!existing) {
          reply.status(404).send({ code: 404, data: null, message: "管理 API Key 不存在" });
          return;
        }

        if (existing.status === "disabled") {
          reply.status(400).send({ code: 400, data: null, message: "该 Key 已被禁用" });
          return;
        }

        await db
          .update(adminApiKeys)
          .set({ status: "disabled" })
          .where(eq(adminApiKeys.id, keyId));

        // ── 审计日志 ──
        await db.insert(auditLogs).values({
          operatorId: request.user!.userId,
          action: "config_update",
          targetType: "admin_api_key",
          targetId: keyId,
          before: { status: existing.status },
          after: { status: "disabled" },
          ip: request.ip,
          description: `禁用管理 API Key: ${existing.name}`,
        });

        reply.status(200).send({
          code: 0,
          data: null,
          message: "管理 API Key 已禁用",
        });
      } catch (err: any) {
        throw err;
      }
    },
  });

  // ════════════════════════════════════════════════
  //  GET /api/v1/admin/api-keys/:id/logs — 使用日志
  // ════════════════════════════════════════════════
  app.get("/api/v1/admin/api-keys/:id/logs", {
    preHandler: [requirePerm(Perm.AUDIT_VIEW)],
    handler: async (request, reply) => {
      try {
        const db = getDb();
        const { id } = request.params as { id: string };
        const keyId = parseInt(id, 10);

        if (isNaN(keyId)) {
          reply.status(400).send({ code: 400, data: null, message: "无效的 ID" });
          return;
        }

        const query = request.query as {
          page?: string;
          pageSize?: string;
        };

        const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10) || 20));
        const offset = (page - 1) * pageSize;

        const [totalResult] = await db
          .select({ total: sql<number>`count(*)::int` })
          .from(adminKeyUsageLogs)
          .where(eq(adminKeyUsageLogs.keyId, keyId));

        const total = totalResult?.total ?? 0;

        const rows = await db
          .select()
          .from(adminKeyUsageLogs)
          .where(eq(adminKeyUsageLogs.keyId, keyId))
          .orderBy(desc(adminKeyUsageLogs.createdAt))
          .limit(pageSize)
          .offset(offset);

        reply.status(200).send({
          code: 0,
          data: {
            list: rows.map((r) => ({
              ...r,
              createdAt: r.createdAt.toISOString(),
            })),
            total,
            page,
            pageSize,
          },
          message: "ok",
        });
      } catch (err: any) {
        throw err;
      }
    },
  });
}
