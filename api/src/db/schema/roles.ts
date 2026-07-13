// ============================================================
//  3cloud (3C) — 动态角色权限
// ============================================================

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  bigint,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

// ── 管理员角色定义 ──

export const adminRoles = pgTable("admin_roles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  label: varchar("label", { length: 100 }).notNull(),
  permissions: bigint("permissions", { mode: "bigint" }).notNull().default(0n),
  isSystem: boolean("is_system").notNull().default(false),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("admin_roles_name_idx").on(table.name),
  systemIdx: index("admin_roles_is_system_idx").on(table.isSystem),
}));

// ── 用户角色分配 ──

export const userRoleAssignments = pgTable("user_role_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  adminRoleId: integer("admin_role_id").notNull().references(() => adminRoles.id, { onDelete: "cascade" }),
  assignedBy: integer("assigned_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniquePair: uniqueIndex("user_role_assignments_user_role_idx").on(table.userId, table.adminRoleId),
  userIdIdx: index("user_role_assignments_user_id_idx").on(table.userId),
  roleIdIdx: index("user_role_assignments_role_id_idx").on(table.adminRoleId),
}));

// ── 用户权限覆盖 ──

export const userPermissionOverrides = pgTable("user_permission_overrides", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  grantPerms: bigint("grant_perms", { mode: "bigint" }).notNull().default(0n),
  denyPerms: bigint("deny_perms", { mode: "bigint" }).notNull().default(0n),
  reason: text("reason"),
  grantedBy: integer("granted_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
