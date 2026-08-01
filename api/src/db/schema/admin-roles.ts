import { pgTable, serial, varchar, text, bigint, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * 管理员角色表（§30.1 bitset 权限引擎底座）
 * 对齐 SPEC-§30-权限管理.md
 * permissions: bigint bitset，每位对应一个权限常量
 * is_system: 系统内置角色不可编辑/删除
 */
export const adminRoles = pgTable(
  "admin_roles",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 50 }).notNull().unique(),
    label: varchar("label", { length: 100 }).notNull(),
    description: text("description"),
    permissions: bigint("permissions", { mode: "number" }).notNull().default(0),
    isSystem: boolean("is_system").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_admin_roles_name").on(table.name)],
);

export type AdminRole = typeof adminRoles.$inferSelect;
export type NewAdminRole = typeof adminRoles.$inferInsert;

/**
 * 用户角色分配表（§30.1 §30.2）
 * 支持多角色（一人多角色取权限并集）
 * revoked_at 非空 = 已撤销（保留审计）
 */
export const userRoleAssignments = pgTable(
  "user_role_assignments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    roleId: integer("role_id")
      .notNull()
      .references(() => adminRoles.id),
    assignedBy: integer("assigned_by").references(() => users.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_ura_user").on(table.userId),
    index("idx_ura_role").on(table.roleId),
  ],
);

export type UserRoleAssignment = typeof userRoleAssignments.$inferSelect;
export type NewUserRoleAssignment = typeof userRoleAssignments.$inferInsert;

/**
 * 权限变更审计日志表（§30.3）
 * action: role_created / role_updated / role_deleted / user_role_assigned / user_role_removed
 * diff: JSON 格式变更前后对比
 */
export const rolePermissionAuditLogs = pgTable(
  "role_permission_audit_logs",
  {
    id: serial("id").primaryKey(),
    action: varchar("action", { length: 30 }).notNull(),
    operatorId: integer("operator_id"),
    targetUserId: integer("target_user_id"),
    targetRoleId: integer("target_role_id"),
    detail: text("detail"),
    diff: text("diff"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_rpal_created").on(table.createdAt),
    index("idx_rpal_action").on(table.action),
  ],
);

export type RolePermissionAuditLog = typeof rolePermissionAuditLogs.$inferSelect;
export type NewRolePermissionAuditLog = typeof rolePermissionAuditLogs.$inferInsert;
