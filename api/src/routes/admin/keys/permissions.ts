// ============================================================
//  3cloud (3C) — API Key 权限管理路由
//  GET    /api/v1/admin/keys/:id/permissions          — 获取权限配置
//  PUT    /api/v1/admin/keys/:id/permissions          — 更新权限配置
//  POST   /api/v1/admin/keys/permission-templates     — 创建权限模板
//  GET    /api/v1/admin/keys/permission-templates     — 列表权限模板
//  GET    /api/v1/admin/keys/permission-templates/:id — 获取单个模板
//  PUT    /api/v1/admin/keys/permission-templates/:id — 更新权限模板
//  DELETE /api/v1/admin/keys/permission-templates/:id — 删除权限模板
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { apiKeys, apiKeyPermissionTemplates, auditLogs } from "../../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";
import {
  apiKeyPermissionsSchema,
  createPermissionTemplateSchema,
  updatePermissionTemplateSchema,
  isValidIpOrCidr,
} from "../../../schemas/api-keys.js";
import type { ApiKeyPermissions } from "../../../db/schema/api-keys.js";

export async function apiKeyPermissionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ══════════════════════════════════════════════
  //  API Key 权限配置
  // ══════════════════════════════════════════════

  // ── GET /api/v1/admin/keys/:id/permissions — 获取权限配置 ──
  app.get("/api/v1/admin/keys/:id/permissions", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const keyId = parseInt(id, 10);

    if (isNaN(keyId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的 Key ID" });
      return;
    }

    const [key] = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        permissions: apiKeys.permissions,
        templateId: apiKeys.templateId,
      })
      .from(apiKeys)
      .where(eq(apiKeys.id, keyId))
      .limit(1);

    if (!key) {
      reply.status(404).send({ code: 404, data: null, message: "API Key 不存在" });
      return;
    }

    // 如果关联了模板，获取模板信息
    let template = null;
    if (key.templateId) {
      const [tpl] = await db
        .select()
        .from(apiKeyPermissionTemplates)
        .where(eq(apiKeyPermissionTemplates.id, key.templateId))
        .limit(1);
      template = tpl || null;
    }

    reply.status(200).send({
      code: 0,
      data: {
        keyId: key.id,
        keyName: key.name,
        permissions: key.permissions || null,
        templateId: key.templateId || null,
        template,
      },
      message: "ok",
    });
  });

  // ── PUT /api/v1/admin/keys/:id/permissions — 更新权限配置 ──
  app.put("/api/v1/admin/keys/:id/permissions", {
    preHandler: [requirePerm(Perm.USER_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const keyId = parseInt(id, 10);

    if (isNaN(keyId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的 Key ID" });
      return;
    }

    const body = request.body as {
      permissions?: ApiKeyPermissions;
      templateId?: number | null;
    };

    // 验证 permissions
    if (body.permissions) {
      const parsed = apiKeyPermissionsSchema.safeParse(body.permissions);
      if (!parsed.success) {
        reply.status(400).send({
          code: 400,
          data: null,
          message: `权限配置格式错误: ${parsed.error.errors[0]?.message}`,
        });
        return;
      }

      // 验证 IP 白名单格式
      if (body.permissions.ipWhitelist && body.permissions.ipWhitelist.length > 0) {
        for (const ip of body.permissions.ipWhitelist) {
          if (!isValidIpOrCidr(ip)) {
            reply.status(400).send({
              code: 400,
              data: null,
              message: `无效的 IP 地址格式: ${ip}`,
            });
            return;
          }
        }
      }
    }

    const [existing] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, keyId))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: "API Key 不存在" });
      return;
    }

    // 如果指定了模板，验证模板存在
    if (body.templateId) {
      const [template] = await db
        .select()
        .from(apiKeyPermissionTemplates)
        .where(eq(apiKeyPermissionTemplates.id, body.templateId))
        .limit(1);

      if (!template) {
        reply.status(400).send({ code: 400, data: null, message: "权限模板不存在" });
        return;
      }
    }

    const updateData: any = {};
    if (body.permissions !== undefined) updateData.permissions = body.permissions;
    if (body.templateId !== undefined) updateData.templateId = body.templateId;

    await db.update(apiKeys).set(updateData).where(eq(apiKeys.id, keyId));

    // 记录审计日志
    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "api_key_permissions_update",
      targetType: "api_key",
      targetId: keyId,
      before: { permissions: existing.permissions, templateId: existing.templateId },
      after: updateData,
      ip: request.ip,
      description: `更新 API Key #${keyId} 的权限配置`,
    });

    reply.status(200).send({
      code: 0,
      data: null,
      message: "权限配置已更新",
    });
  });

  // ══════════════════════════════════════════════
  //  权限模板管理
  // ══════════════════════════════════════════════

  // ── GET /api/v1/admin/keys/permission-templates — 列表权限模板 ──
  app.get("/api/v1/admin/keys/permission-templates", {
    preHandler: [requirePerm(Perm.USER_LIST)],
  }, async (request, reply) => {
    const db = getDb();

    const templates = await db
      .select()
      .from(apiKeyPermissionTemplates)
      .orderBy(desc(apiKeyPermissionTemplates.isSystem), desc(apiKeyPermissionTemplates.createdAt));

    reply.status(200).send({
      code: 0,
      data: {
        list: templates.map(t => ({
          ...t,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        })),
      },
      message: "ok",
    });
  });

  // ── GET /api/v1/admin/keys/permission-templates/:id — 获取单个模板 ──
  app.get("/api/v1/admin/keys/permission-templates/:id", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const templateId = parseInt(id, 10);

    if (isNaN(templateId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的模板 ID" });
      return;
    }

    const [template] = await db
      .select()
      .from(apiKeyPermissionTemplates)
      .where(eq(apiKeyPermissionTemplates.id, templateId))
      .limit(1);

    if (!template) {
      reply.status(404).send({ code: 404, data: null, message: "权限模板不存在" });
      return;
    }

    reply.status(200).send({
      code: 0,
      data: {
        ...template,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      },
      message: "ok",
    });
  });

  // ── POST /api/v1/admin/keys/permission-templates — 创建权限模板 ──
  app.post("/api/v1/admin/keys/permission-templates", {
    preHandler: [requirePerm(Perm.CONFIG_EDIT)],
  }, async (request, reply) => {
    try {
      const parsed = createPermissionTemplateSchema.parse(request.body);
      const db = getDb();

      // 验证 IP 白名单格式
      if (parsed.permissions.ipWhitelist && parsed.permissions.ipWhitelist.length > 0) {
        for (const ip of parsed.permissions.ipWhitelist) {
          if (!isValidIpOrCidr(ip)) {
            reply.status(400).send({
              code: 400,
              data: null,
              message: `无效的 IP 地址格式: ${ip}`,
            });
            return;
          }
        }
      }

      const [template] = await db
        .insert(apiKeyPermissionTemplates)
        .values({
          name: parsed.name,
          description: parsed.description || null,
          permissions: parsed.permissions as ApiKeyPermissions,
        })
        .returning();

      reply.status(200).send({
        code: 0,
        data: {
          ...template,
          createdAt: template.createdAt.toISOString(),
          updatedAt: template.updatedAt.toISOString(),
        },
        message: "权限模板已创建",
      });

      // 审计日志
      await db.insert(auditLogs).values({
        operatorId: request.user!.userId,
        action: "permission_template_create",
        targetType: "permission_template",
        targetId: template.id,
        after: template,
        ip: request.ip,
        description: `创建权限模板: ${template.name}`,
      });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        reply.status(400).send({
          code: 400,
          data: null,
          message: err.errors?.[0]?.message || "参数校验失败",
        });
        return;
      }
      throw err;
    }
  });

  // ── PUT /api/v1/admin/keys/permission-templates/:id — 更新权限模板 ──
  app.put("/api/v1/admin/keys/permission-templates/:id", {
    preHandler: [requirePerm(Perm.CONFIG_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const templateId = parseInt(id, 10);

    if (isNaN(templateId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的模板 ID" });
      return;
    }

    const [existing] = await db
      .select()
      .from(apiKeyPermissionTemplates)
      .where(eq(apiKeyPermissionTemplates.id, templateId))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: "权限模板不存在" });
      return;
    }

    if (existing.isSystem) {
      reply.status(403).send({ code: 403, data: null, message: "系统预设模板不可修改" });
      return;
    }

    try {
      const parsed = updatePermissionTemplateSchema.parse(request.body);

      // 验证 IP 白名单格式
      if (parsed.permissions?.ipWhitelist && parsed.permissions.ipWhitelist.length > 0) {
        for (const ip of parsed.permissions.ipWhitelist) {
          if (!isValidIpOrCidr(ip)) {
            reply.status(400).send({
              code: 400,
              data: null,
              message: `无效的 IP 地址格式: ${ip}`,
            });
            return;
          }
        }
      }

      const updateData: any = { updatedAt: new Date() };
      if (parsed.name !== undefined) updateData.name = parsed.name;
      if (parsed.description !== undefined) updateData.description = parsed.description;
      if (parsed.permissions !== undefined) updateData.permissions = parsed.permissions;

      const [updated] = await db
        .update(apiKeyPermissionTemplates)
        .set(updateData)
        .where(eq(apiKeyPermissionTemplates.id, templateId))
        .returning();

      reply.status(200).send({
        code: 0,
        data: {
          ...updated,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
        message: "权限模板已更新",
      });

      // 审计日志
      await db.insert(auditLogs).values({
        operatorId: request.user!.userId,
        action: "permission_template_update",
        targetType: "permission_template",
        targetId: templateId,
        before: existing,
        after: updated,
        ip: request.ip,
        description: `更新权限模板: ${updated.name}`,
      });
    } catch (err: any) {
      if (err?.name === "ZodError") {
        reply.status(400).send({
          code: 400,
          data: null,
          message: err.errors?.[0]?.message || "参数校验失败",
        });
        return;
      }
      throw err;
    }
  });

  // ── DELETE /api/v1/admin/keys/permission-templates/:id — 删除权限模板 ──
  app.delete("/api/v1/admin/keys/permission-templates/:id", {
    preHandler: [requirePerm(Perm.CONFIG_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const templateId = parseInt(id, 10);

    if (isNaN(templateId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的模板 ID" });
      return;
    }

    const [existing] = await db
      .select()
      .from(apiKeyPermissionTemplates)
      .where(eq(apiKeyPermissionTemplates.id, templateId))
      .limit(1);

    if (!existing) {
      reply.status(404).send({ code: 404, data: null, message: "权限模板不存在" });
      return;
    }

    if (existing.isSystem) {
      reply.status(403).send({ code: 403, data: null, message: "系统预设模板不可删除" });
      return;
    }

    // 检查是否有 API Key 正在使用此模板
    const [keyUsingTemplate] = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.templateId, templateId))
      .limit(1);

    if (keyUsingTemplate) {
      reply.status(400).send({
        code: 400,
        data: null,
        message: "此模板正在被 API Key 使用，无法删除",
      });
      return;
    }

    await db
      .delete(apiKeyPermissionTemplates)
      .where(eq(apiKeyPermissionTemplates.id, templateId));

    reply.status(200).send({
      code: 0,
      data: null,
      message: "权限模板已删除",
    });

    // 审计日志
    await db.insert(auditLogs).values({
      operatorId: request.user!.userId,
      action: "permission_template_delete",
      targetType: "permission_template",
      targetId: templateId,
      before: existing,
      ip: request.ip,
      description: `删除权限模板: ${existing.name}`,
    });
  });
}
