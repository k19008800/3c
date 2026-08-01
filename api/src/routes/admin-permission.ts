import type { FastifyInstance } from "fastify";
import { db, pool } from "../db/index";
import { adminRoles, userRoleAssignments } from "../db/schema/admin-roles";
import { users } from "../db/schema/users";
import { getUserEffectivePermMask, getUserActiveRoles, logPermissionChange, seedDefaultRoles, maskToKeys, PERMISSION_TREE, ALL_PERMS } from "../services/permission";
import { eq } from "drizzle-orm";
function requireAdmin(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
      const role = (decoded as any).role;
      if (role !== "admin" && role !== "super_admin") {
        return reply.code(403).send({ code: 403, error: "FORBIDDEN" });
      }
    } catch { return reply.code(401).send({ code: 401, error: "UNAUTHORIZED" }); }
  };
}
function requireAuth(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const decoded = app.jwt.verify(token as string);
      req.user = decoded;
    } catch { return reply.code(401).send({ code: 401, error: "UNAUTHORIZED" }); }
  };
}

export function adminPermissionRoutes(app: FastifyInstance) {
  const admin = requireAdmin(app);
  const auth = requireAuth(app);
  const uid = (req: any) => Number((req as any).user.sub);

  app.post("/admin/roles/seed", { onRequest: [admin], schema: { body: { type: "object", additionalProperties: true } } }, async () => {
    await seedDefaultRoles();
    return { code: 0, data: { ok: true }, message: "预设角色已初始化" };
  });

  app.get("/admin/roles", { onRequest: [admin] }, async () => {
    const rows = await pool.query(
      "SELECT r.*, (SELECT count(*) FROM user_role_assignments a WHERE a.role_id=r.id AND a.revoked_at IS NULL) AS user_count FROM admin_roles r ORDER BY r.sort_order ASC, r.id ASC",
    );
    const list = rows.rows.map((r: any) => ({
      id: r.id, name: r.name, label: r.label, description: r.description,
      permissions: Number(r.permissions), is_system: r.is_system, user_count: Number(r.user_count),
      sort_order: r.sort_order, created_at: r.created_at, updated_at: r.updated_at,
    }));
    return { code: 0, data: { list }, message: "ok" };
  });

  app.get("/admin/roles/permissions/list", { onRequest: [admin] }, async () => {
    return { code: 0, data: { tree: PERMISSION_TREE, all_bits: Number(ALL_PERMS) }, message: "ok" };
  });

  // POST + PUT 正常使用 schema 校验
  app.post("/admin/roles", { onRequest: [admin], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const b = req.body as { name?: string; label?: string; description?: string; permission_bits?: number[] };
    if (!b.name?.trim() || !b.label?.trim()) return reply.code(400).send({ code: 400, error: "MISSING_FIELDS" });
    const permValue = b.permission_bits?.length ? b.permission_bits.reduce((m, k) => m | (1n << BigInt(k)), 0n) : 0n;
    const r = await db.insert(adminRoles).values({ name: b.name, label: b.label, description: b.description ?? null, permissions: Number(permValue) }).returning({ id: adminRoles.id });
    await logPermissionChange({ action: "role_created", operatorId: uid(req), targetRoleId: r[0]!.id, detail: "创建角色 " + b.name });
    return { code: 0, data: { id: r[0]!.id }, message: "角色已创建" };
  });

  app.put("/admin/roles/:id", { onRequest: [admin], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = req.body as { name?: string; label?: string; description?: string; permission_bits?: number[] };
    const cur = await db.select().from(adminRoles).where(eq(adminRoles.id, id)).limit(1);
    if (!cur[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    if (cur[0].isSystem) return reply.code(400).send({ code: 400, error: "SYSTEM_ROLE", message: "系统角色不可编辑" });
    const permValue = b.permission_bits?.length ? b.permission_bits.reduce((m, k) => m | (1n << BigInt(k)), 0n) : cur[0].permissions;
    const oldPerms = cur[0].permissions;
    await db.update(adminRoles).set({
      ...(b.name?.trim() ? { name: b.name } : {}),
      ...(b.label?.trim() ? { label: b.label } : {}),
      ...(b.description !== undefined ? { description: b.description } : {}),
      permissions: Number(permValue),
      updatedAt: new Date(),
    }).where(eq(adminRoles.id, id));
    await logPermissionChange({ action: "role_updated", operatorId: uid(req), targetRoleId: id, detail: "编辑角色 " + (b.label || cur[0].label), diff: JSON.stringify({ before: Number(oldPerms), after: Number(permValue) }) });
    return { code: 0, data: { ok: true }, message: "角色已更新" };
  });

  // DELETE 不带 content-type 避免 Fastify5 空 body 400
  app.post("/admin/roles/:id/delete", { onRequest: [admin], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const cur = await db.select().from(adminRoles).where(eq(adminRoles.id, id)).limit(1);
    if (!cur[0]) return reply.code(404).send({ code: 404, error: "NOT_FOUND" });
    if (cur[0].isSystem) return reply.code(400).send({ code: 400, error: "SYSTEM_ROLE", message: "系统角色不可删除" });
    const cnt = (await pool.query("SELECT count(*)::int c FROM user_role_assignments WHERE role_id=$1 AND revoked_at IS NULL", [id])).rows[0].c;
    if (cnt > 0) return reply.code(400).send({ code: 400, error: "ROLE_HAS_USERS", message: "该角色仍有 " + cnt + " 位关联用户" });
    await db.delete(adminRoles).where(eq(adminRoles.id, id));
    await logPermissionChange({ action: "role_deleted", operatorId: uid(req), targetRoleId: id, detail: "删除角色 " + cur[0].label });
    return { code: 0, data: { ok: true }, message: "角色已删除" };
  });

  app.get("/admin/roles/users/:roleId", { onRequest: [admin] }, async (req) => {
    const roleId = Number((req.params as any).roleId);
    const rows = await pool.query(
      "SELECT u.id, u.email, u.username, a.assigned_at, a.id AS assignment_id FROM user_role_assignments a JOIN users u ON u.id=a.user_id WHERE a.role_id=$1 AND a.revoked_at IS NULL ORDER BY a.assigned_at DESC",
      [roleId],
    );
    return { code: 0, data: { list: rows.rows }, message: "ok" };
  });

  app.get("/admin/users/:userId/roles", { onRequest: [admin] }, async (req) => {
    const userId = Number((req.params as any).userId);
    const roles = await getUserActiveRoles(userId);
    return { code: 0, data: { list: roles }, message: "ok" };
  });

  app.post("/admin/users/:userId/roles/assign", { onRequest: [admin], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const userId = Number((req.params as any).userId);
    const b = req.body as { role_id?: number };
    if (!b.role_id) return reply.code(400).send({ code: 400, error: "MISSING_ROLE" });
    const dup = await pool.query("SELECT id FROM user_role_assignments WHERE user_id=$1 AND role_id=$2 AND revoked_at IS NULL LIMIT 1", [userId, b.role_id]);
    if (!dup.rows[0]) { await db.insert(userRoleAssignments).values({ userId, roleId: b.role_id, assignedBy: uid(req) }); }
    await logPermissionChange({ action: "user_role_assigned", operatorId: uid(req), targetUserId: userId, targetRoleId: b.role_id, detail: "分配角色" });
    return { code: 0, data: { ok: true }, message: "已分配" };
  });

  app.post("/admin/users/:userId/roles/remove", { onRequest: [admin], schema: { body: { type: "object", additionalProperties: true } } }, async (req, reply) => {
    const userId = Number((req.params as any).userId);
    const b = req.body as { role_id?: number };
    if (!b.role_id) return reply.code(400).send({ code: 400, error: "MISSING_ROLE" });
    await pool.query("UPDATE user_role_assignments SET revoked_at=now() WHERE user_id=$1 AND role_id=$2 AND revoked_at IS NULL", [userId, b.role_id]);
    await logPermissionChange({ action: "user_role_removed", operatorId: uid(req), targetUserId: userId, targetRoleId: b.role_id, detail: "移除角色" });
    return { code: 0, data: { ok: true }, message: "已移除" };
  });

  app.get("/admin/users/:userId/permissions/detail", { onRequest: [admin] }, async (req) => {
    const userId = Number((req.params as any).userId);
    const mask = await getUserEffectivePermMask(userId);
    const keys = maskToKeys(mask);
    const roles = await getUserActiveRoles(userId);
    const user = (await db.select({ id: users.id, email: users.email, username: users.username }).from(users).where(eq(users.id, userId)).limit(1))[0];
    const tree = PERMISSION_TREE.map((g) => ({ ...g, permissions: g.permissions.map((p) => ({ ...p, granted: keys.includes(p.key) })) }));
    return { code: 0, data: { user, roles, effective: keys, effective_mask: Number(mask), tree }, message: "ok" };
  });

  app.get("/admin/permission-audit-logs", { onRequest: [admin] }, async (req) => {
    const q = req.query as { action?: string; page?: string; page_size?: string };
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Number(q.page_size) || 20);
    const offset = (page - 1) * pageSize;
    let where = "1=1";
    const params: any[] = [];
    if (q.action) { params.push(q.action); where += " AND l.action=$" + params.length; }
    const total = (await pool.query("SELECT count(*)::int c FROM role_permission_audit_logs l WHERE " + where, params)).rows[0].c;
    const rows = await pool.query(
      "SELECT l.*, op.email AS operator_email, tu.email AS target_email" +
      " FROM role_permission_audit_logs l LEFT JOIN users op ON op.id=l.operator_id" +
      " LEFT JOIN users tu ON tu.id=l.target_user_id" +
      " WHERE " + where + " ORDER BY l.created_at DESC LIMIT " + pageSize + " OFFSET " + offset,
      params,
    );
    return { code: 0, data: { list: rows.rows, pagination: { page, page_size: pageSize, total } }, message: "ok" };
  });

  app.get("/me/permissions", { onRequest: [auth] }, async (req) => {
    const userId = uid(req);
    const mask = await getUserEffectivePermMask(userId);
    const keys = maskToKeys(mask);
    const roles = await getUserActiveRoles(userId);
    const tree = PERMISSION_TREE.map((g) => ({ ...g, permissions: g.permissions.map((p) => ({ ...p, granted: keys.includes(p.key) })) }));
    return { code: 0, data: { roles: roles.map((r: any) => ({ name: r.name, label: r.label })), effective: keys, tree }, message: "ok" };
  });
}
