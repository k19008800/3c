// ============================================================
//  3cloud (3C) — 动态角色权限管理路由
//  POST   /api/v1/admin/roles                     — 创建角色
//  GET    /api/v1/admin/roles                     — 角色列表
//  PATCH  /api/v1/admin/roles/:id                 — 编辑角色
//  DELETE /api/v1/admin/roles/:id                 — 删除角色
//  GET    /api/v1/admin/roles/permissions/list    — 权限位清单
//  GET    /api/v1/admin/users/:id/permissions      — 用户权限查询
//  PUT    /api/v1/admin/users/:id/permissions      — 用户权限微调
//  DELETE /api/v1/admin/users/:id/permissions      — 清除用户权限微调
//  GET    /api/v1/admin/roles/users/:roleId        — 角色下的用户列表
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, sql, inArray, and } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { adminRoles, userRoleAssignments, userPermissionOverrides, users } from "../../db/schema.js";
import { authenticateJWT, requirePerm, Perm, guardNotImpersonating } from "../../middleware/auth.js";
import {
  getUserPermissions,
  clearPermissionCache,
  clearAllPermissionCache,
  getPermissionList,
} from "../../services/permission-engine.js";

export async function adminRoleRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/admin/roles/permissions/list — 权限位清单
  // ════════════════════════════════════════════════════════════

  app.get("/api/v1/admin/roles/permissions/list", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (_request, reply) => {
    const list = getPermissionList();
    reply.status(200).send({ code: 0, data: { list }, message: "ok" });
  });

  // ════════════════════════════════════════════════════════════
  //  POST /api/v1/admin/roles — 创建角色
  // ════════════════════════════════════════════════════════════

  app.post("/api/v1/admin/roles", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE), guardNotImpersonating],
  }, async (request, reply) => {
    const db = getDb();
    const body = request.body as {
      name: string;
      label: string;
      permissions: string;
      description?: string;
    };

    if (!body.name || !body.label) {
      reply.status(200).send({ code: 400, data: null, message: "角色名称和标签不能为空" });
      return;
    }

    // 检查角色名是否已存在
    const [existing] = await db
      .select({ id: adminRoles.id })
      .from(adminRoles)
      .where(eq(adminRoles.name, body.name))
      .limit(1);

    if (existing) {
      reply.status(200).send({ code: 400, data: null, message: "角色名称已存在" });
      return;
    }

    let perms: bigint;
    try {
      perms = BigInt(body.permissions ?? "0");
    } catch {
      reply.status(200).send({ code: 400, data: null, message: "权限值格式错误" });
      return;
    }

    const [role] = await db
      .insert(adminRoles)
      .values({
        name: body.name,
        label: body.label,
        permissions: perms,
        description: body.description ?? null,
      })
      .returning();

    await clearAllPermissionCache();

    reply.status(200).send({
      code: 0,
      data: {
        id: role.id,
        name: role.name,
        label: role.label,
        permissions: role.permissions?.toString() ?? "0",
        isSystem: role.isSystem,
        description: role.description,
        createdAt: role.createdAt?.toISOString() ?? null,
        updatedAt: role.updatedAt?.toISOString() ?? null,
      },
      message: "创建成功",
    });
  });

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/admin/roles — 角色列表
  // ════════════════════════════════════════════════════════════

  app.get("/api/v1/admin/roles", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (_request, reply) => {
    const db = getDb();

    const rows = await db
      .select({
        id: adminRoles.id,
        name: adminRoles.name,
        label: adminRoles.label,
        permissions: adminRoles.permissions,
        isSystem: adminRoles.isSystem,
        description: adminRoles.description,
        createdAt: adminRoles.createdAt,
        updatedAt: adminRoles.updatedAt,
      })
      .from(adminRoles)
      .orderBy(adminRoles.id);

    const list = rows.map((r) => ({
      id: r.id,
      name: r.name,
      label: r.label,
      permissions: r.permissions?.toString() ?? "0",
      isSystem: r.isSystem,
      description: r.description,
      createdAt: r.createdAt?.toISOString() ?? null,
      updatedAt: r.updatedAt?.toISOString() ?? null,
    }));

    reply.status(200).send({ code: 0, data: { list }, message: "ok" });
  });

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/admin/roles/:id — 角色详情
  // ════════════════════════════════════════════════════════════

  app.get("/api/v1/admin/roles/:id", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const roleId = parseInt(id, 10);
    if (isNaN(roleId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的角色 ID" });
      return;
    }

    const [role] = await db
      .select()
      .from(adminRoles)
      .where(eq(adminRoles.id, roleId))
      .limit(1);

    if (!role) {
      reply.status(404).send({ code: 404, data: null, message: "角色不存在" });
      return;
    }

    const [countResult] = await db
      .select({ count: sql`count(*)::int` })
      .from(userRoleAssignments)
      .where(eq(userRoleAssignments.adminRoleId, roleId));

    reply.status(200).send({
      code: 0,
      data: {
        ...role,
        permissions: role.permissions.toString(),
        userCount: Number(countResult?.count ?? 0),
        createdAt: role.createdAt.toISOString(),
        updatedAt: role.updatedAt.toISOString(),
      },
      message: "ok",
    });
  });

  // ════════════════════════════════════════════════════════════
  //  PATCH /api/v1/admin/roles/:id — 编辑角色
  // ════════════════════════════════════════════════════════════

  app.patch("/api/v1/admin/roles/:id", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE), guardNotImpersonating],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const roleId = parseInt(id, 10);
    const body = request.body as {
      label?: string;
      permissions?: string;
      description?: string;
    };

    if (isNaN(roleId)) {
      reply.status(200).send({ code: 400, data: null, message: "无效的角色 ID" });
      return;
    }

    // 检查角色是否存在
    const [existing] = await db
      .select()
      .from(adminRoles)
      .where(eq(adminRoles.id, roleId))
      .limit(1);

    if (!existing) {
      reply.status(200).send({ code: 404, data: null, message: "角色不存在" });
      return;
    }

    // super_admin 不可编辑
    if (existing.name === "super_admin") {
      reply.status(200).send({ code: 403, data: null, message: "超级管理员角色不可编辑" });
      return;
    }

    const updateData: Record<string, any> = {};

    if (body.label !== undefined) {
      updateData.label = body.label;
    }
    if (body.description !== undefined) {
      updateData.description = body.description;
    }
    if (body.permissions !== undefined) {
      try {
        updateData.permissions = BigInt(body.permissions);
      } catch {
        reply.status(200).send({ code: 400, data: null, message: "权限值格式错误" });
        return;
      }
    }

    if (Object.keys(updateData).length === 0) {
      reply.status(200).send({ code: 400, data: null, message: "没有需要更新的字段" });
      return;
    }

    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(adminRoles)
      .set(updateData)
      .where(eq(adminRoles.id, roleId))
      .returning();

    await clearAllPermissionCache();

    reply.status(200).send({
      code: 0,
      data: {
        id: updated.id,
        name: updated.name,
        label: updated.label,
        permissions: updated.permissions?.toString() ?? "0",
        isSystem: updated.isSystem,
        description: updated.description,
        createdAt: updated.createdAt?.toISOString() ?? null,
        updatedAt: updated.updatedAt?.toISOString() ?? null,
      },
      message: "更新成功",
    });
  });

  // ════════════════════════════════════════════════════════════
  //  DELETE /api/v1/admin/roles/:id — 删除角色
  // ════════════════════════════════════════════════════════════

  app.delete("/api/v1/admin/roles/:id", {
    preHandler: [requirePerm(Perm.MODEL_MANAGE), guardNotImpersonating],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const roleId = parseInt(id, 10);

    if (isNaN(roleId)) {
      reply.status(200).send({ code: 400, data: null, message: "无效的角色 ID" });
      return;
    }

    const [existing] = await db
      .select()
      .from(adminRoles)
      .where(eq(adminRoles.id, roleId))
      .limit(1);

    if (!existing) {
      reply.status(200).send({ code: 404, data: null, message: "角色不存在" });
      return;
    }

    // super_admin 和 is_system 角色不可删除
    if (existing.name === "super_admin") {
      reply.status(200).send({ code: 403, data: null, message: "超级管理员角色不可删除" });
      return;
    }
    if (existing.isSystem) {
      reply.status(200).send({ code: 403, data: null, message: "系统预置角色不可删除" });
      return;
    }

    // 删除角色（级联删除 user_role_assignments）
    await db.delete(adminRoles).where(eq(adminRoles.id, roleId));
    await clearAllPermissionCache();

    reply.status(200).send({ code: 0, data: null, message: "删除成功" });
  });

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/admin/users/:id/permissions — 用户权限查询
  // ════════════════════════════════════════════════════════════

  app.get("/api/v1/admin/users/:id/permissions", {
    preHandler: [requirePerm(Perm.USER_VIEW)],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      reply.status(200).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const [userRow] = await db
      .select({ id: users.id, nickname: users.nickname, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRow) {
      reply.status(200).send({ code: 404, data: null, message: "用户不存在" });
      return;
    }

    // 查角色分配
    const assignments = await db
      .select({
        roleId: userRoleAssignments.adminRoleId,
        roleName: adminRoles.name,
        roleLabel: adminRoles.label,
      })
      .from(userRoleAssignments)
      .innerJoin(adminRoles, eq(userRoleAssignments.adminRoleId, adminRoles.id))
      .where(eq(userRoleAssignments.userId, userId));

    // 查权限微调
    const [override] = await db
      .select()
      .from(userPermissionOverrides)
      .where(eq(userPermissionOverrides.userId, userId))
      .limit(1);

    // 计算最终权限
    const effectivePerms = await getUserPermissions(userId);

    reply.status(200).send({
      code: 0,
      data: {
        user: {
          id: userRow.id,
          nickname: userRow.nickname,
          email: userRow.email,
          role: userRow.role,
        },
        roles: assignments.map((a) => ({
          roleId: a.roleId,
          roleName: a.roleName,
          roleLabel: a.roleLabel,
        })),
        override: override
          ? {
              id: override.id,
              grantPerms: override.grantPerms?.toString() ?? "0",
              denyPerms: override.denyPerms?.toString() ?? "0",
              reason: override.reason,
              createdAt: override.createdAt?.toISOString() ?? null,
              updatedAt: override.updatedAt?.toISOString() ?? null,
            }
          : null,
        effectivePermissions: effectivePerms.toString(),
      },
      message: "ok",
    });
  });

  // ════════════════════════════════════════════════════════════
  //  PUT /api/v1/admin/users/:id/permissions — 用户权限微调
  // ════════════════════════════════════════════════════════════

  app.put("/api/v1/admin/users/:id/permissions", {
    preHandler: [requirePerm(Perm.USER_EDIT), guardNotImpersonating],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      reply.status(200).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    const [userRow] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRow) {
      reply.status(200).send({ code: 404, data: null, message: "用户不存在" });
      return;
    }

    const body = request.body as {
      grantPerms?: string;
      denyPerms?: string;
      reason?: string;
    };

    const grantPerms = body.grantPerms !== undefined ? BigInt(body.grantPerms) : 0n;
    const denyPerms = body.denyPerms !== undefined ? BigInt(body.denyPerms) : 0n;

    const [existing] = await db
      .select({ id: userPermissionOverrides.id })
      .from(userPermissionOverrides)
      .where(eq(userPermissionOverrides.userId, userId))
      .limit(1);

    if (existing) {
      await db
        .update(userPermissionOverrides)
        .set({
          grantPerms,
          denyPerms,
          reason: body.reason ?? null,
          grantedBy: request.user!.userId,
          updatedAt: new Date(),
        })
        .where(eq(userPermissionOverrides.userId, userId));
    } else {
      await db
        .insert(userPermissionOverrides)
        .values({
          userId,
          grantPerms,
          denyPerms,
          reason: body.reason ?? null,
          grantedBy: request.user!.userId,
        });
    }

    // 清除用户角色分配，避免覆盖逻辑混淆
    // 当用户有权限微调时，getUserPermissions 会优先取微调值

    await clearPermissionCache(userId);

    reply.status(200).send({ code: 0, data: null, message: "权限微调已设置" });
  });

  // ════════════════════════════════════════════════════════════
  //  DELETE /api/v1/admin/users/:id/permissions — 清除用户权限微调
  // ════════════════════════════════════════════════════════════

  app.delete("/api/v1/admin/users/:id/permissions", {
    preHandler: [requirePerm(Perm.USER_EDIT), guardNotImpersonating],
  }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      reply.status(200).send({ code: 400, data: null, message: "无效的用户 ID" });
      return;
    }

    await db
      .delete(userPermissionOverrides)
      .where(eq(userPermissionOverrides.userId, userId));

    await clearPermissionCache(userId);

    reply.status(200).send({ code: 0, data: null, message: "权限微调已清除" });
  });

  // ════════════════════════════════════════════════════════════
  //  POST /api/v1/admin/roles/:id/users/:userId — 为用户分配角色
  // ════════════════════════════════════════════════════════════

  app.post("/api/v1/admin/roles/:id/users/:userId", {
    preHandler: [requirePerm(Perm.USER_EDIT), guardNotImpersonating],
  }, async (request, reply) => {
    const db = getDb();
    const { id, userId } = request.params as { id: string; userId: string };
    const roleId = parseInt(id, 10);
    const uid = parseInt(userId, 10);

    if (isNaN(roleId) || isNaN(uid)) {
      reply.status(200).send({ code: 400, data: null, message: "无效的角色 ID 或用户 ID" });
      return;
    }

    const [role] = await db
      .select({ id: adminRoles.id })
      .from(adminRoles)
      .where(eq(adminRoles.id, roleId))
      .limit(1);
    if (!role) {
      reply.status(200).send({ code: 404, data: null, message: "角色不存在" });
      return;
    }

    const [userRow] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, uid))
      .limit(1);
    if (!userRow) {
      reply.status(200).send({ code: 404, data: null, message: "用户不存在" });
      return;
    }

    const [existing] = await db
      .select({ id: userRoleAssignments.id })
      .from(userRoleAssignments)
      .where(and(
        eq(userRoleAssignments.userId, uid),
        eq(userRoleAssignments.adminRoleId, roleId),
      ))
      .limit(1);
    if (existing) {
      reply.status(200).send({ code: 400, data: null, message: "该用户已分配此角色" });
      return;
    }

    await db.insert(userRoleAssignments).values({
      userId: uid,
      adminRoleId: roleId,
      assignedBy: request.user!.userId,
    });

    await clearPermissionCache(uid);

    reply.status(200).send({ code: 0, data: null, message: "角色分配成功" });
  });

  // ════════════════════════════════════════════════════════════
  //  DELETE /api/v1/admin/roles/:id/users/:userId — 移除用户角色
  // ════════════════════════════════════════════════════════════

  app.delete("/api/v1/admin/roles/:id/users/:userId", {
    preHandler: [requirePerm(Perm.USER_EDIT), guardNotImpersonating],
  }, async (request, reply) => {
    const db = getDb();
    const { id, userId } = request.params as { id: string; userId: string };
    const roleId = parseInt(id, 10);
    const uid = parseInt(userId, 10);

    if (isNaN(roleId) || isNaN(uid)) {
      reply.status(200).send({ code: 400, data: null, message: "无效的角色 ID 或用户 ID" });
      return;
    }

    const [existing] = await db
      .select({ id: userRoleAssignments.id })
      .from(userRoleAssignments)
      .where(and(
        eq(userRoleAssignments.userId, uid),
        eq(userRoleAssignments.adminRoleId, roleId),
      ))
      .limit(1);
    if (!existing) {
      reply.status(200).send({ code: 404, data: null, message: "该用户未分配此角色" });
      return;
    }

    await db
      .delete(userRoleAssignments)
      .where(and(
        eq(userRoleAssignments.userId, uid),
        eq(userRoleAssignments.adminRoleId, roleId),
      ));

    await clearPermissionCache(uid);

    reply.status(200).send({ code: 0, data: null, message: "角色已移除" });
  });

  // ════════════════════════════════════════════════════════════
  //  GET /api/v1/admin/roles/users/:roleId — 角色下的用户列表
  // ════════════════════════════════════════════════════════════

  app.get("/api/v1/admin/roles/users/:roleId", {
    preHandler: [requirePerm(Perm.USER_LIST)],
  }, async (request, reply) => {
    const db = getDb();
    const { roleId } = request.params as { roleId: string };
    const rid = parseInt(roleId, 10);

    if (isNaN(rid)) {
      reply.status(200).send({ code: 400, data: null, message: "无效的角色 ID" });
      return;
    }

    const [role] = await db
      .select({ id: adminRoles.id, name: adminRoles.name, label: adminRoles.label })
      .from(adminRoles)
      .where(eq(adminRoles.id, rid))
      .limit(1);

    if (!role) {
      reply.status(200).send({ code: 404, data: null, message: "角色不存在" });
      return;
    }

    const assignments = await db
      .select({
        userId: users.id,
        nickname: users.nickname,
        email: users.email,
        assignedAt: userRoleAssignments.createdAt,
      })
      .from(userRoleAssignments)
      .innerJoin(users, eq(userRoleAssignments.userId, users.id))
      .where(eq(userRoleAssignments.adminRoleId, rid))
      .orderBy(userRoleAssignments.createdAt);

    const list = assignments.map((a) => ({
      userId: a.userId,
      nickname: a.nickname,
      email: a.email,
      assignedAt: a.assignedAt?.toISOString() ?? null,
    }));

    reply.status(200).send({
      code: 0,
      data: {
        role: {
          id: role.id,
          name: role.name,
          label: role.label,
        },
        users: list,
      },
      message: "ok",
    });
  });
}
