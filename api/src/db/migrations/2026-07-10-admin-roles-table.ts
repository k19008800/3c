// ============================================================
//  3cloud (3C) — Migration: 动态角色权限表
//  admin_roles: 自定义管理角色（含系统预置角色）
//  user_role_assignments: 用户-角色关联
//  user_permission_overrides: 用户权限微调（增/减）
// ============================================================

import { sql } from "drizzle-orm";
import { getDb } from "../index.js";

export async function up() {
  const db = getDb();

  // 1. 创建 admin_roles 表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) NOT NULL UNIQUE,
      label VARCHAR(100) NOT NULL,
      permissions BIGINT NOT NULL DEFAULT 0,
      is_system BOOLEAN NOT NULL DEFAULT false,
      description TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  // 2. 添加索引
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS admin_roles_name_idx ON admin_roles(name);
    CREATE INDEX IF NOT EXISTS admin_roles_is_system_idx ON admin_roles(is_system);
  `);

  // 3. 创建 user_role_assignments 表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_role_assignments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      admin_role_id INTEGER NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
      assigned_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, admin_role_id)
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS user_role_assignments_user_id_idx ON user_role_assignments(user_id);
    CREATE INDEX IF NOT EXISTS user_role_assignments_role_id_idx ON user_role_assignments(admin_role_id);
  `);

  // 4. 创建 user_permission_overrides 表
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_permission_overrides (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      grant_perms BIGINT NOT NULL DEFAULT 0,
      deny_perms BIGINT NOT NULL DEFAULT 0,
      reason TEXT,
      granted_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  // 5. 插入系统预置角色
  const systemRoles = [
    {
      name: "super_admin",
      label: "超级管理员",
      permissions: "-1", // ~0n = all permissions as signed bigint
      description: "拥有全部权限，不可删除或编辑",
    },
    {
      name: "admin",
      label: "管理员",
      permissions: BigInt(
        (1n << 0n) | // DASHBOARD_VIEW
        (1n << 1n)  | // USER_LIST
        (1n << 2n)  | // USER_VIEW
        (1n << 3n)  | // USER_EDIT
        (1n << 4n)  | // USER_DELETE
        (1n << 5n)  | // USER_CREATE
        (1n << 6n)  | // USER_RESET_PWD
        (1n << 7n)  | // USER_CHANGE_ROLE
        (1n << 8n)  | // USER_BALANCE
        (1n << 9n)  | // USER_IMPERSONATE
        (1n << 10n) | // REVIEW_LIST
        (1n << 11n) | // REVIEW_ACTION
        (1n << 12n) | // MODEL_MANAGE
        (1n << 17n) | // CONFIG_VIEW
        (1n << 19n) | // SECURITY_VIEW
        (1n << 20n) | // SECURITY_ACTION
        (1n << 21n) | // AUDIT_VIEW
        (1n << 22n) | // AGENT_LIST
        (1n << 23n) | // AGENT_MANAGE
        (1n << 24n)   // LOG_VIEW
      ).toString(),
      description: "日常运营管理员，管理用户/资源/安全/审计",
    },
    {
      name: "finance_ops",
      label: "财务专员",
      permissions: BigInt(
        (1n << 0n) | // DASHBOARD_VIEW
        (1n << 1n)  | // USER_LIST
        (1n << 2n)  | // USER_VIEW
        (1n << 8n)  | // USER_BALANCE
        (1n << 13n) | // FINANCE_VIEW
        (1n << 14n) | // FINANCE_COMMISSION
        (1n << 15n) | // FINANCE_WITHDRAW
        (1n << 16n) | // FINANCE_RECHARGE
        (1n << 24n) | // LOG_VIEW
        (1n << 22n) | // AGENT_LIST
        (1n << 26n)   // RECONCILIATION_VIEW
      ).toString(),
      description: "财务专员，管理全部财务功能",
    },
    {
      name: "ops",
      label: "运维工程师",
      permissions: BigInt(
        (1n << 0n) | // DASHBOARD_VIEW
        (1n << 1n)  | // USER_LIST
        (1n << 2n)  | // USER_VIEW
        (1n << 10n) | // REVIEW_LIST
        (1n << 12n) | // MODEL_MANAGE
        (1n << 17n) | // CONFIG_VIEW
        (1n << 18n) | // CONFIG_EDIT
        (1n << 19n) | // SECURITY_VIEW
        (1n << 20n) | // SECURITY_ACTION
        (1n << 21n) | // AUDIT_VIEW
        (1n << 22n) | // AGENT_LIST
        (1n << 24n) | // LOG_VIEW
        (1n << 25n)   // OPS_READ
      ).toString(),
      description: "运维工程师，管理配置/限流/熔断",
    },
    {
      name: "support",
      label: "客服/审核",
      permissions: BigInt(
        (1n << 1n)  | // USER_LIST
        (1n << 2n)  | // USER_VIEW
        (1n << 6n)  | // USER_RESET_PWD
        (1n << 10n) | // REVIEW_LIST
        (1n << 11n) | // REVIEW_ACTION
        (1n << 24n)   // LOG_VIEW
      ).toString(),
      description: "客服/审核员，管理用户和实名审核",
    },
    {
      name: "auditor",
      label: "审计员",
      permissions: BigInt(
        (1n << 1n)  | // USER_LIST
        (1n << 2n)  | // USER_VIEW
        (1n << 21n) | // AUDIT_VIEW
        (1n << 22n) | // AGENT_LIST
        (1n << 24n) | // LOG_VIEW
        (1n << 26n)   // RECONCILIATION_VIEW
      ).toString(),
      description: "审计员，查看审计日志和对账报表",
    },
  ];

  for (const role of systemRoles) {
    await db.execute(sql`
      INSERT INTO admin_roles (name, label, permissions, is_system, description)
      VALUES (${role.name}, ${role.label}, ${role.permissions}::bigint, true, ${role.description})
      ON CONFLICT (name) DO UPDATE SET
        label = EXCLUDED.label,
        permissions = EXCLUDED.permissions,
        description = EXCLUDED.description,
        updated_at = NOW()
    `);
  }

  // 6. 为现有管理员创建 user_role_assignments
  await db.execute(sql`
    INSERT INTO user_role_assignments (user_id, admin_role_id)
    SELECT u.id, ar.id
    FROM users u
    INNER JOIN admin_roles ar ON u.role::text = ar.name
    WHERE u.role IN ('super_admin', 'admin', 'finance_ops', 'ops', 'support', 'auditor')
    ON CONFLICT (user_id, admin_role_id) DO NOTHING
  `);

  console.log("[Migration] 2026-07-10-admin-roles-table: ✅ 角色表 + 预置角色 + 用户关联完成");
}

// Self-invoke for CLI execution
import { createDb, closeDb } from "../index.js";
createDb();
up().catch((err) => { console.error("Migration failed:", err); process.exit(1); }).finally(() => closeDb());
